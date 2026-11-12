import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 2026/11/12新設: 管理画面から、銘柄ごとに「全員に無料公開する」を切り替える。
//   POST { company_id, value: true | false | null } … is_public_free を保存する(null=自動判定に戻す)
// このURL(/api/admin/...)は管理画面にログインしている人だけが使える(src/proxy.ts が門番)。
// is_public_free 列がまだ無い(SQL未実行)ときは、保存せずに column_ready:false を返す(管理画面が案内を出す)。
export async function POST(req: NextRequest) {
  try {
    const { company_id, value } = await req.json();
    if (!company_id || !(value === true || value === false || value === null)) {
      return NextResponse.json({ error: "リクエストの形式が不正です" }, { status: 400 });
    }
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: co, error } = await supabase.from("ipo_companies").select("*").eq("id", company_id).maybeSingle();
    if (error || !co) return NextResponse.json({ error: error?.message ?? "銘柄が見つかりません" }, { status: 404 });
    if (!("is_public_free" in (co as any))) return NextResponse.json({ success: true, column_ready: false });
    const { error: upErr } = await supabase.from("ipo_companies").update({ is_public_free: value }).eq("id", company_id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    return NextResponse.json({ success: true, column_ready: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "error" }, { status: 500 });
  }
}
