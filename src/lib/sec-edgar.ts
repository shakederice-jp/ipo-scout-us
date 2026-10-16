// SEC EDGAR(米国の開示システム)から、新規上場(IPO)に関する情報を取り出すための共通部品。
// sec-scan(新規IPOの発見)と sec-track(提出書類の進み具合の追跡)の両方から使う。
// ※ /api/sec にも同様の関数があるが、動作確認済みのため今回は触らず、こちらは別に持つ。

// SECのフェアアクセスポリシーに従い、組織名+連絡先を名乗るUser-Agentを付与する
export const SEC_USER_AGENT = "ipo-scout-us shakederice@gmail.com";

export async function secFetch(url: string, timeoutMs = 15000): Promise<Response> {
  return fetch(url, {
    headers: { "User-Agent": SEC_USER_AGENT, "Accept-Encoding": "gzip, deflate" },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 提出書類の一覧
// ---------------------------------------------------------------------------
export type Filing = {
  form: string;        // 例: S-1 / S-1/A / 424B4 / RW
  filed: string;       // 提出日 YYYY-MM-DD
  accession: string;   // 例: 0001234567-26-000123
  url: string;         // 書類本体(htm)のURL
};

export type Submissions = {
  name: string;
  tickers: string[];
  exchanges: string[];
  filings: Filing[];   // 新しい順
};

// 会社番号(CIK)から、その会社の提出書類一覧を取得する(取得できなければ null)
export async function fetchSubmissions(cik: string): Promise<Submissions | null> {
  try {
    const padded = cik.replace(/\D/g, "").padStart(10, "0");
    const res = await secFetch(`https://data.sec.gov/submissions/CIK${padded}.json`, 15000);
    if (!res.ok) return null;
    const data = await res.json();
    const recent = data?.filings?.recent;
    const cikNum = String(parseInt(padded, 10));
    const filings: Filing[] = [];
    if (recent?.form) {
      for (let i = 0; i < recent.form.length; i++) {
        const acc: string = recent.accessionNumber[i];
        const doc: string = recent.primaryDocument[i];
        filings.push({
          form: recent.form[i],
          filed: recent.filingDate[i],
          accession: acc,
          url: acc && doc ? `https://www.sec.gov/Archives/edgar/data/${cikNum}/${acc.replace(/-/g, "")}/${doc}` : "",
        });
      }
    }
    filings.sort((a, b) => (a.filed < b.filed ? 1 : a.filed > b.filed ? -1 : 0));
    return {
      name: data?.name ?? "",
      tickers: Array.isArray(data?.tickers) ? data.tickers : [],
      exchanges: Array.isArray(data?.exchanges) ? data.exchanges : [],
      filings,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// HTML → テキスト
// ---------------------------------------------------------------------------
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<ix:header[\s\S]*?<\/ix:header>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table|ul|ol)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " | ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
    .replace(/&#8217;|&rsquo;|&#x2019;/gi, "'")
    .replace(/&#8216;|&lsquo;/gi, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&#8212;|&mdash;/gi, "—")
    .replace(/&#8211;|&ndash;/gi, "–")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/gi, "&")
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\| ?(\| ?)+/g, " | ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// 書類本文(HTML)を取得してテキストにする。失敗時は null
export async function fetchDocText(url: string, timeoutMs = 25000): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await secFetch(url, timeoutMs);
    if (!res.ok) return null;
    return htmlToText(await res.text());
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 事業説明の抜き出し(要約用)
// ---------------------------------------------------------------------------
// 「PROSPECTUS SUMMARY」見出しから約6000文字を取り出す。見つからなければ本文の前方から取る。
export function extractBusinessExcerpt(text: string, maxChars = 6000): string {
  const lines = text.split("\n");
  let pos = 0;
  for (let i = 0; i < lines.length; i++) {
    const norm = lines[i].replace(/[|\s.\d]+$/g, "").replace(/^[\s|]+/g, "").toUpperCase().trim();
    if (lines[i].length <= 60 && (norm === "PROSPECTUS SUMMARY" || norm === "SUMMARY")) {
      const body = text.slice(pos, pos + maxChars);
      // 目次の行(直後に別の見出しが続くだけ)を避けるため、十分な量があるものだけ採用
      if (body.length >= 1500) return body.trim();
    }
    pos += lines[i].length + 1;
  }
  const start = Math.floor(text.length * 0.03);
  return text.slice(start, start + maxChars).trim();
}

// ---------------------------------------------------------------------------
// 条件(価格帯・ティッカー・上場先・日付)の読み取り
// ---------------------------------------------------------------------------
export type Terms = {
  priceLow: number | null;
  priceHigh: number | null;
  priceFinal: number | null;      // 公募価格(最終目論見書のみ)
  ticker: string | null;
  exchange: string | null;        // NASDAQ / NYSE / NYSE American
  prospectusDate: string | null;  // 目論見書の日付 YYYY-MM-DD(価格決定日)
  lockupDays: number | null;
};

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

export function normalizeExchange(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("nasdaq")) return "NASDAQ";
  if (s.includes("american")) return "NYSE American";
  if (s.includes("cboe")) return "Cboe";
  if (s.includes("nyse") || s.includes("new york stock exchange")) return "NYSE";
  return raw.trim();
}

function num(s: string | undefined): number | null {
  if (!s) return null;
  const v = parseFloat(s.replace(/,/g, ""));
  return Number.isFinite(v) ? v : null;
}

export function extractTerms(text: string, isFinal: boolean): Terms {
  const head = text.slice(0, 40000); // 表紙〜要約の冒頭に条件が書かれている
  const out: Terms = {
    priceLow: null, priceHigh: null, priceFinal: null,
    ticker: null, exchange: null, prospectusDate: null, lockupDays: null,
  };

  // 価格帯: "between $14.00 and $16.00 per share" / "range of $14.00 to $16.00 per share"
  const range =
    head.match(/between\s+\$\s?(\d{1,4}(?:\.\d{1,4})?)\s+and\s+\$\s?(\d{1,4}(?:\.\d{1,4})?)\s+per\s+(?:share|ADS|American depositary share|unit)/i) ||
    head.match(/range\s+of\s+\$\s?(\d{1,4}(?:\.\d{1,4})?)\s*(?:to|and|-|–)\s*\$?\s?(\d{1,4}(?:\.\d{1,4})?)\s+per\s+(?:share|ADS|American depositary share|unit)/i);
  if (range) {
    const lo = num(range[1]);
    const hi = num(range[2]);
    if (lo !== null && hi !== null && hi >= lo) {
      out.priceLow = lo;
      out.priceHigh = hi;
    }
  }

  // 公募価格(最終目論見書): 表の "Initial public offering price | $ | 15.00" など
  if (isFinal) {
    const fin =
      head.match(/initial public offering price(?:\s+per\s+(?:share|ADS|unit))?(?:[\s|$]){0,25}(\d{1,4}(?:\.\d{1,4})?)/i) ||
      head.match(/initial public offering price of\s+\$\s?(\d{1,4}(?:\.\d{1,4})?)/i) ||
      head.match(/offering price of\s+\$\s?(\d{1,4}(?:\.\d{1,4})?)\s+per\s+(?:share|ADS)/i);
    out.priceFinal = fin ? num(fin[1]) : null;
    if (out.priceFinal !== null && out.priceLow === null) {
      out.priceLow = out.priceFinal;
      out.priceHigh = out.priceFinal;
    }
  }

  // 上場先とティッカー: "... listing on the Nasdaq Global Market under the symbol “ABCD”"
  const tk = head.match(
    /(Nasdaq (?:Global Select|Global|Capital) Market|Nasdaq Stock Market|Nasdaq|New York Stock Exchange|NYSE American|NYSE)[^.]{0,250}?under the (?:trading |ticker )*symbol\s+[“"'‘]?\s*([A-Za-z]{1,5}(?:\.[A-Z])?)\b/i
  );
  if (tk) {
    const sym = tk[2];
    if (sym === sym.toUpperCase()) { // "the" など普通の単語を誤って拾わない
      out.ticker = sym;
      out.exchange = normalizeExchange(tk[1]);
    }
  }
  if (!out.exchange) {
    const ex = head.match(/(Nasdaq (?:Global Select|Global|Capital) Market|New York Stock Exchange|NYSE American)/i);
    if (ex) out.exchange = normalizeExchange(ex[1]);
  }

  // 目論見書の日付(=価格決定日)
  const d = head.match(/(?:Prospectus dated|date of this prospectus is)\s+([A-Z][a-z]+)\s+(\d{1,2}),\s+(20\d\d)/);
  if (d) {
    const m = MONTHS[d[1].toLowerCase()];
    if (m) out.prospectusDate = `${d[3]}-${String(m).padStart(2, "0")}-${String(parseInt(d[2], 10)).padStart(2, "0")}`;
  }

  // ロックアップ期間(日数): "lock-up ... 180 days"
  const lu = text.match(/lock-?up[^.]{0,400}?(\d{2,3})(?:-|\s)days/i);
  if (lu) {
    const days = parseInt(lu[1], 10);
    if (days >= 30 && days <= 400) out.lockupDays = days;
  }

  return out;
}

// ---------------------------------------------------------------------------
// 日付の計算(すべてUTCで扱い、時差によるずれを防ぐ)
// ---------------------------------------------------------------------------
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// 翌営業日(土日を飛ばす)。米国のIPOは価格決定の翌朝から取引が始まるため、上場日の推定に使う。
// ※ 祝日は考慮していない(まれに1日ずれることがある)
export function nextBusinessDay(ymd: string): string {
  let cur = addDays(ymd, 1);
  for (;;) {
    const [y, m, d] = cur.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (dow !== 0 && dow !== 6) return cur;
    cur = addDays(cur, 1);
  }
}
