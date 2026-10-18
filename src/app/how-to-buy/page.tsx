import type { Metadata } from "next";

// 2026/10追加: 日本から米国IPOに参加する方法(日本の証券会社の取り扱い状況)
// ※ 取り扱い状況は変わりやすいため、確認日を明記している。更新したら CHECKED_AT を書き換える。
const CHECKED_AT = "2026年10月17日";

export const metadata: Metadata = {
  title: "日本から米国IPOに参加する方法｜大手町調査室九課",
  description: "米国のIPO(新規上場株)に、日本の証券会社から参加する方法を整理。IPO抽選に参加する方法と、上場後に買う方法の違い、楽天証券・SBI証券の取り扱い条件、注意点をまとめました。",
  alternates: { canonical: "https://ipo-us.finance-tower.com/how-to-buy" },
};

const C = {
  nav: "#1E3A66", dark: "#0F1F36", light: "#F5F4EF", border: "#C7D3E3", mid: "#3D5A85", soft: "#E8EDF5",
};

const card = { backgroundColor: "white", borderRadius: 16, border: `1px solid ${C.border}`, padding: "22px 20px" } as const;
const h2 = { fontSize: 20, fontWeight: 900, color: C.dark, margin: "0 0 12px", lineHeight: 1.5 } as const;
const p = { fontSize: 14, color: "#334155", lineHeight: 2, margin: "0 0 10px" } as const;

type Broker = {
  name: string;
  badge: string;
  url: string;
  note?: string;
  rows: [string, string][];
};

const BROKERS: Broker[] = [
  {
    name: "楽天証券",
    badge: "2026年6月1日から取り扱い開始",
    url: "https://www.rakuten-sec.co.jp/web/us/ipo/",
    rows: [
      ["参加方法", "ブックビルディングに申し込み、抽選に当選すると購入できます(抽選方式)"],
      ["対象銘柄", "楽天証券が選んだ銘柄のみ。すべての米国IPOに参加できるわけではありません"],
      ["決済通貨", "円で決済(ドルへの両替は不要)"],
      ["購入手数料", "0円(為替スプレッドも0)"],
      ["資金", "申込時に預り資産は不要。ただし抽選日までに「申込株数×公開価格×為替レート×1.05」の資金が必要"],
      ["使える口座", "特定口座・一般口座・NISA成長投資枠(PCのウェブサイトからの申込のみ)"],
      ["上場日の売却", "日本時間の夜(22:35頃。サマータイム中は21:35頃)から、指値注文のみ"],
    ],
  },
  {
    name: "SBI証券",
    badge: "2026年6月のスペースX上場で取り扱い",
    url: "https://member.c.sbisec.co.jp/foreign/home",
    note: "新規IPOは、このリンクを開いたあと「IPOスピードキャッチ！(米国・中国)」の欄をご覧ください。取扱予定の新規上場銘柄を確認できます(ログインが必要な場合があります)。",
    rows: [
      ["参加方法", "購入の申込をして、最終日に抽選を受ける方式(事前の需要申告はなし)"],
      ["決済通貨", "米ドルのみ。円は事前にドルへ両替しておく必要があります"],
      ["購入手数料", "0円(売却時は通常の手数料)"],
      ["資金", "申込時は残高がなくても応募できますが、抽選に参加するには期限までに残高が必要"],
      ["使える口座", "NISA成長投資枠でも応募できた"],
      ["注意", "次回以降にどの銘柄を取り扱うかは、その都度の案内で確認してください"],
    ],
  },
];

