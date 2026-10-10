"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/contexts/AppContext";

const C = { nav: "#1E3A66", teal: "#1E3A66" };
type FontSize = "sm" | "md" | "lg";

export default function AppHeader({ slot }: { slot?: React.ReactNode }) {
  const pathname = usePathname();
  const { fontSize, setFontSize, lang, setLang } = useApp();
  const isAnalysis = pathname.startsWith("/analysis/");

  const crumbs = isAnalysis ? [
    { label: lang === "ja" ? "トップ" : "Top", href: "/", link: true },
    { label: lang === "ja" ? "銘柄分析" : "Analysis", href: pathname, link: false },
  ] : [];

  return (
    <header style={{ backgroundColor: C.nav, position: "sticky", top: 0, zIndex: 50, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
      <style>{`
        .hdr-buy-short { display: none; }
        @media (max-width: 560px) { .hdr-buy-long { display: none; } .hdr-buy-short { display: inline; } }
      `}</style>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 44 }}>
        <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>📊</span>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: "#ffffff", letterSpacing: "0.3px", lineHeight: 1.3 }}>
              {lang === "ja" ? "IPO企業情報AI分析レポート" : "IPO Analysis AI Report"}
            </span>
            <span style={{ fontSize: 10, fontWeight: 500, color: "#C7D3E3", lineHeight: 1.3 }}>
              {lang === "ja" ? "担当：大手町調査室九課" : "by Otemachi Research Lab"}
            </span>
          </div>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 2, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 6, padding: "2px 4px" }}>
          {(["sm", "md", "lg"] as FontSize[]).map((s) => (
              <button key={s} onClick={() => setFontSize(s)} style={{
                fontSize: s === "sm" ? 13 : s === "md" ? 15 : 17,
                fontWeight: fontSize === s ? 700 : 400,
                color: fontSize === s ? "#ffffff" : "#C7D3E3",
                background: "none", border: "none", cursor: "pointer", padding: "2px 5px", borderRadius: 4,
                backgroundColor: fontSize === s ? "rgba(255,255,255,0.22)" : "transparent",
              }}>A</button>
            ))}
          </div>
          <Link href="/plans" style={{
            fontSize: 11, fontWeight: 800, color: "#ffffff", whiteSpace: "nowrap",
            backgroundColor: "#f59e0b", border: "1px solid #d97706",
            borderRadius: 6, padding: "3px 8px", cursor: "pointer", textDecoration: "none",
          }}>
            <span className="hdr-buy-long">💳 料金・購入</span>
            <span className="hdr-buy-short">💳 購入</span>
          </Link>
          <Link href="/trends" style={{
            fontSize: 11, fontWeight: 600, color: "#ffffff",
            backgroundColor: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.35)",
            borderRadius: 6, padding: "3px 8px", cursor: "pointer", textDecoration: "none",
          }}>📡 トレンド</Link>
                 </div>
      </div>
      {crumbs.length > 0 && (
        <div style={{ backgroundColor: "rgba(0,0,0,0.2)", borderTop: "1px solid rgba(255,255,255,0.12)" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {crumbs.map((c, i) => (
                <span key={c.href} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {i > 0 && <span style={{ color: "#C7D3E3", fontSize: 10 }}>›</span>}
                  {c.link
                    ? <Link href={c.href} style={{ fontSize: 11, color: "#C7D3E3", textDecoration: "none" }}>{c.label}</Link>
                    : <span style={{ fontSize: 11, color: "#ffffff", fontWeight: 600 }}>{c.label}</span>}
                </span>
              ))}
            </div>
            {slot}
          </div>
        </div>
      )}
    </header>
  );
}