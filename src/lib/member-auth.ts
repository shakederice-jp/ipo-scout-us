// 2026/10/31新設(米国版の紹介制度): 会員(ログインユーザー)の本人確認と、有料分析の閲覧権限の判定をまとめた共通処理。
// 日本版(ipo-scout)の src/lib/member-auth.ts と同じ考え方。
//
// ・本人確認は supabase.auth.getUser() で行う(クッキーの中身を検証せずに信じる getSession() は使わない)。
// ・有料分析ページを読めるのは次のいずれか:
//     1. 分析レポートを読めるプラン(plan_a / plan_b / plan_c)に加入中
//     2. 紹介特典の無料期間中(user_profiles.free_until が未来の日時)
//     3. その銘柄を単品購入済み(各ページ側で判定)
import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { createSupabaseRouteClient } from "@/lib/supabase/server";

// 旧名 report / complete は、管理者が手で付けたものが残っていても読めるよう許可しておく
export const PAID_ANALYSIS_PLANS = ["plan_a", "plan_b", "plan_c", "report", "complete"];

export const getServiceSupabase = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// ログイン中の会員を、Supabaseの認証サーバーに問い合わせて確認する(未ログイン・無効なら null)
export async function getVerifiedUser(): Promise<User | null> {
  const routeClient = await createSupabaseRouteClient();
  if (!routeClient) return null;
  try {
    const { data, error } = await routeClient.auth.getUser();
    if (error || !data?.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

export function isFreeUntilActive(freeUntil: string | null | undefined, now: Date = new Date()): boolean {
  if (!freeUntil) return false;
  const t = Date.parse(freeUntil);
  return Number.isFinite(t) && t > now.getTime();
}

// プラン加入または紹介特典の無料期間中なら、有料分析ページを(銘柄を問わず)読める
export function canReadPaidAnalysis(profile: { plan?: string | null; free_until?: string | null } | null | undefined): boolean {
  if (!profile) return false;
  if (profile.plan && PAID_ANALYSIS_PLANS.includes(profile.plan)) return true;
  return isFreeUntilActive(profile.free_until);
}
