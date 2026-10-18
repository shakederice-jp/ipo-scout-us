export const maxDuration = 120;
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { generateJsonWithGemini } from "@/lib/gemini";
import { STYLE_RULE } from "@/lib/writing-style";

// 2026/10新設: 日本語の分析文を、英語の目論見書の原文と照らし合わせて校正する。
//   action=check : Gemini(別会社のAI)が、間違い・根拠のない数字の候補を挙げる
//   action=fix   : Sonnetが原文を読み直し、本当に間違いのときだけ該当箇所を書き直す
// /api/admin/... は proxy.ts の門番を通るため、管理画面にログインした人だけが呼べる。

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const SONNET_MODEL = "claude-sonnet-5-5";
let thinkingControlWorks = true;

type Issue = { field: string; quote: string; kind: string; problem: string; source_quote?: string };

function supa() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function sourceOf(co: any): string {
  const s = (co.raw_prospectus ?? {}) as Record<string, string>;
  return Object.entries(s).map(([k, v]) => `【${k}】\n${v}`).join("\n\n").slice(0, 100000);
}

function factsOf(co: any): string {
  const sched = [
    `上場予定日: ${co.listing_date ?? "未定"}`,
    `ロックアップ解除日(90日): ${co.lockup_90_date ?? "記載なし"}`,
    `ロックアップ解除日(180日): ${co.lockup_180_date ?? "記載なし"}`,
  ].join("\n");
  const sd = co.structured_data ? JSON.stringify(co.structured_data).slice(0, 7000) : "";
  return `${sched}\n${sd}`;
}

const norm = (t: string) => t.toLowerCase().replace(/[‘’“”"'`]/g, "").replace(/[‐-―−-]/g, "-").replace(/\s+/g, " ");

// 日本語側の数字が、原文や整理済みデータのどこにも無いものを、Geminiへのヒントとして拾う(機械チェック)
function numberHints(fields: Record<string, string>, haystackRaw: string): string[] {
  const hay = haystackRaw.replace(/(\d),(?=\d{3})/g, "$1");
  const hints: string[] = [];
  const re = /(\d[\d,]*(?:\.\d+)?)\s*(%|％|日|か月|ヶ月|ヵ月|カ月|年|倍|百万|千万|万|億|株|ドル)?/g;
  for (const [field, text] of Object.entries(fields)) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const core = m[1].replace(/,/g, "");
      if (core.length <= 1 && !m[2]) continue;
      if (/^\d{1,2}$/.test(core) && !m[2]) continue;
      if (!hay.includes(core)) hints.push(`${field}: 「${m[0].trim()}」`);
      if (hints.length >= 40) return hints;
    }
  }
  return hints;
}

function checkPrompt(co: any, fields: Record<string, string>, source: string, facts: string, hints: string[]) {
  const list = Object.entries(fields).map(([k, v]) => `[${k}]\n${v}`).join("\n\n");
  return `あなたは、英語の目論見書(SEC提出書類)と日本語の分析文を照らし合わせる校閲者です。
${co.name}のIPOについて書かれた日本語の分析文に、原文と食い違う記述がないかを確認してください。

【見つけてほしいもの】
- contradiction: 原文や整理済みデータと明らかに食い違う数字・日付・期間・名称・条件(例:原文は45日なのに92日と書いてある)
- unsupported: 原文にも整理済みデータにも根拠が見当たらない、具体的な数字・固有名詞・事実(作り話の疑いがあるもの)
- overstated: 「確実」「必ず」「絶対」「業界No.1」など、利益の保証や断定にあたる言い過ぎ

【見つけなくてよいもの】
- 見通し・評価・意見(「〜と考えられます」など)。数字や事実が間違っていなければ指摘しない
- 原文の抜粋に載っていないだけで、数字や固有名詞の誤りと言えないもの
- 言い回しや読みやすさ(文体の好みは指摘しない)
- 日程(上場予定日・ロックアップ解除日)は【整理済みデータ・日程】にあるものが正しい
指摘は、確信があるものに絞り、迷うものは含めないでください。

【原文(英語・目論見書の抜粋)】
${source}

【整理済みデータ・日程(原文から作成済み。参考)】
${facts}

【機械チェックの参考(日本語側の数字で、原文に同じ数字が見つからなかったもの。換算や言い換えの可能性もあるので、候補として扱う)】
${hints.length ? hints.join("\n") : "なし"}

【確認する日本語の分析文】
${list}

【出力形式】JSONのみ。指摘がなければ {"issues": []} とすること:
{"issues":[{"field":"上の[ ]内のキー名そのまま","quote":"その文章の中の、問題のある部分をそのまま抜き出したもの(60字以内・一字一句同じ)","kind":"contradiction / unsupported / overstated のいずれか","problem":"何が問題か。60字以内の日本語","source_quote":"根拠となる原文の英文を、そのまま引用(contradictionのときは必須。短く)"}]}`;
}

async function callSonnet(prompt: string): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const params: any = { model: SONNET_MODEL, max_tokens: 4000, messages: [{ role: "user", content: prompt }] };
      if (thinkingControlWorks) params.thinking = { type: "between_tools" };
      const msg: any = await claude.messages.create(params);
      const blocks = Array.isArray(msg?.content) ? msg.content : [];
      return blocks.filter((b: any) => b?.type === "text").map((b: any) => b.text ?? "").join("");
    } catch (e: any) {
      if (/thinking/i.test(String(e?.message ?? ""))) { thinkingControlWorks = false; continue; }
      throw e;
    }
  }
  throw new Error("Sonnet呼び出しに失敗しました");
}

