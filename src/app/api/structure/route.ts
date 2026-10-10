import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!
);

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 構造化に使うモデル。Haiku 5.5へ切り替える場合はここだけ変える
// (5.5は「プレフィル」が使えないため、プロンプトでJSON出力を指示する作りにしてある)
const STRUCTURE_MODEL = "claude-haiku-4-5";
const JSON_ONLY_NOTE = "\n\n【出力形式】前置き・説明文・コードブロックは一切付けず、{ で始まるJSONオブジェクトだけを出力してください。";

// 応答の中から text ブロックだけを取り出す
function textOf(msg: any): string {
  const blocks = Array.isArray(msg?.content) ? msg.content : [];
  return blocks.filter((b: any) => b?.type === "text").map((b: any) => b.text ?? "").join("");
}

// 最初の { 以降を返す(コードブロックや前置きが付いても、JSON本体だけ取り出せるようにする)
function fromFirstBrace(text: string): string {
  const i = text.indexOf("{");
  return i === -1 ? text : text.slice(i);
}

export async function POST(req: NextRequest) {
  try {
    const { company_id } = await req.json();
    const supabase = getSupabase();

    const { data: company, error } = await supabase
      .from("ipo_companies")
      .select("name, sector, raw_prospectus")
      .eq("id", company_id)
      .single();

    if (error || !company) {
      return NextResponse.json({ error: "企業が見つかりません" }, { status: 404 });
    }

    if (!company.raw_prospectus) {
      return NextResponse.json({ error: "SEC書類のデータがありません。先に①を実行してください。" }, { status: 400 });
    }

    const sections = (company.raw_prospectus ?? {}) as Record<string, string>;
    const rawText = Object.entries(sections)
      .map(([label, content]) => `【${label}】\n${content}`)
      .join("\n\n")
      .slice(0, 95000);

    const prompt = `以下は米国のIPO企業「${company.name}」のSEC提出書類(Form S-1など、目論見書を兼ねた登録届出書)の英語テキスト(抜粋)です。
必要な財務・株主・公募条件の数値を抽出し、JSONのみで返してください。前置き・後置き・マークダウン記法は一切不要です。
説明文・要約は日本語で書き、数値は書類に記載された通貨・単位(通常は米ドル、「in thousands」なら千ドル)のまま、桁を変換せずに使ってください(例：「$12,345 千ドル」ではなく、書類が千ドル単位なら「12,345千ドル」)。
書類に記載がない項目は"書類に記載なし"としてください。ただし公募価格・株数・価格帯など、書類の時点でまだ確定していない項目(「[●]」「$—」が空欄など)は"未定"としてください。
特にpublic_shares、fundraising_amountは、書類本文に明記された数字のみを使用し、決して推測や概算をしないでください。
float_ratio(流通比率)のみ、以下の計算式で必ず算出してください(他の独自解釈は禁止)：
  ・上場後発行済株式総数 ＝ 公募前の発行済株式総数(「The Offering」の「Common stock outstanding before this offering」など。複数クラスがある場合は合算) ＋ 公募(新規発行)株式数
  ・流通株式数 ＝ 公募株式数 ＋ 売出株式数(既存株主の売出し「selling stockholders」) ＋ 追加購入オプション(option to purchase additional shares)の株式数
  ・float_ratio ＝ 流通株式数 ÷ 上場後発行済株式総数 × 100(％、小数点1桁、"推定XX.X%程度"の形式で出力)

key_metricsは特に重要な項目です。「Summary Financial Data」(または「Summary Consolidated Financial Data」「Selected Financial Data」)の表から、記載されている全期間分(通常は直近2〜3会計年度。中間期の数字も併記されている場合は、それも別の行として)を、古い期から新しい期の順に配列で抽出してください。この項目を絶対に省略しないでください。
米国のS-1には日本の「経常利益」「自己資本比率」「ROE」「1株当たり純資産」にあたる記載が無いことが多いため、次の対応で入れてください。
  ・revenue：売上高(Revenue / Total revenue)
  ・ordinary_profit：営業損益(Income (loss) from operations / Operating income (loss))。営業損益の記載が無ければ"書類に記載なし"
  ・net_profit：当期純損益(Net income (loss))
  ・total_assets：総資産(Total assets)
  ・net_assets：株主資本(Total stockholders' equity (deficit))
  ・equity_ratio：書類に自己資本比率の記載が無ければnull(自分で計算しないこと)
  ・roe：書類に記載が無ければnull
  ・eps：1株当たり純損益(Net income (loss) per share, basic)
  ・bps：書類に記載が無ければnull
値が「—」など未記載の場合はnullとしてください。損失は「△」ではなく「-」または「(1,234)」の書類表記を踏まえ、「-1,234千ドル」のようにマイナスで表してください。
出力例(2期分のみ示す。実際は表に記載されている全期間分を出力すること)：
"key_metrics": [
  {"period": "FY2024(2024年12月期)", "revenue": "123,456千ドル", "ordinary_profit": "-12,345千ドル", "net_profit": "-15,000千ドル", "total_assets": "200,000千ドル", "net_assets": "80,000千ドル", "equity_ratio": null, "roe": null, "eps": "-1.20ドル", "bps": null},
  {"period": "FY2025(2025年12月期)", "revenue": "180,000千ドル", "ordinary_profit": "-5,000千ドル", "net_profit": "-6,500千ドル", "total_assets": "260,000千ドル", "net_assets": "120,000千ドル", "equity_ratio": null, "roe": null, "eps": "-0.65ドル", "bps": null}
]

【SEC提出書類のテキスト(英語)】
${rawText}

【抽出するJSON形式】
{
  "company_name": "企業名",
  "business_summary": "事業内容の要約(日本語、200字以内)",
  "financials": {
    "revenue_trend": "売上高の推移(例：FY2023 85百万ドル→FY2024 123百万ドル→...)",
    "profit_trend": "営業損益・純損益の推移(黒字化の時期や赤字幅の変化がわかるように)",
    "profit_margin": "直近の営業利益率(赤字なら営業損失率。例：-10.5%)",
    "cash_flow": "営業キャッシュフローの状況(MD&Aの記載から。記載が無ければ'書類に記載なし')"
  },
  "key_metrics": [
    {
      "period": "決算期(例：FY2025(2025年12月期)、または中間期)",
      "revenue": "売上高(書類記載の単位のまま)",
      "ordinary_profit": "営業損益",
      "net_profit": "当期純損益",
      "total_assets": "総資産",
      "net_assets": "株主資本",
      "equity_ratio": null,
      "roe": null,
      "eps": "1株当たり純損益",
      "bps": null
    }
  ],
  "ipo_details": {
    "total_shares": "公募前の発行済株式総数(例：52,000,000株。複数クラスなら合算し内訳を添える)",
    "public_shares": "公募・売出株式数。必ず『公募5,000,000株・売出1,000,000株』の形式で、売出が無ければ『公募5,000,000株・売出0株』と書くこと",
    "float_ratio": "流通株式比率の推定(例：推定15.2%程度)",
    "fundraising_amount": "調達資金総額の見込み(書類に明記があれば。公募価格レンジの中間値×公募株数など、自分で計算した値は書かず、明記が無ければ'書類に記載なし'または'未定')",
    "use_of_proceeds": "資金使途の要約(Use of Proceedsより)",
    "price_range": "想定公募価格帯(例：1株15〜17ドル。未確定なら'未定')",
    "underwriters": "主幹事・引受幹事の証券会社(例：Goldman Sachs & Co. LLC、Morgan Stanley。Underwritingの表紙・表より)",
    "listing_venue": "上場予定の取引所とティッカー(例：Nasdaq Global Market・「ABCD」)",
    "lockup_period": "ロックアップ期間(例：目論見書日から180日間)",
    "lockup_targets": "ロックアップ対象者(例：役員・取締役・ほぼ全ての既存株主)※注意：ロックアップ条項は「we, our directors, officers and holders of substantially all of our securities have agreed not to sell... without the prior written consent of the representatives」という構造です。売却を制限される対象者は主語(会社、役員、既存株主)で、引受証券会社(representatives)は同意権を持つ相手方であり対象者ではありません。証券会社名をlockup_targetsに含めないでください。",
    "overallotment": "追加購入オプション(option to purchase additional shares)の有無と規模(例：30日以内に引受人が最大750,000株を追加購入できる)。株数は『750,000株』の形式で書くこと"
  },
  "shareholders": [
    {
      "name": "株主名(個人名または法人名・ファンド名)",
      "ratio": "公募前の保有比率(例：43.9%)※必ず%付きの数値で",
      "shares": "保有株式数(例：3,950,000株)",
      "type": "属性(創業者/VC/事業会社/役員/その他)",
      "lockup": "ロックアップ(有/無/記載なし)"
    }
  ],
  "risks": [
    {
      "title": "リスクタイトル(日本語)",
      "severity": "高/中/低",
      "description": "内容(日本語、50字以内)"
    }
  ],
  "management": "CEOなど主要経営陣の主な情報",
  "growth_drivers": "成長ドライバー(主な2〜3点)",
  "concerns": "懸念点(主な2〜3点。赤字・資金繰り・顧客集中・複数議決権株式による支配など、Risk Factorsの要点)"
}

株主構成については、「Principal Stockholders(または Principal and Selling Stockholders)」の表から、5%以上の保有者と役員・取締役の合計を、氏名(法人名・ファンド名)・保有株式数・公募前の保有比率で抜き出してください。複数クラスの株式がある場合は、議決権の割合ではなく株式数ベースの比率を優先し、判断できなければ書類に記載された数字をそのまま書いてください。表が無い場合のみ、書類中の記載から推測し、ratioやsharesの末尾に「(推定)」と付けてください。
持株比率は必ず「XX.X%」形式の数値で返してください。`;

    const msg = await claude.messages.create({
      model: STRUCTURE_MODEL,
      max_tokens: 7000,
      messages: [{ role: "user", content: prompt + JSON_ONLY_NOTE }]
    } as any);

    const text = fromFirstBrace(textOf(msg));

    let structured: any = null;
    try {
      structured = JSON.parse(text);
    } catch {
      for (let i = text.length - 1; i > Math.max(0, text.length - 3000); i--) {
        if (text[i] === '}') {
          try {
            structured = JSON.parse(text.slice(0, i + 1));
            if (structured) break;
          } catch { continue; }
        }
      }
    }

    if (!structured) {
      return NextResponse.json({ error: "データの構造化に失敗しました。再試行してください。" }, { status: 500 });
    }

    // 流通比率はAIの自由記述だと不安定なため、保存直前にプログラムで確実に再計算する
    function extractShares(text: string | undefined | null, keyword?: string): number | null {
      if (!text) return null;
      const pattern = keyword
        ? new RegExp(keyword + "[^0-9]{0,5}([0-9,]+)\\s*株")
        : /([0-9,]+)\s*株/;
      const m = text.match(pattern);
      if (!m) return null;
      return parseInt(m[1].replace(/,/g, ""), 10);
    }

    if (structured?.ipo_details) {
      const existingTotal = extractShares(structured.ipo_details.total_shares);
      const publicSharesText = structured.ipo_details.public_shares ?? "";
      const newShares = extractShares(publicSharesText, "公募");
      const soldShares = extractShares(publicSharesText, "売出");
      const oaShares = extractShares(structured.ipo_details.overallotment);

      if (existingTotal && newShares) {
        const postIpoTotal = existingTotal + newShares;
        const floatShares = newShares + (soldShares ?? 0) + (oaShares ?? 0);
        const ratio = Math.round((floatShares / postIpoTotal) * 1000) / 10;
        structured.ipo_details.float_ratio = `推定${ratio}%程度`;
      }
    }

    const { error: saveError } = await supabase.from("ipo_companies").update({
      structured_data: structured,
      analysis_detail: null,
    }).eq("id", company_id);
    if (saveError) {
      return NextResponse.json({ error: `保存に失敗しました: ${saveError.message}` }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "✅ 構造化完了！次に「③Claudeで分析」を実行してください。",
      preview: {
        business: structured.business_summary?.slice(0, 80),
        financials: structured.financials?.revenue_trend,
        public_shares: structured.ipo_details?.public_shares,
        lockup: structured.ipo_details?.lockup_period,
        float_ratio: structured.ipo_details?.float_ratio,
        risks_count: structured.risks?.length ?? 0,
        shareholders_count: structured.shareholders?.length ?? 0,
      }
    });
  } catch (e: any) {
    console.error("structure error:", e?.message);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}