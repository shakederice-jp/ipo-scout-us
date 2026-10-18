import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseRouteClient } from "@/lib/supabase/server";

// 2026/10追加: お気に入り銘柄(マイポートフォリオ)。
//  ・ログイン中のユーザー本人の分だけを扱う(認証サーバーで本人確認 → service roleでDB操作 → 必ず user_id で絞る)。
//  ・表は sql/add_favorite_companies.sql で作る。まだ無い場合は、分かる文言のエラーを返す。
export const dynamic = "force-dynamic";

const service = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function currentUserId(): Promise<string | null> {
  const supabase = await createSupabaseRouteClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

const TABLE_HINT = "お気に入りの保存先がまだ準備できていません。管理者に連絡してください。";
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

// ログイン中ユーザーのお気に入り銘柄のID一覧(未ログインなら空)
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ loggedIn: false, ids: [] });
  const { data, error } = await service().from("favorite_companies").select("company_id").eq("user_id", userId);
  if (error) return NextResponse.json({ loggedIn: true, ids: [], error: TABLE_HINT }, { status: 200 });
  return NextResponse.json({ loggedIn: true, ids: (data ?? []).map((r: any) => r.company_id) });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!isUuid(body?.company_id)) return NextResponse.json({ error: "銘柄が正しくありません" }, { status: 400 });
  const { error } = await service().from("favorite_companies").insert({ user_id: userId, company_id: body.company_id });
  // 23505 = すでに登録済み(エラーにせず、登録済みとして返す)
  if (error && (error as any).code !== "23505") return NextResponse.json({ error: TABLE_HINT }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!isUuid(body?.company_id)) return NextResponse.json({ error: "銘柄が正しくありません" }, { status: 400 });
  const { error } = await service().from("favorite_companies").delete().eq("user_id", userId).eq("company_id", body.company_id);
  if (error) return NextResponse.json({ error: TABLE_HINT }, { status: 500 });
  return NextResponse.json({ ok: true });
}
