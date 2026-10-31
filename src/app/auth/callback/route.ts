import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { NEXT_COOKIE, safeNext } from "@/lib/post-login";
import { applyPendingReferral } from "@/lib/referral";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // メールのリンクが期限切れ・使用済みなどのとき、Supabaseは error / error_code を付けて戻してくる
  const linkError = searchParams.get("error_code") || searchParams.get("error");
  let dest = "/";
  // 2026/10/24追加: パスワード再設定がうまくいかない原因を調べるための確認用コード
  // (失敗したときだけ /auth/reset の画面に小さく表示する。個人情報は含まない)
  let diag: string | null = null;

  const cookieStore = await cookies();

  if (code) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );
    const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) diag = `exchange:${String(exchangeError.message).slice(0, 80)}`;

    // 2026/10/31追加(米国版の紹介制度): 確認メールのリンクからの初回ログイン時に、登録画面で預かった紹介コードを適用する。
    // 本人確認済みのユーザーに対してだけサーバー側で行う(条件チェックは src/lib/referral.ts)。
    // 失敗してもログイン自体は続行する。
    if (!exchangeError && exchangeData?.user) {
      try {
        await applyPendingReferral(exchangeData.user);
      } catch (e) {
        console.error("referral apply failed", e);
      }
    }
  } else {
    diag = linkError ? `link:${linkError}` : "nocode";
  }

  // 2026/10/24追加: 会員登録・パスワード再設定のメールのリンクを押したあと、元の画面へ戻す
  // (購入ボタンから登録した人は料金ページへ・パスワード再設定の人は /auth/reset へ)。
  // 日本版(ipo-scout)のcallbackと同じ処理。
  try {
    const raw = cookieStore.get(NEXT_COOKIE)?.value;
    let decoded = raw ?? null;
    try { decoded = raw ? decodeURIComponent(raw) : null; } catch {}
    const n = safeNext(decoded);
    if (n) dest = n;
    else if (code && !diag) dest = "/";
  } catch {}

  // 失敗したときは、再設定の画面で理由を表示する(再設定の途中だったとき、またはリンクの失敗がはっきりしているとき)
  if (diag && (dest === "/auth/reset" || diag.startsWith("link:") || diag.startsWith("exchange:"))) {
    dest = `/auth/reset?diag=${encodeURIComponent(diag)}`;
  }

  const res = NextResponse.redirect(`${origin}${dest}`);
  res.cookies.set(NEXT_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
