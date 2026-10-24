import type { Metadata } from "next";
import CalendarClient from "@/components/CalendarClient";
import { getPublicCompanies } from "@/lib/get-companies";
import { CheckoutButton } from "@/components/CheckoutButton";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Zap, Crown, AlertCircle, User } from "lucide-react";
import { jpyMonth } from "@/lib/pricing";

export const metadata: Metadata = {
  title: { absolute: "米国IPO企業情報AI分析レポート｜大手町調査室九課" },
  description: "米国IPOの上場スケジュールと、目論見書(S-1)のAI分析を日本語で。上場日・公募価格・ロックアップ解除日・日本からの買い方、買うか見送るかの目安を銘柄ごとに掲載。大手町調査室九課が運営。",
  openGraph: {
    title: "米国IPO企業情報AI分析レポート｜大手町調査室九課",
    description: "米国IPOの上場スケジュールと目論見書のAI分析を日本語で。上場日・公募価格・ロックアップ解除日・買い方を銘柄ごとに掲載。",
    url: "https://ipo-us.finance-tower.com",
    siteName: "大手町調査室九課",
    locale: "ja_JP",
    type: "website",
    images: [{ url: "https://ipo-us.finance-tower.com/ogp.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "米国IPO企業情報AI分析レポート｜大手町調査室九課",
    description: "米国IPOの上場スケジュールと目論見書のAI分析を日本語で。上場日・公募価格・ロックアップ解除日・買い方を銘柄ごとに掲載。",
    images: ["https://ipo-us.finance-tower.com/ogp.png"],
  },
  alternates: { canonical: "https://ipo-us.finance-tower.com" },
};

const cardStyle: React.CSSProperties = {
  backgroundColor: "white",
  borderRadius: 16,
  border: "1px solid #C7D3E3",
  overflow: "hidden",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const params = await searchParams;
  const supabase = createSupabaseServerClient();
  const { data: { session } } = supabase
    ? await supabase.auth.getSession()
    : { data: { session: null } };
  const userId = session?.user?.id ?? null;
  // 銘柄一覧は、サーバー側で取得して最初のHTMLに入れる(失敗したときは、ブラウザ側で取得する従来の動きに戻る)
  let initialCompanies: any[] | undefined;
  try { initialCompanies = await getPublicCompanies(); } catch { initialCompanies = undefined; }

  return (
    <div style={{ backgroundColor:"#F5F4EF", minHeight:"100vh", fontFamily:"'Noto Sans JP','Hiragino Kaku Gothic ProN',sans-serif" }}>

<style>{`
        @media (max-width: 700px) {
          .top-sidebar { flex: 1 1 100% !important; min-width: 0 !important; max-width: 100% !important; }
        }
      `}</style>

      {/* 決済結果バナー */}
      {params.checkout === "success" && (
        <div style={{ margin:"12px 16px 0", borderRadius:12, padding:"10px 16px", display:"flex", alignItems:"center", gap:8, backgroundColor:"#dcfce7", border:"1px solid #bbf7d0" }}>
          <span style={{ fontSize:16 }}>🎉</span>
          <p style={{ fontSize:13, fontWeight:700, color:"#15803d", margin:0 }}>お支払いが完了しました。プレミアムプランへようこそ！</p>
        </div>
      )}
      {params.checkout === "cancel" && (
        <div style={{ margin:"12px 16px 0", borderRadius:12, padding:"10px 16px", display:"flex", alignItems:"center", gap:8, backgroundColor:"#fffbeb", border:"1px solid #fde68a" }}>
          <AlertCircle size={14} color="#d97706" />
          <p style={{ fontSize:13, color:"#92400e", margin:0 }}>決済はキャンセルされました。</p>
        </div>
      )}


      {/* 2026/10追加: サイトの仕組みを伝えるリード文(誇大にならないよう、事実の説明にとどめる) */}
      <div style={{ maxWidth:1200, margin:"0 auto", padding:"16px 16px 0" }}>
        <div style={{ background:"linear-gradient(135deg, #0F1F36 0%, #1E3A66 100%)", borderRadius:16, padding:"22px 22px 18px" }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#C7D3E3", letterSpacing:"0.08em", marginBottom:8 }}>このサイトの仕組み</div>
          <h1 style={{ fontSize:"clamp(17px, 3.2vw, 22px)", fontWeight:900, color:"#ffffff", lineHeight:1.5, margin:"0 0 10px" }}>
            米国IPOの目論見書を、AIが日本語で読み解きます
          </h1>
          <p style={{ fontSize:13, color:"rgba(255,255,255,0.85)", lineHeight:1.9, margin:"0 0 14px", maxWidth:820 }}>
            米国のIPOでは、日本の目論見書にあたる書類（S-1／F-1）が公開されます。公開される場所は、SEC（米国証券取引委員会）の電子開示システム「EDGAR」です。
            当サイトでは、この英語の書類をAIが読み込みます。そしてIPOの判断材料になる部分だけを要約し、日本語でお届けします。
            銘柄ごとに、上場日・公募価格・ロックアップ（売却制限）の解除日・日本からの買い方を確認できます。
          </p>
          <p style={{ fontSize:10.5, color:"#A9C1E8", lineHeight:1.7, margin:0 }}>
            ※ 要約・翻訳はAIによる自動生成です。投資判断の前には、EDGARの原文もあわせてご確認ください。
            <a href="/guide" style={{ color:"#ffffff", marginLeft:10, textDecoration:"underline" }}>このサイトの使い方</a>
            <a href="/schedule" style={{ color:"#ffffff", marginLeft:10, textDecoration:"underline" }}>上場スケジュール一覧</a>
          </p>
        </div>
      </div>

      {/* メインレイアウト */}
      <div style={{ maxWidth:1200, margin:"0 auto", padding:"16px 16px 40px", display:"flex", flexWrap:"wrap", gap:16, alignItems:"flex-start" }}>

        {/* 左：カレンダー＋IPO一覧 */}
        <div style={{ flex:"1 1 560px", minWidth:0 }}>
          {/* 上場スケジュール(月ごとの一覧表)への目立つリンク */}
          <a href="/schedule" style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, padding:"12px 16px", marginBottom:12, borderRadius:14, backgroundColor:"#1E3A66", textDecoration:"none", boxShadow:"0 2px 8px rgba(30,58,102,0.25)" }}>
            <span style={{ display:"flex", alignItems:"center", gap:10, minWidth:0 }}>
              <span style={{ fontSize:20 }}>📋</span>
              <span style={{ display:"flex", flexDirection:"column", minWidth:0 }}>
                <span style={{ fontSize:14, fontWeight:900, color:"#ffffff", lineHeight:1.4 }}>上場スケジュールを一覧表で見る</span>
                <span style={{ fontSize:11, color:"#C7D3E3", lineHeight:1.5 }}>上場日・公募価格・ロックアップ解除日を月ごとに</span>
              </span>
            </span>
            <span style={{ fontSize:16, fontWeight:900, color:"#ffffff", flexShrink:0 }}>→</span>
          </a>
          <CalendarClient initialCompanies={initialCompanies} />
        </div>

        {/* 右：サイドバー */}
        <aside className="top-sidebar" style={{ flex:"0 0 300px", minWidth:280, display:"flex", flexDirection:"column", gap:12 }}>

          {/* 料金プランページへのリンク */}
          <a href="/plans" style={{ ...cardStyle, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", backgroundColor:"#E8EDF5", textDecoration:"none", border:"1.5px solid #1E3A66" }}>
            <div>
              <div style={{ fontSize:12, fontWeight:900, color:"#0F1F36" }}>📋 料金プランを見る</div>
              <div style={{ fontSize:10, color:"#3D5A85", marginTop:2 }}>無料〜{jpyMonth("plan_c")}・有料3プラン比較</div>
            </div>
            <span style={{ fontSize:16, color:"#1E3A66" }}>→</span>
          </a>

          {/* 購入パネル */}
          <div style={cardStyle}>
            <div style={{ padding:"12px 16px", backgroundColor:"#1E3A66", display:"flex", alignItems:"center", gap:8 }}>
              <Crown size={16} color="#ffffff" />
              <div>
                <div style={{ fontWeight:900, fontSize:13, color:"#ffffff" }}>有料プランのお申込み</div>
                <div style={{ fontSize:10, color:"#C7D3E3" }}>Stripeで安全決済 🔒</div>
              </div>
            </div>
            <div style={{ padding:16, backgroundColor:"white" }}>
              <CheckoutButton availablePlans={["plan_a", "plan_b", "plan_c"]} defaultPlan="plan_c" />
              <p style={{ fontSize:10, color:"#64748b", marginTop:10, lineHeight:1.6 }}>
                💡 各IPOレポートの単一購入は、各銘柄の分析ページからお申込みいただけます。
              </p>
            </div>
          </div>

          {/* トレンドページへのリンク */}
          <a href="/trends" style={{ ...cardStyle, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", backgroundColor:"#1E3A66", border:"2px solid #1E3A66", textDecoration:"none" }}>
            <div>
              <div style={{ fontSize:13, fontWeight:900, color:"white" }}>📡 大手町発マーケットトレンド</div>
              <div style={{ fontSize:10, color:"#C7D3E3", marginTop:2 }}>IPO・スタートアップ・資金調達の最新動向</div>
            </div>
            <span style={{ fontSize:16, color:"#ffffff" }}>→</span>
          </a>

{/* 日本から買うには(楽天証券・SBI証券の公式ページへのリンク付き) */}
<div style={{ ...cardStyle, padding:"12px 16px", backgroundColor:"#F5F4EF", border:"1.5px solid #C7D3E3" }}>
            <div style={{ fontSize:12, fontWeight:900, color:"#0F1F36", marginBottom:4 }}>🇯🇵 日本から米国IPOを買うには</div>
            <div style={{ fontSize:10, color:"#3D5A85", lineHeight:1.7, marginBottom:8 }}>取扱いのある証券会社は限られています。最新の状況は各社の公式ページで確認してください。</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:8 }}>
              <a href="https://www.rakuten-sec.co.jp/web/us/ipo/" target="_blank" rel="noopener noreferrer" style={{ fontSize:11, fontWeight:800, color:"#1E3A66", backgroundColor:"#E8EDF5", border:"1px solid #C7D3E3", borderRadius:999, padding:"4px 12px", textDecoration:"none" }}>楽天証券 ↗</a>
              <a href="https://member.c.sbisec.co.jp/foreign/home" target="_blank" rel="noopener noreferrer" style={{ fontSize:11, fontWeight:800, color:"#1E3A66", backgroundColor:"#E8EDF5", border:"1px solid #C7D3E3", borderRadius:999, padding:"4px 12px", textDecoration:"none" }}>SBI証券 ↗</a>
            </div>
            <div style={{ fontSize:10, color:"#64748b", lineHeight:1.7, marginBottom:8 }}>※SBI証券：新規IPOは、このリンクを開いたあと「IPOスピードキャッチ！(米国・中国)」の欄をご覧ください。取扱予定の新規上場銘柄を確認できます(ログインが必要な場合があります)。</div>
            <a href="/how-to-buy" style={{ fontSize:11, fontWeight:700, color:"#1E3A66", textDecoration:"none" }}>参加する方法を見る →</a>
          </div>

{/* IPO投資ガイドへのリンク */}
<a href="/ipo-guide" style={{ ...cardStyle, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", backgroundColor:"#f0fdf4", textDecoration:"none", border:"1.5px solid #22c55e" }}>
            <div>
              <div style={{ fontSize:12, fontWeight:900, color:"#0F1F36" }}>💡 IPO投資で資産を増やす法則</div>
              <div style={{ fontSize:10, color:"#15803d", marginTop:2 }}>超短期・短期・長期の実践的戦略</div>
            </div>
            <span style={{ fontSize:16, color:"#22c55e" }}>→</span>
          </a>

                   {/* マイページ（冒頭） */}
          <a href="/mypage" style={{ ...cardStyle, display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"14px 16px", backgroundColor:"#f59e0b", border:"2px solid #d97706", textDecoration:"none", fontWeight:900, fontSize:14, color:"white", boxShadow:"0 2px 8px rgba(245,158,11,0.25)" }}>
            <User size={16} color="white" />
            👤 マイページ・通知設定
          </a>

{/* サービス説明・免責一言 */}
<div style={{ ...cardStyle, padding:"12px 14px", backgroundColor:"#f8fefe", display:"flex", alignItems:"flex-start", gap:8 }}>
            <span style={{ fontSize:13, flexShrink:0 }}>📋</span>
            <p style={{ fontSize:10, color:"#3D5A85", lineHeight:1.8, margin:0 }}>
              本サービスは、IPO銘柄が米国証券取引委員会（SEC）に提出する目論見書（S-1 / 424B4）をAIが解析・要約します。目的は、投資判断に役立つ情報の抽出です。目論見書に記載のない情報は「不明」「データ不足」と表示されます。AIによる試算・評価であり、投資勧誘ではありません。
            </p>
          </div>

          {/* 通知案内 */}
          <div style={{ ...cardStyle, padding:16 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
              <Zap size={16} color="#1E3A66" />
              <span style={{ fontWeight:900, fontSize:13, color:"#0F1F36" }}>通知サービス</span>
            </div>
            <p style={{ fontSize:12, color:"#3D5A85", lineHeight:1.7, margin:"0 0 12px" }}>
              上場日・価格決定・ロックアップ解除を<strong style={{ color:"#0F1F36" }}>前週金曜日18時</strong>にまとめてお届けします。
            </p>
            {[{ label:"B 分析見放題＋通知プラン", price:jpyMonth("plan_b") }, { label:"C 完全パックプラン", price:jpyMonth("plan_c") }].map(item => (
              <div key={item.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", borderRadius:10, padding:"8px 12px", marginBottom:6, backgroundColor:"#F5F4EF", border:"1px solid #E3E8F0" }}>
                <span style={{ fontSize:11, fontWeight:700, color:"#1E3A66" }}>{item.label}</span>
                <span style={{ fontSize:11, fontWeight:900, color:"#1E3A66" }}>{item.price}</span>
              </div>
            ))}
          </div>

        </aside>
      </div>


      {/* フッター */}
      <footer style={{ borderTop:"1px solid #C7D3E3", backgroundColor:"white", padding:"24px 16px", textAlign:"center" }}>
        <div style={{ display:"flex", flexWrap:"wrap", justifyContent:"center", columnGap:20, rowGap:8, marginBottom:12 }}>
          <a href="/tokushoho" style={{ fontSize:11, color:"#1E3A66", textDecoration:"none", whiteSpace:"nowrap" }}>特定商取引法に基づく表記</a>
          <a href="/privacy" style={{ fontSize:11, color:"#1E3A66", textDecoration:"none", whiteSpace:"nowrap" }}>プライバシーポリシー</a>
          <a href="/contact" style={{ fontSize:11, color:"#1E3A66", textDecoration:"none", whiteSpace:"nowrap" }}>お問い合わせ</a>
          <a href="/schedule" style={{ fontSize:11, color:"#1E3A66", textDecoration:"none", whiteSpace:"nowrap" }}>📅 上場スケジュール</a>
          <a href="/glossary" style={{ fontSize:11, color:"#1E3A66", textDecoration:"none", whiteSpace:"nowrap" }}>📖 用語集</a>
          <a href="/guide" style={{ fontSize:11, color:"#1E3A66", textDecoration:"none", whiteSpace:"nowrap" }}>このサイトの使い方</a>
          <a href="/how-to-buy" style={{ fontSize:11, color:"#1E3A66", textDecoration:"none", whiteSpace:"nowrap" }}>日本からの買い方</a>
          <a href="/plans" style={{ fontSize:11, color:"#1E3A66", textDecoration:"none", whiteSpace:"nowrap" }}>料金プラン</a>
          <a href="/trends" style={{ fontSize:11, color:"#1E3A66", textDecoration:"none", whiteSpace:"nowrap" }}>📡 マーケットトレンド</a>
          <a href="/ipo-guide" style={{ fontSize:11, color:"#1E3A66", textDecoration:"none", whiteSpace:"nowrap" }}>💡 IPO投資の法則</a>
        </div>
        <p style={{ fontSize:10, color:"#94a3b8", lineHeight:1.7, margin:0 }}>
          本サービスの分析・スコアはAIによる試算値であり、投資勧誘ではありません。<br/>
          最終的な投資判断はご自身の責任のもとで行ってください。<br/>
          © 2026 大手町調査室九課｜本サービスのコンテンツ・AI分析結果の無断転載・複製を禁じます。
        </p>
      </footer>
    </div>
  );
}