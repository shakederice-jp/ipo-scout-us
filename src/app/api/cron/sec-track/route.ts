import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyAdmin } from "@/lib/notify-admin";
import {
  fetchSubmissions, fetchDocText, extractTerms, normalizeExchange, addDays, nextBusinessDay, sleep,
  type Filing,
} from "@/lib/sec-edgar";
import { xDraftBlock } from "@/lib/x-link";

// 2026/10追加: SEC提出書類の進み具合の追跡(sec-track)
//
// 登録済みの各社について、毎日SECの提出書類を確認し、次の流れで状態を更新する。
//   filed    : S-1 / F-1 を提出(上場申請)
//   amended  : S-1/A / F-1/A(修正版)を提出
//   launched : 修正版に「価格帯」が載った(ロードショー開始)
//   priced   : 424B4 / 424B1(最終目論見書)が出た = 価格決定・上場
//   withdrawn: RW(登録の撤回請求)が出た
// 書類から読み取れた価格帯・ティッカー・上場先・上場日・ロックアップ解除日を ipo_companies に自動で入れ、
// 節目(価格帯の発表・上場・撤回)で管理者にメールする。
// ※ 事前に sql/add_sec_tracking_columns.sql の実行が必要(進み具合を覚える列を追加する)。

export const maxDuration = 60;

const SITE = "https://ipo-us.finance-tower.com";

const REG_FORMS = new Set(["S-1", "F-1"]);
const AMEND_FORMS = new Set(["S-1/A", "F-1/A"]);
const FINAL_FORMS = new Set(["424B4", "424B1"]);
const RELEVANT = new Set<string>(["RW", ...REG_FORMS, ...AMEND_FORMS, ...FINAL_FORMS]);

const RANK: Record<string, number> = { filed: 0, amended: 1, launched: 2, priced: 3 };
const STAGE_LABEL: Record<string, string> = {
  filed: "上場申請(S-1)", amended: "修正版提出", launched: "価格帯発表", priced: "価格決定・上場", withdrawn: "撤回",
};

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type Company = {
  id: string;
  name: string;
  cik: string;
  ticker: string | null;
  exchange: string | null;
  price_range_min: number | null;
  price_range_max: number | null;
  listing_date: string | null;
  listing_date_confirmed: boolean | null;
  lockup_90_date: string | null;
  lockup_180_date: string | null;
  sec_stage: string | null;
  sec_last_acc: string | null;
};

// 一括更新に失敗した場合(型の合わない列など)は、1項目ずつ更新して、通る項目だけでも反映する
async function safeUpdate(
  supabase: ReturnType<typeof getSupabase>,
  id: string,
  patch: Record<string, any>,
  notes: string[],
  label: string
) {
  const { error } = await supabase.from("ipo_companies").update(patch).eq("id", id);
  if (!error) return;
  for (const [k, v] of Object.entries(patch)) {
    const { error: e2 } = await supabase.from("ipo_companies").update({ [k]: v }).eq("id", id);
    if (e2) notes.push(`⚠️ ${label}: 「${k}」を保存できませんでした(${e2.message})`);
  }
}

