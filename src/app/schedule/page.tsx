import type { Metadata } from "next";
import { getScheduleCompanies } from "@/lib/get-companies";
import { fmtUsd, fmtJpyApprox, FX_NOTE } from "@/lib/fx";

// 1時間ごとに自動で作り直す(銘柄の追加・上場日の更新が、手作業なしで反映される)
export const revalidate = 3600;

const BASE = "https://ipo-us.finance-tower.com";
const C = { nav: "#1E3A66", dark: "#0F1F36", light: "#F5F4EF", border: "#C7D3E3", mid: "#3D5A85", soft: "#E8EDF5" };

type Row = {
  id: string; name: string; ticker: string | null; exchange: string | null; sector: string | null;
  listing_date: string | null; listing_date_confirmed: boolean | null;
  price_range_min: number | null; price_range_max: number | null;
  lockup_90_date: string | null; lockup_180_date: string | null; sec_stage: string | null;
};

// 日本時間の今日(YYYY-MM-DD)
function todayJst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
function jp(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d); return m ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : "";
}
function jpShort(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d); return m ? `${Number(m[2])}/${Number(m[3])}` : "";
}
function monthLabel(key: string): string {
  const [y, m] = key.split("-"); return `${y}年${Number(m)}月`;
}
function priceText(r: Row): { main: string; sub: string } {
  const lo = r.price_range_min, hi = r.price_range_max;
  if (lo == null && hi == null) return { main: "未発表", sub: "" };
  const a = (lo ?? hi) as number, b = (hi ?? lo) as number;
  const main = a === b ? fmtUsd(a) : `${fmtUsd(a)}〜${fmtUsd(b)}`;
  const sub = a === b ? fmtJpyApprox(a) : `${fmtJpyApprox(a)}〜${fmtJpyApprox(b)}`;
  return { main, sub };
}
const STAGE: Record<string, string> = { filed: "価格帯は未発表", launched: "価格帯を発表済み", priced: "価格決定済み" };

async function load() {
  let rows: Row[] = [];
  try { rows = (await getScheduleCompanies()) as Row[]; } catch { rows = []; }
  const today = todayJst();
  const recentFrom = addDays(today, -60);
  // 上場日が今日以降のもの(上場日の早い順)
  const upcoming = rows.filter((r) => r.listing_date && r.listing_date >= today);
  // 上場日が未定でも、価格帯が発表されている銘柄は載せる
  const undated = rows.filter((r) => !r.listing_date && (r.price_range_min != null || r.sec_stage === "launched" || r.sec_stage === "priced"));
  // 直近60日に上場した銘柄(新しい順)
  const recent = rows.filter((r) => r.listing_date && r.listing_date < today && r.listing_date >= recentFrom).reverse();
  return { today, upcoming, undated, recent };
}

