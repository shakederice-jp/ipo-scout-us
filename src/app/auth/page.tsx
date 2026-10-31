"use client";
import { useState, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { NEXT_COOKIE, safeNext } from "@/lib/post-login";

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refCode, setRefCode] = useState("");
  // 購入ボタンなどから来た場合の戻り先（ログイン・登録のあとに、元の画面へ戻して決済に進むため）
  const [next, setNext] = useState<string | null>(null);

  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const n = safeNext(new URLSearchParams(window.location.search).get("next"));
      if (n) {
        setNext(n);
        // 購入ボタンから来た人は、まだ会員でない可能性が高いので「新規登録」を先に見せる
        if (n.includes("buy=")) setMode("signup");
      }
      // 2026/10/31修正: 紹介リンクはトップページ(/?ref=コード)に案内する作りのため、トップページ等を見てから
      // 登録画面に来た場合はURLに?refが付いていない。その場合は、ReferralCapture.tsx がlayout側で保存しておいた
      // コードをlocalStorageから拾う(URL側にあれば従来通りそちらを優先)。
      const urlRef = new URLSearchParams(window.location.search).get("ref");
      if (urlRef) {
        setRefCode(urlRef);
      } else {
        try {
          const stored = localStorage.getItem("pendingReferralCode");
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed?.code && Date.now() - (parsed.savedAt ?? 0) < 30 * 86400000) setRefCode(parsed.code);
          }
        } catch {}
      }
    }
  }, []);

  const handleSubmit = async () => {
    setLoading(true); setError(null); setMessage(null);
    // パスワードを忘れた場合: 再設定用のメールを送る。メールのリンクを押すと、ログイン状態になって
    // 新しいパスワードを入れる画面(/auth/reset)へ進む(戻り先は post_auth_next クッキーで覚えておく)
    if (mode === "forgot") {
      const addr = email.trim();
      if (!addr) { setError("メールアドレスを入力してください"); setLoading(false); return; }
      try { document.cookie = `${NEXT_COOKIE}=${encodeURIComponent("/auth/reset")}; path=/; max-age=3600; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`; } catch {}
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(addr, { redirectTo: `${location.origin}/auth/callback` });
      if (resetError) {
        console.error("resetPasswordForEmail:", resetError.message);
        // 短時間に続けて送ると、送信回数の上限(Supabaseの設定)に達して断られる
        const limited = (resetError as any).status === 429 || /rate limit|too many|after \d+ seconds|security purposes/i.test(resetError.message);
        setError(limited
          ? "短時間にメールの送信が重なったため、いったん受け付けられませんでした。1時間ほど待ってから、もう一度お試しください。"
          : "再設定メールを送れませんでした。しばらくしてからもう一度お試しください。");
      }
      else setMessage("登録されているメールアドレスの場合は、パスワード再設定用のメールをお送りしました。メール内のリンクから、新しいパスワードを設定してください。");
      setLoading(false);
      return;
    }
    if (mode === "signup") {
      if (next) {
        try { document.cookie = `${NEXT_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=3600; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`; } catch {}
      }
      // 2026/10/31改修(米国版の紹介制度): 紹介コードは、ここではその人のアカウント情報に預けておくだけにした。
      // 実際の特典の付与は、確認メールのリンクを押してログインが完了した時点で、サーバーが本人を確認してから
      // 行う(src/lib/referral.ts・src/app/auth/callback/route.ts)。以前はここから会員IDを送って即時に付与して
      // いたため、架空のIDで特典を何度でも発生させられる問題があった。
      const pendingCode = refCode.trim().toUpperCase();
      const { data, error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback`,
        ...(pendingCode ? { data: { pending_referral_code: pendingCode } } : {}),
      },
    });

    if (error) {
      setError(error.message);
    } else {
      let referralNote = "";
      if (pendingCode) {
        try { localStorage.removeItem("pendingReferralCode"); } catch {}
        if (data?.session) {
          // メール確認なしでその場でログインできた場合は、すぐに適用を試みる
          try {
            const res = await fetch("/api/referral", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ referral_code: pendingCode }) });
            const json = await res.json().catch(() => ({} as any));
            referralNote = res.ok && json?.success
              ? " 🎉紹介特典を適用しました（あなたと紹介者様の有料分析が2ヶ月間読み放題になりました）。"
              : json?.error === "invalid code" ? " 紹介コードが見つかりませんでした（登録自体は完了しています）。"
              : json?.error === "self referral" ? " ご自身の紹介コードは利用できません（登録自体は完了しています）。"
              : json?.error === "already referred" ? " このアカウントは既に紹介特典を利用済みです。"
              : " 紹介コードの適用に失敗しました（登録自体は完了しています）。";
          } catch {
            referralNote = " 紹介コードの適用中に通信エラーが発生しました（登録自体は完了しています）。";
          }
        } else {
          referralNote = " 紹介コードを受け付けました。メール内のリンクから登録を完了すると、あなたと紹介者様の有料分析が2ヶ月間読み放題になります。";
        }
      }
      setMessage(`確認メールを送信しました。メールをご確認ください。${referralNote}${next?.includes("buy=") ? " メール内のリンクを押すと、自動でお支払い画面に進みます。" : ""}`);
    }
    } else {
      const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError("メールアドレスまたはパスワードが違います");
      else {
        // 確認メールのリンクを別の端末で開いた等で、紹介特典がまだ適用されていない場合は、ログインのタイミングで
        // 適用する(条件チェックはサーバー側。対象外なら何もしない)
        if ((signInData?.user?.user_metadata as any)?.pending_referral_code) {
          try { await fetch("/api/referral", { method: "POST" }); } catch {}
        }
        location.href = next ?? "/";
      }
    }
    setLoading(false);
  };

  return (
    <div style={{ display:"flex", justifyContent:"center", alignItems:"center", minHeight:"100vh", backgroundColor:"#F5F4EF" }}>
      <div style={{ background:"white", padding:"32px", borderRadius:"16px", border:"1px solid #C7D3E3", width:"100%", maxWidth:"360px" }}>
        <h1 style={{ margin:"0 0 4px", fontSize:"18px", color:"#0F1F36", fontWeight:"900" }}>
          📊 米国IPO企業情報AI分析レポート
        </h1>
        <p style={{ margin:"0 0 24px", fontSize:"11px", color:"#3D5A85" }}>担当：大手町調査室九課</p>

        {next?.includes("buy=") && (
          <div style={{ marginBottom:"16px", padding:"10px 12px", borderRadius:"8px", backgroundColor:"#fffbeb", border:"1px solid #fde68a", fontSize:"12px", color:"#92400e", lineHeight:1.7 }}>
            🔒 お申し込みには、会員登録（無料）またはログインが必要です。完了すると、自動でお支払い画面に進みます。<br/>すでに会員の方は「ログイン」を押してください。
          </div>
        )}

        {mode === "forgot" ? (
          <div style={{ marginBottom:"20px" }}>
            <div style={{ fontSize:"15px", fontWeight:"900", color:"#111", marginBottom:"6px" }}>パスワードの再設定</div>
            <p style={{ fontSize:"12px", color:"#475569", lineHeight:1.8, margin:0 }}>ご登録のメールアドレスを入力してください。再設定用のメールをお送りします。</p>
          </div>
        ) : (
        <div style={{ display:"flex", marginBottom:"24px", borderRadius:"8px", overflow:"hidden", border:"1px solid #C7D3E3" }}>
          {(["login", "signup"] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setError(null); setMessage(null); }}
              style={{ flex:1, padding:"10px", border:"none", cursor:"pointer", fontWeight:"700", fontSize:"13px",
                backgroundColor: mode === m ? "#1E3A66" : "white",
                color: mode === m ? "white" : "#3D5A85" }}>
              {m === "login" ? "ログイン" : "新規登録"}
            </button>
          ))}
        </div>
        )}

        <div style={{ marginBottom:"16px" }}>
          <label style={{ display:"block", fontSize:"12px", fontWeight:"700", color:"#3D5A85", marginBottom:"6px" }}>メールアドレス</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="example@email.com"
            style={{ width:"100%", padding:"10px", borderRadius:"8px", border:"1px solid #C7D3E3", boxSizing:"border-box", fontSize:"14px" }}/>
        </div>

        {mode !== "forgot" && (
        <div style={{ marginBottom:"24px" }}>
          <label style={{ display:"block", fontSize:"12px", fontWeight:"700", color:"#3D5A85", marginBottom:"6px" }}>パスワード</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="8文字以上"
            style={{ width:"100%", padding:"10px", borderRadius:"8px", border:"1px solid #C7D3E3", boxSizing:"border-box", fontSize:"14px" }}
          />
        </div>
        )}
        {mode === "login" && (
          <div style={{ textAlign:"right", margin:"-14px 0 20px" }}>
            <button type="button" onClick={() => { setMode("forgot"); setError(null); setMessage(null); }}
              style={{ background:"none", border:"none", cursor:"pointer", fontSize:"12px", color:"#3D5A85", textDecoration:"underline", padding:0 }}>
              パスワードを忘れた方はこちら
            </button>
          </div>
        )}

        {mode === "signup" && (
          <div style={{ marginBottom:"24px" }}>
            <label style={{ display:"block", fontSize:"12px", fontWeight:"700", color:"#3D5A85", marginBottom:"6px" }}>紹介コード（任意）</label>
            <input type="text" value={refCode} onChange={e => setRefCode(e.target.value)}
              placeholder="お持ちの方はコードを入力"
              style={{ width:"100%", padding:"10px", borderRadius:"8px", border:"1px solid #C7D3E3", boxSizing:"border-box", fontSize:"14px" }}
            />
            <p style={{ fontSize:"11px", color:"#1E3A66", margin:"6px 0 0", fontWeight:"700" }}>
              紹介コードを入力して登録すると、あなたと紹介者の両方が有料分析を2ヶ月間読み放題になります
            </p>
          </div>
        )}

        {error && <p style={{ color:"#b91c1c", fontSize:"13px", margin:"0 0 16px" }}>{error}</p>}
        {message && <p style={{ color:"#3D5A85", fontSize:"13px", margin:"0 0 16px" }}>{message}</p>}

        <button onClick={handleSubmit} disabled={loading}
          style={{ width:"100%", padding:"12px", backgroundColor: loading ? "#C7D3E3" : "#1E3A66",
            color:"white", border:"none", borderRadius:"8px", cursor: loading ? "default" : "pointer",
            fontWeight:"900", fontSize:"14px" }}>
          {loading ? "処理中..." : mode === "login" ? "ログイン" : mode === "forgot" ? "再設定メールを送る" : "登録する"}
        </button>

        {mode === "forgot" && (
          <button type="button" onClick={() => { setMode("login"); setError(null); setMessage(null); }}
            style={{ display:"block", width:"100%", textAlign:"center", marginTop:"14px", background:"none", border:"none", cursor:"pointer", fontSize:"12px", color:"#3D5A85" }}>
            ← ログインに戻る
          </button>
        )}

        <a href="/" style={{ display:"block", textAlign:"center", marginTop:"16px", fontSize:"12px", color:"#3D5A85" }}>
          ← トップへ戻る
        </a>
      </div>
    </div>
  );
}