export default function HowToBuyPage() {
  return (
    <div style={{ backgroundColor: C.light, minHeight: "100vh", fontFamily: "'Noto Sans JP',sans-serif" }}>
      <div style={{ background: `linear-gradient(135deg, ${C.dark} 0%, ${C.nav} 100%)`, padding: "56px 24px 60px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ display: "inline-block", fontSize: 11, fontWeight: 700, color: "#C7D3E3", border: "1px solid rgba(199,211,227,0.4)", borderRadius: 20, padding: "4px 14px", marginBottom: 18 }}>
            大手町調査室九課 | 米国IPO ガイド
          </div>
          <h1 style={{ fontSize: "clamp(24px, 4.5vw, 36px)", fontWeight: 900, color: "white", lineHeight: 1.5, margin: "0 0 14px" }}>
            日本から米国IPOに参加する方法
          </h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", lineHeight: 2, margin: 0 }}>
            米国のIPOは、日本の個人投資家には「抽選に参加する」か「上場後に買う」かの2つの道があります。
            それぞれの違いと、日本の証券会社の取り扱い状況をまとめました。
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px 80px", display: "flex", flexDirection: "column", gap: 16 }}>

        <div style={{ ...card, backgroundColor: "#FFFBEB", border: "1px solid #FDE68A" }}>
          <p style={{ ...p, margin: 0, fontSize: 12.5, color: "#92400E" }}>
            取り扱い状況・条件は変わりやすい情報です。このページは <strong>{CHECKED_AT}</strong> に各社の公式ページで確認した内容をもとにしています。
            お申し込みの前に、必ず各社の公式ページで最新の条件をご確認ください。投資の助言ではありません。
          </p>
        </div>

        <div style={card}>
          <h2 style={h2}>① まず知っておきたいこと</h2>
          <p style={p}>
            米国のIPOは、公募(上場前に株を割り当てる部分)の大半を、機関投資家などが引き受けます。
            そのため、日本の個人が公募価格で買える機会は、日本株のIPOに比べるとずっと限られます。
          </p>
          <p style={{ ...p, margin: 0 }}>
            個人が参加する道は、大きく2つです。
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginTop: 14 }}>
            <div style={{ backgroundColor: C.soft, borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: C.nav, marginBottom: 6 }}>A. IPO抽選に参加する</div>
              <p style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.9, margin: 0 }}>
                公募価格で買えるチャンス。ただし取り扱う証券会社も銘柄も限られ、抽選に当たる必要があります。
              </p>
            </div>
            <div style={{ backgroundColor: C.soft, borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: C.nav, marginBottom: 6 }}>B. 上場後に市場で買う</div>
              <p style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.9, margin: 0 }}>
                米国株を扱う証券会社なら、上場後にティッカー(銘柄コード)で通常の米国株と同じように買えます。価格は市場で決まります。
              </p>
            </div>
          </div>
        </div>

        <div style={card}>
          <h2 style={h2}>② A. 日本の証券会社のIPO抽選(取扱状況)</h2>
          <p style={p}>
            確認できた範囲では、日本の証券会社で米国IPOの抽選に参加できたのは、楽天証券とSBI証券です。
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 6 }}>
            {BROKERS.map((b) => (
              <div key={b.name} style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ backgroundColor: C.nav, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 900, fontSize: 14, color: "white" }}>{b.name}</span>
                  <span style={{ fontSize: 10.5, color: "#C7D3E3" }}>{b.badge}</span>
                </div>
                <dl style={{ margin: 0 }}>
                  {b.rows.map(([k, v], i) => (
                    <div key={k} style={{ display: "grid", gridTemplateColumns: "104px 1fr", gap: 10, padding: "10px 16px", backgroundColor: i % 2 ? "#FAFBFD" : "white", borderTop: i ? `1px solid ${C.soft}` : "none" }}>
                      <dt style={{ fontSize: 12, fontWeight: 800, color: C.mid }}>{k}</dt>
                      <dd style={{ fontSize: 12.5, color: "#334155", lineHeight: 1.8, margin: 0 }}>{v}</dd>
                    </div>
                  ))}
                </dl>
                <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.soft}` }}>
                  <a href={b.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 700, color: C.nav }}>
                    {b.name}の公式ページで最新の条件を見る →
                  </a>
                  {b.note ? (
                    <p style={{ fontSize: 11.5, color: "#64748b", lineHeight: 1.8, margin: "6px 0 0" }}>※{b.note}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <p style={{ ...p, fontSize: 12, color: "#64748b", marginTop: 14, marginBottom: 0 }}>
            楽天証券は、2026年10月時点で取り扱い中の銘柄はないと案内しています。取り扱いがあるときは、各社の案内に銘柄ごとに出ます。
          </p>
        </div>

        <div style={card}>
          <h2 style={h2}>③ B. 上場後に買う</h2>
          <p style={p}>
            米国株の取り扱いがある日本の証券会社であれば、上場後にティッカーで検索して買えます。
            ただし、上場日の日本時間での注文受付の開始時刻は、証券会社によって異なります。
            初値がつく前から注文を受け付ける会社もあれば、初値がついたあとから受け付ける会社もあります。
          </p>
          <p style={{ ...p, margin: 0 }}>
            当サイトの各銘柄の分析ページでは、ティッカー・上場日・ロックアップ解除日、上場後の値動き(公募価格との比較)を確認できます。
          </p>
          <div style={{ marginTop: 12 }}>
            <a href="/" style={{ fontSize: 13, fontWeight: 800, color: C.nav }}>銘柄一覧を見る →</a>
          </div>
        </div>

        <div style={card}>
          <h2 style={h2}>④ 参加する前に知っておきたい注意点</h2>
          <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              "上場日は、日本時間では夜(米国市場が開く時間)になります。初日は値動きが大きく、公募価格を下回ることもあります。",
              "上場日の売却は、成行注文ができず、指値注文のみの証券会社があります。初値から大きく離れた指値は、失効することがあります。",
              "ドルの価格を円で買う・売るため、為替の変動でも損益が変わります(円で決済する場合も、為替レートの影響を受けます)。",
              "ロックアップ(既存株主の売却制限)が解除されるころは、売りが増えやすい時期です。解除日は各銘柄の分析ページに載せています。",
              "税金は、外国株式の売却益として申告が必要になることがあります(NISA口座は非課税)。詳しくは税務署・税理士・証券会社の案内をご確認ください。",
            ].map((t, i) => (
              <li key={i} style={{ fontSize: 13, color: "#334155", lineHeight: 1.9 }}>{t}</li>
            ))}
          </ul>
        </div>

        <p style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.9, margin: "4px 4px 0" }}>
          情報源: 楽天証券「米国株式 新規公開株式（IPO）」および同社のお知らせ、SBI証券の取り扱い事例の報道・解説記事(いずれも{CHECKED_AT}時点で確認)。
          本ページは情報提供を目的としたもので、特定の証券会社・銘柄の取引を勧めるものではありません。投資の判断はご自身の責任でお願いします。
        </p>
      </div>
    </div>
  );
}
