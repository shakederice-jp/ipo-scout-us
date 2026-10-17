// 2026/10追加: 分析ページの「魅力 → 売り時 → 注意点」の流れを作る表示部品。
// ・SectionBand      : 大見出しの帯(①魅力 ②売り時 ③注意点)
// ・CharmSection     : 投資したくなる魅力を、数字つきのカードで並べる
// ・SellTimeline     : 上場日・静穏期間・ロックアップ解除日を、時間の流れで見せる(日付は実データのみ)
// ・CautionSection   : 買ったあとの注意点を、重大度つきのカードで並べる

const NAVY = "#1E3A66";
const DARK = "#0F1F36";
const MID = "#3D5A85";
const BORDER = "#C7D3E3";
const SOFT = "#E8EDF5";

export function SectionBand({ no, title, sub, color = NAVY }: { no: string; title: string; sub: string; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px 0" }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: color, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 16, flexShrink: 0 }}>{no}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: DARK, lineHeight: 1.4 }}>{title}</div>
        <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.6 }}>{sub}</div>
      </div>
    </div>
  );
}

const cardBase: React.CSSProperties = { backgroundColor: "white", borderRadius: 14, border: `1px solid ${BORDER}`, padding: "14px 16px" };

const HORIZON_LABEL: Record<string, string> = { ultra_short: "超短期向き", short: "短期向き", long: "長期向き", all: "全期間" };

