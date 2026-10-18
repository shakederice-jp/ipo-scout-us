// 分析ページの冒頭に置く「結論1行＋主要数値表」。
// ・登録されている情報(上場日・価格帯・ロックアップ解除日・主幹事)から自動で作る。AIの文章生成には頼らないので、数字が食い違うことがない。
// ・サーバー側で最初のHTMLに入るため、検索エンジンや生成AIが「この銘柄の上場日・公募価格」をそのまま読み取れる。
// ・有料部分(分析本文)には触れない。ここに出るのは、目論見書の表紙やSECの公開情報にある事実だけ。
import { fmtUsd, fmtJpyApprox, FX_NOTE, FX_LABEL } from "@/lib/fx";

const PRIMARY = "#1E3A66", DARK = "#0F1F36", BORDER = "#C7D3E3", TTEXT = "#3D5A85";

export type KeyFactsInput = {
  name: string;
  ticker?: string | null;
  exchange?: string | null;
  sector?: string | null;
  listing_date?: string | null;
  listing_date_confirmed?: boolean | null;
  price_range_min?: number | null;
  price_range_max?: number | null;
  lockup_90_date?: string | null;
  lockup_180_date?: string | null;
  sec_stage?: string | null;
};
export type KeyFactsExtra = { underwriters?: string | null; lockupPeriod?: string | null };

export function jpDate(d?: string | null): string {
  const m = d ? /^(\d{4})-(\d{2})-(\d{2})/.exec(d) : null;
  return m ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : "";
}

function usdRange(min?: number | null, max?: number | null): { text: string; yen: string } | null {
  if (min == null && max == null) return null;
  const lo = min ?? max!, hi = max ?? min!;
  if (lo === hi) return { text: fmtUsd(lo), yen: fmtJpyApprox(lo) };
  return { text: `${fmtUsd(lo)}〜${fmtUsd(hi)}`, yen: `${fmtJpyApprox(lo)}〜${fmtJpyApprox(hi)}` };
}

// 数字の見え方(価格が確定済みか、想定の価格帯か)
function priceInfo(c: KeyFactsInput) {
  const r = usdRange(c.price_range_min, c.price_range_max);
  if (!r) return { text: "未発表（価格帯の発表待ち）", short: "価格帯は未発表", faq: "価格帯はまだ発表されていません。" , has: false };
  const fixed = c.sec_stage === "priced";
  const label = fixed ? "公募価格" : "想定の価格帯";
  return {
    text: `${r.text}（${r.yen}）${fixed ? "・価格決定済み" : "・想定の価格帯。価格決定で変わることがあります"}`,
    short: `${label}は${r.text}`,
    faq: `${label}は${r.text}（${r.yen}・${FX_LABEL}）です。`,
    has: true,
  };
}

function lockupInfo(c: KeyFactsInput, x: KeyFactsExtra) {
  const parts: string[] = [];
  if (c.lockup_90_date) parts.push(`90日：${jpDate(c.lockup_90_date)}`);
  if (c.lockup_180_date) parts.push(`180日：${jpDate(c.lockup_180_date)}`);
  if (parts.length) return { text: parts.join(" ／ "), has: true };
  const per = x.lockupPeriod ? `目論見書上の期間は「${x.lockupPeriod}」。` : "";
  return { text: `${per}解除日は価格決定後に確定します`, has: false };
}

const STAGE_TEXT: Record<string, string> = {
  filed: "SEC（米国証券取引委員会）に登録届出書を提出済み。価格帯は未発表",
  launched: "価格帯を発表済み（ロードショー中）",
  priced: "価格決定済み",
  withdrawn: "上場の取り下げが確認されています",
};

// 「結論1行」を作る。登録情報だけで組み立てる。
export function buildKeyLine(c: KeyFactsInput, x: KeyFactsExtra = {}): string {
  const who = `${c.name}${c.ticker ? `（${c.ticker}）` : ""}`;
  if (c.sec_stage === "withdrawn") return `${who}は、米国IPOの取り下げが確認されています。`;
  const venue = c.exchange && !c.exchange.includes("要確認") ? `${c.exchange}への上場を予定する` : "米国での上場を予定する";
  const sector = c.sector ? `${c.sector}分野の` : "";
  const ld = jpDate(c.listing_date);
  const when = ld ? `上場日は${ld}${c.listing_date_confirmed ? "" : "（予定）"}。` : "上場日は未定です。";
  return `${who}は、${venue}${sector}企業です。${when}${priceInfo(c).short}です。`;
}

export function buildKeyFaq(c: KeyFactsInput, x: KeyFactsExtra = {}): { q: string; a: string }[] {
  const who = `${c.name}${c.ticker ? `（${c.ticker}）` : ""}`;
  const ld = jpDate(c.listing_date);
  const lk = lockupInfo(c, x);
  const out = [
    { q: `${who}の上場日はいつですか？`, a: ld ? `${ld}${c.listing_date_confirmed ? "です。" : "の予定です。日程は変わることがあります。"}` : "まだ決まっていません。" },
    { q: `${who}の公募価格はいくらですか？`, a: priceInfo(c).faq },
    { q: `${who}のロックアップ解除日はいつですか？`, a: lk.has ? `${lk.text}です。` : `${lk.text}。` },
  ];
  if (x.underwriters) out.push({ q: `${who}の主幹事はどこですか？`, a: `${x.underwriters}です（目論見書の記載より）。` });
  return out;
}

export default function KeyFacts({ company, extra = {} }: { company: KeyFactsInput; extra?: KeyFactsExtra }) {
  const c = company;
  const price = priceInfo(c);
  const lk = lockupInfo(c, extra);
  const ld = jpDate(c.listing_date);
  const rows: [string, string][] = [
    ["上場日", ld ? `${ld}${c.listing_date_confirmed ? "" : "（予定）"}` : "未定"],
    ["公募価格（想定の価格帯）", price.text],
    ["ロックアップ解除日", lk.text],
    ["主幹事", extra.underwriters || "目論見書で確認中"],
  ];
  if (c.exchange && !c.exchange.includes("要確認")) rows.push(["上場先・ティッカー", `${c.exchange}${c.ticker ? `・${c.ticker}` : ""}`]);
  if (c.sec_stage && STAGE_TEXT[c.sec_stage]) rows.push(["現在の状況", STAGE_TEXT[c.sec_stage]]);

  return (
    <section aria-label="結論と主要数値" style={{ backgroundColor: "white", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 16px" }}>
      <p style={{ fontSize: 14, fontWeight: 900, color: DARK, lineHeight: 1.7, margin: "0 0 10px" }}>{buildKeyLine(c, extra)}</p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <caption style={{ captionSide: "top", textAlign: "left", fontSize: 11, fontWeight: 700, color: TTEXT, paddingBottom: 6 }}>
          {c.name}のIPO 主要数値
        </caption>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} style={{ borderTop: `1px solid ${BORDER}` }}>
              <th scope="row" style={{ textAlign: "left", fontWeight: 700, color: TTEXT, padding: "7px 8px 7px 0", width: "34%", verticalAlign: "top" }}>{k}</th>
              <td style={{ color: DARK, padding: "7px 0", lineHeight: 1.6 }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 10, color: "#64748b", lineHeight: 1.7, margin: "8px 0 0" }}>
        出典：SEC（米国証券取引委員会）の提出書類と目論見書（S-1）。日付と価格は発表のたびに更新します。{FX_NOTE}
      </p>
    </section>
  );
}
