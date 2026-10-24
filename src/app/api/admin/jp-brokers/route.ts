import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 2026/10追加: 銘柄ごとの「日本の証券会社での取扱い(上場後に売買できるか)」を保存する。2026/10/24に「抽選あり」から意味を変更。
// /api/admin/... は proxy.ts の門番を通るため、管理画面にログインした人だけが呼べる。
const ALLOWED = new Set(["rakuten", "sbi"]);

export async function POST(req: NextRequest) {
  const { company_id, brokers } = await req.json().catch(() => ({} as any));
  if (!company_id || !Array.isArray(brokers)) {
    return NextResponse.json({ error: "company_id と brokers(配列)が必要です" }, { status: 400 });
  }
  const clean = Array.from(new Set(brokers.filter((b: unknown): b is string => typeof b === "string" && ALLOWED.has(b))));

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { error } = await supabase.from("ipo_companies").update({ jp_brokers: clean }).eq("id", company_id);
  if (error) {
    const hint = /jp_brokers/.test(error.message)
      ? "(列がまだありません。sql/add_jp_brokers_column.sql を Supabase の SQL Editor で実行してください)"
      : "";
    return NextResponse.json({ error: error.message + hint }, { status: 500 });
  }
  return NextResponse.json({ success: true, brokers: clean });
}
