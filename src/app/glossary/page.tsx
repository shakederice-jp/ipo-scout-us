import type { Metadata } from "next";
import { GLOSSARY } from "@/lib/glossary";

// 用語集ページ。サイト内の吹き出し説明(src/lib/glossary.ts)と同じ辞書から自動で作るので、説明が食い違わない。
export const revalidate = 86400;

const BASE = "https://ipo-us.finance-tower.com";
const C = { nav: "#1E3A66", dark: "#0F1F36", light: "#F5F4EF", border: "#C7D3E3", mid: "#3D5A85", soft: "#E8EDF5" };

export const metadata: Metadata = {
  title: "米国IPO用語集｜ロックアップ・S-1・主幹事・ロードショーの意味",
  description: "米国IPOでよく出る用語を、やさしい日本語で解説。ロックアップ、S-1（目論見書）、主幹事、ロードショー、公募価格、初日終値、売買単位（単元）など。",
  alternates: { canonical: `${BASE}/glossary` },
  openGraph: { title: "米国IPO用語集｜ロックアップ・S-1・主幹事・ロードショーの意味", description: "米国IPOでよく出る用語を、やさしい日本語で解説します。", url: `${BASE}/glossary`, siteName: "米国IPO企業情報AI分析レポート｜大手町調査室九課", locale: "ja_JP", type: "website", images: [{ url: `${BASE}/ogp.png`, width: 1200, height: 630 }] },
};

// 分類(各用語の先頭の言葉で振り分ける)
const CATS: { title: string; lead: string; keys: string[] }[] = [
  { title: "IPOの基本", lead: "IPOの意味と、価格や上場日にまつわる言葉です。", keys: ["IPO", "目論見書", "公募価格", "ロードショー", "プライシング", "初値", "初日終値", "初値形成", "寄り付き", "ティッカー", "単元株"] },
  { title: "上場の仕組みと売り時", lead: "ロックアップや引受会社など、上場後の値動きに関わる言葉です。", keys: ["ロックアップ", "引受証券会社", "主幹事", "ブックランナー", "オーバーアロットメント", "静穏期間", "流通比率", "発行済株式総数", "需給", "希薄化"] },
  { title: "会社の値段と財務", lead: "会社の大きさや、もうけの出し方を見る言葉です。", keys: ["時価総額", "バリュエーション", "PER", "PSR", "EPS", "営業利益率", "粗利率", "営業キャッシュフロー", "フリーキャッシュフロー", "キャッシュバーン", "ランウェイ", "黒字化", "継続企業の前提", "配当", "ユニットエコノミクス", "LTV", "CAC", "ARR", "ネットリテンション", "TAM"] },
  { title: "株主と株の種類", lead: "上場前から会社に出資している人や、株の種類に関する言葉です。", keys: ["ベンチャーキャピタル", "機関投資家", "優先株", "ワラント", "ストックオプション", "二重議決権", "ダウンラウンド", "EGC", "ADS"] },
  { title: "米国の制度と書類", lead: "米国で上場するときの、書類と取引所に関する言葉です。", keys: ["SEC", "EDGAR", "S-1", "424B4", "NASDAQ", "NYSE"] },
];

export default function GlossaryPage() {
  const byKey = new Map(GLOSSARY.map((g) => [g.terms[0], g]));
  const used = new Set<string>();
  const sections = CATS.map((cat) => {
    const items = cat.keys.map((k) => byKey.get(k)).filter(Boolean) as typeof GLOSSARY;
    items.forEach((g) => used.add(g.terms[0]));
    return { ...cat, items };
  });
  // 分類に入れ忘れた用語があっても、最後の分類に自動で載せる(辞書に足すだけで反映される)
  const rest = GLOSSARY.filter((g) => !used.has(g.terms[0]));
  if (rest.length) sections.push({ title: "その他の用語", lead: "", keys: [], items: rest });
  const total = sections.reduce((n, s) => n + s.items.length, 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    "name": "米国IPO用語集",
    "url": `${BASE}/glossary`,
    "inLanguage": "ja",
    "hasDefinedTerm": sections.flatMap((s) => s.items).map((g) => ({
      "@type": "DefinedTerm",
      "name": g.terms[0],
      "alternateName": g.terms.slice(1),
      "description": g.text,
      "inDefinedTermSet": `${BASE}/glossary`,
    })),
  };

  const card = { backgroundColor: "white", borderRadius: 16, border: `1px solid ${C.border}`, padding: "18px 16px", marginBottom: 14 } as const;

  return (
    <div style={{ backgroundColor: C.light, minHeight: "100vh", fontFamily: "'Noto Sans JP',sans-serif" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "16px 16px 48px" }}>
        <div style={{ background: "linear-gradient(135deg, #0F1F36 0%, #1E3A66 100%)", borderRadius: 16, padding: "20px 20px 16px", marginBottom: 14 }}>
          <h1 style={{ fontSize: "clamp(18px, 3.4vw, 24px)", fontWeight: 900, color: "#fff", lineHeight: 1.5, margin: "0 0 8px" }}>米国IPO用語集</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.88)", lineHeight: 1.9, margin: "0 0 6px" }}>
            米国IPOの分析レポートや目論見書に出てくる用語を、やさしい日本語でまとめました（全{total}語）。分析レポートの中でも、下線のついた用語にふれると同じ説明が出ます。
          </p>
        </div>

        <nav aria-label="分類" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {sections.map((s, i) => (
            <a key={s.title} href={`#cat-${i}`} style={{ fontSize: 12, fontWeight: 700, color: C.nav, backgroundColor: "white", border: `1px solid ${C.border}`, borderRadius: 999, padding: "6px 12px", textDecoration: "none" }}>{s.title}</a>
          ))}
        </nav>

        {sections.map((s, i) => (
          <section key={s.title} id={`cat-${i}`} style={card} aria-label={s.title}>
            <h2 style={{ fontSize: 17, fontWeight: 900, color: C.dark, margin: "0 0 4px", lineHeight: 1.5 }}>{s.title}</h2>
            {s.lead && <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.8, margin: "0 0 10px" }}>{s.lead}</p>}
            <dl style={{ margin: 0 }}>
              {s.items.map((g) => (
                <div key={g.terms[0]} id={`term-${g.terms[0]}`} style={{ borderTop: `1px solid ${C.border}`, padding: "10px 0" }}>
                  <dt style={{ fontSize: 14, fontWeight: 800, color: C.nav, lineHeight: 1.6 }}>
                    {g.terms[0]}
                    {g.terms.length > 1 && <span style={{ fontSize: 11, fontWeight: 500, color: "#64748b", marginLeft: 8 }}>（{g.terms.slice(1).join("・")}）</span>}
                  </dt>
                  <dd style={{ fontSize: 13, color: "#334155", lineHeight: 1.9, margin: "2px 0 0" }}>{g.text}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, margin: "4px 4px 0" }}>
          <a href="/schedule" style={{ fontSize: 12, fontWeight: 700, color: C.nav }}>上場スケジュール →</a>
          <a href="/how-to-buy" style={{ fontSize: 12, fontWeight: 700, color: C.nav }}>日本からの買い方 →</a>
          <a href="/" style={{ fontSize: 12, fontWeight: 700, color: C.nav }}>カレンダーで見る →</a>
        </div>
        <p style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.7, textAlign: "center", margin: "18px 0 0" }}>
          用語の説明は、投資判断の参考となる一般的な内容です。投資勧誘ではありません。
        </p>
      </div>
    </div>
  );
}
