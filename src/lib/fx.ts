// =============================================================
// 為替(ドル→円)の表示設定
// -------------------------------------------------------------
// ・サブスクの料金は日本版と同じ「円」です（src/lib/pricing.ts）。
// ・このファイルは、米国株の価格(ドル)に円の目安を添える場所（投資シミュレーション・損益など）で使います。
//   例: $1,000（約150,000円・1ドル150円換算）
// ・毎日レートを変えると混乱するので、換算レートは固定です。円高/円安が進んだら5円刻みで変更します（145 → 150 → 155 …）。
//
// 変更方法（どちらか1つ）
//   A) Vercel の Environment Variables に NEXT_PUBLIC_USD_JPY_RATE=155 を設定して再デプロイ
//   B) 下の DEFAULT_RATE の数字を書き換えて git push
// =============================================================

const DEFAULT_RATE = 150;

function resolveRate(): number {
  const raw = Number(process.env.NEXT_PUBLIC_USD_JPY_RATE);
  if (!Number.isFinite(raw) || raw < 50 || raw > 500) return DEFAULT_RATE;
  // 5円刻みに揃える（例: 152 → 150, 153 → 155）
  return Math.round(raw / 5) * 5;
}

/** 換算に使う為替レート（1ドル＝○円）。5円刻み */
export const USD_JPY_RATE = resolveRate();

/** 「1ドル150円換算」 */
export const FX_LABEL = `1ドル${USD_JPY_RATE}円換算`;

/** 画面の下に添える注意書き */
export const FX_NOTE =
  `※ 円は目安です（${FX_LABEL}）。実際の為替レートとは異なります。`;

/** 数値をドル表記に。整数なら小数なし、それ以外は小数2桁。 例: 3.99 → "$3.99" / 17 → "$17" */
export function fmtUsd(v: number): string {
  const neg = v < 0;
  const a = Math.abs(v);
  const s = a.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(a) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${neg ? "-" : ""}$${s}`;
}

/** ドル → 円（四捨五入した整数） */
export function usdToJpy(usd: number): number {
  return Math.round(usd * USD_JPY_RATE);
}

/** 「約599円」 */
export function fmtJpyApprox(usd: number): string {
  const y = usdToJpy(usd);
  return `約${y < 0 ? "-" : ""}${Math.abs(y).toLocaleString("ja-JP")}円`;
}

/** 「$3.99（約599円）」 レート表記なし（近くに FX_NOTE がある場所向け） */
export function fmtUsdYen(usd: number): string {
  return `${fmtUsd(usd)}（${fmtJpyApprox(usd)}）`;
}

/** 「$3.99（約599円・1ドル150円換算）」 */
export function fmtUsdYenFull(usd: number): string {
  return `${fmtUsd(usd)}（${fmtJpyApprox(usd)}・${FX_LABEL}）`;
}

/** 「約599円・1ドル150円換算」 カッコの中身だけ */
export function fmtYenWithRate(usd: number): string {
  return `${fmtJpyApprox(usd)}・${FX_LABEL}`;
}
