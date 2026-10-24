export const maxDuration = 120;
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { notifyAdmin } from "@/lib/notify-admin";
import { postToX } from "@/lib/post-to-x";
import { STYLE_RULE } from "@/lib/writing-style";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 分析結果の保存が権限の都合で無言で失敗しないよう、サービスロールキーを優先して使う
function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Claude Sonnet 5.5(Sonnet 4.5の後継。Sonnet 4.5は2026/11/30に提供終了予定)。
// ・assistantの先頭文字を指定する「プレフィル」は5.5では使えないため、プロンプトでJSON出力を指示する
// ・何も指定しないと「思考」が自動で動き、出力枠と料金を使うため thinking を between_tools(=最小)に固定する
//   (万一この指定が拒否された場合は、以後thinkingを付けずに再実行する)
const SONNET_MODEL = "claude-sonnet-5-5";
const JSON_ONLY_NOTE = "\n\n【出力形式】前置き・説明文・コードブロックは一切付けず、{ で始まるJSONオブジェクトだけを出力してください。";
let thinkingControlWorks = true;

function buildSonnetParams(prompt: string, maxTokens: number): any {
  const params: any = {
    model: SONNET_MODEL,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt + STYLE_RULE + JSON_ONLY_NOTE }],
  };
  if (thinkingControlWorks) params.thinking = { type: "between_tools" };
  return params;
}

// 応答の中から text ブロックだけを取り出す(先頭が thinking ブロックでも壊れないようにする)
function textOf(msg: any): string {
  const blocks = Array.isArray(msg?.content) ? msg.content : [];
  return blocks.filter((b: any) => b?.type === "text").map((b: any) => b.text ?? "").join("");
}

// 最初の { 以降を返す(コードブロックや前置きが付いても、JSON本体だけ取り出せるようにする)
function fromFirstBrace(text: string): string {
  const i = text.indexOf("{");
  return i === -1 ? text : text.slice(i);
}

async function callClaudeWithRetry(prompt: string, maxRetries: number = 1): Promise<any> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const msg = await claude.messages.create(buildSonnetParams(prompt, 4500));
      return msg;
    } catch (e: any) {
      lastError = e;
      console.error(`Claude API attempt ${attempt} failed:`, e?.message);
      if (/thinking/i.test(String(e?.message ?? ""))) thinkingControlWorks = false;
      if (attempt <= maxRetries) {
        await sleep(5000);
      }
    }
  }
  throw lastError;
}

function repairJson(text: string): any {
  try { return JSON.parse(text); } catch {}
  const t = text.trimEnd();
  for (let i = t.length - 1; i > t.length - 500; i--) {
    if (t[i] === '}') {
      const candidate = t.slice(0, i + 1);
      for (const suffix of ['', '}', ']}', '}}', '}]}', '}}]}', '}}}']) {
        try {
          const result = JSON.parse(candidate + suffix);
          if (result) return result;
        } catch {}
      }
    }
  }
  return null;
}

