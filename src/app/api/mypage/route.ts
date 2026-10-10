import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { syncPlanForUser } from "@/lib/plan-sync";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const getServiceSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const supabase = await createSupabaseRouteClient();
  if (!supabase) return NextResponse.json({ error: "認証エラー" }, { status: 401 });

  // getSession() はクッキーを検証しないため、認証サーバーで確認する getUser() を使う
  const { data: { user: verifiedUser } } = await supabase.auth.getUser();
  const session = verifiedUser ? { user: verifiedUser } : null;
  if (!session) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const userId = session.user.id;
  const email = session.user.email;
  const serviceSupabase = getServiceSupabase();

  // 日本版・米国版は共通のプラン。マイページを開いたときはStripeの契約に合わせて最新にする
  await syncPlanForUser(session.user, { force: true });

  const { data: profile } = await serviceSupabase
    .from("user_profiles").select("*").eq("id", userId).single();

  const { data: referralLogs } = await serviceSupabase
    .from("referral_logs").select("*").eq("referrer_user_id", userId);

  const { data: purchases } = await serviceSupabase
    .from("purchased_stocks")
    .select("*, ipo_companies(id, name, listing_date, sector)")
    .eq("user_id", userId).order("purchased_at", { ascending: false });

  const { data: notifySettings } = await serviceSupabase
    .from("notification_settings").select("*")
    .eq("user_id", userId).is("company_id", null).single();

  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const { data: calendarNotes } = await serviceSupabase
    .from("calendar_notes").select("*").eq("user_id", userId)
    .gte("note_date", threeMonthsAgo.toISOString().slice(0, 10))
    .order("note_date", { ascending: false });

  return NextResponse.json({
    email, profile,
    referralLogs: referralLogs ?? [],
    purchases: purchases ?? [],
    notifySettings,
    calendarNotes: calendarNotes ?? [],
  });
}