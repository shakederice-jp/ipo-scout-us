// 2026/10追加: 米国株の日足(Yahoo Finance)の取得と、上場後の値動きの計算。
// 注意: Yahoo Financeの非公式APIのため、取得できない日もあり得る(その場合は翌日以降に再試行される)。
import { addDays } from "@/lib/sec-edgar";

export type Bar = { date: string; open: number; high: number; low: number; close: number; volume: number };

const r2 = (n: number) => Math.round(n * 100) / 100;
const pct1 = (n: number) => Math.round(n * 10) / 10;

// 日足を古い順に返す。日付は米国東部時間(取引所の現地日付)
export async function fetchUsDailyBars(ticker: string, range = "1y"): Promise<Bar[]> {
  // BRK.B → BRK-B のように、Yahooの表記に合わせる
  const symbol = encodeURIComponent(ticker.replace(/\./g, "-"));
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=${range}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    const ts: number[] = result?.timestamp ?? [];
    const q = result?.indicators?.quote?.[0] ?? {};
    const out: Bar[] = [];
    for (let i = 0; i < ts.length; i++) {
      const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
      if (o == null || h == null || l == null || c == null) continue;
      out.push({
        date: new Date(ts[i] * 1000).toLocaleDateString("sv-SE", { timeZone: "America/New_York" }),
        open: r2(o), high: r2(h), low: r2(l), close: r2(c),
        volume: Math.round(q.volume?.[i] ?? 0),
      });
    }
    return out;
  } catch {
    return [];
  }
}

export type Milestone = { date: string; close: number; ret_pct: number | null };

export type PriceTrack = {
  updated: string;                // 計算した日
  ipo_price: number | null;       // 公募価格(ドル)
  day1: {
    date: string; open: number; high: number; low: number; close: number; volume: number;
    ret_open_pct: number | null;   // 初値(始値)の、公募価格に対する騰落率
    ret_close_pct: number | null;  // 初日終値の、公募価格に対する騰落率
  };
  latest: Milestone;
  best: Milestone;                 // 上場後の終値ベースの最高値
  worst: Milestone;                // 同、最安値
  w1: Milestone | null;            // 上場から1週間後
  m1: Milestone | null;            // 1か月後
  m3: Milestone | null;            // 3か月後
  m6: Milestone | null;            // 6か月後
  quiet_end: string;               // 引受証券会社のアナリスト評価開始の目安(上場の25日後)
  series: [string, number][];      // 上場日からの終値の推移(グラフ用)
  day1_notified?: boolean;         // 初日結果のメールを送ったか
};

// 上場日(listingDate)以降の日足から、値動きの要約を作る。見つからなければ null
export function computeTrack(bars: Bar[], listingDate: string, ipoPrice: number | null, today: string): PriceTrack | null {
  const idx = bars.findIndex((b) => b.date >= listingDate);
  if (idx < 0) return null;
  const first = bars[idx];
  // 上場日から7日以上離れた最初の株価は、別の銘柄(ティッカーの使い回し)や上場日の誤りの可能性があるため使わない
  if (first.date > addDays(listingDate, 7)) return null;

  const after = bars.slice(idx);
  const ret = (v: number) => (ipoPrice ? pct1((v / ipoPrice - 1) * 100) : null);
  const ms = (b: Bar): Milestone => ({ date: b.date, close: b.close, ret_pct: ret(b.close) });

  const latestBar = after[after.length - 1];
  let best = after[0], worst = after[0];
  for (const b of after) {
    if (b.close > best.close) best = b;
    if (b.close < worst.close) worst = b;
  }

  // 「上場日(初日)から N日後」の時点(その日が休場なら直前の営業日)の終値。まだ N日たっていなければ null
  const at = (days: number): Milestone | null => {
    const target = addDays(first.date, days);
    if (target > latestBar.date) return null;
    let pick: Bar | null = null;
    for (const b of after) {
      if (b.date <= target) pick = b;
      else break;
    }
    return pick ? ms(pick) : null;
  };

  return {
    updated: today,
    ipo_price: ipoPrice,
    day1: {
      date: first.date, open: first.open, high: first.high, low: first.low, close: first.close, volume: first.volume,
      ret_open_pct: ret(first.open), ret_close_pct: ret(first.close),
    },
    latest: ms(latestBar),
    best: ms(best),
    worst: ms(worst),
    w1: at(7), m1: at(30), m3: at(90), m6: at(180),
    quiet_end: addDays(first.date, 25),
    series: after.map((b) => [b.date, b.close] as [string, number]),
  };
}