function parseJson(text: string): any {
  const i = text.indexOf("{"), j = text.lastIndexOf("}");
  if (i === -1 || j <= i) return null;
  try { return JSON.parse(text.slice(i, j + 1)); } catch { return null; }
}

// Sonnetが示した原文の引用が、本当に原文にあるかを確かめる(「...」で区切られた部分は、それぞれ確認)
function evidenceFound(evidence: string, source: string): boolean {
  const s = norm(source);
  const parts = evidence.split(/\.\.\.|…/).map(p => norm(p).trim()).filter(p => p.length >= 12);
  if (parts.length === 0) return false;
  return parts.every(p => s.includes(p));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const { company_id, action } = body;
    const fields: Record<string, string> = body.fields && typeof body.fields === "object" ? body.fields : {};
    if (!company_id || !action) return NextResponse.json({ error: "company_id と action が必要です" }, { status: 400 });

    const { data: co } = await supa().from("ipo_companies").select("*").eq("id", company_id).single();
    if (!co) return NextResponse.json({ error: "企業が見つかりません" }, { status: 404 });
    const source = sourceOf(co);
    if (!source) return NextResponse.json({ error: "原文(raw_prospectus)がないため照合できません" }, { status: 400 });
    const facts = factsOf(co);

    // ===== Geminiによる照合 =====
    if (action === "check") {
      const hints = numberHints(fields, source + "\n" + facts);
      const out = await generateJsonWithGemini(checkPrompt(co, fields, source, facts, hints));
      const raw: any[] = Array.isArray(out?.issues) ? out.issues : [];
      const issues: Issue[] = raw
        .filter(i => i && typeof i.field === "string" && typeof i.quote === "string" && typeof fields[i.field] === "string" && fields[i.field].includes(i.quote))
        .map(i => ({ field: i.field, quote: i.quote, kind: String(i.kind ?? ""), problem: String(i.problem ?? "").slice(0, 120), source_quote: typeof i.source_quote === "string" ? i.source_quote.slice(0, 400) : undefined }))
        .slice(0, 20);
      return NextResponse.json({ issues, hints: hints.length });
    }

    // ===== Sonnetによる再確認と書き直し =====
    if (action === "fix") {
      const issues: Issue[] = (Array.isArray(body.issues) ? body.issues : []).slice(0, 20);
      if (issues.length === 0) return NextResponse.json({ results: [], fields, applied: 0 });
      const list = issues.map((i, n) => `#${n}\n場所: ${i.field}\n問題の箇所: 「${i.quote}」\n文章全体: ${fields[i.field] ?? ""}\n指摘の種類: ${i.kind}\n指摘内容: ${i.problem}\n指摘側が示した原文: ${i.source_quote ?? "なし"}`).join("\n\n");
      const prompt = `あなたは米国IPOの分析記事の編集者です。校閲者(別のAI)が、日本語の分析文に誤りがあると指摘しました。
校閲者も間違えることがあります。指摘を鵜呑みにせず、必ず【原文】を自分で読み直して、本当に誤りかを判断してください。

【判断のルール】
- verdict は次の3つから選ぶ:
  fix  = 原文と食い違っている。原文の根拠を引用したうえで、問題の箇所だけを正しく書き直す
  soften = 原文に根拠が見つからない数字・断定・言い過ぎ。根拠がある範囲の言い方に直す(数字を削る、「〜と考えられます」にする等)
  keep = 指摘は誤りで、元の文章が原文と合っている。書き直さない
- fix のときは source_evidence に、根拠となる原文の英文を一字一句そのまま引用すること(引用できないなら fix にしない)
- replacement は「問題の箇所」と置き換える文字列。前後の文章とつながるように書き、元の長さを大きく超えないこと。ですます調のまま
- 原文に書かれていない数字や事実を、新しく作らない。原文が単位違い(千ドル単位など)のときは、単位を取り違えない
${STYLE_RULE}

【原文(英語・目論見書の抜粋)】
${source}

【整理済みデータ・日程(参考)】
${facts}

【指摘の一覧】
${list}

【出力形式】JSONのみ(前置き・コードブロック不要):
{"results":[{"index":0,"verdict":"fix / soften / keep","replacement":"置き換える文字列(keepなら空文字)","source_evidence":"原文の英文の引用(fixのとき必須)","reason":"判断の理由。40字以内"}]}`;
      const text = await callSonnet(prompt);
      const parsed = parseJson(text);
      const rs: any[] = Array.isArray(parsed?.results) ? parsed.results : [];
      const updated = { ...fields };
      let applied = 0;
      const results = issues.map((issue, n) => {
        const r = rs.find(x => Number(x?.index) === n);
        let verdict: string = r?.verdict === "fix" || r?.verdict === "soften" || r?.verdict === "keep" ? r.verdict : "unclear";
        const replacement = typeof r?.replacement === "string" ? r.replacement.trim() : "";
        let didApply = false;
        if (verdict === "fix" && !evidenceFound(String(r?.source_evidence ?? ""), source)) verdict = "unclear"; // 原文の引用が確認できないものは直さない
        if ((verdict === "fix" || verdict === "soften") && replacement && updated[issue.field]?.includes(issue.quote) && replacement.length <= issue.quote.length * 1.6 + 30) {
          updated[issue.field] = updated[issue.field].replace(issue.quote, replacement);
          didApply = true;
          applied++;
        }
        return { issue, verdict, applied: didApply, reason: String(r?.reason ?? "").slice(0, 80) };
      });
      return NextResponse.json({ results, fields: updated, applied });
    }

    return NextResponse.json({ error: "action が不正です" }, { status: 400 });
  } catch (e: any) {
    console.error("proofread error:", e?.message);
    return NextResponse.json({ error: String(e?.message ?? "unknown").slice(0, 200) }, { status: 500 });
  }
}
