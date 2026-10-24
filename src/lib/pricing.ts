// =============================================================
// 料金（円建て）— 日本版とまったく同じ料金です。全ページの価格表示はここを参照します
// -------------------------------------------------------------
// ★重要★ ここの金額は「表示」用です。実際の請求額は Stripe の Price（日本版と同じもの）で決まります。
//   金額を変えるときは、日本版の src/lib/plan-catalog.ts と Stripe の Price も合わせてください。
// 2026/10/24: 3プラン化。通知プラン・レポート無制限・コンプリートパックを廃止し、
//   A 分析プラン(plan_a) / B 分析＋通知プラン(plan_b) / C 総合プラン(plan_c) にした(日本版と共通)。
// =============================================================

export const PRICE_JPY = {
  single: 500,     // シングルレポート（1銘柄）
  plan_a: 2890,    // A 分析プラン（月額）
  plan_b: 3890,    // B 分析＋通知プラン（月額）
  plan_c: 4890,    // C 総合プラン（月額）
} as const;

export type PriceKey = keyof typeof PRICE_JPY;

/** 「¥2,890」 */
export const jpy = (k: PriceKey) => `¥${PRICE_JPY[k].toLocaleString("ja-JP")}`;
/** 「¥2,890/月」 */
export const jpyMonth = (k: PriceKey) => `${jpy(k)}/月`;
/** 「¥500/件」 */
export const jpyPerItem = (k: PriceKey) => `${jpy(k)}/件`;
