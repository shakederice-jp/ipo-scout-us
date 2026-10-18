// 2026/10新設: 原文(英語の目論見書)との照合による校正。
//   Gemini(別会社のAI)が間違い候補を挙げる → Sonnetが原文を読み直して判断し、必要な箇所だけ書き直す。
//   これを最大2回まで繰り返す。管理画面のSTEP3・STEP4〜6の最後に自動で呼ばれる(ボタンは増やさない)。

export type ProofIssue = { field: string; quote: string; kind: string; problem: string; source_quote?: string };
export type ProofResult = { fields: Record<string, string>; fixed: number; unresolved: ProofIssue[]; skipped?: string };

// 分析結果(merged)の中から、事実のチェックが必要な文章だけを取り出す。シナリオなどの見通し・意見は対象外。
export function collectFields(merged: any): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (path: string, v: any) => { if (typeof v === "string" && v.trim().length >= 12) out[path] = v; };
  put("summary", merged?.summary);
  put("ai_summary", merged?.ai_summary);
  put("learning_point.body", merged?.learning_point?.body);
  for (const k of ["ultra_short", "short", "long"]) put(`grade_reason.${k}`, merged?.grade_reason?.[k]);
  (merged?.insights ?? []).forEach((x: any, i: number) => { put(`insights.${i}.body`, x?.body); put(`insights.${i}.detail`, x?.detail); });
  const ag = merged?.action_guide;
  if (ag) {
    put("action_guide.headline", ag.headline);
    put("action_guide.stance_reason", ag.stance_reason);
    (ag.horizons ?? []).forEach((h: any, i: number) => {
      for (const k of ["buy_basis", "sell_timing", "sell_basis", "review_line"]) put(`action_guide.horizons.${i}.${k}`, h?.[k]);
    });
    (ag.danger_flags ?? []).forEach((t: any, i: number) => put(`action_guide.danger_flags.${i}`, t));
    (ag.check_before_buy ?? []).forEach((t: any, i: number) => put(`action_guide.check_before_buy.${i}`, t));
  }
  const hl = merged?.highlights;
  if (hl) {
    put("highlights.tagline", hl.tagline);
    (hl.charms ?? []).forEach((c: any, i: number) => { put(`highlights.charms.${i}.why`, c?.why); put(`highlights.charms.${i}.evidence`, c?.evidence); });
    (hl.cautions ?? []).forEach((c: any, i: number) => { put(`highlights.cautions.${i}.detail`, c?.detail); put(`highlights.cautions.${i}.watch`, c?.watch); });
  }
  return out;
}

// 直した文章を、元の分析結果(merged)へ書き戻す
export function applyFields(merged: any, fields: Record<string, string>) {
  for (const [path, text] of Object.entries(fields)) {
    const keys = path.split(".");
    let cur: any = merged;
    for (let i = 0; i < keys.length - 1; i++) {
      cur = cur?.[keys[i]];
      if (cur == null) break;
    }
    if (cur != null && typeof cur === "object") cur[keys[keys.length - 1]] = text;
  }
}

async function post(body: any): Promise<any> {
  const res = await fetch("/api/admin/proofread", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const keyOf = (i: { field: string; quote: string }) => `${i.field}@@${i.quote}`;

// 照合→書き直しを最大2回。途中で失敗しても、元の文章はそのまま返す(保存は止めない)。
export async function runProofread(
  companyId: string,
  startFields: Record<string, string>,
  onProgress?: (msg: string) => void,
): Promise<ProofResult> {
  let fields = { ...startFields };
  if (Object.keys(fields).length === 0) return { fields, fixed: 0, unresolved: [] };
  let fixed = 0;
  const kept = new Set<string>(); // Sonnetが「Geminiの指摘は誤り(原文どおり)」と判断したもの
  let unresolved: ProofIssue[] = [];
  try {
    for (let round = 1; round <= 2; round++) {
      onProgress?.(`原文と照合中(${round}/2)...`);
      const chk = await post({ action: "check", company_id: companyId, fields });
      const issues: ProofIssue[] = (chk.issues ?? []).filter((i: ProofIssue) => !kept.has(keyOf(i)));
      unresolved = issues;
      if (issues.length === 0) return { fields, fixed, unresolved: [] };
      onProgress?.(`指摘${issues.length}件を、Sonnetが原文で再確認中(${round}/2)...`);
      const fx = await post({ action: "fix", company_id: companyId, fields, issues });
      for (const r of fx.results ?? []) {
        if (r.verdict === "keep") kept.add(keyOf(r.issue));
      }
      fields = fx.fields ?? fields;
      fixed += fx.applied ?? 0;
      unresolved = (fx.results ?? []).filter((r: any) => r.verdict !== "keep" && !r.applied).map((r: any) => r.issue);
    }
    // 2回目の書き直し後に、最終確認
    onProgress?.("最終確認中...");
    const last = await post({ action: "check", company_id: companyId, fields });
    unresolved = (last.issues ?? []).filter((i: ProofIssue) => !kept.has(keyOf(i)));
    return { fields, fixed, unresolved };
  } catch (e: any) {
    return { fields, fixed, unresolved, skipped: String(e?.message ?? e).slice(0, 120) };
  }
}
