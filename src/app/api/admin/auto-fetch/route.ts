import { NextResponse } from "next/server";

// 2026/10/24廃止: この処理は日本版(ipo-scout)からコピーされたもので、日本のIPOスケジュール(96ut.com)から
// 銘柄を取り込んで米国版のDBに登録してしまっていた(例: TOKIUM・KDX Kolet投資法人など、東証の銘柄が米国版に載った原因)。
// 米国版の銘柄は、SEC EDGAR(/api/cron/sec-scan)から自動登録するか、管理画面から手動で登録する。
export async function POST() {
  return NextResponse.json(
    { error: "この機能は米国版では廃止されました(日本の銘柄が混入するため)。米国銘柄はSECから自動登録されます。" },
    { status: 410 }
  );
}
