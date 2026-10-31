"use client";
import { useState, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { User, CreditCard, Gift, Bell, ShoppingBag, Calendar, Copy, Check, LogOut, Star } from "lucide-react";
import { CheckoutButton } from "@/components/CheckoutButton";
import { fmtUsd } from "@/lib/fx";

const PRIMARY = "#1E3A66";
const DARK = "#0F1F36";
const MID = "#1E3A66";
const LIGHT = "#E8EDF5";
const BORDER = "#C7D3E3";

const PLAN_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  free:     { label: "無料プラン",           color: "#64748b", bg: "#f1f5f9" },
  // 2026/10/24: 3プラン化(report / complete は管理者が手で付けた旧名が残っていた場合の表示用)
  plan_a:   { label: "A 分析見放題プラン",         color: "#0369a1", bg: "#eff6ff" },
  plan_b:   { label: "B 分析見放題＋通知プラン",   color: "#7c3aed", bg: "#f5f3ff" },
  plan_c:   { label: "C フルパックプラン",         color: "#1E3A66", bg: "#E8EDF5" },
  report:   { label: "A 分析見放題プラン",         color: "#0369a1", bg: "#eff6ff" },
  complete: { label: "B 分析見放題＋通知プラン",   color: "#7c3aed", bg: "#f5f3ff" },
};

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "white", borderRadius: 16, border: `1px solid ${BORDER}`, padding: "20px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${LIGHT}` }}>
        <span style={{ color: PRIMARY }}>{icon}</span>
        <h2 style={{ fontSize: 15, fontWeight: 900, color: DARK, margin: 0 }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${LIGHT}` }}>
      <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 13, color: DARK, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

export default function MyPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [notifyState, setNotifyState] = useState<any>(null);
  const [savingNotify, setSavingNotify] = useState(false);
  const [notifySaveResult, setNotifySaveResult] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  useEffect(() => {
    // 管理者プレビューモード（URLに?admin=1がある場合）
    const isAdminPreview = new URLSearchParams(window.location.search).get("admin") === "1";
    
    fetch("/api/mypage", { cache: "no-store" })
      .then(r => r.json())
      .then(d => {
        if (d.error && isAdminPreview) {
          // 管理者プレビュー用ダミーデータ
          setData({
            email: "shakederice@gmail.com",
            profile: {
              id: "749843f1-8dd5-4fd7-8e1b-43933af8a8cf",
              plan: "free",
              referral_code: "DEMO1234",
              referral_count: 0,
              referral_credits: 0,
              created_at: new Date().toISOString(),
            },
            referralLogs: [],
            purchases: [],
            notifySettings: {
              notify_bb: true,
              notify_daily_reminder: false,
              notify_apply: true,
              notify_listing: true,
              notify_lockup_90: false,
              notify_lockup_180: false,
              method_email: true,
            },
            calendarNotes: [],
            favoriteCompanies: [],
          });
        } else {
          setData(d);
          setNotifyState(d.notifySettings);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveNotify = async () => {
    if (!notifyState) return;
    setSavingNotify(true);
    setNotifySaveResult(null);
    try {
      const res = await fetch("/api/notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: data.profile?.id,
          company_id: null,
          ...notifyState,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotifySaveResult(`❌ ${json.error ?? "保存に失敗しました"}`);
      } else {
        setNotifySaveResult("✅ 通知設定を保存しました");
      }
    } catch (e) {
      setNotifySaveResult("❌ 通信エラーが発生しました");
    }
    setSavingNotify(false);
  };

  // お気に入り(マイポートフォリオ)から外す
  const handleRemoveFavorite = async (companyId: string, name: string) => {
    if (!confirm(`「${name}」をマイポートフォリオから外しますか？`)) return;
    try {
      const res = await fetch("/api/favorite-companies", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company_id: companyId }) });
      if (!res.ok) { alert("削除に失敗しました。時間をおいてもう一度お試しください。"); return; }
      setData((prev: any) => ({ ...prev, favoriteCompanies: (prev.favoriteCompanies ?? []).filter((f: any) => f.id !== companyId) }));
    } catch { alert("通信エラーが発生しました"); }
  };

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  };
  const handleOpenPortal = async () => {
    setPortalLoading(true);
    setPortalError(null);
    try {
      const res = await fetch("/api/portal", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setPortalError(body.error ?? "ポータルの起動に失敗しました");
        return;
      }
      window.location.href = body.url;
    } catch {
      setPortalError("通信エラーが発生しました");
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#F5F4EF" }}>
      <p style={{ color: MID, fontSize: 14 }}>読み込み中...</p>
    </div>
  );

  if (!data || data.error) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#F5F4EF" }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ color: "#64748b", marginBottom: 16 }}>ログインが必要です</p>
        <a href="/auth" style={{ padding: "10px 24px", backgroundColor: PRIMARY, color: "white", borderRadius: 8, textDecoration: "none", fontWeight: 700 }}>ログイン</a>
      </div>
    </div>
  );

  const profile = data.profile ?? {};
  const plan = PLAN_LABELS[profile.plan ?? "free"] ?? PLAN_LABELS.free;
  const referralUrl = `https://ipo-us.finance-tower.com/?ref=${profile.referral_code ?? ""}`;
  const completedReferrals = (data.referralLogs ?? []).filter((r: any) => r.status === "completed").length;
  const freeMonthsEarned = completedReferrals * 2;

  // 2026/10/31新設(米国版の紹介制度): 招待する側が招待文を自分で考えなくて済むよう、X・LINE・メール・コピーの
  // ワンタップ導線を用意した(日本版と同じ考え方。米国版の文面にしてある)。
  const inviteMessage =
    `📊 米国IPOの目論見書(S-1)をAIが日本語で読み解いてくれる「米国IPO企業情報AI分析レポート」を使っています。\n` +
    `毎月最初の2社ぶんは無料で、ロックアップ解除日や日本からの買い方もまとめて見られて便利です。\n\n` +
    `このリンクから登録すると、お互いに有料分析が2ヶ月間読み放題になります🎁（先着300名限定）\n${referralUrl}`;
  const inviteMessageX =
    `📊 米国IPOの目論見書(S-1)をAIが日本語で解析してくれる「米国IPO企業情報AI分析レポート」を使ってます。毎月2社は無料。\n` +
    `このリンクから登録で、お互い有料分析が2ヶ月読み放題🎁（先着300名限定）\n${referralUrl}\n#米国IPO #IPO投資`;
  const inviteSubjectEmail = `「米国IPO企業情報AI分析レポート」のご紹介`;
  const inviteBodyEmail =
    `いつもお世話になっております。\n\n` +
    `米国IPOの投資判断に役立つ「米国IPO企業情報AI分析レポート」というサービスを使っているのでご紹介します。\n\n` +
    `米国企業がSECに提出する目論見書(S-1)をAIが読み込み、財務状況やリスク、ロックアップ解除日、日本からの買い方を日本語でまとめてくれるサービスです。毎月最初の2社は無料で読めます。\n\n` +
    `以下の招待リンクから登録いただくと、お互いに有料分析が2ヶ月間読み放題になる特典が付きます（先着300名限定）。よろしければ試してみてください。\n\n${referralUrl}`;

  const handleShareX = () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(inviteMessageX)}`, "_blank", "noopener,noreferrer");
  };
  const handleShareLine = () => {
    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(inviteMessage)}`, "_blank", "noopener,noreferrer");
  };
  const handleShareEmail = () => {
    window.location.href = `mailto:?subject=${encodeURIComponent(inviteSubjectEmail)}&body=${encodeURIComponent(inviteBodyEmail)}`;
  };
  const handleCopyInvite = () => {
    // handleCopy()は「招待URLコピー」ボタン用のcopiedを更新してしまうため、別ボタンのここでは巻き込まないよう直接書き込む
    navigator.clipboard.writeText(inviteMessage);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

  // カレンダーメモの月別損益集計
  const pnlByMonth: Record<string, number> = {};
  (data.calendarNotes ?? []).forEach((n: any) => {
    if (n.pnl == null) return;
    const month = n.note_date.slice(0, 7);
    pnlByMonth[month] = (pnlByMonth[month] ?? 0) + n.pnl;
  });

  const toggleNotify = (key: string) => {
    setNotifyState((prev: any) => ({ ...prev, [key]: !prev?.[key] }));
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#F5F4EF", fontFamily: "'Noto Sans JP',sans-serif" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px 48px" }}>

        {/* ヘッダー */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: DARK, margin: 0 }}>マイページ</h1>
            <p style={{ fontSize: 11, color: "#64748b", margin: "4px 0 0" }}>大手町調査室九課</p>
          </div>
          <button onClick={handleLogout}
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 12px", borderRadius: 8, border: `1px solid ${BORDER}`, backgroundColor: "white", cursor: "pointer", fontSize: 12, color: "#64748b" }}>
            <LogOut size={13} />ログアウト
          </button>
        </div>

        {/* 1. アカウント情報 */}
        <Section icon={<User size={16} />} title="アカウント情報">
          <InfoRow label="メールアドレス" value={data.email ?? "-"} />
          <InfoRow label="登録日" value={profile.created_at ? new Date(profile.created_at).toLocaleDateString("ja-JP") : "-"} />
          <InfoRow label="ユーザーID" value={<span style={{ fontSize: 10, color: "#94a3b8" }}>{profile.id?.slice(0, 8)}...</span>} />
        </Section>

       {/* 2. プラン・契約状況 */}
       <Section icon={<CreditCard size={16} />} title="プラン・契約状況">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 900, padding: "6px 14px", borderRadius: 20, backgroundColor: plan.bg, color: plan.color }}>
              {plan.label}
            </span>
          </div>
          {profile.subscription_end_at && (
            <InfoRow label="次回更新日" value={new Date(profile.subscription_end_at).toLocaleDateString("ja-JP")} />
          )}
          {profile.free_until && new Date(profile.free_until) > new Date() && (
            <InfoRow label="無料期間終了日" value={
              <span style={{ color: "#15803d", fontWeight: 700 }}>
                {new Date(profile.free_until).toLocaleDateString("ja-JP")}（紹介特典）
              </span>
            } />
          )}