export async function generateMetadata(): Promise<Metadata> {
  const { today, upcoming } = await load();
  const months = Array.from(new Set(upcoming.map((r) => r.listing_date!.slice(0, 7)))).slice(0, 2).map(monthLabel);
  const span = months.length ? months.join("・") : `${today.slice(0, 4)}年${Number(today.slice(5, 7))}月`;
  const title = `米国IPO上場スケジュール【${span}】｜上場日・公募価格・ロックアップ`;
  const names = upcoming.slice(0, 3).map((r) => r.name).join("、");
  const description = `米国IPOの上場予定を、月ごとに一覧にしました。上場日・公募価格（想定の価格帯）・ロックアップ解除日を銘柄別に掲載。${names ? `直近の予定：${names}。` : ""}目論見書（S-1）をもとにAIが日本語で整理しています。`.slice(0, 200);
  return {
    title, description,
    alternates: { canonical: `${BASE}/schedule` },
    openGraph: { title, description, url: `${BASE}/schedule`, siteName: "米国IPO企業情報AI分析レポート｜大手町調査室九課", locale: "ja_JP", type: "website", images: [{ url: `${BASE}/ogp.png`, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [`${BASE}/ogp.png`] },
  };
}

const FAQ = [
  { q: "米国IPOの上場日と公募価格は、いつ決まりますか？", a: "先に価格帯が発表され、投資家の需要を確認する期間（ロードショー）を経て、多くの場合は上場の前日に公募価格が決まります。取引は価格が決まった翌営業日から始まります。日程は市場の状況で動くことがあるため、このページの上場日は予定として読んでください。" },
  { q: "ロックアップとは何ですか？", a: "創業者・役員・ベンチャーキャピタルなどの大株主が、上場後の一定期間は株を売れないという取り決めです。期間は90日や180日が多く、目論見書に書かれています。解除日の前後は売りが出やすくなるため、売り時を考えるときの目安になります。" },
  { q: "米国株の売買単位（単元）は何株ですか？", a: "米国株には、日本株の「100株単位」のような単元株の決まりがなく、1株から売買できます。IPOの抽選に申し込むときの最低株数は、取り扱う証券会社と銘柄ごとに決まっているため、各社の公式ページで確認してください。" },
  { q: "日本から米国IPOに参加できますか？", a: "日本の証券会社の一部が、米国IPOの抽選の取り扱いを始めています。ただし対象は証券会社が選んだ銘柄に限られ、すべての米国IPOに参加できるわけではありません。取り扱いの条件は「日本からの買い方」のページにまとめています。" },
];

const th = { textAlign: "left", fontSize: 11, fontWeight: 700, color: C.mid, padding: "8px 8px", borderBottom: `2px solid ${C.border}`, whiteSpace: "nowrap" } as const;
const td = { fontSize: 12.5, color: C.dark, padding: "10px 8px", borderBottom: `1px solid ${C.border}`, verticalAlign: "top", lineHeight: 1.6 } as const;

function Table({ rows, today }: { rows: Row[]; today: string }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
        <thead>
          <tr>
            <th scope="col" style={th}>上場日</th>
            <th scope="col" style={th}>銘柄</th>
            <th scope="col" style={th}>公募価格（想定の価格帯）</th>
            <th scope="col" style={th}>ロックアップ解除日</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const p = priceText(r);
            const href = `/analysis/${r.ticker ?? r.id}`;
            const lock = [r.lockup_90_date ? `90日：${jpShort(r.lockup_90_date)}` : "", r.lockup_180_date ? `180日：${jpShort(r.lockup_180_date)}` : ""].filter(Boolean).join(" ／ ");
            return (
              <tr key={r.id}>
                <td style={{ ...td, whiteSpace: "nowrap" }}>
                  {r.listing_date ? jpShort(r.listing_date) : "未定"}
                  {r.listing_date && !r.listing_date_confirmed && r.listing_date >= today && <div style={{ fontSize: 10, color: "#92400e" }}>予定</div>}
                </td>
                <td style={td}>
                  <a href={href} style={{ color: C.nav, fontWeight: 800, textDecoration: "none" }}>{r.name}{r.ticker ? `（${r.ticker}）` : ""}</a>
                  <div style={{ fontSize: 11, color: "#64748b" }}>{[r.exchange && !r.exchange.includes("要確認") ? r.exchange : "", r.sector ?? ""].filter(Boolean).join("・")}</div>
                </td>
                <td style={td}>
                  <div style={{ fontWeight: 700 }}>{p.main}</div>
                  {p.sub && <div style={{ fontSize: 11, color: "#64748b" }}>{p.sub}</div>}
                  {r.sec_stage && STAGE[r.sec_stage] && <div style={{ fontSize: 10, color: "#64748b" }}>{STAGE[r.sec_stage]}</div>}
                </td>
                <td style={td}>{lock || <span style={{ color: "#64748b", fontSize: 11 }}>価格決定後に確定</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function SchedulePage() {
  const { today, upcoming, undated, recent } = await load();
  const byMonth = new Map<string, Row[]>();
  for (const r of upcoming) {
    const k = r.listing_date!.slice(0, 7);
    byMonth.set(k, [...(byMonth.get(k) ?? []), r]);
  }
  const card = { backgroundColor: "white", borderRadius: 16, border: `1px solid ${C.border}`, padding: "18px 16px", marginBottom: 14 } as const;
  const h2 = { fontSize: 17, fontWeight: 900, color: C.dark, margin: "0 0 10px", lineHeight: 1.5 } as const;

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "name": "米国IPO上場スケジュール",
      "itemListElement": upcoming.map((r, i) => ({
        "@type": "ListItem", "position": i + 1,
        "name": `${r.name}${r.ticker ? `（${r.ticker}）` : ""} 上場予定日 ${r.listing_date}`,
        "url": `${BASE}/analysis/${r.ticker ?? r.id}`,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": FAQ.map((f) => ({ "@type": "Question", "name": f.q, "acceptedAnswer": { "@type": "Answer", "text": f.a } })),
    },
  ];

  return (
    <div style={{ backgroundColor: C.light, minHeight: "100vh", fontFamily: "'Noto Sans JP',sans-serif" }}>
      {jsonLd.map((j, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(j) }} />)}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "16px 16px 48px" }}>
        <div style={{ background: "linear-gradient(135deg, #0F1F36 0%, #1E3A66 100%)", borderRadius: 16, padding: "20px 20px 16px", marginBottom: 14 }}>
          <h1 style={{ fontSize: "clamp(18px, 3.4vw, 24px)", fontWeight: 900, color: "#fff", lineHeight: 1.5, margin: "0 0 8px" }}>米国IPO 上場スケジュール</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.88)", lineHeight: 1.9, margin: "0 0 6px" }}>
            米国で上場を予定している企業を、上場日の順に一覧にしました。上場日・公募価格（想定の価格帯）・ロックアップ（売却制限）の解除日を確認できます。
          </p>
          <p style={{ fontSize: 11, color: "#A9C1E8", lineHeight: 1.7, margin: 0 }}>
            {jp(today)}時点。登録データから自動で更新しています。出典はSEC（米国証券取引委員会）の提出書類と、Nasdaqなどの公開情報です。
          </p>
        </div>

        {/* カレンダーへの目立つリンク */}
        <a href="/" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 16px", marginBottom: 14, borderRadius: 14, backgroundColor: "white", border: `2px solid ${C.nav}`, textDecoration: "none" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span style={{ fontSize: 20 }}>📅</span>
            <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: C.dark, lineHeight: 1.4 }}>カレンダーで見る</span>
              <span style={{ fontSize: 11, color: C.mid, lineHeight: 1.5 }}>上場日をカレンダー上で確認し、銘柄の分析レポートへ</span>
            </span>
          </span>
          <span style={{ fontSize: 16, fontWeight: 900, color: C.nav, flexShrink: 0 }}>→</span>
        </a>

        {upcoming.length === 0 && (
          <div style={card}><p style={{ fontSize: 13, color: "#475569", lineHeight: 1.9, margin: 0 }}>現在、上場日が決まっている銘柄は登録されていません。新しい銘柄が見つかり次第、ここに追加します。</p></div>
        )}

        {Array.from(byMonth.entries()).map(([k, rows]) => (
          <section key={k} style={card} aria-label={`${monthLabel(k)}の米国IPO`}>
            <h2 style={h2}>{monthLabel(k)}の米国IPO（{rows.length}銘柄）</h2>
            <Table rows={rows} today={today} />
          </section>
        ))}

        {undated.length > 0 && (
          <section style={card} aria-label="上場日が未定の銘柄">
            <h2 style={h2}>上場日が未定の銘柄</h2>
            <Table rows={undated} today={today} />
          </section>
        )}

        {recent.length > 0 && (
          <section style={card} aria-label="最近上場した銘柄">
            <h2 style={h2}>最近上場した銘柄（直近60日）</h2>
            <Table rows={recent} today={today} />
          </section>
        )}

        <p style={{ fontSize: 11, color: "#64748b", lineHeight: 1.8, margin: "0 4px 14px" }}>
          {FX_NOTE} 日程・価格は発表のたびに変わります。分析ページの「結論と主要数値」は、この表と同じデータから作っています。
        </p>

        <section style={card} aria-label="よくある質問">
          <h2 style={h2}>米国IPOのスケジュールに関するよくある質問</h2>
          {FAQ.map((f) => (
            <div key={f.q} style={{ marginBottom: 14 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: C.nav, margin: "0 0 4px", lineHeight: 1.6 }}>{f.q}</h3>
              <p style={{ fontSize: 13, color: "#334155", lineHeight: 1.9, margin: 0 }}>{f.a}</p>
            </div>
          ))}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 4 }}>
            <a href="/how-to-buy" style={{ fontSize: 12, fontWeight: 700, color: C.nav }}>日本からの買い方 →</a>
            <a href="/" style={{ fontSize: 12, fontWeight: 700, color: C.nav }}>カレンダーで見る →</a>
          </div>
        </section>

        <p style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.7, textAlign: "center", margin: "18px 0 0" }}>
          本ページの情報はAIによる整理を含み、投資勧誘ではありません。最終的な投資判断はご自身の責任で行ってください。
        </p>
      </div>
    </div>
  );
}
