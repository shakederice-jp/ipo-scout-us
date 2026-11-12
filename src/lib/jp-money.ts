// 2026/11/12新設: AIが書いた文章の中の金額を、日本の読み方(万・億・兆)に直す。
//  例) 「900十億ドル」→「9,000億ドル」 / 「84.6十億ドル」→「846億ドル」 / 「33,242百万ドル」→「約332億ドル」
// 「十億ドル」「百万ドル」「千ドル」は、英語の billion / million / thousand を直訳した書き方で、日本の読者には桁が分かりにくい。
// ・表示の直前にかけるので、すでに保存されている分析文も、再分析なしで読みやすくなる。
// ・「数字 + 単位」の形のものだけを直す(「数千ドル」のように数字がないもの、1株あたりの価格などは変えない)。
// ・財務データの表(structured_data)は、数値として読み取る処理があるので、この変換をかけない。
const NUM = "\\d[\\d,]*(?:\\.\\d+)?";
const UNIT = "(十億|百万|千)(?:米)?ドル";
const SIGN = "[-−▲△]?";
const RANGE_RE = new RegExp(`(${SIGN})(${NUM})\\s*([〜～~–])\\s*(${NUM})${UNIT}`, "g");
const SINGLE_RE = new RegExp(`(${SIGN})(${NUM})${UNIT}`, "g");

const MULT: Record<string, number> = { "十億": 1e9, "百万": 1e6, "千": 1e3 };

function trimNum(n: number, maxDecimals: number): string {
  const r = Number(n.toFixed(maxDecimals));
  return r.toLocaleString("en-US", { maximumFractionDigits: maxDecimals });
}

// ドルの金額を、兆・億・万の読み方に直す。exact=false のときは、四捨五入して端数を丸めている。
function toJa(usd: number): { text: string; exact: boolean } {
  const a = Math.abs(usd);
  const eq = (shown: number, real: number) => Math.abs(shown - real) <= Math.abs(real) * 1e-9;
  if (a >= 1e12) {
    const v = a / 1e12; const r = Number(v.toFixed(2));
    return { text: `${trimNum(v, 2)}兆ドル`, exact: eq(r, v) };
  }
  if (a >= 1e8) {
    const v = a / 1e8;
    const r = v >= 100 ? Math.round(v) : Number(v.toFixed(2));
    return { text: `${v >= 100 ? r.toLocaleString("en-US") : trimNum(v, 2)}億ドル`, exact: eq(r, v) };
  }
  if (a >= 1e4) {
    const v = a / 1e4;
    const r = v >= 100 ? Math.round(v) : Number(v.toFixed(1));
    return { text: `${v >= 100 ? r.toLocaleString("en-US") : trimNum(v, 1)}万ドル`, exact: eq(r, v) };
  }
  const r = Math.round(a);
  return { text: `${r.toLocaleString("en-US")}ドル`, exact: eq(r, a) };
}

export function normalizeMoneyJa(text: string): string {
  if (!text || !/(十億|百万|千)(?:米)?ドル/.test(text)) return text;
  const parse = (s: string) => parseFloat(s.replace(/,/g, ""));
  const approx = (full: string, offset: number, exact: boolean) => (!exact && full[offset - 1] !== "約" ? "約" : "");
  // 先に「70〜78百万ドル」のような範囲を直す(後ろの数字だけ直すと、前の数字の桁がずれるため)
  let out = text.replace(RANGE_RE, (m, sign: string, a: string, sep: string, b: string, unit: string, offset: number, full: string) => {
    const k = MULT[unit];
    const x = toJa(parse(a) * k), y = toJa(parse(b) * k);
    return `${approx(full, offset, x.exact && y.exact)}${sign}${x.text}${sep}${y.text}`;
  });
  out = out.replace(SINGLE_RE, (m, sign: string, a: string, unit: string, offset: number, full: string) => {
    const t = toJa(parse(a) * MULT[unit]);
    return `${approx(full, offset, t.exact)}${sign}${t.text}`;
  });
  return out;
}

// 百万ドル単位の数値(例 33242)を、日本の読み方の文字列(例「約332億ドル」)にする。画面の数値カード用。
export function fmtUsdMillionsJa(millions: number): string {
  const t = toJa(millions * 1e6);
  return `${t.exact ? "" : "約"}${millions < 0 ? "-" : ""}${t.text}`;
}

// 文章(文字列)だけを直す。入れ子のオブジェクト・配列もたどる(数値や真偽値、キー名はそのまま)。
export function normalizeMoneyDeep<T>(value: T): T {
  if (typeof value === "string") return normalizeMoneyJa(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => normalizeMoneyDeep(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = normalizeMoneyDeep(v);
    return out as T;
  }
  return value;
}
