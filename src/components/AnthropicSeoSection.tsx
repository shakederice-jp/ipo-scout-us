// 2026/11/12新設: ANTHROPIC, PBC のページの下に出す「検索で見つけてもらうための説明とFAQ」。
// サーバー側で最初のHTMLに入るため、検索エンジンや生成AIがそのまま読める。有料部分には触れない(会社の基本情報とFAQだけ)。
import { withBase } from "@/lib/base-path";
import { ANTHROPIC_PROFILE } from "@/lib/anthropic-seo";

const DARK = "#0F1F36", BORDER = "#C7D3E3", TTEXT = "#3D5A85";

export default function AnthropicSeoSection({ faq }: { faq: { q: string; a: string }[] }) {
  const links: { href: string; label: string; note: string }[] = [
    { href: "/schedule", label: "米国IPO 上場スケジュール", note: "上場予定の銘柄を月ごとに一覧で確認" },
    { href: "/how-to-buy", label: "日本から米国IPOに参加する方法", note: "楽天証券・SBI証券の取り扱い状況" },
    { href: "/glossary", label: "米国IPO用語集", note: "ロックアップ・S-1・主幹事などの解説" },
    { href: "/ipo-guide", label: "IPO投資の法則", note: "IPO投資の考え方" },
  ];
  return (
    <section aria-labelledby="anthropic-faq" style={{ maxWidth: 860, margin: "0 auto", padding: "8px 16px 40px", fontFamily: "'Noto Sans JP','Hiragino Kaku Gothic ProN',sans-serif" }}>
      <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 14, padding: "20px 18px" }}>
        <h2 id="anthropic-faq" style={{ fontSize: 17, fontWeight: 900, color: DARK, margin: "0 0 10px" }}>Anthropic（アンソロピック）のIPOを知りたい方へ</h2>
        <p style={{ fontSize: 13, lineHeight: 1.9, color: DARK, margin: "0 0 10px" }}>{ANTHROPIC_PROFILE}</p>
        <p style={{ fontSize: 13, lineHeight: 1.9, color: TTEXT, margin: "0 0 16px" }}>
          このページでは、上場日・価格帯・ロックアップ解除日・主幹事などの数字を、SEC（米国証券取引委員会）の提出書類などの公開情報をもとに整理しています。注目度の高い銘柄のため、分析レポートは会員登録なしで、どなたでも無料で読めるようにしています。
        </p>

        <h3 style={{ fontSize: 14, fontWeight: 900, color: DARK, margin: "0 0 8px" }}>よくある質問</h3>
        <dl style={{ margin: "0 0 18px" }}>
          {faq.map((f, i) => (
            <div key={i} style={{ borderTop: i === 0 ? "none" : `1px solid ${BORDER}`, padding: "10px 0" }}>
              <dt style={{ fontSize: 13, fontWeight: 800, color: DARK, marginBottom: 4 }}>Q. {f.q}</dt>
              <dd style={{ fontSize: 12.5, lineHeight: 1.85, color: TTEXT, margin: 0 }}>{f.a}</dd>
            </div>
          ))}
        </dl>

        <h3 style={{ fontSize: 14, fontWeight: 900, color: DARK, margin: "0 0 8px" }}>あわせて読みたいページ</h3>
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 14px", display: "flex", flexDirection: "column", gap: 6 }}>
          {links.map((l) => (
            <li key={l.href} style={{ fontSize: 12.5, lineHeight: 1.7 }}>
              <a href={withBase(l.href)} style={{ color: "#1E3A66", fontWeight: 800 }}>{l.label}</a>
              <span style={{ color: TTEXT }}>　{l.note}</span>
            </li>
          ))}
        </ul>

        <p style={{ fontSize: 11, lineHeight: 1.8, color: "#64748b", margin: 0 }}>
          ※ 当サイトの要約・分析は生成AIで作成しており、AI企業を題材にするこのページも同じです。投資の勧誘ではありません。数字は、各提出書類の最新の内容でご確認ください。
        </p>
      </div>
    </section>
  );
}
