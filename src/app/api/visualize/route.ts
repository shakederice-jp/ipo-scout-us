import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { STYLE_RULE } from "@/lib/writing-style";

const anthropic = new Anthropic();
export const maxDuration = 60;

// 保存が権限の都合で無言で失敗しないよう、サービスロールキーを優先して使う
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const CHART_TYPES = ["revenue_chart", "shareholders_chart", "valuation_table", "market_structure_chart", "ipo_summary_table", "use_of_proceeds_table", "risk_table", "shareholders_lockup_table", "key_metrics_table"] as const;
type ChartType = typeof CHART_TYPES[number];


const MAX_TOKENS: Record<ChartType, number> = {
  revenue_chart: 2000,
  shareholders_chart: 4000,
  valuation_table: 4000,
  market_structure_chart: 2000,
  ipo_summary_table: 2000,
  use_of_proceeds_table: 2000,
  risk_table: 3000,
  shareholders_lockup_table: 1000,
  key_metrics_table: 1000,
};

// 文字列から数値を抽出するヘルパー
function parseNumericShares(val: any): number | null {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const cleaned = val.replace(/,/g, "").replace(/株/g, "").trim();
    const m = cleaned.match(/(\d+)/);
    return m ? parseInt(m[1]) : null;
  }
  return null;
}

