import { NextResponse } from "next/server";

// 2026/10/24廃止: EDINET(日本の上場書類)の取得処理は日本版(ipo-scout)の機能で、米国版には不要。
// 日本版からコピーされた名残のため、動かないようにした(動かすと日本の銘柄が米国版のDBに登録されてしまう)。
// 米国版の自動登録は /api/cron/sec-scan(SEC EDGAR)が行う。
export async function GET() {
  return NextResponse.json({ error: "米国版では廃止されました。日本版で使う機能です。" }, { status: 410 });
}
