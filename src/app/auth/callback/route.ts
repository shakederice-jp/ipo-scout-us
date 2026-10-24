import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { NEXT_COOKIE, safeNext } from "@/lib/post-login";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  let dest = "/";

  if (code) {
    const cookieStore = await cookies();
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
    await supabase.auth.exchangeCodeForSession(code);

    // 2026/10/24追加: 会員登録・パスワード再設定のメールのリンクを押したあと、元の画面へ戻す
    // (購入ボタンから登録した人は料金ページへ・パスワード再設定の人は /auth/reset へ)。
    // 日本版(ipo-scout)のcallbackと同じ処理。
    try {
      const raw = cookieStore.get(NEXT_COOKIE)?.value;
      let decoded = raw ?? null;
      try { decoded = raw ? decodeURIComponent(raw) : null; } catch {}
      const n = safeNext(decoded);
      if (n) dest = n;
    } catch {}
  }

  const res = NextResponse.redirect(`${origin}${dest}`);
  res.cookies.set(NEXT_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
