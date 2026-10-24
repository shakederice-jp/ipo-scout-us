export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyAdmin } from "@/lib/notify-admin";

// 2026/10/24新設: 楽天証券の「【米国IPO】新規取扱い開始」のお知らせを見張り、
// お知らせに載った銘柄(ティッカーが自社DBにある銘柄)に「楽天証券で取扱いあり」を自動で付ける。
//   ・お知らせのURLは https://www.rakuten-sec.co.jp/web/info/info{YYYYMMDD}-{NN}.html (NNはその日の通し番号)
//   ・直近10日分 × 通し番号01〜10 を順に取得し、「米国IPO」のお知らせだけを読む
//   ・載っているティッカーのうち、自社DBに同じティッカーの銘柄があれば ipo_companies.jp_brokers に "rakuten" を追加する
//   ・付けるだけで、外すことはしない(誤って消さないため)
//   ・取得できなくなったとき(ブロックされた・ページの作りが変わった)は管理者にメールで知らせる
// 動作確認: 管理画面にログインしたまま /api/cron/rakuten-ipo?dry=1 を開くと、何も書き込まずに結果だけ見られる。
// 楽天証券のサイトへのアクセスは、公開されているお知らせページだけ・1日2回・最大100件程度に抑えている。

const BASE = "https://www.rakuten-sec.co.jp/web/info";
const DAYS = 10;
const MAX_PER_DAY = 10;
const CONCURRENCY = 6;
const UA = "Mozilla/5.0 (compatible; IPO-Scout-US/1.0; +https://ipo-us.finance-tower.com)";

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 日本時間の「今日」から過去へ n 日分の日付(YYYYMMDD)
function jstDates(n: number): string[] {
  const out: string[] = [];
  const base = Date.now() + 9 * 60 * 60 * 1000;
  for (let i = 0; i < n; i++) {
    out.push(new Date(base - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, ""));
  }
  return out;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(td|th|tr|p|div|li|h\d|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[ \t　]+/g, " ")
    .replace(/\n\s*\n+/g, "\n");
}

type Fetched = { url: string; status: "ok" | "notfound" | "blocked"; text?: string; code?: number };

async function fetchNotice(url: string): Promise<Fetched> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "text/html" }, signal: AbortSignal.timeout(8000), redirect: "follow" });
    if (res.status === 404 || res.status === 410) return { url, status: "notfound", code: res.status };
    if (!res.ok) return { url, status: "blocked", code: res.status };
    const text = htmlToText(await res.text());
    return { url, status: "ok", text, code: res.status };
  } catch {
    return { url, status: "blocked", code: 0 };
  }
}

// 同時に CONCURRENCY 件ずつ取得する
async function fetchAll(urls: string[]): Promise<Fetched[]> {
  const results: Fetched[] = new Array(urls.length);
  let next = 0;
  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= urls.length) return;
      results[i] = await fetchNotice(urls[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));
  return results;
}

// 「米国IPO」の新規取扱いのお知らせか
function isUsIpoNotice(text: string): boolean {
  return text.includes("米国IPO") || (text.includes("米国") && text.includes("新規取扱い"));
}

// 「銘柄名（TICKER）」の形のティッカーを取り出す(全角・半角のかっこ両対応)
function extractTickers(text: string): string[] {
  const set = new Set<string>();
  for (const m of text.matchAll(/[（(]([A-Z][A-Z0-9]{0,5}(?:\.[A-Z])?)[）)]/g)) set.add(m[1]);
  return Array.from(set);
}

export async function GET(req: NextRequest) {
  // /api/cron/... は proxy.ts の門番(ログイン済みの管理画面、または CRON_SECRET)を通った呼び出しだけが届く
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const slot = req.nextUrl.searchParams.get("slot");

  const urls: string[] = [];
  for (const d of jstDates(DAYS)) for (let n = 1; n <= MAX_PER_DAY; n++) urls.push(`${BASE}/info${d}-${String(n).padStart(2, "0")}.html`);

  const fetched = await fetchAll(urls);
  const ok = fetched.filter(f => f.status === "ok");
  const notFound = fetched.filter(f => f.status === "notfound").length;
  const blocked = fetched.filter(f => f.status === "blocked");

  const notices = ok.filter(f => isUsIpoNotice(f.text ?? "")).map(f => ({ url: f.url, tickers: extractTickers(f.text ?? "") }));
  const allTickers = Array.from(new Set(notices.flatMap(n => n.tickers)));

  const supabase = getSupabase();
  const matched: { ticker: string; name: string; had: boolean }[] = [];
  const updated: string[] = [];
  if (allTickers.length > 0) {
    const { data: rows } = await supabase.from("ipo_companies").select("id, name, ticker, jp_brokers").in("ticker", allTickers);
    for (const r of rows ?? []) {
      const cur: string[] = Array.isArray((r as any).jp_brokers) ? (r as any).jp_brokers : [];
      const had = cur.includes("rakuten");
      matched.push({ ticker: String((r as any).ticker), name: String((r as any).name), had });
      if (!had && !dry) {
        const { error } = await supabase.from("ipo_companies").update({ jp_brokers: [...cur, "rakuten"] }).eq("id", (r as any).id);
        if (!error) updated.push(`${(r as any).name}(${(r as any).ticker})`);
      }
    }
  }

  const summary = {
    dry,
    scanned: fetched.length,
    fetched_ok: ok.length,
    not_found: notFound,
    blocked: blocked.length,
    blocked_codes: Array.from(new Set(blocked.map(b => b.code))),
    us_ipo_notices: notices,
    matched,
    updated,
  };

  if (!dry) {
    // 1件も取得できず、ブロックや通信エラーだけだったときは、仕組みが止まっているので知らせる(夕方の回だけ)
    if (ok.length === 0 && blocked.length > 0 && slot === "pm") {
      await notifyAdmin(
        "楽天証券のお知らせを取得できません",
        `楽天証券の米国IPOのお知らせを取得できませんでした(取得失敗${blocked.length}件・コード: ${summary.blocked_codes.join(", ")})。\n` +
        "サイト側でアクセスが制限されたか、ページの作りが変わった可能性があります。\n" +
        "「取扱いあり」の自動表示が止まっています。",
        "warn"
      );
    }
    if (updated.length > 0) {
      await notifyAdmin("「楽天証券で取扱いあり」を自動で付けました", updated.join("\n"), "info");
    }
  }
  return NextResponse.json(summary);
}
