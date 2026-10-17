import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyAdmin } from "@/lib/notify-admin";
import Anthropic from "@anthropic-ai/sdk";
import {
  fetchSubmissions, fetchDocText, extractTerms, normalizeExchange, addDays, nextBusinessDay, sleep,
  type Filing,
} from "@/lib/sec-edgar";
import { xDraftBlock } from "@/lib/x-link";
import { fetchNasdaqCalendar, matchCalendar, normName, NASDAQ_DATE_IS_PRICING_DATE, type CalRow } from "@/lib/ipo-calendar";
import { secFetch, extractBusinessExcerpt, isExcludedByName, isBlankCheckText } from "@/lib/sec-edgar";

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

// 2026/10追加: Nasdaq公式のIPOカレンダーから、上場予定日・ティッカー・上場先・価格帯を補う。
// ・SEC書類で確定した日付(listing_date_confirmed=true)は上書きしない
// ・カレンダーに載るのは、価格帯が決まって公募が始まった案件から(上場の1〜2週間前ごろ)
// ・取得できなくても、SEC書類の追跡はそのまま続ける
async function syncFromNasdaqCalendar(
  supabase: ReturnType<typeof getSupabase>,
  targets: Company[],
  results: string[]
): Promise<CalRow[]> {
  const cal = await fetchNasdaqCalendar();
  if (cal.rows.length === 0) {
    results.push(`⚠️ Nasdaq IPOカレンダーを取得できませんでした: ${cal.error ?? "原因不明"}（SEC書類の追跡は続けます。上場日は、必要なら管理画面で手入力してください）`);
    return [];
  }
  const count = (k: string) => cal.rows.filter((r) => r.kind === k).length;
  results.push(
    `📅 Nasdaq IPOカレンダーを確認(${cal.months.join("・")}): 予定${count("upcoming")}件・決定済み${count("priced")}件・申請${count("filed")}件${cal.error ? "／一部取得失敗: " + cal.error : ""}`
  );
  results.push(`🔎 カレンダーの中身(確認用): ${cal.diag.join(" ／ ")}`);
  const upcomingNames = cal.rows.filter((r) => r.kind === "upcoming").map((r) => `${r.name}${r.ticker ? "(" + r.ticker + ")" : ""}${r.exchange ? "・" + r.exchange : ""}${r.date ? "・" + r.date : ""}`);
  if (upcomingNames.length > 0) results.push(`🔎 上場予定の案件: ${upcomingNames.slice(0, 15).join(" ／ ")}`);
  const pricedNames = cal.rows.filter((r) => r.kind === "priced").map((r) => `${r.name}${r.ticker ? "(" + r.ticker + ")" : ""}${r.exchange ? "・" + r.exchange : ""}${r.date ? "・上場" + r.date : ""}`);
  if (pricedNames.length > 0) results.push(`🔎 決定済みの案件(上場先の確認用): ${pricedNames.slice(0, 12).join(" ／ ")}`);
  const todayYmd = new Date().toISOString().slice(0, 10);

  for (const c of targets) {
    const m = matchCalendar(cal.rows, c);
    if (!m) continue;
    if (m.kind === "withdrawn") {
      if (c.sec_stage !== "withdrawn") results.push(`⚠️ Nasdaqカレンダーで「取り下げ」に載っています: ${c.name}（SEC書類でも確認してください）`);
      continue;
    }

    const patch: Record<string, any> = {};
    const notes: string[] = [];

    if (!c.ticker && m.ticker) patch.ticker = m.ticker;
    if ((!c.exchange || c.exchange.includes("要確認")) && m.exchange) patch.exchange = m.exchange;
    if (c.price_range_min === null && m.priceLow !== null && m.priceHigh !== null) {
      patch.price_range_min = m.priceLow;
      patch.price_range_max = m.priceHigh;
    }

    let dateChanged = false;
    if (m.date && c.listing_date_confirmed !== true && c.listing_date !== m.date && m.date >= addDays(todayYmd, -14)) {
      patch.listing_date = m.date;
      patch.listing_date_confirmed = false;
      dateChanged = true;
    }
    if (Object.keys(patch).length === 0) continue;

    await safeUpdate(supabase, c.id, patch, notes, c.name);
    Object.assign(c, patch);
    const parts = [
      patch.listing_date ? `上場日 ${patch.listing_date}` : "",
      patch.ticker ? `ティッカー ${patch.ticker}` : "",
      patch.exchange ? `上場先 ${patch.exchange}` : "",
      patch.price_range_min !== undefined ? `価格帯 ${fmtPrice(patch.price_range_min, patch.price_range_max)}` : "",
    ].filter(Boolean);
    results.push(`📅 Nasdaqカレンダーから補完: ${c.name} → ${parts.join("・")}`);
    results.push(...notes);

    if (dateChanged) {
      const analysisUrl = `${SITE}/analysis/${c.id}`;
      const tickerNow = c.ticker ?? "";
      const priceNow = c.price_range_min !== null && c.price_range_max !== null ? fmtPrice(c.price_range_min, c.price_range_max) : "";
      const draft =
        `【米国IPO】${c.name}${tickerNow ? "(" + tickerNow + ")" : ""}の上場予定日が見えてきました\n\n` +
        `上場予定日: ${patch.listing_date}\n` +
        `${c.exchange ? "上場先: " + c.exchange + "\n" : ""}` +
        `${priceNow ? "想定価格: " + priceNow + "/株\n" : ""}\n` +
        `詳しい分析はこちら👇\n${analysisUrl}\n\n#米国IPO #IPO`;
      await notifyAdmin(
        `📅 上場予定日を取得: ${c.name}（${patch.listing_date}）`,
        `Nasdaq公式のIPOカレンダーから、上場予定日を自動で取得してDBに反映しました。\n\n` +
        `会社名: ${c.name}\n上場予定日: ${patch.listing_date}（予定・未確定）\n` +
        `${c.exchange ? "上場先: " + c.exchange + "  " : ""}${tickerNow ? "ティッカー: " + tickerNow : ""}\n${priceNow ? "想定価格: " + priceNow + "/株\n" : ""}\n` +
        `※ カレンダーの日付は${NASDAQ_DATE_IS_PRICING_DATE ? "価格決定日として扱い、その翌営業日を上場日にしています" : "取引開始日として扱っています"}。1日ずれることがあるため、公開前に Nasdaq のカレンダー(https://www.nasdaq.com/market-activity/ipos)でもご確認ください。\n` +
        `最終目論見書(424B4)が出ると、日付は書類の内容で自動的に確定します。\n\n` + xDraftBlock(draft),
        "info"
      );
    }
  }
  return cal.rows;
}

