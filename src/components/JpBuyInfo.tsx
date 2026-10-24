// 2026/10追加: 「日本での買い方」の表示と、証券会社の公式ページへのリンク。
// 読者が、公式ページで取扱い状況を再確認できるようにする。
// 取扱い状況(上場後に売買できるか)は、管理画面で銘柄ごとに登録する(ipo_companies.jp_brokers)。
// 2026/10/24: この列の意味を「抽選あり」から「上場後に売買できる(取扱いあり)」に変更した。

export const JP_BROKERS = {
  rakuten: {
    name: "楽天証券",
    url: "https://www.rakuten-sec.co.jp/web/us/ipo/",
    label: "楽天証券 米国IPOのページ",
  },
  sbi: {
    name: "SBI証券",
    url: "https://www.sbisec.co.jp/",
    label: "SBI証券 公式サイト",
  },
} as const;

export type JpBrokerKey = keyof typeof JP_BROKERS;
export const JP_BROKER_KEYS = Object.keys(JP_BROKERS) as JpBrokerKey[];

const NAVY = "#1E3A66";

// 公式ページへのリンク(小さな帯)。分析ページ・トップ・ガイドなどに置く。
export function BrokerLinks({ title = "取扱い状況は、各社の公式ページで最新の情報をご確認ください" }: { title?: string }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 11, color: "#64748b", lineHeight: 1.7 }}>{title}</span>
      {JP_BROKER_KEYS.map((k) => (
        <a
          key={k}
          href={JP_BROKERS[k].url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 11, fontWeight: 800, color: NAVY, backgroundColor: "#E8EDF5", border: "1px solid #C7D3E3", borderRadius: 999, padding: "4px 12px", textDecoration: "none", whiteSpace: "nowrap" }}
        >
          {JP_BROKERS[k].label} ↗
        </a>
      ))}
    </div>
  );
}

type Tone = { bg: string; border: string; fg: string; badgeBg: string };
const TONES: Record<string, Tone> = {
  listed: { bg: "#F0FDF4", border: "#BBF7D0", fg: "#15803D", badgeBg: "#DCFCE7" },
  unknown: { bg: "#FFFBEB", border: "#FDE68A", fg: "#92400E", badgeBg: "#FEF3C7" },
};

// 銘柄ごとの「日本での買い方」カード(分析ページの上部に置く)
// 2026/10/24変更: 「抽選あり」の表示をやめ、「上場後に売買できるか(取扱いあり)」の表示に変更した。
export function JpBuyCard({ company }: { company: { listing_date?: string | null; jp_brokers?: string[] | null } }) {
  const today = new Date().toISOString().slice(0, 10);
  const listed = !!company.listing_date && company.listing_date <= today;
  const keys = (Array.isArray(company.jp_brokers) ? company.jp_brokers : []).filter((k): k is JpBrokerKey => k in JP_BROKERS);
  const names = keys.map((k) => JP_BROKERS[k].name).join("・");

  let toneKey = "unknown";
  let badge = "取扱い未確認";
  let title = "日本の証券会社での取扱いは、確認できていません";
  let body = "多くの銘柄は上場後に取扱いが始まりますが、銘柄によっては扱われないこともあります。買う前に、各社の公式ページでティッカーを検索して確認してください。";

  if (keys.length > 0 && !listed) {
    toneKey = "listed";
    badge = "取扱いあり";
    title = `${names}で、上場後に売買できます`;
    body = "買値は公募価格ではなく、上場後の市場価格です(上場初日の値になります)。取扱いは変わることがあるので、各社の公式ページで確認してください。";
  } else if (keys.length > 0 && listed) {
    toneKey = "listed";
    badge = "取扱いあり";
    title = `${names}で売買できます`;
    body = "ティッカーから検索して買えます。価格は、公募価格ではなく、その時点の市場価格です。";
  }

  const t = TONES[toneKey];
  return (
    <div style={{ backgroundColor: t.bg, border: `1px solid ${t.border}`, borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ fontSize: 14 }}>🇯🇵</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: "#334155" }}>日本での買い方</span>
        <span style={{ fontSize: 11, fontWeight: 900, color: t.fg, backgroundColor: t.badgeBg, borderRadius: 999, padding: "2px 10px" }}>{badge}</span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 900, color: "#0F1F36", lineHeight: 1.6, marginBottom: 2 }}>{title}</div>
      <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.8, margin: "0 0 8px" }}>{body}</p>
      <BrokerLinks />
      <div style={{ marginTop: 6 }}>
        <a href="/how-to-buy" style={{ fontSize: 11, fontWeight: 700, color: NAVY }}>日本から米国IPOに参加する方法を見る →</a>
      </div>
    </div>
  );
}
