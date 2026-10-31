import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminRequest } from "@/lib/admin-auth";

// 2026/10/31新設(米国版の紹介制度): 紹介プログラムの実績を管理画面で見えるようにするための集計API。
// 日本版と同じ。まずは「特典が実際に成立した件数」と「先着300名」に対する残り枠を返す。
export const dynamic = "force-dynamic";

const CAP = 300; // 「先着300名限定」の人数(表記のみ。上限に達しても自動では止めない)

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { count: completedCount, error } = await supabase
    .from("referral_logs")
    .select("id", { count: "exact", head: true })
    .eq("status", "completed");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const completed = completedCount ?? 0;

  return NextResponse.json({
    completed,
    cap: CAP,
    remaining: Math.max(0, CAP - completed),
  });
}
