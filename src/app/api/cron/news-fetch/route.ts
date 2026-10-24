import { NextResponse } from "next/server";

// 2026/10/24廃止: 米国版ではマーケットトレンド記事の自動収集をやめた
// (日本語ニュースが中心で、米国版のテーマに合わず、運用も追いきれないため)。
export async function GET() {
  return NextResponse.json(
    { error: "この機能は米国版では廃止されました(マーケットトレンドの提供終了)。" },
    { status: 410 }
  );
}
