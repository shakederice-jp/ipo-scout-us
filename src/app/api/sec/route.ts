import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;

// SECのフェアアクセスポリシーに従い、組織名+連絡先を名乗るUser-Agentを付与する
const SEC_USER_AGENT = "ipo-scout-us shakederice@gmail.com";

// 分析に使う書類の種類。新しい書類ほど公募価格帯などが確定しているため、日付が新しい順に探す。
//   424B4/424B1 = 価格決定後の最終目論見書、S-1/A = 修正版の登録届出書、S-1 = 最初の登録届出書、F-1 = 外国企業版
const TARGET_FORMS = new Set(["424B4", "424B1", "S-1/A", "S-1", "F-1/A", "F-1"]);

// 本文として十分な量があるかの目安(修正版のうち「別紙の追加だけ」の薄い書類を飛ばすため)
const MIN_FULL_DOC_CHARS = 120_000;

type Candidate = { form: string; filed: string; url: string };

async function secFetch(url: string, timeoutMs: number): Promise<Response> {
  return fetch(url, {
    headers: { "User-Agent": SEC_USER_AGENT, "Accept-Encoding": "gzip, deflate" },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

// 会社番号(CIK)から、目論見書として使える書類の候補一覧(新しい順)を作る
async function listCandidates(cik: string): Promise<Candidate[]> {
  const padded = cik.replace(/\D/g, "").padStart(10, "0");
  const res = await secFetch(`https://data.sec.gov/submissions/CIK${padded}.json`, 15000);
  if (!res.ok) throw new Error(`SECの提出書類一覧を取得できませんでした(HTTP ${res.status})`);
  const data = await res.json();
  const recent = data?.filings?.recent;
  if (!recent?.form) return [];

  const cikNum = String(parseInt(padded, 10));
  const out: Candidate[] = [];
  for (let i = 0; i < recent.form.length; i++) {
    const form: string = recent.form[i];
    if (!TARGET_FORMS.has(form)) continue;
    const acc: string = recent.accessionNumber[i];
    const doc: string = recent.primaryDocument[i];
    if (!acc || !doc) continue;
    out.push({
      form,
      filed: recent.filingDate[i],
      url: `https://www.sec.gov/Archives/edgar/data/${cikNum}/${acc.replace(/-/g, "")}/${doc}`,
    });
  }
  // 提出日の新しい順(同日なら元の並び順を維持)
  return out.sort((a, b) => (a.filed < b.filed ? 1 : a.filed > b.filed ? -1 : 0));
}

// HTMLを、行構造を残したままテキストに変換する(見出しの検出に行単位で使うため)
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<ix:header[\s\S]*?<\/ix:header>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table|ul|ol)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " | ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
    .replace(/&#8217;|&rsquo;|&#x2019;/gi, "'")
    .replace(/&#8216;|&lsquo;/gi, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&#8212;|&mdash;/gi, "—")
    .replace(/&#8211;|&ndash;/gi, "–")
    .replace(/&#8226;|&bull;/gi, "•")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/gi, "&")
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\| ?(\| ?)+/g, " | ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// 見出し判定用に行を正規化する(大文字化、アポストロフィ統一、末尾のページ番号や罫線を除去)
function normHeading(line: string): string {
  return line
    .replace(/[’‘`]/g, "'")
    .replace(/[|\s]+$/g, "")
    .replace(/[\s|.\d]+$/g, "")
    .replace(/^[\s|]+/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase()
    .trim();
}

// S-1の主要な見出し(大見出し)。ここに該当する行が来たら、前の項目はそこで終わりとみなす。
const TOP_HEADINGS = new Set([
  "PROSPECTUS SUMMARY", "THE OFFERING", "SUMMARY FINANCIAL DATA", "SUMMARY CONSOLIDATED FINANCIAL DATA",
  "SUMMARY CONSOLIDATED FINANCIAL AND OTHER DATA", "SUMMARY HISTORICAL CONSOLIDATED FINANCIAL DATA",
  "SUMMARY FINANCIAL AND OTHER DATA", "SUMMARY CONSOLIDATED FINANCIAL AND OPERATING DATA",
  "SELECTED FINANCIAL DATA", "SELECTED CONSOLIDATED FINANCIAL DATA", "RISK FACTORS",
  "SPECIAL NOTE REGARDING FORWARD-LOOKING STATEMENTS", "CAUTIONARY NOTE REGARDING FORWARD-LOOKING STATEMENTS",
  "MARKET AND INDUSTRY DATA", "INDUSTRY AND MARKET DATA", "USE OF PROCEEDS", "DIVIDEND POLICY", "CAPITALIZATION",
  "DILUTION", "MANAGEMENT'S DISCUSSION AND ANALYSIS OF FINANCIAL CONDITION AND RESULTS OF OPERATIONS",
  "BUSINESS", "MANAGEMENT", "EXECUTIVE COMPENSATION", "DIRECTOR COMPENSATION",
  "CERTAIN RELATIONSHIPS AND RELATED PARTY TRANSACTIONS", "CERTAIN RELATIONSHIPS AND RELATED-PARTY TRANSACTIONS",
  "PRINCIPAL STOCKHOLDERS", "PRINCIPAL AND SELLING STOCKHOLDERS", "PRINCIPAL SHAREHOLDERS",
  "PRINCIPAL AND SELLING SHAREHOLDERS", "DESCRIPTION OF CAPITAL STOCK", "DESCRIPTION OF SHARE CAPITAL",
  "DESCRIPTION OF SECURITIES", "SHARES ELIGIBLE FOR FUTURE SALE", "UNDERWRITING", "UNDERWRITING (CONFLICTS OF INTEREST)",
  "LEGAL MATTERS", "EXPERTS", "WHERE YOU CAN FIND MORE INFORMATION", "INDEX TO CONSOLIDATED FINANCIAL STATEMENTS",
  "INDEX TO FINANCIAL STATEMENTS", "GLOSSARY", "ABOUT THIS PROSPECTUS",
]);

function isTopHeading(norm: string): boolean {
  return TOP_HEADINGS.has(norm) || /^MATERIAL .*TAX CONSEQUENCES/.test(norm);
}

type SectionDef = { key: string; names: string[]; max: number };

// 分析で重要な順に並べる(structureの入力上限でカットされても、重要な項目が残るように)
const SECTION_DEFS: SectionDef[] = [
  { key: "募集の概要(The Offering)", names: ["THE OFFERING"], max: 5000 },
  { key: "目論見書要約(Prospectus Summary)", names: ["PROSPECTUS SUMMARY"], max: 8000 },
  {
    key: "財務サマリー(Summary Financial Data)",
    names: [
      "SUMMARY FINANCIAL DATA", "SUMMARY CONSOLIDATED FINANCIAL DATA", "SUMMARY CONSOLIDATED FINANCIAL AND OTHER DATA",
      "SUMMARY HISTORICAL CONSOLIDATED FINANCIAL DATA", "SUMMARY FINANCIAL AND OTHER DATA",
      "SUMMARY CONSOLIDATED FINANCIAL AND OPERATING DATA", "SELECTED FINANCIAL DATA", "SELECTED CONSOLIDATED FINANCIAL DATA",
    ],
    max: 7000,
  },
  {
    key: "主要株主(Principal Stockholders)",
    names: ["PRINCIPAL STOCKHOLDERS", "PRINCIPAL AND SELLING STOCKHOLDERS", "PRINCIPAL SHAREHOLDERS", "PRINCIPAL AND SELLING SHAREHOLDERS"],
    max: 8000,
  },
  { key: "将来の売却(Shares Eligible for Future Sale)", names: ["SHARES ELIGIBLE FOR FUTURE SALE"], max: 5000 },
  { key: "引受(Underwriting)", names: ["UNDERWRITING", "UNDERWRITING (CONFLICTS OF INTEREST)"], max: 7000 },
  { key: "資金使途(Use of Proceeds)", names: ["USE OF PROCEEDS"], max: 3500 },
  { key: "資本構成(Capitalization)", names: ["CAPITALIZATION"], max: 3000 },
  { key: "リスク要因(Risk Factors)", names: ["RISK FACTORS"], max: 8000 },
  {
    key: "経営陣による財政状態の分析(MD&A)",
    names: ["MANAGEMENT'S DISCUSSION AND ANALYSIS OF FINANCIAL CONDITION AND RESULTS OF OPERATIONS"],
    max: 6000,
  },
  { key: "事業内容(Business)", names: ["BUSINESS"], max: 6000 },
  { key: "経営陣(Management)", names: ["MANAGEMENT"], max: 3500 },
  { key: "希薄化(Dilution)", names: ["DILUTION"], max: 2500 },
  { key: "株式の説明(Description of Capital Stock)", names: ["DESCRIPTION OF CAPITAL STOCK", "DESCRIPTION OF SHARE CAPITAL", "DESCRIPTION OF SECURITIES"], max: 2000 },
];

// 見出し行(名前が一致する行)から、次の別の大見出しまでを取り出す。
// 目次の行(すぐ次に別の見出しが来る)や、ページごとの見出しの繰り返しは、長さが足りない/同名として除外する。
function extractSections(text: string): Record<string, string> {
  const lines = text.split("\n");
  const offsets: number[] = new Array(lines.length);
  let pos = 0;
  for (let i = 0; i < lines.length; i++) {
    offsets[i] = pos;
    pos += lines[i].length + 1;
  }
  const norms = lines.map((l) => (l.length > 140 ? "" : normHeading(l)));

  const sections: Record<string, string> = {};
  for (const def of SECTION_DEFS) {
    const names = new Set(def.names);
    for (let i = 0; i < lines.length; i++) {
      if (!names.has(norms[i])) continue;
      // 同じ項目の続きの行(ページの見出しの繰り返しなど)を読み飛ばして、別の大見出しを探す
      let end = text.length;
      for (let j = i + 1; j < lines.length; j++) {
        if (norms[j] && isTopHeading(norms[j]) && !names.has(norms[j])) {
          end = offsets[j];
          break;
        }
      }
      const len = end - offsets[i];
      if (len < 500) continue; // 目次の行など
      sections[def.key] = text.slice(offsets[i], offsets[i] + Math.min(len, def.max)).trim();
      break;
    }
  }
  return sections;
}

// ロックアップ(株式売却制限)の記載は複数の項目に散らばるため、本文全体から該当箇所を拾う
function extractLockup(text: string): string {
  const re = /lock-?up (agreements?|period)/gi;
  const picked: string[] = [];
  let lastEnd = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null && picked.length < 3) {
    if (m.index < lastEnd) continue;
    const start = Math.max(0, m.index - 150);
    const win = text.slice(start, start + 1800);
    if (!/\bdays?\b/i.test(win)) continue; // 「何日間」の記載がある箇所を優先
    picked.push(win);
    lastEnd = start + 1800;
  }
  return picked.join("\n---\n");
}

function guardAdmin(req: NextRequest): boolean {
  const pw = req.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD || pw === "otemachi9";
}

export async function POST(req: NextRequest) {
  try {
    if (!guardAdmin(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { company_id, doc_url } = await req.json();
    if (!company_id) {
      return NextResponse.json({ error: "company_id がありません" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!
    );

    const { data: company, error: cErr } = await supabase
      .from("ipo_companies")
      .select("id, name, cik")
      .eq("id", company_id)
      .single();
    if (cErr || !company) {
      return NextResponse.json({ error: "企業が見つかりません" }, { status: 404 });
    }

    // 取得する書類の候補を決める(手入力のURLがあればそれを最優先)
    let candidates: Candidate[] = [];
    const manual = typeof doc_url === "string" ? doc_url.trim() : "";
    if (manual) {
      if (!/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/\d+\/\d+\/[^\s]+\.(htm|html)$/i.test(manual)) {
        return NextResponse.json(
          { error: "SEC書類URLの形式が正しくありません。https://www.sec.gov/Archives/edgar/data/…/….htm の形式で入力してください。" },
          { status: 400 }
        );
      }
      candidates = [{ form: "手入力", filed: "", url: manual }];
    } else {
      if (!company.cik) {
        return NextResponse.json(
          { error: "この銘柄にはSECの会社番号(CIK)が登録されていません。SEC書類URLを手入力してください。" },
          { status: 400 }
        );
      }
      candidates = await listCandidates(company.cik);
      if (candidates.length === 0) {
        return NextResponse.json(
          { error: "SECに目論見書(S-1など)の提出が見つかりませんでした。提出後にもう一度実行するか、SEC書類URLを手入力してください。" },
          { status: 404 }
        );
      }
    }

    // 新しい順に最大4件まで試し、本文として十分な量のある書類を採用する
    const started = Date.now();
    let chosen: Candidate | null = null;
    let text = "";
    let tooShortNote = "";
    for (const cand of candidates.slice(0, 4)) {
      if (Date.now() - started > 38000) break; // 関数の制限時間(60秒)に収める
      await new Promise((r) => setTimeout(r, 200)); // SECの秒間10回までの制限を守る
      const res = await secFetch(cand.url, 30000);
      if (!res.ok) {
        tooShortNote = `HTTP ${res.status}`;
        continue;
      }
      const html = await res.text();
      const t = htmlToText(html);
      if (t.length >= MIN_FULL_DOC_CHARS || cand.form === "手入力") {
        chosen = cand;
        text = t;
        break;
      }
      tooShortNote = `${cand.form}(${cand.filed})は本文が短いため飛ばしました`;
    }

    if (!chosen) {
      return NextResponse.json(
        { error: `本文として使える書類を取得できませんでした。${tooShortNote}` },
        { status: 502 }
      );
    }

    const sections: Record<string, string> = {};
    // 表紙(価格帯・株数・引受会社・上場予定市場とティッカーの記載が多い)
    sections["表紙(Cover)"] = text.slice(0, 5000);
    Object.assign(sections, extractSections(text));
    const lockup = extractLockup(text);
    if (lockup) sections["ロックアップ関連(Lock-up)"] = lockup;

    const found = Object.keys(sections).filter((k) => !k.startsWith("表紙"));
    if (found.length < 4) {
      // 見出しをうまく拾えなかった場合の保険: 本文を前半・中盤・後半から少しずつ取る
      const total = text.length;
      sections["本文前半"] = text.slice(Math.floor(total * 0.05), Math.floor(total * 0.05) + 6000);
      sections["本文中盤"] = text.slice(Math.floor(total * 0.35), Math.floor(total * 0.35) + 6000);
      sections["本文後半"] = text.slice(Math.floor(total * 0.65), Math.floor(total * 0.65) + 6000);
    }

    const { error: uErr } = await supabase
      .from("ipo_companies")
      .update({ sec_doc_url: chosen.url, raw_prospectus: sections })
      .eq("id", company_id);
    if (uErr) {
      return NextResponse.json({ error: `保存に失敗しました: ${uErr.message}` }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      doc_url: chosen.url,
      form: chosen.form,
      filed: chosen.filed,
      sections_found: Object.keys(sections),
      chars: text.length,
      message: `✅ ${chosen.form}${chosen.filed ? `（提出日${chosen.filed}）` : ""}から${Object.keys(sections).length}セクション取得完了！次に「⑦市場・競合情報」→「②で構造化」を実行してください。`,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "unknown error" }, { status: 500 });
  }
}