function buildDataContext(structured: any, raw: any): { ctx: string; source: string } {
  if (structured && Object.keys(structured).length > 0) {
    const d = structured;
    const ctx = [
      `事業:${(d.business_summary??"").slice(0,200)}`,
      `売上推移:${d.financials?.revenue_trend??"不明"}`,
      `利益推移:${d.financials?.profit_trend??"不明"}`,
      `利益率:${d.financials?.profit_margin??"不明"}`,
      `CF:${d.financials?.cash_flow??"不明"}`,
      `発行済株式:${d.ipo_details?.total_shares??"不明"}`,
      `公募売出株数:${d.ipo_details?.public_shares??"不明"}`,
      `想定公募価格レンジ(USD):${d.ipo_details?.price_range??"不明"}`,
      `主幹事(引受会社):${(d.ipo_details?.underwriters??"不明").toString().slice(0,120)}`,
      `上場予定市場:${d.ipo_details?.listing_venue??"不明"}`,
      `流通比率:${d.ipo_details?.float_ratio??"不明"}`,
      `調達金額:${d.ipo_details?.fundraising_amount??"不明"}`,
      `資金使途:${(d.ipo_details?.use_of_proceeds??"").slice(0,150)}`,
      `ロックアップ期間:${d.ipo_details?.lockup_period??"不明"}`,
      `ロックアップ対象:${(d.ipo_details?.lockup_targets??"").slice(0,150)}`,
      `OA:${d.ipo_details?.overallotment??"不明"}`,
      `主要株主:${JSON.stringify(d.shareholders??[]).slice(0,500)}`,
      `主なリスク:${JSON.stringify((d.risks??[]).slice(0,6)).slice(0,500)}`,
      `経営陣:${(d.management??"").slice(0,200)}`,
      `成長要因:${(d.growth_drivers??"").slice(0,200)}`,
      `懸念点:${(d.concerns??"").slice(0,200)}`,
    ].join("\n");
    return { ctx: ctx.slice(0, 2800), source: "SEC EDGAR+Claude(7step)" };
  }
  if (raw && Object.keys(raw).length > 0) {
    const ctx = Object.entries(raw as Record<string,string>)
      .map(([k,v]) => `[${k}]${String(v).slice(0,500)}`)
      .join("\n");
    return { ctx: ctx.slice(0, 2500), source: "SEC EDGAR+Claude" };
  }
  return { ctx: "", source: "AI" };
}

function buildDataNote(co: any) {
  const { ctx: dataContext, source: dataSource } = buildDataContext(co.structured_data, co.raw_prospectus);
  const marketInfo = co.analysis_market
    ? `\n【市場・競合情報】主幹事:${co.analysis_market.lead_underwriter ?? ""}・競合:${(co.analysis_market.competitors ?? []).map((c: any) => c.name).join("、")}・業界バリュエーション:${co.analysis_market.industry_per ?? ""}・市場動向:${co.analysis_market.market_trend ?? ""}`
    : "";
  const n = co.name ?? "unknown";
  const sc = co.sector ?? "tech";
  const dataNote = dataContext
    ? `【実データ - 必ず具体的数値を引用すること】\n${dataContext}${marketInfo}`
    : `実データ未取得。${n}(${sc})の一般情報で分析。${marketInfo}`;
  return { dataNote, dataSource };
}

