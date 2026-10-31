import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { syncPlanForUser } from "@/lib/plan-sync";
import { canReadPaidAnalysis } from "@/lib/member-auth";

// 分析レポートを読めるプラン(2026/10/24: 3プラン化。旧名 report / complete は管理者が手で付けたものが残っていた場合のために許可)
const PAID_ANALYSIS_PLANS = ["plan_a", "plan_b", "plan_c", "report", "complete"];

export async function GET(req: NextRequest) {
  const stockId  = req.nextUrl.searchParams.get("stock_id") ?? "";
  const isFreeQ  = req.nextUrl.searchParams.get("is_free") === "true";
  const freeRank = parseInt(req.nextUrl.searchParams.get("free_rank") ?? "99");

  // 無料枠（上位3社）は誰でも閲覧可
  if (isFreeQ || freeRank < 3) {
    return NextResponse.json({ access: true, reason: "free" });
  }

  // セッションからユーザーを取得
  const cookieStore = await cookies();
  const supabaseUser = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabaseUser.auth.getUser();

  if (!user) {
    return NextResponse.json({ access: false, reason: "not_logged_in" });
  }

  // サービスロールで権限チェック
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // サブスクプランを確認（日本版・米国版共通のプラン。Stripeの契約に合わせて最新にしてから判定する）
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("plan, free_until")
    .eq("id", user.id)
    .maybeSingle();
  const synced = await syncPlanForUser(user);
  const plan = synced ?? profile?.plan;

  if (plan && PAID_ANALYSIS_PLANS.includes(plan)) {
    return NextResponse.json({ access: true, reason: "subscription" });
  }

  // 紹介特典の無料期間中(user_profiles.free_until が未来)も、有料分析を読める
  if (canReadPaidAnalysis({ plan: null, free_until: profile?.free_until })) {
    return NextResponse.json({ access: true, reason: "referral" });
  }

  // 単品購入を確認（購入した銘柄だけ）
  const { data: purchased } = await supabase
    .from("purchased_stocks")
    .select("id")
    .eq("user_id", user.id)
    .eq("company_id", stockId)
    .maybeSingle();

  if (purchased) {
    return NextResponse.json({ access: true, reason: "purchased" });
  }

  return NextResponse.json({ access: false, reason: "paywall" });
}