const fmtPrice = (lo: number, hi: number) => (lo === hi ? `$${lo}` : `$${lo}〜$${hi}`);

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const results: string[] = [];
  const startedAt = Date.now();

  const { data, error } = await supabase
    .from("ipo_companies")
    .select(
      "id, name, cik, ticker, exchange, price_range_min, price_range_max, listing_date, listing_date_confirmed, lockup_90_date, lockup_180_date, sec_stage, sec_last_acc"
    )
    .not("cik", "is", null)
    .order("created_at", { ascending: false })
    .limit(150);

  if (error) {
    const hint = /sec_stage|sec_last/.test(error.message)
      ? "（進み具合を覚える列がまだありません。sql/add_sec_tracking_columns.sql をSupabaseのSQL Editorで実行してください）"
      : "";
    await notifyAdmin("SEC追跡エラー", `企業一覧を取得できませんでした: ${error.message}${hint}`, "warn");
    return NextResponse.json({ error: error.message + hint }, { status: 500 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const targets = (data as Company[]).filter((c) => {
    if (c.sec_stage === "withdrawn") return false;
    // 上場から約7か月以上たった会社は、ロックアップ解除も済んでいるため追跡を終える
    if (c.sec_stage === "priced" && c.listing_date && c.listing_date < addDays(today, -220)) return false;
    return true;
  });

  let docFetches = 0;

  for (const c of targets) {
    if (Date.now() - startedAt > 45000) {
      results.push("時間切れのため残りは次回に持ち越します");
      break;
    }
    await sleep(150); // SECの秒間10回までの制限を守る
    const sub = await fetchSubmissions(c.cik);
    if (!sub) continue;

    const patch: Record<string, any> = {};
    const notes: string[] = [];

    // 上場後はSECの会社情報にティッカーが載る。まだ空ならそこから補う
    if (sub.tickers.length > 0 && !c.ticker) {
      patch.ticker = sub.tickers[0];
      if (sub.exchanges[0]) patch.exchange = normalizeExchange(sub.exchanges[0]);
    }

    const rel: Filing[] = sub.filings.filter((f) => RELEVANT.has(f.form));
    const newest = rel[0];

    // 新しい書類が出ていなければ、本文は読まない(ティッカーの補完だけ反映して次へ)
    if (!newest || newest.accession === c.sec_last_acc) {
      if (Object.keys(patch).length > 0) {
        await safeUpdate(supabase, c.id, patch, notes, c.name);
        results.push(`🔤 ティッカー補完: ${c.name} → ${patch.ticker}`);
      }
      continue;
    }

    const final = rel.find((f) => FINAL_FORMS.has(f.form));
    const latestNonRw = rel.find((f) => f.form !== "RW");
    const prevStage = c.sec_stage === "withdrawn" ? null : c.sec_stage;

    let newStage: string;
    let terms: ReturnType<typeof extractTerms> | null = null;

    if (newest.form === "RW" && !final) {
      newStage = "withdrawn";
    } else {
      // 本文を読んで、価格帯・ティッカー・日付を読み取る(1回の実行で読むのは最大5社まで)
      const docFiling = final ?? latestNonRw;
      if (!docFiling) continue;
      if (docFetches >= 5) {
        results.push(`持ち越し(本文取得の上限): ${c.name}`);
        continue;
      }
      docFetches++;
      const text = await fetchDocText(docFiling.url, 25000);
      if (!text) {
        results.push(`⚠️ 本文を取得できませんでした: ${c.name}（${docFiling.form}）`);
        continue;
      }
      terms = extractTerms(text, !!final);

      let computed: string;
      if (final) computed = "priced";
      else if (terms.priceLow !== null || c.price_range_min !== null) computed = AMEND_FORMS.has(docFiling.form) ? "launched" : "filed";
      else computed = AMEND_FORMS.has(docFiling.form) ? "amended" : "filed";
      // 後戻りさせない(修正版に価格帯の記載が無くても、一度「価格帯発表」になったら戻さない)
      newStage = prevStage && (RANK[prevStage] ?? -1) > RANK[computed] ? prevStage : computed;
    }

    patch.sec_stage = newStage;
    patch.sec_last_acc = newest.accession;
    patch.sec_last_form = newest.form;
    patch.sec_last_filed = newest.filed;

    let priceChanged = false;
    let pricingDate: string | null = null;
    let lockupNote = "";

    if (terms) {
      if (terms.priceLow !== null && terms.priceHigh !== null) {
        priceChanged = c.price_range_min !== terms.priceLow || c.price_range_max !== terms.priceHigh;
        patch.price_range_min = terms.priceLow;
        patch.price_range_max = terms.priceHigh;
      }
      if (terms.ticker) patch.ticker = terms.ticker;
      if (terms.exchange && (newStage === "priced" || !c.exchange || c.exchange.includes("要確認"))) {
        patch.exchange = terms.exchange;
      }

      if (newStage === "priced" && final) {
        pricingDate = terms.prospectusDate ?? final.filed;
        // 米国のIPOは、価格決定の翌営業日の朝から取引が始まる
        const listing = terms.prospectusDate ? nextBusinessDay(terms.prospectusDate) : final.filed;
        if (!c.listing_date || !c.listing_date_confirmed) {
          patch.listing_date = listing;
          patch.listing_date_confirmed = !!terms.prospectusDate;
        }
        if (terms.lockupDays === 90 && !c.lockup_90_date) patch.lockup_90_date = addDays(pricingDate, 90);
        else if (terms.lockupDays === 180 && !c.lockup_180_date) patch.lockup_180_date = addDays(pricingDate, 180);
        else if (terms.lockupDays !== null) lockupNote = `ロックアップ約${terms.lockupDays}日(日付欄は90日・180日のみのため未入力。目論見書日 ${pricingDate} から数えてください)`;
        else lockupNote = "ロックアップ期間を読み取れませんでした(目論見書の「Shares Eligible for Future Sale」を確認してください)";
      }
    }

    await safeUpdate(supabase, c.id, patch, notes, c.name);
    results.push(`${STAGE_LABEL[newStage] ?? newStage}: ${c.name}（${newest.form} ${newest.filed}）`);
    results.push(...notes);

    // ---- 節目のメール ----
    const stageChanged = newStage !== c.sec_stage;
    const analysisUrl = `${SITE}/analysis/${c.id}`;
    const tickerNow = patch.ticker ?? c.ticker ?? "";
    const exchangeNow = patch.exchange ?? c.exchange ?? "";
    const loNow = patch.price_range_min ?? c.price_range_min;
    const hiNow = patch.price_range_max ?? c.price_range_max;

    if (newStage === "launched" && (stageChanged || priceChanged) && loNow !== null && hiNow !== null) {
      const draft =
        `【米国IPO】${c.name}が公募価格帯を発表\n\n` +
        `想定価格: ${fmtPrice(loNow, hiNow)}/株\n` +
        `${exchangeNow ? "上場予定: " + exchangeNow + (tickerNow ? "「" + tickerNow + "」" : "") + "\n" : ""}\n` +
        `詳しい分析はこちら👇\n${analysisUrl}\n\n#米国IPO #IPO`;
      await notifyAdmin(
        `📈 価格帯発表: ${c.name}${priceChanged && !stageChanged ? "(価格帯が変更されました)" : ""}`,
        `SECの修正版(${newest.form}、提出日${newest.filed})に公募価格帯が載りました。DBに自動で反映済みです。\n\n` +
        `会社名: ${c.name}\n想定価格: ${fmtPrice(loNow, hiNow)}/株\n` +
        `上場先: ${exchangeNow || "未確認"}  ティッカー: ${tickerNow || "未確認"}\n書類: ${newest.url}\n\n` +
        `※ 数値は書類から自動で読み取っています。公開前に書類で確認してください。\n\n` + xDraftBlock(draft),
        "info"
      );
    } else if (newStage === "priced" && stageChanged) {
      const price = terms?.priceFinal;
      const listingNow = patch.listing_date ?? c.listing_date ?? "未確認";
      const draft =
        `【米国IPO】${c.name}が上場${tickerNow ? "(" + tickerNow + ")" : ""}\n\n` +
        `${price ? "公募価格: $" + price + "/株\n" : ""}` +
        `${exchangeNow ? "上場先: " + exchangeNow + "\n" : ""}` +
        `上場日(予定): ${listingNow}\n\n` +
        `詳しい分析はこちら👇\n${analysisUrl}\n\n#米国IPO #IPO`;
      await notifyAdmin(
        `🔔 価格決定・上場: ${c.name}`,
        `SECに最終目論見書(${newest.form}、提出日${newest.filed})が出ました。DBに自動で反映済みです。\n\n` +
        `会社名: ${c.name}\n公募価格: ${price ? "$" + price + "/株" : "読み取れませんでした(書類で確認してください)"}\n` +
        `上場先: ${exchangeNow || "未確認"}  ティッカー: ${tickerNow || "未確認"}\n` +
        `上場日: ${listingNow}${patch.listing_date_confirmed === false ? "(目論見書の日付を読み取れず、書類の提出日で代用。要確認)" : ""}\n` +
        `${lockupNote ? lockupNote + "\n" : ""}書類: ${newest.url}\n\n` +
        `※ 数値は書類から自動で読み取っています。公開前に書類で確認してください。\n\n` + xDraftBlock(draft),
        "info"
      );
    } else if (newStage === "withdrawn" && stageChanged) {
      await notifyAdmin(
        `⛔ 上場申請の撤回: ${c.name}`,
        `SECに登録の撤回請求(RW、提出日${newest.filed})が出ました。上場は取りやめになった可能性があります。\n\n` +
        `会社名: ${c.name}\n書類: ${newest.url}\n\n管理画面で、この銘柄の掲載を見直してください。\n${SITE}/admin`,
        "warn"
      );
    }
  }

  return NextResponse.json({ success: true, checked: targets.length, results });
}