function scorePrompt(co: any, dataNote: string) {
  const n = co.name ?? "unknown", sc = co.sector ?? "tech", ld = co.listing_date ?? "2026", ex = co.exchange ?? "NASDAQ/NYSE";
  return `あなたは米国IPO（NYSE・Nasdaq上場）を専門とする投資アナリストで、読者は日本の個人投資家です。
${n}（${sc}、${ex}、上場予定${ld}）のIPOを総合評価してください。
金額は米ドル（USD）基準で扱い、円換算は行わないこと。マイナス（損失・下落）は「-」で表し、「△」「▲」は使わないこと。S-1などSEC提出書類に基づく実データを根拠とすること。
JSONのみで返答してください。マークダウン・コードブロック・余分なテキスト一切不要。文章はすべて「ですます調」で記述すること。

${dataNote}

【絶対ルール】
1. 数値・事実は必ず上記【実データ】から引用すること。データにない数値は絶対に作らない
2. データに記載のない情報は「不明」または「S-1参照」と記載する
3. summaryには必ず実データから引用した具体的数値を最低2つ含める
4. missing_data_pointsには、IPO投資判断において通常あるべき以下のような項目のうち、上記【実データ】に記載がなかった、または「不明」「S-1参照」となっていたものだけを具体的に列挙すること（記載があった項目は含めない）:
   想定公募価格レンジ／配当方針／株主別の具体的な保有比率／流通株式比率の具体的な数値／主幹事（引受会社）名／類似上場企業とのバリュエーション比較／黒字化・収益化の見込み時期／ロックアップの解除条件／種類株（議決権の差）の有無／代表者の同業界での実績年数
   ※このリストは例示であり、他にも実データに記載がなく投資判断上重要と思われる項目があれば追加してよい
5. 記載がなかった項目が無い場合はmissing_data_pointsを空配列[]にすること
6. learning_point(今日の見方)は、この銘柄の目論見書で最も特徴的な点に合わせて、投資の見方を1つ選ぶこと。どの銘柄でも同じテーマにしないこと

【出力形式】必ず以下の構造のみで完結させること:
{
  "summary": "400字以内。必ず実データの具体的数値を2つ以上引用して記述。1文目で結論を端的に述べ、改行(\\n\\n)を1つ挟んでから詳細説明を続ける2段落構成にすること。ですます調",
  "learning_point": {
    "title": "今日の見方の見出し(20字以内)。例:「手元資金は何か月もつか」",
    "body": "150〜250字。(1)その見方は何を確かめるものか (2)この銘柄では実データの数値から何が分かるか (3)他の銘柄を読むときにも使える一言、の順に、流れのある文章で書く。ですます調"
  },
  "data_citations": ["引用根拠1", "引用根拠2", "引用根拠3"],
  "data_confidence": "high（実データあり）/ medium（一部推定）/ low（データ不足）のいずれか",
  "missing_data_points": ["記載がなかった項目1（15字以内、体言止め）", "記載がなかった項目2（15字以内、体言止め）"],
  "ai_summary": "トップページ掲載用・120字以内。この銘柄の最大の魅力・独自ポジション・成長の根拠を核心から語る文章。ですます調",
  "total_score": 65,
  "grade": "B",
  "ultra_short_grade": "B",
  "short_grade": "C",
  "long_grade": "B",
  "grade_reason": {
    "ultra_short": "超短期（初値〜当日）の判定理由。100字以内。ですます調",
    "short": "短期（1〜3ヶ月）の判定理由。100字以内。ですます調",
    "long": "長期（数年〜）の判定理由。100字以内。ですます調"
  },
  "axes_scores": {
    "float": 65, "lockup": 60, "timing": 70, "valuation": 55, "vc_sell": 50,
    "growth": 75, "management": 65, "unit_econ": 60, "competitor": 55
  }
}
グレードはA〜Eの5段階（A=強気(上位20%) 〜 E=弱気(下位20%)）`;
}

