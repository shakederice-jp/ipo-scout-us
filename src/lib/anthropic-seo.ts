// 2026/11/12新設: ANTHROPIC, PBC のページ用の特別なSEO(検索で見つけてもらうための工夫)。
// 方針:
//  ・書くのは「登録データ(上場日・価格帯など)」と「公開されている会社の基本情報」だけ。推測や噂は書かない。
//  ・検索されそうな言い方(アンソロピック/アントロピック/Anthropic IPO/上場日/公募価格/買い方 など)を、題名・説明・見出し・FAQに自然に入れる。
//  ・AI企業を題材にしたページであることと、当サイトの文章がAIで作られていることを、はっきり書く(誤解を避けるため)。
import { buildKeyFaq, jpDate, type KeyFactsInput, type KeyFactsExtra } from "@/components/KeyFacts";
import { fmtUsd } from "@/lib/fx";
import { PUBLIC_ORIGIN, BASE_PATH } from "@/lib/base-path";

export const ANTHROPIC_SLUG = "anthropic";
export const ANTHROPIC_URL = `${PUBLIC_ORIGIN}${BASE_PATH}/analysis/${ANTHROPIC_SLUG}`;
export const ANTHROPIC_OGP = `${PUBLIC_ORIGIN}${BASE_PATH}/og-anthropic.png`;

export const ANTHROPIC_PROFILE =
  "Anthropic（アンソロピック。正式名称 Anthropic, PBC）は、対話型AI「Claude（クロード）」シリーズを開発する米国のAI企業です。2021年に設立され、本社は米国カリフォルニア州サンフランシスコ。株主の利益に加えて社会的な公益も目的に掲げる「公益法人（Public Benefit Corporation）」として設立されています。";

function priceText(co: any): string {
  const lo = co.price_range_min, hi = co.price_range_max;
  if (lo == null && hi == null) return "";
  const a = (lo ?? hi) as number, b = (hi ?? lo) as number;
  return a === b ? fmtUsd(a) : `${fmtUsd(a)}〜${fmtUsd(b)}`;
}

export function anthropicMetadata(co: any) {
  const ticker: string | null = co.ticker ?? null;
  const ld = jpDate(co.listing_date);
  const facts = [
    ld ? `上場日${ld}${co.listing_date_confirmed ? "" : "(予定)"}` : "",
    priceText(co) ? `${co.sec_stage === "priced" ? "公募価格" : "想定価格帯"}${priceText(co)}` : "",
  ].filter(Boolean).join("、");
  const title = `Anthropic（アンソロピック）のIPO｜上場日・公募価格・ロックアップ・日本からの買い方`;
  const description = `Anthropic${ticker ? `（${ticker}）` : ""}の米国IPO情報を日本語で。${facts ? facts + "。" : ""}ロックアップ解除日・主幹事・日本からの買い方を、SEC提出書類などの公開情報をもとに整理。この銘柄のレポートはどなたでも無料で読めます。`.slice(0, 200);
  const keywords = [
    "Anthropic IPO", "アンソロピック IPO", "アンソロピック 上場", "アントロピック 上場", "Anthropic 上場日",
    "Anthropic 公募価格", "Anthropic ロックアップ", "Anthropic 株 買い方", "Anthropic 日本から", "Anthropic PBC",
    "Claude 開発元 上場", "AI企業 IPO", "米国IPO",
    ticker ?? "",
  ].filter(Boolean);
  return {
    title, description, keywords,
    openGraph: {
      title, description, url: ANTHROPIC_URL,
      siteName: "米国IPO企業情報AI分析レポート｜大手町調査室九課",
      locale: "ja_JP", type: "article",
      images: [{ url: ANTHROPIC_OGP, width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image" as const, title, description, images: [ANTHROPIC_OGP] },
    alternates: { canonical: ANTHROPIC_URL },
  };
}

// 画面にも構造化データ(FAQ)にも使う「よくある質問」。登録データから作る部分(buildKeyFaq)に、Anthropic向けの質問を足す。
export function anthropicFaq(co: KeyFactsInput, x: KeyFactsExtra): { q: string; a: string }[] {
  const facts = buildKeyFaq(co, x);
  const extra = [
    { q: "Anthropic（アンソロピック）とはどんな会社ですか？", a: ANTHROPIC_PROFILE },
    { q: "Anthropicの株は、日本からIPOで買えますか？", a: "上場後は、米国株を取り扱う日本の証券会社で買うのが一般的です。IPO（公募）の段階での抽選の取り扱いは証券会社ごとに異なり、注目度の高い銘柄ほど個人投資家への配分が少ないことがあります。最新の取り扱い状況は「日本から米国IPOに参加する方法」のページに、確認日つきでまとめています。" },
    { q: "このページの情報は、どこから来ていますか？", a: "SEC（米国証券取引委員会）の電子開示システムEDGARに提出された書類（S-1など）や、取引所などの公開情報が出どころです。要約・翻訳・分析はAIによる自動生成で、別のAIによる原文との照合を経ています。投資の勧誘ではなく、最終的な判断は一次資料を確認のうえご自身でお願いします。" },
    { q: "AI企業のページを、AIで作っていて大丈夫ですか？", a: "当サイトの文章は生成AIで作っています。AI企業のAnthropicを題材にするこのページでも、日付・価格などの事実は公開情報の出典に基づいて表示し、AIによる評価とは分けています。評価の部分は参考意見として読み、数字は出典の書類でご確認ください。" },
  ];
  return [...facts, ...extra];
}

export function anthropicBreadcrumbLd() {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "米国IPO企業情報AI分析レポート", item: `${PUBLIC_ORIGIN}${BASE_PATH}` },
      { "@type": "ListItem", position: 2, name: "上場スケジュール", item: `${PUBLIC_ORIGIN}${BASE_PATH}/schedule` },
      { "@type": "ListItem", position: 3, name: "Anthropic（アンソロピック）のIPO", item: ANTHROPIC_URL },
    ],
  };
}
