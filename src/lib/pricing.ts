// =============================================================
// 料金（円建て）— 日本版とまったく同じ料金です。全ページの価格表示はここを参照します
// -------------------------------------------------------------
// ★重要★ ここの金額は「表示」用です。実際の請求額は Stripe の Price（日本版と同じもの）で決まります。
//   金額を変えるときは、日本版の src/lib/pricing.ts（または各ページ）と Stripe の Price も合わせてください。
// =============================================================

export const PRICE_JPY = {
  single: 500,     // シングルレポート（1銘柄）
  notify: 890,     // 通知プラン（月額）
  unlimited: 1890, // レポート無制限（月額）
  complete: 2490,  // コンプリートパック（月額）
} as const;

export type PriceKey = keyof typeof PRICE_JPY;

/** 「¥890」 */
export const jpy = (k: PriceKey) => `¥${PRICE_JPY[k].toLocaleString("ja-JP")}`;
/** 「¥890/月」 */
export const jpyMonth = (k: PriceKey) => `${jpy(k)}/月`;
/** 「¥500/件」 */
export const jpyPerItem = (k: PriceKey) => `${jpy(k)}/件`;
