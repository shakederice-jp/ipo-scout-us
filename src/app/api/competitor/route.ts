import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;

// 書き込みはサービスロールキーで行う（RLSで匿名キーの書き込みが無言で失敗するのを防ぐ）
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const SEC_UA = "ipo-scout-us shakederice@gmail.com";
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

type TickerRow = { cik: number; ticker: string; title: string };

// SECの「ティッカー⇔CIK」対応表を取得
async function loadTickerTable(): Promise<TickerRow[]> {
  const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
    headers: { "User-Agent": SEC_UA, "Accept": "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`SECの企業一覧の取得に失敗しました (${res.status})`);
  const json: any = await res.json();
  return Object.values(json).map((v: any) => ({
    cik: Number(v.cik_str),
    ticker: String(v.ticker ?? "").toUpperCase(),
    title: String(v.title ?? ""),
  }));
}

function normName(s: string): string {
  return s.toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\b(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|holdings?|group|class [a-c])\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findCompany(table: TickerRow[], name: string, ticker?: string): TickerRow | null {
  const t = (ticker ?? "").toUpperCase().replace(/[^A-Z.\-]/g, "");
  if (t) {
    const hit = table.find(r => r.ticker === t);
    if (hit) return hit;
  }
  const n = normName(name);
  if (!n) return null;
  return table.find(r => normName(r.title) === n)
    ?? table.find(r => normName(r.title).startsWith(n + " ") || normName(r.title) === n)
    ?? null;
}

const REVENUE_TAGS = [
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "Revenues",
  "RevenueFromContractWithCustomerIncludingAssessedTax",
  "SalesRevenueNet",
];
const OPERATING_TAGS = ["OperatingIncomeLoss"];
const NET_TAGS = ["NetIncomeLoss", "ProfitLoss"];

type Fact = { end: string; start?: string; val: number; form?: string; fp?: string; filed?: string };

function daysBetween(a: string, b: string): number {
  return (Date.parse(b) - Date.parse(a)) / 86400000;
}

// 年次(約1年間)の値のうち、決算日(end)が最新のものを返す
function latestAnnual(facts: any, tags: string[]): Fact | null {
  let best: Fact | null = null;
  for (const tag of tags) {
    const arr: Fact[] = facts?.["us-gaap"]?.[tag]?.units?.USD ?? [];
    for (const f of arr) {
      if (!f.start || !f.end || typeof f.val !== "number") continue;
      const d = daysBetween(f.start, f.end);
      if (d < 340 || d > 380) continue;
      if (f.form && !/^10-K/.test(f.form)) continue;
      if (!best || f.end > best.end || (f.end === best.end && (f.filed ?? "") > (best.filed ?? ""))) best = f;
    }
  }
  return best;
}

function valueAtEnd(facts: any, tags: string[], end: string): number | null {
  for (const tag of tags) {
    const arr: Fact[] = facts?.["us-gaap"]?.[tag]?.units?.USD ?? [];
    const hit = arr
      .filter(f => f.end === end && f.start && typeof f.val === "number" && daysBetween(f.start, f.end) >= 340 && daysBetween(f.start, f.end) <= 380 && (!f.form || /^10-K/.test(f.form)))
      .sort((a, b) => (b.filed ?? "").localeCompare(a.filed ?? ""))[0];
    if (hit) return hit.val;
  }
  return null;
}

const toMillions = (v: number | null) => v === null ? null : Math.round(v / 1e5) / 10; // 百万ドル(小数1桁)

function extractFinancials(companyFacts: any) {
  const facts = companyFacts?.facts;
  const rev = latestAnnual(facts, REVENUE_TAGS);
  if (!rev) return null;
  const end = rev.end;
  const op = valueAtEnd(facts, OPERATING_TAGS, end);
  const net = valueAtEnd(facts, NET_TAGS, end);
  const fiscal_year = `${end.slice(0, 4)}年${Number(end.slice(5, 7))}月期`;
  return {
    revenue: toMillions(rev.val),
    operating_profit: toMillions(op),
    net_profit: toMillions(net),
    fiscal_year,
    unit: "百万ドル",
    currency: "USD",
    per: null as number | null,
    pbr: null as number | null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { company_id } = await req.json();
    if (!company_id) return NextResponse.json({ error: "company_id required" }, { status: 400 });

    const supabase = getSupabase();

    const { data: co, error } = await supabase
      .from("ipo_companies")
      .select("name, analysis_market")
      .eq("id", company_id)
      .single();

    if (error || !co) return NextResponse.json({ error: "企業が見つかりません" }, { status: 404 });

    const competitors: any[] = co.analysis_market?.competitors ?? [];
    if (competitors.length === 0) {
      return NextResponse.json({ error: "競合他社情報がありません。先に⑦市場・競合情報収集を実行してください。" }, { status: 400 });
    }

    const table = await loadTickerTable();
    const results: any[] = [];

    for (const comp of competitors.slice(0, 6)) {
      const compName = comp.name ?? "";
      const row = findCompany(table, compName, comp.ticker);
      if (!row) {
        results.push({ name: compName, ticker: comp.ticker ?? null, error: "SECの企業一覧に見つかりません（米国上場企業ではない可能性）", revenue: null, operating_profit: null, per: null, pbr: null });
        continue;
      }

      try {
        await sleep(200); // SECの利用ルール（秒間10回以内）を守る
        const cik10 = String(row.cik).padStart(10, "0");
        const res = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10}.json`, {
          headers: { "User-Agent": SEC_UA, "Accept": "application/json" },
          signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) {
          results.push({ name: compName, ticker: row.ticker, cik: row.cik, error: `財務データ取得失敗 (${res.status})`, revenue: null, operating_profit: null, per: null, pbr: null });
          continue;
        }
        const fin = extractFinancials(await res.json());
        if (!fin) {
          results.push({ name: compName, ticker: row.ticker, cik: row.cik, error: "年次の売上高データが見つかりません（米国会計基準以外の可能性）", revenue: null, operating_profit: null, per: null, pbr: null });
          continue;
        }
        results.push({ name: compName, ticker: row.ticker, cik: row.cik, ...fin });
      } catch {
        results.push({ name: compName, ticker: row.ticker, cik: row.cik, error: "財務データ取得失敗", revenue: null, operating_profit: null, per: null, pbr: null });
      }
    }

    const { data: updated, error: saveError } = await supabase
      .from("ipo_companies")
      .update({ analysis_market: { ...co.analysis_market, competitor_financials: results } })
      .eq("id", company_id)
      .select("id");

    if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 });
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: "保存できませんでした（書き込み権限を確認してください）" }, { status: 500 });
    }

    return NextResponse.json({ success: true, results });

  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