function parseFloatRatio(val: any): number | null {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    // "15-20%", "15～20%程度" → midpoint（範囲を示す記号がある場合のみ。小数点は範囲とみなさない）
    const range = val.match(/(\d+(?:\.\d+)?)\s*[~〜\-ー]\s*(\d+(?:\.\d+)?)/);
    if (range) return (parseFloat(range[1]) + parseFloat(range[2])) / 2;
    const single = val.match(/(\d+(?:\.\d+)?)/);
    if (single) return parseFloat(single[1]);
  }
  return null;
}
// public_sharesの文字列（例："公募100,000株、売出1,050,000株"）から公募株数だけを取り出す
function parsePublicOfferingShares(val: any): number | null {
  if (typeof val !== "string") return null;
  const m = val.match(/公募[^0-9]{0,5}([0-9,]+)\s*株/);
  if (!m) return null;
  return parseInt(m[1].replace(/,/g, ""), 10);
}
// "△9.77円" や "15.1%" のような文字列を数値に変換（△は日本の会計でマイナスを表す）
function parseJpNumber(val: any): number | null {
  if (typeof val === "number") return val;
  if (typeof val !== "string") return null;
  const isNegative = val.includes("△") || val.includes("▲") || val.trim().startsWith("-");
  const m = val.replace(/,/g, "").match(/([0-9]+(?:\.[0-9]+)?)/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  return isNegative ? -num : num;
}
// "123,456千ドル" "1.2百万ドル" "3億ドル" "-12,345千ドル" "(1,234)" "$1,234" → 百万ドル単位の数値（小数1桁）
function parseUsdMillions(val: any): number | null {
  if (typeof val === "number") return val;
  if (typeof val !== "string") return null;
  const s = val.trim();
  const m = s.replace(/,/g, "").match(/([0-9]+(?:\.[0-9]+)?)/);
  if (!m) return null;
  const isNegative = /^[-−–△▲]/.test(s) || /^[(（]/.test(s) || s.includes("△") || s.includes("▲");
  let factor = 1e-6; // 単位の記載がなければ「ドル」そのもの
  if (/十億ドル|billion/i.test(s)) factor = 1000;
  else if (/億ドル/.test(s)) factor = 100;
  else if (/百万ドル|million/i.test(s)) factor = 1;
  else if (/万ドル/.test(s)) factor = 0.01;
  else if (/千ドル|thousand/i.test(s)) factor = 1e-3;
  const v = Math.round(parseFloat(m[1]) * factor * 10) / 10;
  return isNegative ? -v : v;
}
const fmtM = (v: number | null) => (v === null ? "不明" : v.toLocaleString("en-US", { maximumFractionDigits: 1 }));

function buildPrompt(chartType: ChartType, name: string, sd: any, market: any): string {
  const header = `You are a financial data extractor. Extract visualization data from this IPO company structured data and return ONLY valid JSON with no explanation or markdown.

Company: ${name}
Data: ${JSON.stringify(sd, null, 2)}

CRITICAL: Your response must be a JSON object containing EXACTLY the top-level key(s) shown in the example structure below — nothing more. Do NOT invent or add any additional chart types, additional keys, or extra analysis beyond what is explicitly requested.

IMPORTANT RULES:`;

if (chartType === "revenue_chart") {
  return `${header}
- "citation" fields MUST be natural Japanese sentences — NEVER output raw key:value dumps.
- Use null for any numeric value that is genuinely unknown. Do not invent numbers.
- CRITICAL UNIT RULE: "revenue" and "profit" values MUST be in 百万ドル（millions of US dollars）units. If the source data is in 千ドル（thousands of dollars）, divide by 1,000.
- "profit" must be 営業損益（operating income/loss）specifically. Losses are negative numbers.

Return this exact JSON structure:
{
"revenue_chart": {
  "available": true,
  "title": "売上高・営業損益推移",
  "data": [{"year": "FY2023", "revenue": 232.1, "profit": -7.8}],
  "citation": "S-1の財務情報によると、FY2024の売上高は前年比23.0%増加し285.5百万ドルとなった"
}
}`;
}

  if (chartType === "shareholders_chart") {
    return `${header}
- "citation" fields MUST be natural Japanese sentences — NEVER output raw key:value dumps.
- Include ALL entries from the input shareholders array. Use null for unknown ratios.
- Use null for any numeric value that is genuinely unknown. Do not invent numbers.

Return this exact JSON structure:
{
  "shareholders_chart": {
    "available": true,
    "title": "株主構成",
    "data": [{"name": "name", "ratio": 50, "type": "創業者", "lockup": true}],
    "lockup_info": "創業者および主要株主にはロックアップが設定されている（具体的な期間は書類に記載なし）",
    "citation": "S-1の株主構成によると、創業者および主要株主にロックアップが設定されている"
  }
}`;
  }

  if (chartType === "valuation_table") {
    return `${header}
- "citation" and "comment" fields MUST be natural Japanese sentences — NEVER output raw key:value dumps.
- Use null for any numeric value that is genuinely unknown. Do not invent numbers.
- "fundraising" must be a plain number in 百万ドル（millions of US dollars）. If ipo_details.fundraising_amount is in 千ドル（thousands of dollars）, divide by 1,000.

Return this exact JSON structure:
{
  "valuation_table": {
    "available": true,
    "title": "IPO概要",
    "ipo_price": null,
    "market_cap": null,
    "per": null,
    "pbr": null,
    "float_ratio": 17.5,
    "fundraising": 318,
    "comment": "流通比率は推定15～20%程度。IPO価格は未決定のためPER・PSR・時価総額は上場後に確定する",
    "citation": "S-1のIPO詳細によると、推定流通比率は15～20%程度である"
  }
}`;
  }
  if (chartType === "ipo_summary_table") {
    return `${header}
- "citation" fields MUST be natural Japanese sentences — NEVER output raw key:value dumps.
- Extract from ipo_details: 公開株数（公募+売出の合計株数）, 想定公募価格レンジ（price_range）, 追加購入オプション（金額・有無）, 調達額（合計上限）, 流通比率, ロックアップ対象, ロックアップ期間. Use the original text values as-is (no need to compute or convert units). Amounts are in US dollars.
- If a value is genuinely unknown or not stated, use "書類に記載なし" as the value (not null).
- Do not invent numbers.

Return this exact JSON structure:
{
  "ipo_summary_table": {
    "available": true,
    "title": "IPO条件・資金調達サマリー",
    "rows": [
      {"label": "公開株数（公募+売出）", "value": "5,000,000株"},
      {"label": "想定公募価格レンジ", "value": "16〜18ドル"},
      {"label": "追加購入オプション", "value": "30日以内に最大750,000株"},
      {"label": "調達額（上限）", "value": "約95百万ドル"},
      {"label": "流通比率", "value": "推定15〜20%程度"},
      {"label": "ロックアップ対象", "value": "創業者・主要株主"},
      {"label": "ロックアップ期間", "value": "書類に記載なし"}
    ],
    "citation": "S-1のIPO概要によると、公募及び売出による調達額の上限は約95百万ドルである"
  }
}`;
  }

  if (chartType === "use_of_proceeds_table") {
    return `${header}
- "citation" fields MUST be natural Japanese sentences — NEVER output raw key:value dumps.
- Extract from ipo_details.use_of_proceeds (and fundraising_amount if helpful). List each distinct use-of-funds item as a separate row, using the company's own wording for the category (do NOT force-fit into generic categories like 設備投資/人件費/広告費 unless the prospectus actually uses those terms).
- "amount" is the original display string exactly as stated (e.g. "約20百万ドル" or "調達額の30%").
- "amount_value" is the SAME amount converted to a plain number in 千ドル (thousand-dollar) units, for charting. Examples: "20百万ドル" → 20000. "1.5百万ドル" → 1500. "3,000千ドル" → 3000. If the amount is not a parseable number (e.g. "未定" or a percentage only), set amount_value to null.
- "timing" should be the fiscal year/period the funds will be used in, if stated (e.g. "FY2027"). Omit (set to null) if not stated.
- US S-1 filings often describe use of proceeds only in general terms (working capital, R&D, sales and marketing, general corporate purposes) with percentages or no amounts. Still list each item as a row; when no amount is given, set "amount" to the stated percentage or "金額の記載なし" and amount_value to null.
- If use_of_proceeds information is too vague to break into rows (e.g. just one general sentence with no amounts), set available to false and rows to [].
- Do not invent numbers.

Return this exact JSON structure:
{
  "use_of_proceeds_table": {
    "available": true,
    "title": "調達資金の使途",
    "rows": [
      {"category": "研究開発費", "amount": "約20百万ドル", "amount_value": 20000, "timing": "FY2027"},
      {"category": "運転資金・一般事業目的", "amount": "調達額の30%", "amount_value": null, "timing": null}
    ],
    "citation": "S-1によると、調達資金は研究開発費と運転資金などに充当される予定である"
  }
}`;
  }
  if (chartType === "risk_table") {
    return `${header}
- "citation" fields MUST be natural Japanese sentences — NEVER output raw key:value dumps.
- For each entry in the input "risks" array, classify it into a short Japanese category label based on its content (e.g. "競合", "法的規制", "継続企業・資金繰り", "市場・景気動向", "人材・組織", "技術・セキュリティ", "顧客・取引先依存", "支配株主・複数議決権" etc — choose whatever label best fits each risk's actual content, do not force-fit into a fixed list).
- Keep the original "severity" (高/中/低) and "description" from the input as-is. Use the risk's "title" as well.
- Include ALL risks from the input array, do not omit or summarize them away.
- Do not invent risks that aren't in the input data.

Return this exact JSON structure:
{
  "risk_table": {
    "available": true,
    "title": "主なリスク要因（重要度別）",
    "rows": [
      {"category": "継続企業・資金繰り", "severity": "高", "title": "累積赤字と資金調達の必要性", "description": "営業損失が続いており、追加の資金調達が必要となる可能性"}
    ],
    "citation": "S-1に記載されたリスク要因（Risk Factors）を、カテゴリ別に整理した"
  }
}`;
  }
  // market_structure_chart: recent_ipo_chartのみClaudeに依頼
  return `${header}
- "citation" fields MUST be natural Japanese sentences — NEVER output raw key:value dumps.
- For recent_ipo_chart: using the Recent IPO market data below, extract a numeric "performance" value (percentage, can be negative, e.g. 25 or -10) for each entry in recent_ipos by parsing its "result" field. If recent_ipos is empty or no entries have a parseable numeric result, set available to false and data to [].
- Do not invent numbers.

Recent IPO market data: ${JSON.stringify(market ?? {}, null, 2)}

Return this exact JSON structure:
{
  "recent_ipo_chart": {
    "available": true,
    "title": "直近の米国同業種IPO 初日パフォーマンス",
    "data": [{"name": "企業名", "performance": 25}],
    "citation": "市場動向調査によると、直近の米国同業種IPOはIPO価格を上回る初日終値を記録した"
  }
}`;
}

export async function POST(req: NextRequest) {
  const { companyId, chart_type, save_results } = await req.json();
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  const supabase = getSupabase();

  if (save_results) {
    const { error: saveError } = await supabase
      .from("ipo_companies")
      .update({ visualization_data: save_results })
      .eq("id", companyId);
    if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (!chart_type || !CHART_TYPES.includes(chart_type)) {
    return NextResponse.json({ error: "chart_type が不正です" }, { status: 400 });
  }

  const { data: co, error } = await supabase
    .from("ipo_companies")
    .select("structured_data, name, analysis_market, ipo_price")
    .eq("id", companyId)
    .single();

  if (error || !co) return NextResponse.json({ error: "not found" }, { status: 404 });

  const sd = co.structured_data as any;
  const market = (co as any).analysis_market;

  // market_structure_chart: share_structure_chartはTS側で計算
  if (chart_type === "market_structure_chart") {
    const ipoDetails = sd?.ipo_details ?? {};
    const existingShares = parseNumericShares(ipoDetails.total_shares);
    const newShares = parsePublicOfferingShares(ipoDetails.public_shares);
    const totalShares = (existingShares !== null && newShares !== null)
      ? existingShares + newShares
      : existingShares;
    const floatRatio = parseFloatRatio(ipoDetails.float_ratio);

    let shareStructureChart: any;
    if (totalShares !== null && floatRatio !== null) {
      const floatShares = Math.round(totalShares * floatRatio / 100);
      const lockupShares = totalShares - floatShares;
      const lockupRatio = Math.round((100 - floatRatio) * 10) / 10;
      shareStructureChart = {
        available: true,
        title: "株式構成（上場時）",
        data: [
          { label: "上場時流通株式", shares: floatShares, ratio: floatRatio },
          { label: "ロックアップ対象等", shares: lockupShares, ratio: lockupRatio },
        ],
        citation: `S-1のIPO詳細によると、上場後発行済株式総数${totalShares.toLocaleString()}株に対し流通比率は推定${floatRatio}%程度である`,
      };
    } else {
      shareStructureChart = { available: false, title: "株式構成（上場時）", data: [], citation: "" };
    }

    // recent_ipo_chartのみClaudeに依頼
    try {
      const prompt = buildPrompt("market_structure_chart", (co as any).name, sd, market);
      const message = await anthropic.messages.create(
        { model: "claude-haiku-4-5", max_tokens: MAX_TOKENS["market_structure_chart"], messages: [{ role: "user", content: prompt + STYLE_RULE }] },
        { timeout: 55000 }
      );
      const text = (message.content[0] as any).text;
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      return NextResponse.json({
        success: true,
        chart_type,
        data: { share_structure_chart: shareStructureChart, recent_ipo_chart: parsed.recent_ipo_chart },
      });
    } catch (e) {
      // recent_ipo_chartが失敗してもshare_structure_chartは返す
      return NextResponse.json({
        success: true,
        chart_type,
        data: { share_structure_chart: shareStructureChart, recent_ipo_chart: { available: false, data: [], title: "直近の米国同業種IPO 初日パフォーマンス", citation: "" } },
      });
    }
  }
// revenue_chart: 構造化済みのkey_metrics（売上高・営業損益）を使い、TS側で確定的に計算する（単位：百万ドル）
if (chart_type === "revenue_chart") {
  const keyMetrics: any[] = Array.isArray(sd?.key_metrics) ? sd.key_metrics : [];

  if (keyMetrics.length === 0) {
    return NextResponse.json({
      success: true,
      chart_type,
      data: { revenue_chart: { available: false, title: "売上高・営業損益推移", data: [], citation: "" } },
    });
  }

  const chartData = keyMetrics.map((m: any) => ({
    year: m.period,
    revenue: parseUsdMillions(m.revenue),        // 百万ドル
    profit: parseUsdMillions(m.ordinary_profit), // 営業損益（百万ドル）。赤字はマイナス
  }));

  const first = chartData[0];
  const last = chartData[chartData.length - 1];

  let citation = "";
  if (first && last) {
    citation = chartData.length >= 2
      ? `${(co as any).name}の財務実績によると、売上高は${first.year}の${fmtM(first.revenue)}百万ドルから${last.year}の${fmtM(last.revenue)}百万ドルとなり、営業損益は${last.year}に${fmtM(last.profit)}百万ドルとなった。`
      : `${(co as any).name}の財務実績によると、${last.year}の売上高は${fmtM(last.revenue)}百万ドル、営業損益は${fmtM(last.profit)}百万ドルである。`;
  }

  return NextResponse.json({
    success: true,
    chart_type,
    data: {
      revenue_chart: {
        available: true,
        title: "売上高・営業損益推移",
        unit: "百万ドル",
        data: chartData,
        citation,
      },
    },
  });
}

// shareholders_lockup_table: すでに構造化済みのデータをそのまま使うのでClaude不要
if (chart_type === "shareholders_lockup_table") {
  const shareholders: any[] = Array.isArray(sd?.shareholders) ? sd.shareholders : [];
  const lockupPeriod = sd?.ipo_details?.lockup_period ?? null;
  const lockupTargets = sd?.ipo_details?.lockup_targets ?? null;

  const rows = shareholders.map((s: any) => ({
    name: s?.name ?? "書類に記載なし",
    shares: s?.shares ?? "書類に記載なし",
    ratio: s?.ratio ?? "書類に記載なし",
    type: s?.type ?? "書類に記載なし",
    lockup: s?.lockup ?? "書類に記載なし",
  }));

  const citationParts: string[] = [];
  if (lockupTargets) citationParts.push(`ロックアップ対象は${lockupTargets}`);
  if (lockupPeriod) citationParts.push(`期間は${lockupPeriod}`);
  const citation = citationParts.length > 0 ? `S-1によると、${citationParts.join("、")}である。` : "";

  return NextResponse.json({
    success: true,
    chart_type,
    data: {
      shareholders_lockup_table: {
        available: rows.length > 0,
        title: "大株主・ロックアップ情報",
        rows,
        lockup_period: lockupPeriod,
        lockup_targets: lockupTargets,
        citation,
      },
    },
  });
}

// key_metrics_table: 構造化済みデータをそのまま使い、PER・PSRはIPO価格が入力されていれば自動計算する
if (chart_type === "key_metrics_table") {
  const keyMetrics: any[] = Array.isArray(sd?.key_metrics) ? sd.key_metrics : [];
  const latest = keyMetrics.length > 0 ? keyMetrics[keyMetrics.length - 1] : null;

  const ipoPrice = (co as any).ipo_price ?? null;
  const latestEps = latest ? parseJpNumber(latest.eps) : null;
  const per = (ipoPrice && latestEps && latestEps > 0) ? Math.round((ipoPrice / latestEps) * 10) / 10 : null;

  // PSR（株価売上高倍率）＝ 時価総額 ÷ 直近の売上高（赤字企業でも使える指標）
  const ipoDetails = sd?.ipo_details ?? {};
  const existingShares = parseNumericShares(ipoDetails.total_shares);
  const newShares = parsePublicOfferingShares(ipoDetails.public_shares);
  const totalShares = (existingShares !== null && newShares !== null) ? existingShares + newShares : existingShares;
  const latestRevenue = latest ? parseUsdMillions(latest.revenue) : null;
  const marketCap = (ipoPrice && totalShares) ? (ipoPrice * totalShares) / 1_000_000 : null; // 百万ドル
  const psr = (marketCap && latestRevenue && latestRevenue > 0) ? Math.round((marketCap / latestRevenue) * 10) / 10 : null;

  return NextResponse.json({
    success: true,
    chart_type,
    data: {
      key_metrics_table: {
        available: keyMetrics.length > 0,
        title: "主要財務指標の推移",
        trend_rows: keyMetrics,
        latest_summary: latest ? {
          period: latest.period,
          total_assets: latest.total_assets,
          net_assets: latest.net_assets,
          eps: latest.eps,
        } : null,
        per,
        psr,
        pbr: null,
        ipo_price: ipoPrice,
        citation: keyMetrics.length > 0
          ? `S-1の財務サマリーによると、直近期（${latest?.period ?? ""}）の売上高は${latest?.revenue ?? "不明"}、営業損益は${latest?.ordinary_profit ?? "不明"}、純損益は${latest?.net_profit ?? "不明"}である。`
          : "",
      },
    },
  });
}

  // その他のchartType
  const prompt = buildPrompt(chart_type as ChartType, (co as any).name, sd, market);
  try {
    const message = await anthropic.messages.create(
      { model: "claude-haiku-4-5", max_tokens: MAX_TOKENS[chart_type as ChartType] ?? 2000, messages: [{ role: "user", content: prompt + STYLE_RULE }] },
      { timeout: 55000 }
    );
    const text = (message.content[0] as any).text;
    const clean = text.replace(/```json|```/g, "").trim();
    const chartData = JSON.parse(clean);
   // 念のため、頼んだchart_type以外の余計なキーは全て捨てる（Claudeが余計なデータを作ってしまった場合の保険）
   const filtered: Record<string, any> = { [chart_type]: chartData[chart_type] };

   // valuation_table: 流通比率はAI任せにせず常にstructured_dataの実値を使う（market_structure_chartと計算方法を統一）
   if (chart_type === "valuation_table" && filtered.valuation_table) {
    const ipoDetails = sd?.ipo_details ?? {};
    const floatRatioFromData = parseFloatRatio(ipoDetails.float_ratio);
    if (floatRatioFromData !== null) {
      filtered.valuation_table = {
        ...filtered.valuation_table,
        float_ratio: floatRatioFromData,
      };
    }

    // 公募価格が確定している場合、時価総額・PER・PBRはAI任せにせずTS側で確定計算して上書きする
    const ipoPrice = (co as any).ipo_price ?? null;
    if (ipoPrice) {
      const existingShares = parseNumericShares(ipoDetails.total_shares);
      const newShares = parsePublicOfferingShares(ipoDetails.public_shares);
      const totalShares = (existingShares !== null && newShares !== null)
        ? existingShares + newShares
        : existingShares;

      const keyMetrics: any[] = Array.isArray(sd?.key_metrics) ? sd.key_metrics : [];
      const latest = keyMetrics.length > 0 ? keyMetrics[keyMetrics.length - 1] : null;
      const latestEps = latest ? parseJpNumber(latest.eps) : null;
      const latestRevenue = latest ? parseUsdMillions(latest.revenue) : null;

      const marketCap = totalShares ? Math.round((ipoPrice * totalShares) / 1_000_000) : null; // 百万ドル
      const per = (latestEps && latestEps > 0) ? Math.round((ipoPrice / latestEps) * 10) / 10 : null;
      const psr = (marketCap && latestRevenue && latestRevenue > 0) ? Math.round((marketCap / latestRevenue) * 10) / 10 : null;

      filtered.valuation_table = {
        ...filtered.valuation_table,
        ipo_price: ipoPrice,
        market_cap: marketCap,
        per,
        psr,
        pbr: null,
      };
    }
  }

    return NextResponse.json({ success: true, chart_type, data: filtered });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}