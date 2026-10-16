import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyAdmin } from "@/lib/notify-admin";
import { fetchUsDailyBars, computeTrack, type PriceTrack } from "@/lib/us-prices";
import { addDays } from "@/lib/sec-edgar";
import { xDraftBlock } from "@/lib/x-link";

// 2026/10追加: 上場後の値動きの自動計算(us-price-track)
// 上場日を過ぎた銘柄(ティッカー登録済み)について、毎日Yahoo Financeの日足を取得し、
// 初値・初日終値の騰落率(公募価格比)、1週間/1か月/3か月/6か月後、最高値・最安値、終値の推移を ipo_companies.price_track に保存する。
// 初日の結果が出た日に、管理者へメールする(X投稿リンク付き)。
// ※ 事前に sql/add_price_track_column.sql の実行が必要。

export const maxDuration = 60;

const SITE = "https://ipo-us.finance-tower.com";

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const sign = (n: number | null | undefined) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${n}%`);

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const startedAt = Date.now();
  const results: string[] = [];
  const today = new Date().toISOString().slice(0, 10);

  // 米国東部時間の今日の日付と時刻(初日の取引が終わる前に、途中の値で確定しないための判定用)
  const etDate = new Date().toLocaleDateString("sv-SE", { timeZone: "America/New_York" });
  const etHour = parseInt(new Date().toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }), 10);

  const { data, error } = await supabase
    .from("ipo_companies")
    .select("id, name, ticker, listing_date, ipo_price, price_range_min, price_range_max, initial_price, price_change_rate, price_track, sec_stage")
    .not("ticker", "is", null)
    .not("listing_date", "is", null)
    .lte("listing_date", today)
    .gte("listing_date", addDays(today, -200))
    .order("listing_date", { ascending: false })
    .limit(30);

  if (error) {
    const hint = /price_track/.test(error.message)
      ? "（値動きを保存する列がまだありません。sql/add_price_track_column.sql をSupabaseのSQL Editorで実行してください）"
      : "";
    await notifyAdmin("株価追跡エラー", `企業一覧を取得できませんでした: ${error.message}${hint}`, "warn");
    return NextResponse.json({ error: error.message + hint }, { status: 500 });
  }

  const targets = (data ?? []).filter((c: any) => c.sec_stage !== "withdrawn");
  let okCount = 0;
  let failCount = 0;

  for (const c of targets as any[]) {
    if (Date.now() - startedAt > 45000) {
      results.push("時間切れのため残りは次回に持ち越します");
      break;
    }

    // 公募価格: 手入力(ipo_price)を優先。無ければ、最終目論見書から読み取った価格(価格帯の下限=上限のとき)
    const ipoPrice: number | null =
      c.ipo_price != null ? Number(c.ipo_price)
      : c.price_range_min != null && c.price_range_min === c.price_range_max ? Number(c.price_range_min)
      : null;

    const bars = await fetchUsDailyBars(c.ticker);
    const prev: PriceTrack | null = c.price_track ?? null;
    const track = bars.length > 0 ? computeTrack(bars, c.listing_date, ipoPrice, today) : null;

    if (!track) {
      failCount++;
      results.push(`⚠️ 株価を取得できませんでした: ${c.name}（${c.ticker}）`);
      continue;
    }

    // 上場初日の取引が終わる前は、途中の値で確定させない
    if (track.day1.date === etDate && etHour < 17) {
      results.push(`⏳ 初日の取引中のため見送り: ${c.name}`);
      continue;
    }
    okCount++;

    track.day1_notified = prev?.day1_notified === true;

    const patch: Record<string, any> = { price_track: track };
    if (c.ipo_price == null && ipoPrice != null) patch.ipo_price = ipoPrice;
    if (c.initial_price == null) patch.initial_price = track.day1.open;
    if (c.price_change_rate == null && track.day1.ret_open_pct != null) patch.price_change_rate = track.day1.ret_open_pct;

    // 初日の結果メール(公募価格が分かっているときだけ。1銘柄につき1回)
    let notify = false;
    if (!track.day1_notified && ipoPrice != null) {
      notify = true;
      track.day1_notified = true;
    }

    const { error: uErr } = await supabase.from("ipo_companies").update(patch).eq("id", c.id);
    if (uErr) {
      // 一部の列だけ保存できない場合(型の違いなど)に備え、価格追跡の列だけでも保存する
      const { error: e2 } = await supabase.from("ipo_companies").update({ price_track: track }).eq("id", c.id);
      if (e2) {
        results.push(`❌ 保存失敗: ${c.name} - ${e2.message}`);
        continue;
      }
      results.push(`⚠️ ${c.name}: 一部の列を保存できませんでした(${uErr.message})`);
    }

    results.push(`📊 ${c.name}（${c.ticker}）: 初値${sign(track.day1.ret_open_pct)} / 初日終値${sign(track.day1.ret_close_pct)} / 最新${sign(track.latest.ret_pct)}`);

    if (notify) {
      const url = `${SITE}/analysis/${c.ticker ?? c.id}`;
      const draft =
        `【米国IPO 初日の結果】${c.name}(${c.ticker})\n\n` +
        `公募価格 $${ipoPrice} → 初値 $${track.day1.open}(${sign(track.day1.ret_open_pct)})\n` +
        `初日終値 $${track.day1.close}(${sign(track.day1.ret_close_pct)})\n\n` +
        `詳しい分析はこちら👇\n${url}\n\n#米国IPO #IPO`;
      await notifyAdmin(
        `📊 初日の結果: ${c.name}（${c.ticker}）`,
        `上場初日(${track.day1.date})の値動きを自動計算しました。DBに反映済みです。\n\n` +
        `公募価格: $${ipoPrice}\n` +
        `初値(始値): $${track.day1.open}（${sign(track.day1.ret_open_pct)}）\n` +
        `初日終値: $${track.day1.close}（${sign(track.day1.ret_close_pct)}）\n` +
        `初日の高値/安値: $${track.day1.high} / $${track.day1.low}\n` +
        `出来高: ${track.day1.volume.toLocaleString()}株\n\n` +
        `※ 株価はYahoo Financeから自動取得しています。公開前に確認してください。\n\n` + xDraftBlock(draft),
        "info"
      );
    }
  }

  // 追跡対象があるのに1件も取得できなかった日は、取得元の不調を知らせる
  if (targets.length > 0 && okCount === 0 && failCount > 0) {
    await notifyAdmin(
      "株価追跡: 株価を取得できませんでした",
      `${failCount}銘柄の株価を取得できませんでした。Yahoo Financeの一時的な不調の可能性があります(翌日に再試行されます)。\n\n${results.join("\n")}`,
      "warn"
    );
  }

  return NextResponse.json({ success: true, checked: targets.length, ok: okCount, results });
}
