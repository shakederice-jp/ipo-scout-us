import { nextBusinessDay, normalizeExchange } from "@/lib/sec-edgar";

// 2026/10追加: Nasdaq公式のIPOカレンダーから、上場予定日・ティッカー・上場先・価格帯を拾う。
//
// 使うのは Nasdaq が自社サイトの「IPOカレンダー」画面に表示しているデータ(https://www.nasdaq.com/market-activity/ipos)。
// NYSE上場の案件も含めて、米国の主なIPOが載る。公式の取引所のデータだが、
//  ・「公開用のAPI」としては保証されていないため、仕様が変わったり、取得を断られたりすることがある
//  ・カレンダーに載るのは、価格帯が決まってロードショーに入った案件(上場の1〜2週間前ごろ)から
// という性質がある。取得できなかった場合も、他の自動処理(SEC書類の追跡)は止まらない作りにしている。

// Nasdaqカレンダーの日付は「価格決定日」(米国は決定の翌営業日の朝から取引開始)として扱う。
// 実際の上場日と1日ずれると分かった場合は、ここを false にすると「カレンダーの日付=取引開始日」として扱う。
export const NASDAQ_DATE_IS_PRICING_DATE = true;

export type CalRow = {
  kind: "upcoming" | "priced" | "filed" | "withdrawn";
  name: string;
  ticker: string | null;
  exchange: string | null;
  priceLow: number | null;
  priceHigh: number | null;
  date: string | null; // 取引開始日(YYYY-MM-DD)。filed / withdrawn は null
};

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://www.nasdaq.com",
  Referer: "https://www.nasdaq.com/",
};

function mdyToYmd(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

function parsePrice(s: unknown): { lo: number | null; hi: number | null } {
  if (typeof s !== "string") return { lo: null, hi: null };
  const nums = (s.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length === 0) return { lo: null, hi: null };
  return { lo: Math.min(...nums), hi: Math.max(...nums) };
}

function toRows(kind: CalRow["kind"], rows: any, dateKey: string | null): CalRow[] {
  if (!Array.isArray(rows)) return [];
  const out: CalRow[] = [];
  for (const r of rows) {
    const name = String(r?.companyName ?? "").trim();
    if (!name) continue;
    const { lo, hi } = parsePrice(r?.proposedSharePrice);
    const raw = dateKey ? mdyToYmd(r?.[dateKey]) : null;
    const date = raw ? (NASDAQ_DATE_IS_PRICING_DATE ? nextBusinessDay(raw) : raw) : null;
    const t = String(r?.proposedTickerSymbol ?? "").trim().toUpperCase();
    const ex = String(r?.proposedExchange ?? "").trim();
    out.push({
      kind,
      name,
      ticker: /^[A-Z.\-]{1,6}$/.test(t) ? t : null,
      exchange: ex ? normalizeExchange(ex) : null,
      priceLow: lo,
      priceHigh: hi,
      date,
    });
  }
  return out;
}

// 想定と少し違う入れ物(階層)で返ってきても拾えるよう、「companyName を持つ行の配列」を深く探す
function findRows(node: any, depth = 0): any[] {
  if (!node || depth > 4) return [];
  if (Array.isArray(node)) return node.length > 0 && typeof node[0] === "object" && node[0] && "companyName" in node[0] ? node : [];
  if (typeof node !== "object") return [];
  for (const v of Object.values(node)) {
    const r = findRows(v, depth + 1);
    if (r.length > 0) return r;
  }
  return [];
}

async function fetchMonth(ym: string): Promise<{ rows: CalRow[]; error?: string; diag?: string }> {
  try {
    const res = await fetch(`https://api.nasdaq.com/api/ipo/calendar?date=${ym}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (!res.ok) return { rows: [], error: `HTTP ${res.status}` };
    const json: any = await res.json();
    const d = json?.data;
    if (!d) return { rows: [], error: "データ形式が想定と違います" };
    const up = findRows(d?.upcoming);
    const pr = findRows(d?.priced);
    const fi = findRows(d?.filed);
    const wd = findRows(d?.withdrawn);
    const diag = `${ym} 項目=[${Object.keys(d).join(",")}] 予定${up.length}/決定済み${pr.length}/申請${fi.length}/取下げ${wd.length}`;
    return {
      rows: [
        ...toRows("upcoming", up, "expectedPriceDate"),
        ...toRows("priced", pr, "pricedDate"),
        ...toRows("filed", fi, null),
        ...toRows("withdrawn", wd, null),
      ],
      diag,
    };
  } catch (e: any) {
    return { rows: [], error: String(e?.message ?? e) };
  }
}

export async function fetchNasdaqCalendar(): Promise<{ rows: CalRow[]; months: string[]; error?: string; diag: string[] }> {
  const now = new Date();
  const ymOf = (offset: number) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const months = [ymOf(0), ymOf(1)];
  if (now.getUTCDate() <= 10) months.unshift(ymOf(-1)); // 月初は、前月末に決まった案件も拾う
  const rows: CalRow[] = [];
  const errors: string[] = [];
  const diag: string[] = [];
  for (const ym of months) {
    const r = await fetchMonth(ym);
    rows.push(...r.rows);
    if (r.error) errors.push(`${ym}: ${r.error}`);
    if (r.diag) diag.push(r.diag);
  }
  return { rows, months, error: errors.length > 0 ? errors.join(" / ") : undefined, diag };
}

// ---- 会社名の照合 ----
const SUFFIX = /\b(incorporated|inc|corporation|corp|company|co|limited|ltd|holdings?|group|plc|llc|lp|l\.p|sa|nv|ag|ordinary shares?|class [ab]|the)\b/g;

export function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[.,'’"()\-]/g, " ")
    .replace(SUFFIX, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const KIND_RANK: Record<CalRow["kind"], number> = { priced: 3, upcoming: 2, filed: 1, withdrawn: 0 };

export function matchCalendar(
  rows: CalRow[],
  company: { name: string; ticker: string | null }
): CalRow | null {
  const cn = normName(company.name);
  if (!cn) return null;
  let best: CalRow | null = null;
  for (const r of rows) {
    const rn = normName(r.name);
    const byTicker = !!company.ticker && !!r.ticker && company.ticker.toUpperCase() === r.ticker;
    const byName = rn === cn || (rn.length >= 6 && cn.length >= 6 && (rn.startsWith(cn) || cn.startsWith(rn)));
    if (!byTicker && !byName) continue;
    if (!best || KIND_RANK[r.kind] > KIND_RANK[best.kind]) best = r;
  }
  return best;
}
