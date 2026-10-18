import { getScheduleCompanies } from "@/lib/get-companies";

// 生成AI(ChatGPT・Claude・Perplexityなど)にサイトの概要を伝えるための案内ファイル(/llms.txt)。
// 銘柄の一覧は、登録データから自動で作る(銘柄を追加すると、1時間以内に反映される)。
export const revalidate = 3600;

const BASE = "https://ipo-us.finance-tower.com";

function todayJst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

export async function GET() {
  let rows: any[] = [];
  try { rows = await getScheduleCompanies(); } catch { rows = []; }
  const today = todayJst();
  const from = addDays(today, -60);
  const upcoming = rows.filter((r) => r.listing_date && r.listing_date >= today);
  const recent = rows.filter((r) => r.listing_date && r.listing_date < today && r.listing_date >= from).reverse();
  const line = (r: any) =>
    `- [${r.name}${r.ticker ? `（${r.ticker}）` : ""}](${BASE}/analysis/${r.ticker ?? r.id}): 上場日${r.listing_date}${r.listing_date_confirmed ? "" : "（予定）"}`;

  const body = `# 米国IPO企業情報AI分析レポート（大手町調査室九課）

> 米国で上場するIPO（新規株式公開）企業の目論見書（S-1）などをAIが日本語で読み解き、上場日・公募価格・ロックアップ解除日・主幹事・日本からの買い方・上場後の値動きを銘柄ごとにまとめた日本語サイトです。運営は大手町調査室九課（ピークアンドバレー合同会社）。日本株のIPOを扱う姉妹サイトは別ドメイン（https://ipo.finance-tower.com）です。

## 主なページ
- [米国IPO 上場スケジュール](${BASE}/schedule): 上場予定の銘柄を月ごとに一覧にした表。上場日・公募価格（想定の価格帯）・ロックアップ解除日。1時間ごとに自動更新。
- [日本から米国IPOに参加する方法](${BASE}/how-to-buy): 日本の証券会社（楽天証券・SBI証券）での抽選の取り扱い状況と、上場後に買う方法。確認日を明記。
- [米国IPO用語集](${BASE}/glossary): ロックアップ、S-1、主幹事、ロードショー、売買単位（単元）などの解説。
- [IPO投資の法則](${BASE}/ipo-guide): IPO投資の考え方の解説。
- [マーケットトレンド](${BASE}/trends): 米国IPO市場のニュースと動向。
- [サイトの使い方](${BASE}/guide)

## 銘柄ページ
各銘柄のページは ${BASE}/analysis/{ティッカー} の形式です。冒頭に「結論1行と主要数値表」（上場日・公募価格・ロックアップ解除日・主幹事）があり、無料で読めます。AIによる詳細な分析は、銘柄により有料です。

### これから上場する銘柄
${upcoming.length ? upcoming.map(line).join("\n") : "- 現在、上場日が決まっている銘柄はありません。"}

### 最近上場した銘柄（直近60日）
${recent.length ? recent.map(line).join("\n") : "- 該当する銘柄はありません。"}

## 情報の出どころと扱い方
- 出典は、SEC（米国証券取引委員会）の電子開示システムEDGARの提出書類（S-1、424B4など）、Nasdaqなどの公開情報、Yahoo Financeの株価です。
- 要約・翻訳・分析はAIによる自動生成で、別のAIによる原文との照合（校正）を経ています。投資勧誘ではありません。
- 日付と価格は発表のたびに変わります。引用するときは、各ページの更新日と出典（SEC提出書類）を確認してください。
- 円換算は、1ドル150円などの固定レートによる目安です。
- 上場日は「予定」のものを含みます。確定した日付かどうかは、各ページに明記しています。
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