// 2026/10追加: Nasdaq公式カレンダーに載った「上場が決まった銘柄」のうち、まだDBにない実在企業を自動登録する。
// ・SPAC・ファンド等は対象外(会社名と、目論見書の本文の両方で判定)
// ・上場日が「今月1日以降」のものだけ登録する(今月すでに上場した銘柄も含む。それ以前の古い銘柄は登録しない)
// ・SECの会社番号(CIK)は、SEC公式の一覧(ティッカー→CIK)から探す。見つからない銘柄は見送り、翌日以降に再確認する
// ・1回の実行で登録するのは最大3社(関数の制限時間に収めるため)。残りは翌日以降に登録する
const SUMMARY_MODEL = "claude-haiku-4-5";
const REGISTER_MAX_PER_RUN = 3;

async function registerFromCalendar(
  supabase: ReturnType<typeof getSupabase>,
  rows: CalRow[],
  results: string[],
  startedAt: number
) {
  const monthStart = new Date().toISOString().slice(0, 7) + "-01";
  const cands = rows.filter(
    (r) => (r.kind === "priced" || r.kind === "upcoming") && !!r.date && r.date >= monthStart && !isExcludedByName(r.name)
  );
  if (cands.length === 0) return;

  const { data: all } = await supabase.from("ipo_companies").select("id, name, ticker, cik");
  const existing = (all ?? []) as { id: string; name: string; ticker: string | null; cik: string | null }[];
  const todo = cands.filter((r) => !existing.some((c) => matchCalendar([r], c) !== null));
  if (todo.length === 0) return;
  results.push(`🆕 カレンダーにあってDBにない案件: ${todo.map((r) => `${r.name}${r.ticker ? "(" + r.ticker + ")" : ""}`).join(" ／ ")}`);

  // SEC公式のティッカー→会社番号の一覧
  let tickerMap: { cik: string; ticker: string; title: string }[] = [];
  try {
    const res = await secFetch("https://www.sec.gov/files/company_tickers.json", 20000);
    if (res.ok) {
      const json: any = await res.json();
      tickerMap = Object.values(json).map((v: any) => ({ cik: String(v.cik_str), ticker: String(v.ticker).toUpperCase(), title: String(v.title) }));
    }
  } catch { /* 取得できなければ、下で「見送り」になる */ }

  let registered = 0;
  for (const r of todo) {
    if (registered >= REGISTER_MAX_PER_RUN) { results.push("登録は1回3社までのため、残りは次回に回します"); break; }
    if (Date.now() - startedAt > 30000) { results.push("時間切れのため、残りの登録は次回に回します"); break; }
    await sleep(150);

    const hit =
      (r.ticker ? tickerMap.find((t) => t.ticker === r.ticker) : undefined) ??
      tickerMap.find((t) => normName(t.title) === normName(r.name));
    if (!hit) { results.push(`見送り(SECで会社番号が見つかりません・翌日以降に再確認): ${r.name}${r.ticker ? "(" + r.ticker + ")" : ""}`); continue; }
    if (existing.some((c) => c.cik === hit.cik)) continue; // 別の名前ですでに登録済み

    try {
      const sub = await fetchSubmissions(hit.cik);
      const relevant = (sub?.filings ?? []).filter((f) => FINAL_FORMS.has(f.form) || AMEND_FORMS.has(f.form) || REG_FORMS.has(f.form));
      const doc = relevant.find((f) => FINAL_FORMS.has(f.form) && f.url) ?? relevant.find((f) => AMEND_FORMS.has(f.form) && f.url) ?? relevant.find((f) => f.url);
      const docText = doc?.url ? await fetchDocText(doc.url, 20000) : null;
      if (docText && isBlankCheckText(docText)) { results.push(`スキップ(SPAC): ${r.name}`); continue; }
      const terms = docText ? extractTerms(docText, !!doc && FINAL_FORMS.has(doc.form)) : null;

      let analysis: any = { sector: "不明", biz_type: "不明", ai_summary: "目論見書の本文を取得できていません。管理画面のSTEP 1(SEC書類の取得)の後に、事業内容が反映されます。" };
      if (docText) {
        try {
          const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
          const msg = await claude.messages.create({
            model: SUMMARY_MODEL,
            max_tokens: 700,
            messages: [{
              role: "user",
              content:
                `次は、米国の新規上場(IPO)企業「${r.name}」の目論見書の冒頭の要約部分です。` +
                `この文章に書かれている内容だけを根拠に、事業内容を日本語でまとめてください。` +
                `書かれていないことは推測せず、分からない項目は「不明」としてください。` +
                `JSON形式のみで回答してください(前後の説明文は不要)。\n\n` +
                `{"sector":"業種名(日本語)","biz_type":"事業内容の一言説明(日本語・30字程度)","ai_summary":"150文字程度の事業概要説明(日本語)"}\n\n` +
                `--- 目論見書の本文(抜粋) ---\n${extractBusinessExcerpt(docText, 6000)}`,
            }],
          });
          const raw = (msg.content[0] as any).text ?? "";
          const m = raw.match(/\{[\s\S]*\}/);
          analysis = JSON.parse(m ? m[0] : raw.replace(/```json|```/g, "").trim());
        } catch { /* 要約に失敗しても、登録は続ける(初期文言のまま) */ }
      }

      const { error: insErr } = await supabase.from("ipo_companies").insert({
        name: r.name,
        cik: hit.cik,
        sec_doc_url: doc?.url ?? null,
        exchange: r.exchange ?? terms?.exchange ?? "NASDAQ/NYSE(要確認)",
        ticker: r.ticker ?? terms?.ticker ?? null,
        price_range_min: r.priceLow ?? terms?.priceLow ?? null,
        price_range_max: r.priceHigh ?? terms?.priceHigh ?? null,
        listing_date: r.date,
        listing_date_confirmed: false,
        sector: analysis.sector,
        biz_type: analysis.biz_type,
        ai_summary: analysis.ai_summary,
        status: "自動検出・要確認",
      });
      if (insErr) { results.push(`❌ カレンダーからの登録失敗: ${r.name} - ${insErr.message}`); continue; }
      registered++;
      existing.push({ id: "", name: r.name, ticker: r.ticker, cik: hit.cik });
      results.push(`🆕 Nasdaqカレンダーから自動登録: ${r.name}${r.ticker ? "(" + r.ticker + ")" : ""}・上場日 ${r.date}`);
      await notifyAdmin(
        `🆕 米国IPO銘柄を自動登録: ${r.name}`,
        `Nasdaq公式のIPOカレンダーに載った案件を、自動登録しました。\n\n` +
        `会社名: ${r.name}\nティッカー: ${r.ticker ?? "不明"}  上場先: ${r.exchange ?? "不明"}\n` +
        `上場日: ${r.date}(${r.kind === "priced" ? "価格決定済み" : "予定"})\n事業内容: ${analysis.biz_type}\n\n` +
        `管理画面から分析を進めてください。\nhttps://ipo-us.finance-tower.com/admin`,
        "info"
      );
    } catch (e: any) {
      results.push(`❌ カレンダーからの登録エラー: ${r.name} - ${String(e?.message ?? e)}`);
    }
  }
}

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

  // SEC書類を見に行く前に、Nasdaqカレンダーから日付などを補う(失敗しても先へ進む)
  let calRows: CalRow[] = [];
  try {
    calRows = await syncFromNasdaqCalendar(supabase, targets, results);
  } catch (e: any) {
    results.push(`⚠️ Nasdaqカレンダーの処理でエラー: ${String(e?.message ?? e)}`);
  }
  // カレンダーに載った「上場が決まった銘柄」で、まだDBにないものを登録する(今月上場分。上場済みも含む)
  try {
    await registerFromCalendar(supabase, calRows, results, startedAt);
  } catch (e: any) {
    results.push(`⚠️ カレンダーからの自動登録でエラー: ${String(e?.message ?? e)}`);
  }

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