export function CharmSection({ highlights, lockedCount = 0 }: { highlights: any; lockedCount?: number }) {
  const charms: any[] = Array.isArray(highlights?.charms) ? highlights.charms : [];
  if (charms.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {highlights?.tagline && (
        <div style={{ borderRadius: 14, padding: "14px 16px", background: `linear-gradient(135deg, ${DARK} 0%, ${NAVY} 100%)`, color: "white" }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#A9C1E8", letterSpacing: "0.08em", marginBottom: 4 }}>この銘柄の魅力をひとことで</div>
          <div style={{ fontSize: 15, fontWeight: 900, lineHeight: 1.7 }}>{highlights.tagline}</div>
        </div>
      )}
      {charms.map((c, i) => (
        <div key={i} style={{ ...cardBase, display: "flex", gap: 14, alignItems: "stretch" }}>
          <div style={{ flex: "0 0 112px", borderRadius: 12, backgroundColor: SOFT, border: `1px solid ${BORDER}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "10px 6px", textAlign: "center" }}>
            {c.big_number ? (
              <>
                <div style={{ fontSize: String(c.big_number).length > 7 ? 17 : 22, fontWeight: 900, color: NAVY, lineHeight: 1.2, wordBreak: "break-all" }}>{c.big_number}</div>
                {c.big_label && <div style={{ fontSize: 10, color: MID, marginTop: 4, lineHeight: 1.5 }}>{c.big_label}</div>}
              </>
            ) : (
              <div style={{ fontSize: 26, fontWeight: 900, color: NAVY }}>{i + 1}</div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: DARK, lineHeight: 1.5 }}>{c.title}</span>
              {c.horizon && HORIZON_LABEL[c.horizon] && (
                <span style={{ fontSize: 10, fontWeight: 800, color: NAVY, backgroundColor: SOFT, borderRadius: 999, padding: "2px 8px" }}>{HORIZON_LABEL[c.horizon]}</span>
              )}
            </div>
            <p style={{ fontSize: 12.5, color: "#334155", lineHeight: 1.85, margin: "0 0 6px" }}>{c.why}</p>
            {c.evidence && (
              <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.7, borderTop: `1px dashed ${BORDER}`, paddingTop: 6 }}>
                <span style={{ fontWeight: 800, color: MID }}>根拠：</span>{c.evidence}
              </div>
            )}
          </div>
        </div>
      ))}
      {lockedCount > 0 && (
        <div style={{ ...cardBase, backgroundColor: "#F5F4EF", textAlign: "center", fontSize: 12, color: "#475569", lineHeight: 1.8 }}>
          🔒 このほかにも魅力が{lockedCount}点あります。売り時の目安・注意点とあわせて、有料プランでご覧いただけます。
        </div>
      )}
    </div>
  );
}

function addDays(d: string, n: number): string {
  const t = new Date(d + "T00:00:00Z");
  if (isNaN(t.getTime())) return "";
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
function fmt(d?: string | null): string {
  if (!d) return "日付は確定後";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : "日付は確定後";
}

// 売り時カレンダー。日付はすべて、実データ(上場日・ロックアップ解除日)か、上場日からの計算です。
export function SellTimeline({ company, bestHorizon }: { company: any; bestHorizon?: string }) {
  const ld: string = company?.listing_date ?? "";
  const confirmed = !!company?.listing_date_confirmed;
  const today = new Date().toISOString().slice(0, 10);
  const quiet = ld ? addDays(ld, 25) : "";
  const l90: string = company?.lockup_90_date ?? "";
  const l180: string = company?.lockup_180_date ?? "";

  type Ev = { key: string; date: string; title: string; note: string; tag?: string; horizon?: string };
  const evs: Ev[] = [
    { key: "listing", date: ld, title: ld && !confirmed ? "上場日(予定)" : "上場日", horizon: "ultra_short",
      note: "超短期の売買はこの日です。初日は値動きが大きく、始値と終値が大きく違うことがあります。" },
    { key: "quiet", date: quiet, title: "静穏期間の終わり(目安)", horizon: "short",
      note: "引受証券会社のアナリストが、評価を出し始める目安の日です。短期の値動きのきっかけになることがあります。" },
  ];
  if (l90) evs.push({ key: "l90", date: l90, title: "ロックアップ解除(90日)", horizon: "short",
    note: "大株主などの売却制限が解ける日です。売りが出やすくなるため、短期で売るかどうかの見直しの目安になります。" });
  if (l180) evs.push({ key: "l180", date: l180, title: "ロックアップ解除(180日)", horizon: "long",
    note: "売却制限が解ける、もう1つの節目です。長期で持つ場合も、この前後の株価と売りの動きを確認したい日です。" });
  evs.push({ key: "long", date: "", title: "長期(数年〜)", horizon: "long",
    note: "日付で売るのではなく、売上や利益の成長が続いているかを決算ごとに確認し、前提が崩れたときに見直します。" });

  const labelOf: Record<string, string> = { ultra_short: "超短期", short: "短期", long: "長期" };
  const dated = evs.filter(e => e.date);
  // 今日の位置(日付のある予定のうち、今日より前のものの数)
  const pastCount = dated.filter(e => e.date <= today).length;
  const todayIdx = evs.findIndex(e => !e.date || e.date > today);

  return (
    <div style={cardBase}>
      <div style={{ fontSize: 13, fontWeight: 900, color: DARK, marginBottom: 2 }}>📅 売り時カレンダー</div>
      <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.7, marginBottom: 12 }}>
        節目の日付を並べました。日付は目論見書と上場日から計算した目安で、株価の動きを約束するものではありません。
      </div>
      <div style={{ position: "relative", paddingLeft: 26 }}>
        <div style={{ position: "absolute", left: 8, top: 6, bottom: 6, width: 2, backgroundColor: BORDER }} />
        {evs.map((e, idx) => {
          const isPast = !!e.date && e.date <= today;
          const isBest = !!bestHorizon && bestHorizon === e.horizon && bestHorizon !== "none";
          const showToday = pastCount > 0 && idx === todayIdx;
          return (
            <div key={e.key}>
              {showToday && (
                <div style={{ position: "relative", margin: "0 0 10px", fontSize: 10, fontWeight: 900, color: "#b45309" }}>
                  <span style={{ position: "absolute", left: -23, top: 3, width: 10, height: 10, borderRadius: 999, backgroundColor: "#f59e0b" }} />
                  ▶ 今日（{fmt(today)}）
                </div>
              )}
              <div style={{ position: "relative", marginBottom: 14, opacity: isPast ? 0.65 : 1 }}>
                <span style={{ position: "absolute", left: -24, top: 3, width: 14, height: 14, borderRadius: 999, backgroundColor: isBest ? NAVY : "white", border: `3px solid ${isBest ? NAVY : MID}`, boxSizing: "border-box" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: DARK }}>{e.title}</span>
                  {e.date && <span style={{ fontSize: 12, fontWeight: 800, color: NAVY }}>{fmt(e.date)}</span>}
                  {e.horizon && <span style={{ fontSize: 10, fontWeight: 800, color: MID, backgroundColor: SOFT, borderRadius: 999, padding: "1px 8px" }}>{labelOf[e.horizon]}の目安</span>}
                  {isBest && <span style={{ fontSize: 10, fontWeight: 800, color: "white", backgroundColor: NAVY, borderRadius: 999, padding: "1px 8px" }}>この銘柄で最も向く期間</span>}
                </div>
                <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.8 }}>{e.note}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const SEV: Record<string, { bg: string; fg: string; bar: string; w: number }> = {
  高: { bg: "#fee2e2", fg: "#b91c1c", bar: "#dc2626", w: 100 },
  中: { bg: "#fef3c7", fg: "#92400e", bar: "#f59e0b", w: 66 },
  低: { bg: "#e0f2fe", fg: "#075985", bar: "#38bdf8", w: 33 },
};

export function CautionSection({ highlights }: { highlights: any }) {
  const items: any[] = Array.isArray(highlights?.cautions) ? highlights.cautions : [];
  if (items.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((c, i) => {
        const s = SEV[c.severity] ?? SEV["中"];
        return (
          <div key={i} style={{ ...cardBase, borderLeft: `5px solid ${s.bar}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: DARK, lineHeight: 1.5 }}>{c.title}</span>
              <span style={{ fontSize: 10, fontWeight: 900, color: s.fg, backgroundColor: s.bg, borderRadius: 999, padding: "2px 10px" }}>重大度 {c.severity ?? "中"}</span>
            </div>
            <div style={{ height: 5, borderRadius: 999, backgroundColor: "#f1f5f9", marginBottom: 8, overflow: "hidden" }}>
              <div style={{ width: `${s.w}%`, height: "100%", backgroundColor: s.bar }} />
            </div>
            <p style={{ fontSize: 12.5, color: "#334155", lineHeight: 1.85, margin: "0 0 6px" }}>{c.detail}</p>
            {c.watch && (
              <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.7, backgroundColor: "#F5F4EF", borderRadius: 8, padding: "6px 10px" }}>
                <span style={{ fontWeight: 800, color: MID }}>買ったあとに見るところ：</span>{c.watch}
              </div>
            )}
          </div>
        );
      })}
      <p style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.7, margin: 0 }}>
        ※注意点は、魅力と同じ重みで読んでください。公開資料をもとにしたAIの分析であり、投資助言ではありません。
      </p>
    </div>
  );
}