<a href="/cancel"
            style={{ display: "block", textAlign: "center", width: "100%", marginTop: 16, padding: "12px", backgroundColor: "white", color: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, textDecoration: "none", fontWeight: 700, fontSize: 13, boxSizing: "border-box" }}>
            🔓 プラン変更・解約はこちら
          </a>

<div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${LIGHT}` }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: DARK, marginBottom: 12 }}>プランに加入・アップグレード</p>
            <CheckoutButton availablePlans={["plan_a", "plan_b", "plan_c"]} defaultPlan="plan_c" />
            <p style={{ fontSize: 11, color: "#64748b", marginTop: 10, lineHeight: 1.6 }}>
              💡 特定の1銘柄だけ読みたい場合は、各銘柄の分析ページから「シングルレポートを購入」できます。
            </p>
          </div>
        </Section>

        {/* 2.5 マイポートフォリオ(100万円シミュレーション): お気に入り登録した銘柄。上場後は「公募価格で100万円分買っていたら」で追跡する */}
        <Section icon={<Star size={16} />} title="マイポートフォリオ（100万円シミュレーション）">
          {(data.favoriteCompanies ?? []).length === 0 ? (
            <p style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: "16px 0", lineHeight: 1.8 }}>
              まだ銘柄がありません。<br />各銘柄の分析ページで「お気に入りに追加」すると、ここに並びます。<br />
              上場後は、100万円分を公募価格で買っていたらいくらになったかを、自動で追跡します。
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(data.favoriteCompanies ?? []).map((f: any) => {
                const href = `/analysis/${f.ticker ?? f.id}`;
                const ip: number | null = f.ipo_price ?? null;
                const lp: number | null = f.latest_price ?? null;
                const sim = ip && lp && ip > 0 ? { pct: (lp / ip - 1) * 100, val: Math.round(1000000 * lp / ip) } : null;
                const up = sim ? sim.pct >= 0 : true;
                return (
                  <div key={f.id} style={{ display: "flex", alignItems: "stretch", gap: 6 }}>
                    <a href={href} style={{ flex: 1, minWidth: 0, display: "block", padding: "10px 12px", backgroundColor: sim ? (up ? "#f0fdf4" : "#fef2f2") : LIGHT, borderRadius: 8, border: `1px solid ${sim ? (up ? "#bbf7d0" : "#fecaca") : BORDER}`, textDecoration: "none" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: DARK }}>{f.name}{f.ticker ? `（${f.ticker}）` : ""}</div>
                      {sim ? (
                        <>
                          <div style={{ fontSize: 10, color: "#64748b", margin: "2px 0 4px" }}>公募価格 {fmtUsd(ip as number)} → 現在 {fmtUsd(lp as number)}{f.latest_date ? `（${f.latest_date}）` : ""}</div>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 10, color: "#64748b" }}>100万円なら</span>
                            <span style={{ fontSize: 18, fontWeight: 900, color: up ? "#15803d" : "#b91c1c" }}>¥{sim.val.toLocaleString("ja-JP")}</span>
                            <span style={{ fontSize: 13, fontWeight: 800, color: up ? "#15803d" : "#b91c1c" }}>（{up ? "+" : ""}{sim.pct.toFixed(1)}%）</span>
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                          {f.listing_date ? `上場予定日：${f.listing_date}` : "上場日は未定"}
                          {f.listing_date && ip == null ? "・公募価格は未確定" : ""}
                          {f.listing_date && ip != null && lp == null ? "・上場後の株価を取得待ち" : ""}
                        </div>
                      )}
                    </a>
                    <button onClick={() => handleRemoveFavorite(f.id, f.name)} aria-label={`${f.name}を外す`}
                      style={{ flexShrink: 0, width: 36, borderRadius: 8, border: `1px solid ${BORDER}`, backgroundColor: "white", cursor: "pointer", fontSize: 14 }}>🗑</button>
                  </div>
                );
              })}
              <p style={{ fontSize: 9.5, color: "#94a3b8", lineHeight: 1.7, margin: "4px 0 0" }}>
                公募価格と終値の比率から計算した目安です。為替の変動と手数料は含みません。過去の値動きであり、将来の株価を約束するものではありません。
              </p>
            </div>
          )}
        </Section>

        {/* 3. 友達招待プログラム */}
        <Section icon={<Gift size={16} />} title="友達招待プログラム">
          {/* 2026/10/31追加(米国版の紹介制度): 日本版と同じ「先着300名限定」の訴求。実際の残り人数で自動的に止める仕組みは無い(表記のみ) */}
          <div style={{ marginBottom: 12 }}>
            <span style={{ display: "inline-block", fontSize: 10, fontWeight: 900, color: "white", backgroundColor: "#dc2626", borderRadius: 6, padding: "3px 10px" }}>
              🎉 先着300名限定キャンペーン実施中
            </span>
          </div>
          <div style={{ backgroundColor: LIGHT, borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: MID, marginBottom: 6, fontWeight: 700 }}>あなたの招待URL</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input readOnly value={referralUrl}
                style={{ flex: 1, fontSize: 11, padding: "6px 8px", borderRadius: 6, border: `1px solid ${BORDER}`, backgroundColor: "white", color: DARK }} />
              <button onClick={() => handleCopy(referralUrl)}
                style={{ padding: "6px 12px", backgroundColor: copied ? "#15803d" : PRIMARY, color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
                {copied ? <><Check size={11} />コピー済</> : <><Copy size={11} />コピー</>}
              </button>
            </div>
          </div>
          {/* 招待文つきのワンタップ共有ボタン */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: MID, marginBottom: 6, fontWeight: 700 }}>かんたん招待（招待文つき）</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={handleShareX}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px", borderRadius: 8, border: "none", backgroundColor: "#000", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                𝕏 でシェア
              </button>
              <button onClick={handleShareLine}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px", borderRadius: 8, border: "none", backgroundColor: "#06C755", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                💬 LINEで送る
              </button>
              <button onClick={handleShareEmail}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px", borderRadius: 8, border: "none", backgroundColor: MID, color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                📧 メールで送る
              </button>
              <button onClick={handleCopyInvite}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px", borderRadius: 8, border: `1.5px solid ${PRIMARY}`, backgroundColor: inviteCopied ? "#dcfce7" : "white", color: inviteCopied ? "#15803d" : MID, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                {inviteCopied ? <><Check size={14} />招待文をコピーしました</> : <><Copy size={14} />招待文をコピー（Slack・Discordなど）</>}
              </button>
            </div>
          </div>

          <InfoRow label="招待コード" value={<span style={{ fontFamily: "monospace", letterSpacing: 2 }}>{profile.referral_code ?? "-"}</span>} />
          <InfoRow label="招待済み人数" value={`${completedReferrals}名`} />
          <InfoRow label="獲得した読み放題期間" value={<span style={{ color: "#15803d", fontWeight: 900 }}>{freeMonthsEarned}ヶ月</span>} />
          <div style={{ marginTop: 12, padding: "10px 12px", backgroundColor: "#fffbeb", borderRadius: 8, border: "1px solid #fde68a", fontSize: 11, color: "#92400e" }}>
            💡 友達が登録すると、あなたと友達の両方が<strong>有料分析を2ヶ月間読み放題</strong>になります（通知機能は対象外）（<strong>先着300名限定</strong>・予告なく終了する場合があります）
          </div>
        </Section>

        {/* 4. 通知設定 */}
        <Section icon={<Bell size={16} />} title="通知設定">
          <p style={{ fontSize: 11, color: "#64748b", marginBottom: 14 }}>毎週金曜18時に翌週のIPOイベントをメールでお知らせします。</p>
          {[
            { key: "notify_bb",      label: "🟦 価格決定日" },
                        { key: "notify_listing", label: "🔴 上場日" },
            { key: "notify_daily_reminder", label: "⏰ 前日リマインダー（毎日12時・翌日分のみ）" },
            { key: "notify_lockup_90",  label: "🔓 ロックアップ90日解除" },
            { key: "notify_lockup_180", label: "🔓 ロックアップ180日解除" },
            { key: "method_email",   label: "📧 メール通知" },
          ].map(({ key, label }) => (
            <div key={key} onClick={() => toggleNotify(key)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${LIGHT}`, cursor: "pointer" }}>
              <span style={{ fontSize: 13, color: DARK }}>{label}</span>
              <div style={{ width: 36, height: 20, borderRadius: 10, backgroundColor: notifyState?.[key] ? PRIMARY : "#e2e8f0", position: "relative", transition: "background 0.2s" }}>
                <div style={{ position: "absolute", top: 2, left: notifyState?.[key] ? 18 : 2, width: 16, height: 16, borderRadius: "50%", backgroundColor: "white", transition: "left 0.2s" }} />
              </div>
            </div>
          ))}
          <button onClick={handleSaveNotify} disabled={savingNotify}
            style={{ width: "100%", marginTop: 14, padding: "10px", backgroundColor: savingNotify ? "#94a3b8" : PRIMARY, color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
            {savingNotify ? "保存中..." : "通知設定を保存する"}
          </button>
          {notifySaveResult && (
            <p style={{ marginTop: 10, fontSize: 12, textAlign: "center", color: notifySaveResult.startsWith("❌") ? "#dc2626" : "#15803d", fontWeight: 700 }}>
              {notifySaveResult}
            </p>
          )}
        </Section>

        {/* 5. 購入済みレポート */}
        <Section icon={<ShoppingBag size={16} />} title="購入済みレポート">
          {data.purchases.length === 0 ? (
            <p style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: "16px 0" }}>購入済みのレポートはありません</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.purchases.map((p: any) => (
                <a key={p.id} href={`/analysis/${p.company_id}`}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", backgroundColor: LIGHT, borderRadius: 8, border: `1px solid ${BORDER}`, textDecoration: "none" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: DARK }}>{p.ipo_companies?.name ?? "不明"}</div>
                    <div style={{ fontSize: 10, color: "#64748b" }}>{p.ipo_companies?.listing_date} · ¥{p.amount?.toLocaleString()}</div>
                  </div>
                  <span style={{ fontSize: 11, color: PRIMARY, fontWeight: 700 }}>レポートを見る →</span>
                </a>
              ))}
            </div>
          )}
        </Section>

        {/* 6. カレンダーメモ・損益履歴 */}
        <Section icon={<Calendar size={16} />} title="IPOカレンダー 損益履歴（直近3ヶ月）">
          {Object.keys(pnlByMonth).length === 0 ? (
            <p style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: "16px 0" }}>記録はありません</p>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                {Object.entries(pnlByMonth).sort((a, b) => b[0].localeCompare(a[0])).map(([month, pnl]) => (
                  <div key={month} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", backgroundColor: (pnl as number) >= 0 ? "#f0fdf4" : "#fef2f2", borderRadius: 8, border: `1px solid ${(pnl as number) >= 0 ? "#bbf7d0" : "#fecaca"}` }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: DARK }}>{month.replace("-", "年")}月</span>
                    <span style={{ fontSize: 14, fontWeight: 900, color: (pnl as number) >= 0 ? "#15803d" : "#b91c1c" }}>
                      {(pnl as number) >= 0 ? "+" : ""}{fmtUsd(pnl as number)}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {(data.calendarNotes ?? []).filter((n: any) => n.pnl != null || n.memo).slice(0, 10).map((n: any) => (
                  <div key={n.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 10px", backgroundColor: "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0" }}>
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: MID }}>{n.note_date}</span>
                      {n.memo && <p style={{ fontSize: 11, color: "#475569", margin: "2px 0 0", lineHeight: 1.5 }}>{n.memo}</p>}
                    </div>
                    {n.pnl != null && (
                      <span style={{ fontSize: 12, fontWeight: 900, color: n.pnl >= 0 ? "#15803d" : "#b91c1c", flexShrink: 0, marginLeft: 8 }}>
                        {n.pnl >= 0 ? "+" : ""}{fmtUsd(n.pnl)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </Section>

      </div>
    </div>
  );
}