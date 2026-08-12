"use client";
import { useState, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refCode, setRefCode] = useState("");

  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlRef = new URLSearchParams(window.location.search).get("ref");
      if (urlRef) setRefCode(urlRef);
    }
  }, []);

  const handleSubmit = async () => {
    setLoading(true); setError(null); setMessage(null);
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });

    if (error) {
      setError(error.message);
    } else if (refCode.trim() && data?.user?.id) {
      try {
        await fetch("/api/referral", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ referral_code: refCode, user_id: data.user.id }),
        });
      } catch (e) {
        console.error("referral apply failed", e);
      }
    }
      else setMessage("確認メールを送信しました。メールをご確認ください。");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError("メールアドレスまたはパスワードが違います");
      else location.href = "/";
    }
    setLoading(false);
  };

  return (
    <div style={{ display:"flex", justifyContent:"center", alignItems:"center", minHeight:"100vh", backgroundColor:"#F5F4EF" }}>
      <div style={{ background:"white", padding:"32px", borderRadius:"16px", border:"1px solid #C7D3E3", width:"100%", maxWidth:"360px" }}>
        <h1 style={{ margin:"0 0 4px", fontSize:"18px", color:"#0F1F36", fontWeight:"900" }}>
          📊 IPO企業情報AI分析レポート
        </h1>
        <p style={{ margin:"0 0 24px", fontSize:"11px", color:"#3D5A85" }}>担当：大手町調査室九課</p>

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

        <div style={{ marginBottom:"16px" }}>
          <label style={{ display:"block", fontSize:"12px", fontWeight:"700", color:"#3D5A85", marginBottom:"6px" }}>メールアドレス</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="example@email.com"
            style={{ width:"100%", padding:"10px", borderRadius:"8px", border:"1px solid #C7D3E3", boxSizing:"border-box", fontSize:"14px" }}/>
        </div>

        <div style={{ marginBottom:"24px" }}>
          <label style={{ display:"block", fontSize:"12px", fontWeight:"700", color:"#3D5A85", marginBottom:"6px" }}>パスワード</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="8文字以上"
            style={{ width:"100%", padding:"10px", borderRadius:"8px", border:"1px solid #C7D3E3", boxSizing:"border-box", fontSize:"14px" }}
          />
        </div>

        {mode === "signup" && (
          <div style={{ marginBottom:"24px" }}>
            <label style={{ display:"block", fontSize:"12px", fontWeight:"700", color:"#3D5A85", marginBottom:"6px" }}>紹介コード（任意）</label>
            <input type="text" value={refCode} onChange={e => setRefCode(e.target.value)}
              placeholder="お持ちの方はコードを入力"
              style={{ width:"100%", padding:"10px", borderRadius:"8px", border:"1px solid #C7D3E3", boxSizing:"border-box", fontSize:"14px" }}
            />
            <p style={{ fontSize:"11px", color:"#1E3A66", margin:"6px 0 0", fontWeight:"700" }}>
              紹介コードを入力して登録すると、あなたと紹介者の両方に2ヶ月間無料特典が付与されます
            </p>
          </div>
        )}

        {error && <p style={{ color:"#b91c1c", fontSize:"13px", margin:"0 0 16px" }}>{error}</p>}
        {message && <p style={{ color:"#3D5A85", fontSize:"13px", margin:"0 0 16px" }}>{message}</p>}

        <button onClick={handleSubmit} disabled={loading}
          style={{ width:"100%", padding:"12px", backgroundColor: loading ? "#C7D3E3" : "#1E3A66",
            color:"white", border:"none", borderRadius:"8px", cursor: loading ? "default" : "pointer",
            fontWeight:"900", fontSize:"14px" }}>
          {loading ? "処理中..." : mode === "login" ? "ログイン" : "登録する"}
        </button>

        <a href="/" style={{ display:"block", textAlign:"center", marginTop:"16px", fontSize:"12px", color:"#3D5A85" }}>
          ← トップへ戻る
        </a>
      </div>
    </div>
  );
}