function addDays(dateStr: string | null | undefined, days: number): string {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// 2026/10新設: 「買うか見送るか・いつ売るか・その根拠」を示す part=action 用プロンプト。
// 先に作った総合スコア・シナリオの結果(prior)を渡して、評価がちぐはぐにならないようにする。
function actionPrompt(co: any, dataNote: string, prior: any) {
  const n = co.name ?? "unknown";
  const ld = co.listing_date ?? "";
  const confirmed = (co as any).listing_date_confirmed ? "確定" : "予定(未確定)";
  const quietEnd = addDays(ld, 25);
  const lock90 = (co as any).lockup_90_date ?? "";
  const lock180 = (co as any).lockup_180_date ?? "";
  const schedule = [
    `上場日: ${ld || "未定"}(${confirmed})`,
    `静穏期間の終了(引受証券会社のアナリストが評価を出せるようになる目安・上場から25日後): ${quietEnd || "上場日の確定後"}`,
    `ロックアップ解除日(90日): ${lock90 || "記載なし・不明"}`,
    `ロックアップ解除日(180日): ${lock180 || "記載なし・不明"}`,
  ].join("\n");
  // 日本の証券会社での取扱い(上場後に売買できるか。管理画面で登録)。未登録なら「取扱い未確認」として扱う。
  const jpNames: Record<string, string> = { rakuten: "楽天証券", sbi: "SBI証券" };
  const jpList: string[] = (Array.isArray((co as any).jp_brokers) ? (co as any).jp_brokers : []).map((k: string) => jpNames[k]).filter(Boolean);
  const buyRoute = jpList.length > 0
    ? `日本の${jpList.join("・")}で、上場後に売買できます(取扱いあり)。読者は公募価格では買えず、上場初日の寄り付き付近(始値あたり)から買うことを出発点として考えてください。買う根拠・売る根拠は、公募価格ではなく「上場初日の始値あたりで買った場合」を前提に書き、公募価格と始値の差が大きくなりうる点(すでに値上がりしたあとに買う形になる点)にも触れてください。`
    : `日本の主要な証券会社での取扱い(上場後の売買)は、まだ確認できていません。多くの銘柄は上場後に取扱いが始まりますが、確認できるまでは「日本から買えるかは各社の取扱い次第」と一言添えてください。買える場合は、読者は公募価格では買えず、上場初日の寄り付き付近(始値あたり)から買うことになります。買う根拠・売る根拠は、公募価格ではなく「上場初日の始値あたりで買った場合」を前提に書き、公募価格と始値の差が大きくなりうる点(すでに値上がりしたあとに買う形になる点)にも触れてください。`;
  const p = prior ?? {};
  const scen = (arr: any) => (Array.isArray(arr) ? arr : []).map((s: any) => `${s.verdict}:${s.name}(公募価格比:${s.vsIpo}・確率:${s.prob})`).join(" / ");
  const priorText = [
    `総合: ${p.total_score ?? "?"}点(${p.grade ?? "?"})`,
    `超短期: ${p.ultra_short_grade ?? "?"}評価 / 短期: ${p.short_grade ?? "?"}評価 / 長期: ${p.long_grade ?? "?"}評価`,
    `超短期の理由: ${p.grade_reason?.ultra_short ?? ""}`,
    `短期の理由: ${p.grade_reason?.short ?? ""}`,
    `長期の理由: ${p.grade_reason?.long ?? ""}`,
    `短期シナリオ: ${scen(p.scenarios_short)}`,
    `長期シナリオ: ${scen(p.scenarios_long)}`,
  ].join("\n");
  return `あなたは米国IPO（NYSE・Nasdaq上場）を専門とする投資アナリストで、読者は日本の個人投資家です。
読者は「IPOで利益を上げたい」と考えています。${n}のIPOについて、次の3点をはっきり示してください。
(1) この銘柄は買うのを控えたほうがよい(リスクが大きい)のか、検討に値するのか
(2) 買うと決めた場合、超短期(上場初日)・短期(1〜3ヶ月)・長期(数年〜)のどの期間が向いているのか
(3) その場合の買う根拠・売る時期の目安・売る根拠・見直しの目安
JSONのみで返答してください。マークダウン・コードブロック・余分なテキスト一切不要。文章はすべて「ですます調」で記述すること。

${dataNote}

【日程(実データ)】
${schedule}

【日本での買い方(この前提で、買う根拠を書くこと)】
${buyRoute}

【すでに作成済みの評価(これと矛盾しないこと)】
${priorText}

【絶対ルール】
1. 数値・事実・日付は、上記【実データ】【日程】【作成済みの評価】にあるものだけを使う。ないものは作らない。日付が不明なときは「ロックアップ解除日の確定後」のように、時期の条件で書く。
2. 危険な銘柄は、遠慮せずに「見送りを検討する材料が多い」とはっきり書く。良い銘柄も、買う根拠と同時に、売る条件を必ず示す。
3. 「必ず儲かる」「確実」「絶対」「損しない」など、利益を保証・断定する表現は使わない。売り時は「〜になったら」「〜の時点で」という条件と時期の目安で書く。
4. 買う根拠・売る根拠は、必ず目論見書の数字や日程と結びつけて書く。
5. 公募価格や株価の水準に触れるときは、シナリオの公募価格比(例:公募価格の1.8倍)を使い、自分で新しい目標株価を作らない。
6. 「見直しの目安」は、前提が崩れたと判断する条件(例:成長率の鈍化・ロックアップ解除・大株主の売却開示)を具体的に書く。
7. これは投資助言ではなく、公開資料にもとづくAIの分析であることを前提に、読み手に命令せず「〜と考えられます」「〜を検討する材料です」の形で書く。

【出力形式】必ず以下の構造のみで完結させること:
{
  "action_guide": {
    "stance": "見送りを検討 / 様子見 / 条件付きで検討 / 前向きに検討 のいずれか1つ",
    "risk_level": "高 / 中 / 低 のいずれか1つ",
    "headline": "結論を一言で。40字以内。ですます調",
    "stance_reason": "そう判断した理由。200字以内。結論、根拠の数字、だからどう考えるか、の流れで書く。ですます調",
    "danger_flags": ["この銘柄の危険材料1(30字以内・体言止め)", "危険材料2"],
    "check_before_buy": ["買う前に確認したい点1(40字以内)", "確認したい点2", "確認したい点3"],
    "best_horizon": "ultra_short / short / long / none のいずれか1つ(noneは、どの期間も向かないとき)",
    "horizons": [
      {"id": "ultra_short", "label": "超短期(上場初日)", "fit": "向いている / 条件付き / 向いていない のいずれか", "buy_basis": "買う根拠。120字以内", "sell_timing": "売る時期の目安。80字以内", "sell_basis": "売る根拠。120字以内", "review_line": "見直し・撤退の目安。80字以内"},
      {"id": "short", "label": "短期(1〜3ヶ月)", "fit": "同上", "buy_basis": "同上", "sell_timing": "同上", "sell_basis": "同上", "review_line": "同上"},
      {"id": "long", "label": "長期(数年〜)", "fit": "同上", "buy_basis": "同上", "sell_timing": "同上", "sell_basis": "同上", "review_line": "同上"}
    ]
  }
}
danger_flagsは、危険材料が見当たらなければ空配列[]にすること。`;
}

function insightsPrompt(co: any, dataNote: string) {
  const n = co.name ?? "unknown";
  return `あなたは米国IPO（NYSE・Nasdaq上場）を専門とする投資アナリストで、読者は日本の個人投資家です。
${n}のIPOについて、「まずここに注目！」というコーナー用のインサイトを3つ作成してください。
JSONのみで返答してください。マークダウン・コードブロック・余分なテキスト一切不要。文章はすべて「ですます調」で記述すること。

${dataNote}

【絶対ルール】
1. 数値・事実は必ず上記【実データ】から引用すること。データにない数値は絶対に作らない
2. 3つは「強み」「懸念点」「注目すべき構造・戦略」など、視点が重ならないよう選ぶこと
3. tweet_summaryは、3つのインサイトのうち最も注目度が高いもの1つを選び、40字以内で要約すること（Xへの投稿に使うため、文字数を厳守すること）

【出力形式】必ず以下の構造のみで完結させること:
{
  "insights": [
    {"title": "インサイトタイトル1（20字以内）", "body": "カード折りたたみ時に見える短い要約（100字以内）。ですます調", "detail": "カードを開いた時に表示する詳しい解説。250〜400字程度。1文目で結論・要点を端的に述べ、そのあと改行(\\n\\n)を1つ挟んでから、実データの数値を交えた背景・理由の説明、さらに改行(\\n\\n)を挟んで投資判断への影響、という2〜3段落構成にすること。ですます調"},
    {"title": "インサイトタイトル2（20字以内）", "body": "同上（100字以内）。ですます調", "detail": "同上の形式で250〜400字程度。ですます調"},
    {"title": "インサイトタイトル3（20字以内）", "body": "同上（100字以内）。ですます調", "detail": "同上の形式で250〜400字程度。ですます調"}
  ],
  "tweet_summary": "40字以内の要約文（ですます調）"
}`;
}

function insightsBeginnerPrompt(insights: any[]): string {
  const list = insights.map((ins: any, i: number) => `${i+1}. タイトル:${ins.title}\n本文:${ins.detail ?? ins.body ?? ""}`).join("\n\n");
  return `以下は米国IPO投資に関する3つの解説です。それぞれを、投資初心者にも分かるように書き直してください。
JSONのみで返答してください。マークダウン・コードブロック・余分なテキスト一切不要。

【元の解説】
${list}

【書き直しのルール】
1. 専門用語には都度かんたんな説明を添えること
2. 250〜400字程度、段落ごとに改行(\\n\\n)を入れること
3. ですます調で記述すること
4. 元の数値・事実は省略せずそのまま引用すること

【出力形式】必ず以下の構造のみで完結させること:
{
  "details_beginner": ["1つ目の書き直し文", "2つ目の書き直し文", "3つ目の書き直し文"]
}`;
}

function scenariosPrompt(co: any, dataNote: string) {
  const n = co.name ?? "unknown";
  return `あなたは米国IPO（NYSE・Nasdaq上場）を専門とする投資アナリストで、読者は日本の個人投資家です。
${n}のIPOについて、短期（〜6ヶ月）と長期（5〜10年）の株価シナリオをそれぞれ3パターン（強気・中立・弱気）作成してください。
JSONのみで返答してください。マークダウン・コードブロック・余分なテキスト一切不要。文章はすべて「ですます調」で記述すること。

${dataNote}

【絶対ルール】
1. 数値・事実は必ず上記【実データ】から引用すること。データにない数値は絶対に作らない
2. 確率(prob)は3パターン合計がおおよそ100%になるようにすること

【出力形式】必ず以下の構造のみで完結させること:
{
  "scenarios_short": [
    {"id": "A", "verdict": "強気", "name": "短期強気シナリオ名", "vsIpo": "公募価格の1.8倍", "prob": "25%", "positives": ["好材料1", "好材料2"], "negatives": ["リスク1"], "conclusion": "短期（〜6ヶ月）の要点を50字以内で。ですます調"},
    {"id": "B", "verdict": "中立", "name": "短期中立シナリオ名", "vsIpo": "公募価格±10%", "prob": "45%", "positives": ["好材料1"], "negatives": ["リスク1", "リスク2"], "conclusion": "同上。ですます調"},
    {"id": "C", "verdict": "弱気", "name": "短期弱気シナリオ名", "vsIpo": "公募価格の0.8倍", "prob": "30%", "positives": ["好材料1"], "negatives": ["リスク1", "リスク2"], "conclusion": "同上。ですます調"}
  ],
  "scenarios_long": [
    {"id": "A", "verdict": "強気", "name": "長期強気シナリオ名", "vsIpo": "+200〜500%", "prob": "25%", "positives": ["好材料1", "好材料2"], "negatives": ["リスク1"], "conclusion": "長期（5〜10年）の要点を50字以内で。ですます調"},
    {"id": "B", "verdict": "中立", "name": "長期中立シナリオ名", "vsIpo": "+50〜150%", "prob": "45%", "positives": ["好材料1"], "negatives": ["リスク1", "リスク2"], "conclusion": "同上。ですます調"},
    {"id": "C", "verdict": "弱気", "name": "長期弱気シナリオ名", "vsIpo": "-20〜-50%", "prob": "30%", "positives": ["好材料1"], "negatives": ["リスク1", "リスク2"], "conclusion": "同上。ですます調"}
  ]
}`;
}

// 2026/10追加: 「魅力」と「注意点」を、数字つきのカード用に作るパート
function highlightsPrompt(co: any, dataNote: string, prior: any) {
  const n = co.name ?? "unknown";
  const p = prior ?? {};
  const priorText = [
    `総合: ${p.total_score ?? "?"}点(${p.grade ?? "?"})`,
    `超短期: ${p.ultra_short_grade ?? "?"}評価 / 短期: ${p.short_grade ?? "?"}評価 / 長期: ${p.long_grade ?? "?"}評価`,
    `要約: ${String(p.summary ?? "").slice(0, 300)}`,
  ].join("\n");
  return `あなたは米国IPO（NYSE・Nasdaq上場）を専門とする投資アナリストで、読者は日本の個人投資家です。
${n}のIPOについて、「投資したいと思える魅力」と「買ったあとの注意点」を、カード表示用に整理してください。
読者は、まず魅力を知り、そのあと売り時と注意点を知りたいと考えています。魅力は魅力として具体的に書き、注意点は同じ重みで正直に書いてください。
JSONのみで返答してください。マークダウン・コードブロック・余分なテキスト一切不要。文章はすべて「ですます調」で記述すること。

${dataNote}

【すでに作成済みの評価(これと矛盾しないこと)】
${priorText}

【絶対ルール】
1. 数値・事実は、上記【実データ】にあるものだけを使う。ないものは作らない。
2. big_number には、実データにある数字を1つだけ、短く入れる(例:「+45%」「$120M」「3.2倍」)。該当する数字がなければ空文字にする。数字を推測で作らない。
3. 「最高」「業界No.1」「画期的」「必ず」「確実」「絶対」「間違いなく」など、断定や最上級の表現は使わない。「〜と考えられます」「〜が強みです」の形で書く。
4. 魅力は、会社のほめ言葉ではなく、投資家にとっての意味(なぜ株価や評価にプラスになりうるか)で書く。
5. 魅力が少ない銘柄は、無理に増やさず2〜3件でよい。注意点が多い銘柄は、遠慮せず4件書き、重大度を正直に付ける。
6. 注意点には、買ったあとに何を見ればよいか(決算の指標・ロックアップ解除日・大株主の売却開示など)を必ず書く。
7. これは投資助言ではなく、公開資料にもとづくAIの分析であることを前提に、読み手に命令しない。

【出力形式】必ず以下の構造のみで完結させること:
{
  "highlights": {
    "tagline": "この銘柄の魅力をひとことで。40字以内。ですます調ではなく体言止めでもよい",
    "charms": [
      {"title": "魅力の見出し。20字以内・体言止め", "big_number": "実データにある数字1つ。なければ空文字", "big_label": "その数字が何か。20字以内。big_numberが空なら空文字", "why": "投資家にとってなぜ魅力か。100字以内。ですます調", "evidence": "目論見書のどの記述・数字が根拠か。80字以内", "horizon": "ultra_short / short / long / all のいずれか1つ"}
    ],
    "cautions": [
      {"title": "注意点の見出し。20字以内・体言止め", "severity": "高 / 中 / 低 のいずれか1つ", "detail": "何が問題で、なぜ気をつけるのか。100字以内。ですます調", "watch": "買ったあとに見るところ。60字以内"}
    ]
  }
}
charms は2〜4件、cautions は3〜4件にしてください。`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = createSupabaseServerClient();
    if (!supabase) return NextResponse.json({ error: "db" }, { status: 500 });
    const { data: co } = await supabase.from("ipo_companies").select("*").eq("id", body.id).single();
    if (!co) return NextResponse.json({ error: "not found" }, { status: 404 });

    // ===== 最終保存（3パートの結果をまとめてDBに書き込む） =====
    if (body.save_results) {
      const r = body.save_results;
      const summary = {
        summary:             r.summary ?? `${co.name}IPO分析`,
        summary_beginner:    r.summary_beginner ?? "",
        action_guide:        (r.action_guide && typeof r.action_guide === "object") ? r.action_guide : null,
        learning_point:      (r.learning_point && typeof r.learning_point === "object") ? r.learning_point : null,
        highlights:          (r.highlights && typeof r.highlights === "object") ? r.highlights : null,
        data_citations:      Array.isArray(r.data_citations) ? r.data_citations : [],
        data_confidence:     r.data_confidence ?? "low",
        missing_data_points: Array.isArray(r.missing_data_points) ? r.missing_data_points.slice(0,8) : [],
        total_score:       r.total_score ?? 65,
        grade:             r.grade ?? "C",
        ultra_short_grade: r.ultra_short_grade ?? "C",
        short_grade:       r.short_grade ?? "C",
        long_grade:        r.long_grade ?? "C",
        grade_reason:      r.grade_reason ?? {},
        insights:          Array.isArray(r.insights) ? r.insights.slice(0,3) : [],
        tweet_summary:     r.tweet_summary ?? "",
        scenarios_short:   Array.isArray(r.scenarios_short) ? r.scenarios_short.slice(0,3) : [],
        scenarios_long:    Array.isArray(r.scenarios_long) ? r.scenarios_long.slice(0,3) : [],
        axes_scores:       r.axes_scores ?? {},
        data_source:       r.data_source ?? "AI",
        proofread:         (r.proofread && typeof r.proofread === "object") ? r.proofread : null,
        sources: [
          { label:"SEC EDGAR（S-1・目論見書）", url:"https://www.sec.gov/edgar/search/" },
          { label:"Nasdaq IPOカレンダー", url:"https://www.nasdaq.com/market-activity/ipos" },
          { label:"NYSE IPOセンター", url:"https://www.nyse.com/ipo-center/recent-ipo" },
        ],
        generated_at: new Date().toISOString(),
      };
      await supabase.from("ipo_companies").update({
        analysis_summary: summary,
        analysis_detail: { ...summary, axes: { ultra_short: [], short: [], long: [] } },
        ...(r.ai_summary ? { ai_summary: r.ai_summary } : {}),
      }).eq("id", co.id);

      // X分析系投稿：「まずここに注目！」の1つ目のインサイトを紹介
      if (process.env.X_AUTOPOST_ENABLED === "true" && summary.insights?.[0]) {
        try {
          const tweetText = `【IPO分析】${co.name}（${(co as any).ticker ?? ""}）\n\n${summary.tweet_summary}\n\n詳しい分析はプロフィールのリンクから👆\n\n#IPO #米国IPO #米国株`;
          const postResult = await postToX(tweetText);
          if (!postResult.success) {
            await notifyAdmin(
              `⚠️ X投稿失敗: ${co.name}（分析系）`,
              `エラー: ${postResult.error}`,
              "warn"
            );
          }
        } catch (e: any) {
          await notifyAdmin(`⚠️ X投稿エラー: ${co.name}（分析系）`, String(e), "warn");
        }
      }

      return NextResponse.json({ success: true });
    }

    // ===== 個別パートの生成 =====
    const part = body.part ?? "score";

    if (part === "insights_beginner") {
      const insights = body.insights ?? [];
      const prompt = insightsBeginnerPrompt(insights);
      const msg = await callClaudeWithRetry(prompt);
      const parsed = repairJson(fromFirstBrace(textOf(msg)));
      if (!parsed) {
        return NextResponse.json({ error: "parse failed (insights_beginner)" }, { status: 500 });
      }
      return NextResponse.json(parsed);
    }

    const { dataNote, dataSource } = buildDataNote(co);
    const prompt =
      part === "insights"  ? insightsPrompt(co, dataNote) :
      part === "scenarios" ? scenariosPrompt(co, dataNote) :
      part === "action"    ? actionPrompt(co, dataNote, body.prior) :
      part === "highlights" ? highlightsPrompt(co, dataNote, body.prior) :
      scorePrompt(co, dataNote);

    const msg = await callClaudeWithRetry(prompt);
    const raw2 = textOf(msg);
    let parsed = repairJson(fromFirstBrace(raw2));

    if (!parsed) {
      console.warn(`analyze(${part}) parse failed, retrying once...`);
      await sleep(5000);
      try {
        const retryMsg = await claude.messages.create(buildSonnetParams(prompt, 4500));
        parsed = repairJson(fromFirstBrace(textOf(retryMsg)));
      } catch (e) {
        console.error(`analyze(${part}) retry failed:`, e);
      }
    }

    if (!parsed) {
      await notifyAdmin(
        `分析JSONパース失敗（${part}／リトライ後も失敗）`,
        `銘柄: ${co.name ?? "不明"}`,
        'error'
      );
      return NextResponse.json({ error: `parse failed (${part})` }, { status: 500 });
    }

    return NextResponse.json({ ...parsed, data_source: dataSource });
  } catch (e: any) {
    console.error("analyze error:", e?.message);
    await notifyAdmin(`分析生成エラー`, `エラー: ${e?.message ?? "unknown"}\n\n${e?.stack ?? ""}`, 'error');
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}