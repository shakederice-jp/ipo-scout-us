"use client";
import { useState, useEffect, useRef } from "react";
import InitialPriceForm from "@/components/InitialPriceForm";
import { runProofread, collectFields, applyFields } from "@/lib/proofread";
import { isPublicFree } from "@/lib/public-free";

// 2026/10追加: SEC書類の進み具合(sec-track が毎日更新する sec_stage)の表示用
const STAGE_INFO: Record<string, { label: string; color: string; bg: string; rank: number }> = {
  priced:    { label: "価格決定・上場", color: "#166534", bg: "#dcfce7", rank: 4 },
  launched:  { label: "価格帯発表",     color: "#92400e", bg: "#fef3c7", rank: 3 },
  amended:   { label: "修正版提出",     color: "#1e40af", bg: "#dbeafe", rank: 2 },
  filed:     { label: "上場申請(S-1)",  color: "#475569", bg: "#e2e8f0", rank: 1 },
  withdrawn: { label: "撤回",           color: "#991b1b", bg: "#fee2e2", rank: 0 },
};
const stageOf = (c: any) =>
  STAGE_INFO[c?.sec_stage ?? ""] ?? { label: c?.cik ? "未確認" : "手動登録", color: "#64748b", bg: "#f1f5f9", rank: -1 };
const fmtUsd = (lo: any, hi: any) =>
  lo == null || hi == null ? null : Number(lo) === Number(hi) ? `$${lo}` : `$${lo}〜$${hi}`;

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [masterOpen, setMasterOpen] = useState(false);

  const [autoLoading, setAutoLoading] = useState(false);
  const [autoResult, setAutoResult] = useState<string | null>(null);
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [notifyResult, setNotifyResult] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [referralStats, setReferralStats] = useState<{ completed: number; cap: number; remaining: number } | null>(null);
  const [healthResult, setHealthResult] = useState<any | null>(null);
  const [dbCheckLoading, setDbCheckLoading] = useState(false);
  const [dbCheckResult, setDbCheckResult] = useState<any | null>(null);

  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<any | null>(null);
  const [edinetDocId, setEdinetDocId] = useState("");
  const [stepLoading, setStepLoading] = useState<Record<string,boolean>>({});
  const [stepResult, setStepResult] = useState<Record<string,string|null>>({});
  // 校正で「要確認」として残った指摘の中身(STEPごと)。何が問題か・原文はどうかを画面で確認できるようにする
  const [proofDetails, setProofDetails] = useState<Record<string, { unresolved: any[]; changes: any[] }>>({});
  const renderProofDetails = (key: string) => {
    const d = proofDetails[key];
    if (!d || (d.unresolved.length === 0 && d.changes.length === 0)) return null;
    const kindLabel: Record<string,string> = { contradiction:"原文と食い違い", unsupported:"根拠が見当たらない", overstated:"言い過ぎ" };
    const actLabel: Record<string,string> = { fix:"原文に合わせて修正", soften:"根拠のない部分をやわらげた", remove:"根拠が示せないため削除" };
    return (
      <>
        {d.changes.length > 0 && (
          <details style={{ marginTop:6, fontSize:11, lineHeight:1.7, background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:6, padding:"6px 8px" }}>
            <summary style={{ cursor:"pointer", fontWeight:700, color:"#075985" }}>AIが自動で直した内容を見る({d.changes.length}件)</summary>
            {d.changes.map((u:any, i:number) => (
              <div key={i} style={{ marginTop:6, paddingTop:6, borderTop: i===0 ? "none" : "1px dashed #bae6fd", color:"#0c4a6e", whiteSpace:"pre-wrap" }}>
                <div><b>{i+1}. {actLabel[u.action] ?? u.action}</b>{u.reason ? `(${u.reason})` : ""}</div>
                <div style={{ color:"#64748b" }}>直す前: {u.before}</div>
                <div>直した後: {u.after || "(この文を削除)"}</div>
              </div>
            ))}
          </details>
        )}
        {d.unresolved.length > 0 && (
          <details style={{ marginTop:6, fontSize:11, lineHeight:1.7, background:"#fffbeb", border:"1px solid #fde68a", borderRadius:6, padding:"6px 8px" }}>
            <summary style={{ cursor:"pointer", fontWeight:700, color:"#92400e" }}>要確認の中身を見る({d.unresolved.length}件)</summary>
            {d.unresolved.map((u:any, i:number) => (
              <div key={i} style={{ marginTop:6, paddingTop:6, borderTop: i===0 ? "none" : "1px dashed #fde68a", color:"#78350f", whiteSpace:"pre-wrap" }}>
                <div><b>{i+1}. {kindLabel[u.kind] ?? u.kind}</b>　「{u.quote}」</div>
                <div>問題点: {u.problem}</div>
                {u.source_quote ? <div style={{ color:"#64748b" }}>原文: {u.source_quote}</div> : null}
              </div>
            ))}
          </details>
        )}
      </>
    );
  };
  const [vizLoading, setVizLoading] = useState(false);
  const [vizResult, setVizResult] = useState<string | null>(null);
  const [ipoPriceInput, setIpoPriceInput] = useState("");
  const [jpBrokers, setJpBrokers] = useState<string[]>([]);
  const [jpBrokersLoading, setJpBrokersLoading] = useState(false);
  const [jpBrokersResult, setJpBrokersResult] = useState<string | null>(null);
  const [ipoPriceLoading, setIpoPriceLoading] = useState(false);
  const [ipoPriceResult, setIpoPriceResult] = useState<string | null>(null);
  const [allAxesLoading, setAllAxesLoading] = useState(false);
  const [edinetSearchLoading, setEdinetSearchLoading] = useState(false);
  const [edinetSearchResult, setEdinetSearchResult] = useState<string | null>(null);
  const [bulkEdinetLoading, setBulkEdinetLoading] = useState(false);
  const [bulkEdinetResult, setBulkEdinetResult] = useState<string | null>(null);
  const [compLoading, setCompLoading] = useState(false);
  const [compResult, setCompResult] = useState<string | null>(null);
  const [edinetResult, setEdinetResult] = useState("");
  const [econEvents, setEconEvents] = useState<any[]>([]);
  const [econDate, setEconDate] = useState("");
  const [econType, setEconType] = useState("FOMC");
  const [econLabel, setEconLabel] = useState("");
  const [econLoading, setEconLoading] = useState(false);
  const [econResult, setEconResult] = useState<string | null>(null);

  // ページを開いたときに、すでにログイン済みか（有効なログイン状態のクッキーがあるか）をサーバーに確認する
  useEffect(() => {
    fetch("/ipo-us/api/admin/session", { cache: "no-store" })
      .then(r => r.json())
      .then(d => { if (d?.authed) setAuthed(true); })
      .catch(() => {})
      .finally(() => setSessionChecking(false));
  }, []);

  // ログイン: パスワードはサーバー側で照合する（このファイルには書かない）
  const handleLogin = async () => {
    if (!password || loginLoading) return;
    setLoginLoading(true); setLoginError("");
    try {
      const res = await fetch("/ipo-us/api/admin/login", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ password }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) { setPassword(""); setAuthed(true); }
      else setLoginError(data?.error ?? "ログインに失敗しました");
    } catch { setLoginError("通信エラーです。もう一度お試しください"); }
    setLoginLoading(false);
  };

  useEffect(() => {
    if (!authed) return;
    fetch("/ipo-us/api/admin/companies").then(r => r.json()).then(setCompanies).catch(() => {});
    fetch("/ipo-us/api/admin/economic-events").then(r => r.json()).then(data => {
      if (Array.isArray(data)) setEconEvents(data);
    }).catch(() => {});
    // 2026/10/31追加(米国版の紹介制度): 紹介プログラムの成立件数を管理画面を開くたびに自動取得(手動ボタンは増やさない方針)
    fetch("/ipo-us/api/admin/referral-stats")
      .then(r => r.json()).then(data => { if (!data.error) setReferralStats(data); }).catch(() => {});
  }, [authed]);


  // 2026/11/7追加: 分析の進み具合の記録(画面を閉じても残る)。
  // 各STEPが終わるたびに /api/admin/analysis-progress へ「完了/失敗＋日時」を保存し、銘柄を選んだときに読み込んで表示する。
  // 「残りを続きから実行」は、未完了・失敗・要やり直しのSTEPだけを、順番に自動で実行する。
  type ProgItem = { status: "done" | "failed"; at: string | null; note: string; inferred: boolean };
  const PROG_ORDER: string[] = ["1","7","2","3","4","5","6","viz"];
  const PROG_LABEL: Record<string, string> = { "1":"STEP1 SECテキスト取得", "7":"STEP2 市場・競合情報", "2":"STEP3 財務データ構造化", "3":"STEP4 スコア・シナリオ", "4":"STEP5 9軸(超短期3軸)", "5":"STEP5 9軸(短期3軸)", "6":"STEP5 9軸(長期3軸)", "viz":"STEP6 視覚化データ" };
  const PROG_DEPS: Record<string, string[]> = {};
  const [, setProgressTick] = useState(0);
  const progressRef = useRef<Record<string, ProgItem>>({});
  const selectedIdRef = useRef<string | null>(null);
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoRunMsg, setAutoRunMsg] = useState<string | null>(null);

  const setProgressMap = (m: Record<string, ProgItem>) => { progressRef.current = m; setProgressTick(t => t + 1); };

  // 2026/11/12追加: 銘柄選択の一覧で、月ごとに分け、分析が終わった銘柄に「分析終了」のしるしを付ける。
  // 全銘柄まとめの進み具合を /api/admin/analysis-progress?summary=1 から読む(STEPが終わるたびに読み直す)。
  const [progressSummary, setProgressSummary] = useState<Record<string, { done: number; total: number; failed: number }>>({});
  const [onlyTodo, setOnlyTodo] = useState(false);
  const [publicFreeMsg, setPublicFreeMsg] = useState<string | null>(null);
  const loadSummary = async () => {
    try {
      const r = await fetch("/ipo-us/api/admin/analysis-progress?summary=1", { cache: "no-store" });
      const d = await r.json();
      if (r.ok && d.summary) setProgressSummary(d.summary);
    } catch { /* 読めなくても、銘柄選択と分析は使える(しるしが出ないだけ) */ }
  };
  useEffect(() => { if (authed) loadSummary(); }, [authed]);
  const markOf = (c: any): { icon: string; text: string; kind: "done" | "part" | "todo" | "unknown" } => {
    const sm = progressSummary[c.id];
    if (!sm) return { icon: "", text: "", kind: "unknown" };
    if (sm.done >= sm.total) return { icon: "✅", text: "分析終了", kind: "done" };
    if (sm.done > 0) return { icon: "🟡", text: `途中 ${sm.done}/${sm.total}`, kind: "part" };
    return { icon: "⬜", text: "未分析", kind: "todo" };
  };
  const setPublicFree = async (c: any, value: boolean) => {
    setPublicFreeMsg("保存中...");
    try {
      const r = await fetch("/ipo-us/api/admin/public-free", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company_id: c.id, value }) });
      const d = await r.json();
      if (!r.ok || d.error) { setPublicFreeMsg(`❌ 保存できませんでした: ${d.error ?? r.status}`); return; }
      if (d.column_ready === false) { setPublicFreeMsg("⚠️ 保存する場所(is_public_free列)がまだありません。先にSupabaseでSQLを実行してください。"); return; }
      setCompanies((prev: any[]) => prev.map((x: any) => x.id === c.id ? { ...x, is_public_free: value } : x));
      setSelectedCompany((prev: any) => prev && prev.id === c.id ? { ...prev, is_public_free: value } : prev);
      setPublicFreeMsg(value ? "✅ 全員に無料で公開しました（反映まで数十秒かかることがあります）" : "✅ 全員無料の設定を外しました（月の無料2枠のルールに戻ります）");
    } catch { setPublicFreeMsg("❌ 通信エラー"); }
  };

  const fmtAt = (at: string | null) => {
    if (!at) return "";
    try { return new Date(at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
  };

  const recordProgress = (key: string, status: "done" | "failed", note?: string) => {
    const cid = selectedCompany?.id;
    if (!cid || !PROG_ORDER.includes(key)) return;
    const item: ProgItem = { status, at: new Date().toISOString(), note: String(note ?? "").slice(0, 300), inferred: false };
    if (selectedIdRef.current === cid) setProgressMap({ ...progressRef.current, [key]: item });
    fetch("/ipo-us/api/admin/analysis-progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company_id: cid, key, status, note: item.note }) }).then(() => loadSummary()).catch(() => {});
  };

  // setStep(各STEPの最後の「✅ …」「❌ …」)から、完了/失敗を自動で記録する
  const autoRecord = (key: string, result: string) => {
    if (!PROG_ORDER.includes(key)) return;
    const failed = result.startsWith("❌") || (key === "8" && result.includes("❌")) || (key === "1" && result.includes("失敗"));
    if (failed) { recordProgress(key, "failed", result); return; }
    if (result.startsWith("✅")) recordProgress(key, "done", result);
  };

  const loadProgress = async (cid: string) => {
    try {
      const r = await fetch(`/ipo-us/api/admin/analysis-progress?company_id=${encodeURIComponent(cid)}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok || d.error || selectedIdRef.current !== cid) return;
      const merged: Record<string, ProgItem> = {};
      Object.entries(d.inferred ?? {}).forEach(([k, v]: [string, any]) => { merged[k] = { status: "done", at: v?.at ?? null, note: "", inferred: true }; });
      Object.entries(d.progress ?? {}).forEach(([k, v]: [string, any]) => { merged[k] = { status: v.status, at: v.at ?? null, note: v.note ?? "", inferred: false }; });
      // 読み込み中に、この画面で新しく記録した分があれば、そちらを優先する
      Object.entries(progressRef.current).forEach(([k, v]) => { if (!v.inferred && (!merged[k] || (merged[k].at ?? "") < (v.at ?? ""))) merged[k] = v; });
      setProgressMap(merged);
    } catch { /* 記録が読めなくても、分析の操作は続けられる */ }
  };

  // done=完了 / failed=失敗 / stale=前の工程をやり直したので要やり直し / todo=未実行
  const getStatus = (key: string): { kind: "done" | "failed" | "stale" | "todo"; at: string | null; note: string; inferred: boolean } => {
    const it = progressRef.current[key];
    if (!it) return { kind: "todo", at: null, note: "", inferred: false };
    if (it.status === "failed") return { kind: "failed", at: it.at, note: it.note, inferred: false };
    const stale = (PROG_DEPS[key] ?? []).some(d => { const di = progressRef.current[d]; return !!(di && di.status === "done" && di.at && it.at && di.at > it.at); });
    return { kind: stale ? "stale" : "done", at: it.at, note: it.note, inferred: it.inferred };
  };

  const runRemaining = async () => {
    if (!selectedCompany || autoRunning) return;
    const pending = PROG_ORDER.filter(k => getStatus(k).kind !== "done");
    if (pending.length === 0) return;
    if (!window.confirm(`次の分析を、順番に自動で実行します(完了済みは飛ばします)。\n\n${pending.map(k => "・" + PROG_LABEL[k]).join("\n")}\n\n画面を開いたままにしてください。よろしいですか？`)) return;
    setAutoRunning(true);
    setAutoRunMsg(null);
    try {
      for (const key of PROG_ORDER) {
        if (getStatus(key).kind === "done") continue;
        setAutoRunMsg(`⏳ ${PROG_LABEL[key]} を実行中...`);
        await runStepByKey(key);
        if (getStatus(key).kind !== "done") {
          setAutoRunMsg(`❌ ${PROG_LABEL[key]} で止まりました。内容を確認して、もう一度「残りを続きから実行」を押してください(完了したSTEPは飛ばして再開します)。`);
          return;
        }
      }
      setAutoRunMsg("✅ すべて完了しました");
    } finally {
      setAutoRunning(false);
    }
  };

  const runStepByKey = async (key: string) => {
    const axesMap: Record<string, [string, string]> = { "4": ["ultra_short", "超短期3軸"], "5": ["short", "短期3軸"], "6": ["long", "長期3軸"] };
    switch (key) {
      case "1": await handleStep1(); break;
      case "7": await handleStep7(); break;
      case "2": await handleStep2(); break;
      case "3": await handleStep3(); break;
      case "4": case "5": case "6": {
        setAllAxesLoading(true); setStep(key, true);
        try { await runAxes(axesMap[key][0], axesMap[key][1], key); } finally { setAllAxesLoading(false); }
        break;
      }
      case "viz": await handleVisualize(); break;
    }
  };

  const setStep = (key: string, loading: boolean, result?: string) => {
    setStepLoading(prev => ({...prev, [key]: loading}));
    if (result !== undefined) setStepResult(prev => ({...prev, [key]: result}));
    if (!loading && result !== undefined) autoRecord(key, result);
  };

  const handleSelectCompany = (c: any) => {
    setSelectedCompany(c);
    selectedIdRef.current = c.id;
    setProgressMap({});
    loadProgress(c.id);
    setAutoRunMsg(null);
    setPublicFreeMsg(null);
    setEdinetDocId("");
    setStepResult({});
    setStepLoading({});
    setVizResult(null);
    setIpoPriceInput(c.ipo_price != null ? String(c.ipo_price) : "");
    setIpoPriceResult(null);
    setJpBrokers(Array.isArray(c.jp_brokers) ? c.jp_brokers : []);
    setJpBrokersResult(null);
  };

  const handleStep1 = async () => {
    if (!selectedCompany) return;
    setStep("1", true);
    try {
      const res = await fetch("/ipo-us/api/sec", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ company_id:selectedCompany.id, doc_url:edinetDocId||undefined }) });
      const data = await res.json();
      setStep("1", false, data.error ? `❌ ${data.error}` : `✅ ${data.message}`);
    } catch { setStep("1", false, "❌ 通信エラー"); }
  };

  const handleStep7 = async () => {
    if (!selectedCompany) return;
    setStep("7", true);
    try {
      const res = await fetch("/ipo-us/api/market", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ companyId:selectedCompany.id }) });
      const data = await res.json();
      setStep("7", false, data.error ? `❌ ${data.error}` : `✅ 完了・主幹事:${data.data?.lead_underwriter??"不明"}・競合${data.data?.competitors?.length??0}社`);
    } catch { setStep("7", false, "❌ 通信エラー"); }
  };

  const handleStep2 = async () => {
    if (!selectedCompany) return;
    setStep("2", true);
    try {
      const res = await fetch("/ipo-us/api/structure", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ company_id:selectedCompany.id }) });
      const data = await res.json();
      setStep("2", false, data.error ? `❌ ${data.error}` : `✅ ${data.message}`);
    } catch { setStep("2", false, "❌ 通信エラー"); }
  };

  const handleStep3 = async () => {
    if (!selectedCompany) return;
    setStep("3", true);
    const parts = [
      { key:"score",     label:"①総合スコア" },
      { key:"insights",  label:"②まずここに注目" },
      { key:"scenarios", label:"③株価シナリオ" },
      { key:"action",    label:"④買い方・売り方ガイド" },
      { key:"highlights", label:"⑤魅力と注意点" },
    ];
    const merged: Record<string, any> = {};
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      setStepResult(prev => ({...prev, "3": `⏳ ${p.label} 生成中 (${i+1}/${parts.length+1})...`}));
      try {
        const res = await fetch("/ipo-us/api/analyze", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ id:selectedCompany.id, part:p.key, ...((p.key === "action" || p.key === "highlights") ? { prior: merged } : {}) }) });
        const data = await res.json();
        if (data.error) { setStep("3", false, `❌ ${p.label}: ${data.error}`); return; }
        Object.assign(merged, data);
      } catch { setStep("3", false, `❌ ${p.label}: 通信エラー`); return; }
    }
    // ⑥原文(英語の目論見書)との照合: Geminiが間違い候補を挙げ、Sonnetが原文で再確認して書き直す(失敗しても保存は続ける)
    const pr = await runProofread(selectedCompany.id, collectFields(merged), msg => setStepResult(prev => ({...prev, "3": `⏳ ⑥${msg}`})));
    applyFields(merged, pr.fields);
    setProofDetails(prev => ({...prev, "3": { unresolved: pr.unresolved, changes: pr.changes }}));
    merged.proofread = { checked_at: new Date().toISOString(), fixed: pr.fixed, unresolved: pr.unresolved.slice(0, 10), changes: pr.changes.slice(0, 20), skipped: pr.skipped ?? null };
    const proofNote = pr.skipped ? `・校正スキップ(${pr.skipped})` : `・校正:修正${pr.fixed}件${pr.unresolved.length ? `／要確認${pr.unresolved.length}件(${pr.unresolved.slice(0,2).map(u => `${u.field}「${u.quote.slice(0,20)}」`).join("、")})` : ""}`;
    setStepResult(prev => ({...prev, "3": "⏳ 保存中..."}));
    try {
      const saveRes = await fetch("/ipo-us/api/analyze", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ id:selectedCompany.id, save_results:merged }) });
      const saveData = await saveRes.json();
      if (saveData.error) { setStep("3", false, `❌ 保存エラー: ${saveData.error}`); return; }
    } catch { setStep("3", false, "❌ 保存通信エラー"); return; }
    setStep("3", false, `✅ スコア: ${merged.total_score}/100・${merged.grade}ランク${proofNote}`);
  };

  const runAxes = async (period: string, label: string, stepNum: string) => {
    const axisMap: Record<string, string[]> = { ultra_short:["float","lockup","timing"], short:["valuation","vc_sell","growth"], long:["management","unit_econ","competitor"] };
    const axes = axisMap[period];
    const allResults: any[] = [];
    for (let i = 0; i < axes.length; i++) {
      const axisId = axes[i];
      let combinedText = "";
      let axisLabel = "", axisScore = 0, axisGrade = "C";
      for (let part = 1; part <= 2; part++) {
        setStepResult(prev => ({...prev, [stepNum]: `⏳ ${label} ${i*2+part}/${axes.length*2}・${axisId}（${part}/2）分析中...`}));
        try {
          const res = await fetch("/ipo-us/api/axes", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ company_id:selectedCompany.id, period, single_axis:axisId, part }) });
          const data = await res.json();
          if (data.error) { setStep(stepNum, false, `❌ ${axisId}: ${data.error}`); return false; }
          combinedText += (part===2?"\n\n":"") + (data.text??"");
          axisLabel=data.label; axisScore=data.score; axisGrade=data.grade;
        } catch { setStep(stepNum, false, `❌ ${axisId} 通信エラー`); return false; }
      }
      allResults.push({ id:axisId, label:axisLabel, score:axisScore, grade:axisGrade, report:combinedText.trim() });
    }
    // 原文との照合(Gemini→Sonnet)。失敗しても保存は続ける
    const pf: Record<string,string> = {};
    allResults.forEach((a:any, idx:number) => { if (a.report) pf[`axis${idx}`] = a.report; });
    const pr = await runProofread(selectedCompany.id, pf, msg => setStepResult(prev => ({...prev, [stepNum]: `⏳ ${label} ${msg}`})));
    allResults.forEach((a:any, idx:number) => { if (pr.fields[`axis${idx}`]) a.report = pr.fields[`axis${idx}`]; });
    setProofDetails(prev => ({...prev, [stepNum]: { unresolved: pr.unresolved, changes: pr.changes }}));
    const proofNote = pr.skipped ? `・校正スキップ(${pr.skipped})` : `・校正:修正${pr.fixed}件${pr.unresolved.length ? `／要確認${pr.unresolved.length}件(${pr.unresolved.slice(0,2).map(u => `「${u.quote.slice(0,20)}」`).join("、")})` : ""}`;
    setStepResult(prev => ({...prev, [stepNum]: `⏳ ${label} 保存中...`}));
    try {
      const saveRes = await fetch("/ipo-us/api/axes", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ company_id:selectedCompany.id, period, save_results:allResults }) });
      const saveData = await saveRes.json();
      if (saveData.error) { setStep(stepNum, false, `❌ 保存エラー: ${saveData.error}`); return false; }
    } catch { setStep(stepNum, false, "❌ 保存通信エラー"); return false; }
    setStep(stepNum, false, `✅ ${label} 完了（${allResults.map((a:any)=>`${a.id}:${a.grade}`).join("/")}）${proofNote}`);
    return true;
  };

  const handleAllAxes = async () => {
    if (!selectedCompany) return;
    setAllAxesLoading(true);
    setStep("4",true); setStep("5",true); setStep("6",true);
    const ok4 = await runAxes("ultra_short","超短期3軸","4"); if (!ok4) { setAllAxesLoading(false); return; }
    const ok5 = await runAxes("short","短期3軸","5"); if (!ok5) { setAllAxesLoading(false); return; }
    await runAxes("long","長期3軸","6");
    setAllAxesLoading(false);
  };
  const runBeginnerRewrite = async (period: string, label: string, stepNum: string) => {
    const axisMap: Record<string, string[]> = { ultra_short:["float","lockup","timing"], short:["valuation","vc_sell","growth"], long:["management","unit_econ","competitor"] };
    const axes = axisMap[period];
    const allResults: any[] = [];
    for (let i = 0; i < axes.length; i++) {
      const axisId = axes[i];
      setStepResult(prev => ({...prev, [stepNum]: `⏳ ${label} ${i+1}/${axes.length}・${axisId}を初心者向けに書き直し中...`}));
      try {
        const res = await fetch("/ipo-us/api/axes-beginner", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ company_id:selectedCompany.id, period, single_axis:axisId }) });
        const data = await res.json();
        if (data.error) { setStep(stepNum, false, `❌ ${axisId}: ${data.error}`); return false; }
        allResults.push({ id:axisId, report_beginner:data.report_beginner });
      } catch { setStep(stepNum, false, `❌ ${axisId} 通信エラー`); return false; }
    }
    setStepResult(prev => ({...prev, [stepNum]: `⏳ ${label} 保存中...`}));
    try {
      const saveRes = await fetch("/ipo-us/api/axes-beginner", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ company_id:selectedCompany.id, period, save_results:allResults }) });
      const saveData = await saveRes.json();
      if (saveData.error) { setStep(stepNum, false, `❌ 保存エラー: ${saveData.error}`); return false; }
    } catch { setStep(stepNum, false, "❌ 保存通信エラー"); return false; }
    setStep(stepNum, false, `✅ ${label} 初心者向けリライト完了`);
    return true;
  };

  const [beginnerLoading, setBeginnerLoading] = useState(false);
  const handleBeginnerRewrite = async () => {
    if (!selectedCompany) return;
    setBeginnerLoading(true);
    setStep("7a",true); setStep("7b",true); setStep("7c",true);
    const ok1 = await runBeginnerRewrite("ultra_short","超短期3軸","7a"); if (!ok1) { setBeginnerLoading(false); return; }
    const ok2 = await runBeginnerRewrite("short","短期3軸","7b"); if (!ok2) { setBeginnerLoading(false); return; }
    await runBeginnerRewrite("long","長期3軸","7c");
    setBeginnerLoading(false);
  };

  const handleVisualize = async () => {
    if (!selectedCompany) return;
    setVizLoading(true);
    const chartTypes = ["revenue_chart","shareholders_chart","valuation_table","market_structure_chart","ipo_summary_table","use_of_proceeds_table","risk_table","shareholders_lockup_table","key_metrics_table"];
    const labels: Record<string,string> = { revenue_chart:"売上・利益", shareholders_chart:"株主構成", valuation_table:"IPO概要", market_structure_chart:"株式構成・市場比較", ipo_summary_table:"IPO条件", use_of_proceeds_table:"資金使途", risk_table:"リスク表", shareholders_lockup_table:"大株主・LU", key_metrics_table:"主要経営指標" };
    const merged: Record<string,any> = {};
    for (let i = 0; i < chartTypes.length; i++) {
      const type = chartTypes[i];
      setVizResult(`⏳ ${labels[type]} 生成中 (${i+1}/${chartTypes.length})...`);
      try {
        const res = await fetch("/ipo-us/api/visualize", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ companyId:selectedCompany.id, chart_type:type }) });
        const data = await res.json();
        if (data.error) { setVizResult(`❌ ${labels[type]}: ${data.error}`); recordProgress("viz", "failed", `${labels[type]}: ${data.error}`); setVizLoading(false); return; }
        Object.assign(merged, data.data);
      } catch { setVizResult("❌ 通信エラー"); recordProgress("viz", "failed", "通信エラー"); setVizLoading(false); return; }
    }
    setVizResult("⏳ 保存中...");
    try {
      const saveRes = await fetch("/ipo-us/api/visualize", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ companyId:selectedCompany.id, save_results:merged }) });
      const saveData = await saveRes.json();
      setVizResult(saveData.success ? "✅ 視覚化データ生成完了" : `❌ 保存エラー: ${saveData.error}`);
      recordProgress("viz", saveData.success ? "done" : "failed", saveData.success ? "視覚化データ生成完了" : `保存エラー: ${saveData.error}`);
    } catch { setVizResult("❌ 保存通信エラー"); recordProgress("viz", "failed", "保存通信エラー"); }
    finally { setVizLoading(false); }
  };

  const handleSaveJpBrokers = async () => {
    if (!selectedCompany) return;
    setJpBrokersLoading(true); setJpBrokersResult(null);
    try {
      const res = await fetch("/ipo-us/api/admin/jp-brokers", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ company_id:selectedCompany.id, brokers:jpBrokers }) });
      const data = await res.json();
      if (data.error) { setJpBrokersResult(`❌ ${data.error}`); }
      else {
        setJpBrokersResult("✅ 保存しました");
        setSelectedCompany((prev:any)=>prev?{...prev,jp_brokers:data.brokers}:prev);
        setCompanies((prev:any[])=>prev.map((x:any)=>x.id===selectedCompany.id?{...x,jp_brokers:data.brokers}:x));
      }
    } catch { setJpBrokersResult("❌ 通信エラー"); }
    setJpBrokersLoading(false);
  };

  const handleSetIpoPrice = async () => {
    if (!selectedCompany) return;
    setIpoPriceLoading(true); setIpoPriceResult(null);
    try {
      const res = await fetch("/ipo-us/api/admin/set-ipo-price", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ company_id:selectedCompany.id, ipo_price:ipoPriceInput }) });
      const data = await res.json();
      setIpoPriceResult(data.error ? `❌ ${data.error}` : "✅ 保存しました");
    } catch { setIpoPriceResult("❌ 通信エラー"); }
    setIpoPriceLoading(false);
  };

  const handleBulkEdinetSearch = async () => {
    setBulkEdinetLoading(true); setBulkEdinetResult(null);
    const targets = companies.filter(c => !c.edinet_doc_id);
    if (targets.length===0) { setBulkEdinetResult("✅ 全銘柄の書類IDが設定済みです"); setBulkEdinetLoading(false); return; }
    const results: string[] = [];
    for (const c of targets) {
      try {
        const res = await fetch("/ipo-us/api/admin/find-edinet-doc", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ company_name:c.name }) });
        const data = await res.json();
        if (data.error) results.push(`❌ ${c.name}: ${data.error}`);
        else {
          await fetch("/ipo-us/api/admin/set-edinet-doc-id", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ company_id:c.id, edinet_doc_id:data.doc_id }) });
          results.push(`✅ ${c.name}: ${data.doc_id}`);
        }
      } catch { results.push(`❌ ${c.name}: 通信エラー`); }
    }
    setBulkEdinetResult(results.join("\n"));
    fetch("/ipo-us/api/admin/companies").then(r=>r.json()).then(setCompanies).catch(()=>{});
    setBulkEdinetLoading(false);
  };

  const handleCompetitor = async () => {
    if (!selectedCompany) return;
    setCompLoading(true); setCompResult(null);
    try {
      const res = await fetch("/ipo-us/api/competitor", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ company_id:selectedCompany.id }) });
      const data = await res.json();
      if (data.error) setCompResult(`❌ ${data.error}`);
      else setCompResult(data.results.map((r:any)=>r.error?`❌ ${r.name}: ${r.error}`:`✅ ${r.name}: 売上${r.revenue}億`).join("\n"));
    } catch { setCompResult("❌ 通信エラー"); }
    setCompLoading(false);
  };

  const handleAutoFetch = async () => {
    setAutoLoading(true); setAutoResult("IPO情報を取得中...");
    try {
      const res = await fetch("/ipo-us/api/admin/auto-fetch", { method:"POST" });
      const data = await res.json();
      setAutoResult(data.error ? `❌ ${data.error}` : `✅ ${data.added}件追加・${data.skipped}件スキップ`);
    } catch { setAutoResult("❌ 通信エラー"); }
    setAutoLoading(false);
  };

  const handleTestNotify = async () => {
    setNotifyLoading(true); setNotifyResult(null);
    try {
      const res = await fetch("/ipo-us/api/admin/send-notify", { method:"POST" });
      const data = await res.json();
      setNotifyResult(data.error ? `❌ ${data.error}` : `✅ 送信完了・${data.sent}件`);
    } catch { setNotifyResult("❌ 通信エラー"); }
    setNotifyLoading(false);
  };

  const handleHealthCheck = async () => {
    setHealthLoading(true); setHealthResult(null);
    try {
      const res = await fetch("/ipo-us/api/admin/health");
      setHealthResult(await res.json());
    } catch(e) { setHealthResult({ ok:false, error:String(e) }); }
    setHealthLoading(false);
  };

  const handleDbCheck = async () => {
    setDbCheckLoading(true); setDbCheckResult(null);
    try {
      const res = await fetch("/ipo-us/api/cron/db-check");
      setDbCheckResult(await res.json());
    } catch(e) { setDbCheckResult({ ok:false, error:String(e) }); }
    setDbCheckLoading(false);
  };

  const handleEdinetCodes = () => {
    window.open("https://disclosure2.edinet-fsa.go.jp/weee0010.aspx", "_blank");
    setEdinetResult("📋 新しいタブでEDINETのダウンロードページを開きました。");
  };

  const handleAddEconEvent = async () => {
    if (!econDate||!econType) return;
    setEconLoading(true); setEconResult(null);
    try {
      const res = await fetch("/ipo-us/api/admin/economic-events", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ event_date:econDate, event_type:econType, label:econLabel||null }) });
      const data = await res.json();
      if (data.error) setEconResult(`❌ ${data.error}`);
      else {
        setEconResult("✅ 追加しました"); setEconDate(""); setEconLabel("");
        const updated = await fetch("/ipo-us/api/admin/economic-events").then(r=>r.json());
        if (Array.isArray(updated)) setEconEvents(updated);
      }
    } catch { setEconResult("❌ 通信エラー"); }
    setEconLoading(false);
  };

  const handleDeleteEconEvent = async (id: string) => {
    if (!confirm("このイベントを削除しますか？")) return;
    try {
      await fetch("/ipo-us/api/admin/economic-events", { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ id }) });
      setEconEvents(prev=>prev.filter(e=>e.id!==id));
    } catch {}
  };

  const inputStyle = { width:"100%", padding:"8px 10px", borderRadius:"8px", border:"1px solid #C7D3E3", boxSizing:"border-box" as const, fontSize:"13px" };
  const labelStyle = { fontSize:"11px", fontWeight:"700" as const, color:"#3D5A85", marginBottom:"4px", display:"block" as const };
  const sectionStyle = { background:"white", borderRadius:"12px", padding:"20px", marginBottom:"12px", border:"1px solid #d1f5f7" };
  const btnStyle = (color: string, disabled: boolean) => ({ padding:"9px 16px", backgroundColor:disabled?"#94a3b8":color, color:"white", border:"none", borderRadius:"8px", cursor:disabled?"default":"pointer" as const, fontWeight:700 as const, fontSize:"13px", width:"100%" });


  const progIcon = (k: string) => { const s = getStatus(k).kind; return s === "done" ? "✅" : s === "failed" ? "❌" : s === "stale" ? "⚠️" : "⬜"; };
  const progText = (k: string) => {
    const s = getStatus(k);
    if (s.kind === "done") return s.at ? `完了 ${fmtAt(s.at)}` : "完了(既存のデータあり・日時は不明)";
    if (s.kind === "failed") return `失敗 ${fmtAt(s.at)}`;
    if (s.kind === "stale") return `要やり直し(前の工程をやり直したため・前回 ${fmtAt(s.at)})`;
    return "未実行";
  };
  const progColor = (k: string) => { const s = getStatus(k).kind; return s === "done" ? "#166534" : s === "failed" ? "#dc2626" : s === "stale" ? "#b45309" : "#64748b"; };
  // 各STEPの枠の中に出す「記録された完了日時」の1行(いま実行中・結果表示中のときは出さない)
  const renderBadge = (keys: string[], withLabel?: boolean) => {
    if (!selectedCompany) return null;
    return (
      <div style={{ margin:"2px 0 6px" }}>
        {keys.map(k => (
          <div key={k} style={{ fontSize:11, lineHeight:1.7, color:progColor(k) }}>
            📌 {withLabel ? `${PROG_LABEL[k]}: ` : "記録: "}{progIcon(k)} {progText(k)}
          </div>
        ))}
      </div>
    );
  };
  const renderProgressPanel = () => {
    if (!selectedCompany) return null;
    const pend = PROG_ORDER.filter(k => getStatus(k).kind !== "done");
    const busy = autoRunning || Object.values(stepLoading).some(Boolean) || allAxesLoading || vizLoading || false;
    return (
      <div style={{ borderRadius:10, padding:"12px 14px", marginBottom:12, border:"1px solid #66c3c6", background:"white" }}>
        <div style={{ fontWeight:900, fontSize:13, color:"#082b2e", marginBottom:6 }}>📋 この銘柄の進み具合(画面を閉じても残ります)</div>
        {PROG_ORDER.map(k => (
          <div key={k} style={{ display:"flex", justifyContent:"space-between", gap:8, fontSize:11, lineHeight:1.9, color:progColor(k) }}>
            <span>{progIcon(k)} {PROG_LABEL[k]}</span>
            <span style={{ textAlign:"right" }}>{progText(k)}</span>
          </div>
        ))}
        <button onClick={runRemaining} disabled={busy || pend.length === 0} style={{ ...btnStyle("#0d4f52", busy || pend.length === 0), marginTop:10 }}>
          {autoRunning ? "⏳ 残りを自動で実行中(画面を閉じないでください)..." : pend.length === 0 ? "✅ すべて完了しています" : `▶ 残りを続きから実行(${pend.length}件)`}
        </button>
        {autoRunMsg && <div style={{ marginTop:6, fontSize:11, lineHeight:1.7, padding:"4px 8px", borderRadius:6, background:autoRunMsg.startsWith("❌")?"#fef2f2":"#f0fdf4", color:autoRunMsg.startsWith("❌")?"#dc2626":"#166534", whiteSpace:"pre-wrap" }}>{autoRunMsg}</div>}
        <p style={{ fontSize:10, color:"#64748b", margin:"8px 0 0", lineHeight:1.7 }}>未完了・失敗・要やり直しのSTEPだけを、順番に自動で実行します。途中で画面を閉じても、完了したSTEPは記録されます。止まったときは、もう一度押すと続きから再開します。</p>
      </div>
    );
  };

  const StepRow = ({ num, color, title, desc, btnLabel, onClick, disabled }: any) => {
    const isLoading = stepLoading[num];
    const res = stepResult[num];
    const isErr = res?.startsWith("❌");
    const isDone = res?.startsWith("✅");
    return (
      <div style={{ borderRadius:10, padding:"12px 14px", marginBottom:10, border:`1px solid ${isErr?"#fecaca":isDone?"#bbf7d0":"#e2e8f0"}`, background:isErr?"#fef2f2":isDone?"#f0fdf4":"#f8fafc" }}>
        <div style={{ fontWeight:900, color, fontSize:13, marginBottom:3 }}>{title}</div>
        {!isLoading && !res && renderBadge([num])}
        <p style={{ fontSize:11, color:"#64748b", margin:"2px 0 8px" }}>{desc}</p>
        <button onClick={onClick} disabled={isLoading||disabled||autoRunning} style={btnStyle(color, isLoading||disabled||autoRunning)}>
          {isLoading?"⏳ 処理中...":isDone?"✅ 完了（再実行）":btnLabel}
        </button>
        {res && <div style={{ marginTop:6, fontSize:11, lineHeight:1.7, padding:"6px 8px", borderRadius:6, background:isErr?"#fef2f2":"#f0fdf4", color:isErr?"#dc2626":"#166534", whiteSpace:"pre-wrap" }}>{res}</div>}
        {renderProofDetails(num)}
      </div>
    );
  };

  if (sessionChecking) return (
    <div style={{ display:"flex", justifyContent:"center", alignItems:"center", height:"100vh", backgroundColor:"#F5F4EF", color:"#64748b", fontSize:13 }}>確認中...</div>
  );

  if (!authed) return (
    <div style={{ display:"flex", justifyContent:"center", alignItems:"center", height:"100vh", backgroundColor:"#F5F4EF" }}>
      <div style={{ background:"white", padding:"32px", borderRadius:"16px", border:"1px solid #C7D3E3", minWidth:"300px" }}>
        <h2 style={{ margin:"0 0 16px", fontSize:"16px", color:"#0F1F36" }}>⚙️ 管理画面</h2>
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&handleLogin()}
          placeholder="パスワードを入力" style={{ width:"100%", padding:"10px", borderRadius:"8px", border:"1px solid #C7D3E3", marginBottom:"12px", boxSizing:"border-box" }}/>
        <button onClick={handleLogin} disabled={loginLoading}
          style={{ width:"100%", padding:"10px", backgroundColor:"#1E3A66", color:"white", border:"none", borderRadius:"8px", cursor:loginLoading?"default":"pointer", fontWeight:"700", opacity:loginLoading?0.6:1 }}>
          {loginLoading?"確認中...":"ログイン"}
        </button>
        {loginError && <div style={{ marginTop:10, fontSize:12, color:"#dc2626", lineHeight:1.6 }}>{loginError}</div>}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", backgroundColor:"#F5F4EF", padding:"24px" }}>
      <div style={{ maxWidth:"1200px", margin:"0 auto" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8, marginBottom:"20px" }}>
          <h1 style={{ fontSize:"18px", fontWeight:900, color:"#0F1F36", margin:0 }}>⚙️ 管理画面(米国版)</h1>
          {/* 2026/10/16追加: 日本版の管理画面へ移動するリンク(ログインは各サイトで別々) */}
          <a href="https://ipo.finance-tower.com/admin" style={{ fontSize:"12px", fontWeight:700, color:"#1E3A66", background:"white", border:"1px solid #1E3A66", borderRadius:"999px", padding:"6px 14px", textDecoration:"none" }}>
            🇯🇵 日本版の管理画面へ →
          </a>
        </div>
        <style>{`
          @media (max-width: 768px) {
            .admin-layout { flex-direction: column !important; }
            .admin-col { width: 100% !important; }
          }
        `}</style>

        <div className="admin-layout" style={{ display:"flex", gap:16, alignItems:"flex-start" }}>

          {/* ═══ 左カラム ═══ */}
          <div className="admin-col" style={{ width:"50%", display:"flex", flexDirection:"column", gap:12 }}>

            {/* 週次ルーティン */}
            <div style={{ ...sectionStyle, background:"#1E3A66", border:"none" }}>
              <h2 style={{ fontSize:"13px", fontWeight:900, color:"white", margin:"0 0 12px" }}>📅 週次ルーティン</h2>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {[
                  { day:"毎日", label:"SEC書類の取得・進み具合の更新", auto:true },
                  { day:"月曜", label:"DB整合性チェック結果をメールで確認", auto:true },
                  { day:"随時", label:"新規IPO銘柄を登録 → AI分析を生成", auto:false },
                  { day:"随時", label:"公募価格が決定したら入力", auto:false },
                  { day:"木曜", label:"翌週分の銘柄データが揃っているか確認", auto:false },
                  { day:"金曜", label:"週次通知メールが送信されたか確認", auto:true },
                ].map((item, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", borderRadius:8, background:item.auto?"rgba(255,255,255,0.08)":"rgba(102,195,198,0.2)" }}>
                    <span style={{ fontSize:10, fontWeight:800, color:item.auto?"#a0d4d6":"#1E3A66", minWidth:40 }}>{item.day}</span>
                    <span style={{ fontSize:12, color:"white", flex:1 }}>{item.label}</span>
                    <span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:item.auto?"rgba(255,255,255,0.15)":"#1E3A66", color:"white", fontWeight:700, whiteSpace:"nowrap" as const }}>
                      {item.auto?"🤖 自動":"✋ 手動"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 2026/10/31追加(米国版の紹介制度): 紹介プログラムの実績(このページを開くたびに自動取得) */}
            <div style={sectionStyle}>
              <h2 style={{ fontSize:"13px", fontWeight:900, color:"#0F1F36", margin:"0 0 12px" }}>🎁 紹介プログラムの実績</h2>
              {referralStats ? (
                <div style={{ display:"flex", gap:12 }}>
                  <div style={{ flex:1, textAlign:"center", padding:"10px 8px", borderRadius:8, backgroundColor:"#f0fdf4", border:"1px solid #bbf7d0" }}>
                    <div style={{ fontSize:20, fontWeight:900, color:"#15803d" }}>{referralStats.completed}</div>
                    <div style={{ fontSize:10, color:"#166534" }}>特典成立数</div>
                  </div>
                  <div style={{ flex:1, textAlign:"center", padding:"10px 8px", borderRadius:8, backgroundColor:"#fef2f2", border:"1px solid #fecaca" }}>
                    <div style={{ fontSize:20, fontWeight:900, color:"#b91c1c" }}>{referralStats.remaining}</div>
                    <div style={{ fontSize:10, color:"#991b1b" }}>「先着{referralStats.cap}名」残り枠</div>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize:11, color:"#94a3b8", margin:0 }}>読み込み中...</p>
              )}
              <p style={{ fontSize:10, color:"#94a3b8", margin:"10px 0 0" }}>
                ※「特典成立数」は紹介コードが正しく適用され、紹介した人・された人の両方に「有料分析2ヶ月読み放題」が付与された件数です。
              </p>
            </div>

            {/* 手動実行ツール */}
            <div style={{ ...sectionStyle, padding:0, overflow:"hidden" }}>
              <button onClick={()=>setManualOpen(v=>!v)}
                style={{ width:"100%", padding:"16px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", background:"#475569", border:"none", cursor:"pointer", borderRadius:manualOpen?"12px 12px 0 0":"12px" }}>
                <div>
                  <div style={{ fontWeight:900, fontSize:14, color:"white" }}>🛠 手動実行ツール</div>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.6)", marginTop:2 }}>通常は自動実行されます。緊急時や確認用</div>
                </div>
                <span style={{ color:"white", fontSize:12, transform:manualOpen?"rotate(180deg)":"none", display:"inline-block", transition:"transform 0.2s" }}>▼</span>
              </button>
              {manualOpen && (
                <div style={{ padding:"16px 20px", display:"flex", flexDirection:"column", gap:14 }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:13, color:"#0F1F36", marginBottom:4 }}>🩺 システムヘルスチェック</div>
                    <button onClick={handleHealthCheck} disabled={healthLoading} style={btnStyle("#1E3A66", healthLoading)}>
                      {healthLoading?"確認中...":"ヘルスチェックを実行"}
                    </button>
                    {healthResult && (
                      <div style={{ marginTop:8, fontSize:11, color:healthResult.ok?"#166534":"#b91c1c" }}>
                        {healthResult.ok?"✅ 全システム正常":"⚠️ 一部に問題があります"}
                        {healthResult.results && Object.entries(healthResult.results).map(([key,val]:[string,any])=>(
                          <div key={key} style={{ marginTop:4, padding:"4px 8px", borderRadius:6, background:val.ok?"#f0fdf4":"#fef2f2" }}>
                            {val.ok?"✅":"❌"} {{"supabase":"Supabase DB","claude":"Claude API","last_cron":"直近Cron"}[key]??key}: {val.detail}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <hr style={{ border:"none", borderTop:"1px solid #e2e8f0" }}/>
                  <div>
                    <div style={{ fontWeight:700, fontSize:13, color:"#0F1F36", marginBottom:2 }}>🔍 DB整合性チェック <span style={{ fontSize:10, color:"#94a3b8", marginLeft:6 }}>（通常: 毎週月曜に自動実行）</span></div>
                    <button onClick={handleDbCheck} disabled={dbCheckLoading} style={btnStyle("#7c3aed", dbCheckLoading)}>
                      {dbCheckLoading?"確認中...":"整合性チェックを今すぐ実行"}
                    </button>
                    {dbCheckResult && (
                      <div style={{ marginTop:8, fontSize:11 }}>
                        <div style={{ color:(dbCheckResult.issues?.length??0)===0?"#166534":"#d97706", fontWeight:700 }}>
                          {(dbCheckResult.issues?.length??0)===0?"✅ 問題なし":`⚠️ ${dbCheckResult.issues?.length}件の問題を検出`}
                        </div>
                        {dbCheckResult.issues?.map((issue:string,i:number)=>(
                          <div key={i} style={{ marginTop:4, padding:"4px 8px", background:"#fffbeb", borderRadius:6, color:"#374151", whiteSpace:"pre-wrap" }}>{issue}</div>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* 2026/10/24削除: 「📡 IPO情報自動取得」ボタンは、日本版からコピーされた機能で、日本のIPOスケジュール(96ut.com)から銘柄を取り込んでしまうため、米国版では廃止した */}
                  <hr style={{ border:"none", borderTop:"1px solid #e2e8f0" }}/>
                  <div>
                    <div style={{ fontWeight:700, fontSize:13, color:"#0F1F36", marginBottom:2 }}>📧 週次通知メール送信 <span style={{ fontSize:10, color:"#94a3b8", marginLeft:6 }}>（通常: 毎週金曜18時に自動送信）</span></div>
                    <p style={{ fontSize:11, color:"#64748b", margin:"0 0 8px" }}>翌週にBB開始・申込開始・上場がある場合のみ送信されます</p>
                    <button onClick={handleTestNotify} disabled={notifyLoading} style={btnStyle("#0369a1", notifyLoading)}>
                      {notifyLoading?"送信中...":"通知メールを今すぐ送信"}
                    </button>
                    {notifyResult && <p style={{ marginTop:6, fontSize:11, color:notifyResult.startsWith("❌")?"#dc2626":"#166534" }}>{notifyResult}</p>}
                  </div>
                </div>
              )}
            </div>

            {/* マスタ管理 */}
            <div style={{ ...sectionStyle, padding:0, overflow:"hidden" }}>
              <button onClick={()=>setMasterOpen(v=>!v)}
                style={{ width:"100%", padding:"16px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", background:"#334155", border:"none", cursor:"pointer", borderRadius:masterOpen?"12px 12px 0 0":"12px" }}>
                <div>
                  <div style={{ fontWeight:900, fontSize:14, color:"white" }}>🗂 マスタ管理</div>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.6)", marginTop:2 }}>競合財務・初値・経済指標カレンダー</div>
                </div>
                <span style={{ color:"white", fontSize:12, transform:masterOpen?"rotate(180deg)":"none", display:"inline-block", transition:"transform 0.2s" }}>▼</span>
              </button>
              {masterOpen && (
                <div style={{ padding:"16px 20px", display:"flex", flexDirection:"column", gap:16 }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:13, color:"#0F1F36", marginBottom:4 }}>🏢 競合他社財務データ取得</div>
                    <p style={{ fontSize:11, color:"#64748b", margin:"0 0 8px" }}>⑦で収集した競合企業の財務データを取得します</p>
                    {!selectedCompany
                      ? <p style={{ fontSize:11, color:"#94a3b8" }}>※ 右の「銘柄分析」で銘柄を選択してください</p>
                      : <>
                        <button onClick={handleCompetitor} disabled={compLoading} style={btnStyle("#0f766e", compLoading)}>
                          {compLoading?"取得中...":"競合財務データを取得する"}
                        </button>
                        {compResult && <div style={{ marginTop:8, fontSize:11, lineHeight:1.7, padding:"6px 8px", borderRadius:6, background:"#f0fdf4", color:"#166534", whiteSpace:"pre-wrap" }}>{compResult}</div>}
                      </>}
                  </div>
                  <hr style={{ border:"none", borderTop:"1px solid #e2e8f0" }}/>
                  {/* 2026/10/24削除: 「EDINETコードリスト取得」は日本版由来の機能で、米国版では使わないため */}
                  <div>
                    <div style={{ fontWeight:700, fontSize:13, color:"#0F1F36", marginBottom:8 }}>📝 初値・騰落率入力</div>
                    <InitialPriceForm />
                  </div>
                  <hr style={{ border:"none", borderTop:"1px solid #e2e8f0" }}/>
                  <div>
                    <div style={{ fontWeight:700, fontSize:13, color:"#0F1F36", marginBottom:4 }}>🌐 経済指標カレンダー登録 <span style={{ fontSize:10, color:"#94a3b8", marginLeft:6 }}>（年に数回）</span></div>
                    <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:12 }}>
                      <div><label style={labelStyle}>日付 *</label><input type="date" value={econDate} onChange={e=>setEconDate(e.target.value)} style={inputStyle}/></div>
                      <div>
                        <label style={labelStyle}>イベント種別 *</label>
                        <select value={econType} onChange={e=>setEconType(e.target.value)} style={inputStyle}>
                          <option value="FOMC">🇺🇸 FOMC</option>
                          <option value="日銀">🇯🇵 日銀金融政策決定会合</option>
                          <option value="NFP">📊 米雇用統計（NFP）</option>
                          <option value="CPI">📈 米CPI</option>
                        </select>
                      </div>
                      <div><label style={labelStyle}>メモ（任意）</label><input value={econLabel} onChange={e=>setEconLabel(e.target.value)} placeholder="例：結果発表23:00" style={inputStyle}/></div>
                      <button onClick={handleAddEconEvent} disabled={econLoading||!econDate} style={btnStyle("#0369a1", econLoading||!econDate)}>
                        {econLoading?"追加中...":"➕ 追加する"}
                      </button>
                      {econResult && <p style={{ fontSize:11, color:econResult.startsWith("❌")?"#dc2626":"#166534" }}>{econResult}</p>}
                    </div>
                    {econEvents.length>0 && (
                      <div>
                        <div style={{ fontSize:11, fontWeight:700, color:"#3D5A85", marginBottom:6 }}>登録済みイベント（{econEvents.length}件）</div>
                        <div style={{ display:"flex", flexDirection:"column", gap:4, maxHeight:200, overflowY:"auto" }}>
                          {econEvents.map(e=>(
                            <div key={e.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 10px", background:"#f8fafc", borderRadius:8, border:"1px solid #e2e8f0" }}>
                              <div>
                                <span style={{ fontSize:12, fontWeight:700, color:"#0F1F36" }}>{e.event_date}</span>
                                <span style={{ fontSize:11, color:"#3D5A85", marginLeft:8 }}>{e.event_type}</span>
                                {e.label && <span style={{ fontSize:11, color:"#64748b", marginLeft:6 }}>（{e.label}）</span>}
                              </div>
                              <button onClick={()=>handleDeleteEconEvent(e.id)} style={{ background:"none", border:"none", cursor:"pointer", color:"#ef4444", fontSize:16, padding:"2px 6px" }}>×</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

          </div>{/* 左カラム終わり */}

          {/* ═══ 右カラム ═══ */}
          <div className="admin-col" style={{ width:"50%", display:"flex", flexDirection:"column", gap:12 }}>


            {/* SEC書類の進み具合(2026/10追加) */}
            <div style={sectionStyle}>
              <h2 style={{ fontSize:"15px", fontWeight:900, color:"#0F1F36", marginBottom:4 }}>📡 SEC書類の進み具合</h2>
              <p style={{ fontSize:11, color:"#64748b", marginBottom:10, lineHeight:1.6 }}>毎日自動で更新されます。行をクリックすると、下の「銘柄分析」でその銘柄が選択されます。</p>
              {companies.length === 0 ? (
                <p style={{ fontSize:12, color:"#94a3b8" }}>登録された銘柄がありません</p>
              ) : (
                <>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:10 }}>
                    {Object.entries(STAGE_INFO).sort((a,b)=>b[1].rank-a[1].rank).map(([key,info])=>{
                      const n = companies.filter(c=>c.sec_stage===key).length;
                      return <span key={key} style={{ fontSize:10, fontWeight:800, padding:"3px 10px", borderRadius:999, color:info.color, background:info.bg }}>{info.label} {n}</span>;
                    })}
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:360, overflowY:"auto" }}>
                    {[...companies].sort((a,b)=>stageOf(b).rank-stageOf(a).rank || String(b.sec_last_filed??"").localeCompare(String(a.sec_last_filed??""))).map(c=>{
                      const st = stageOf(c);
                      const range = fmtUsd(c.price_range_min, c.price_range_max);
                      return (
                        <button key={c.id} onClick={()=>handleSelectCompany(c)}
                          style={{ textAlign:"left" as const, cursor:"pointer", padding:"8px 10px", borderRadius:8, border:selectedCompany?.id===c.id?"2px solid #1E3A66":"1px solid #e2e8f0", background:selectedCompany?.id===c.id?"#f0f5ff":"#fff" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" as const }}>
                            <span style={{ fontSize:12, fontWeight:800, color:"#0F1F36" }}>{c.name}</span>
                            <span style={{ fontSize:10, fontWeight:800, padding:"2px 8px", borderRadius:999, color:st.color, background:st.bg }}>{st.label}</span>
                          </div>
                          <div style={{ fontSize:10.5, color:"#64748b", marginTop:3, lineHeight:1.6 }}>
                            {c.sec_last_form ? `最新書類: ${c.sec_last_form}（${c.sec_last_filed ?? "-"}）` : "最新書類: 未確認"}
                            {c.ticker ? `　${c.exchange ?? ""} ${c.ticker}` : ""}
                            {range ? `　価格帯 ${range}` : ""}
                            {`　上場日 ${c.listing_date ?? "未定"}`}
                            {c.price_track?.day1?.ret_close_pct != null ? `　初日終値 ${c.price_track.day1.ret_close_pct >= 0 ? "+" : ""}${c.price_track.day1.ret_close_pct}%` : ""}
                            {c.price_track?.latest?.ret_pct != null ? `　最新 ${c.price_track.latest.ret_pct >= 0 ? "+" : ""}${c.price_track.latest.ret_pct}%` : ""}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* 銘柄分析 */}
            <div style={sectionStyle}>
              <h2 style={{ fontSize:"15px", fontWeight:900, color:"#0F1F36", marginBottom:4 }}>🔬 銘柄分析（手動作業）</h2>
              <p style={{ fontSize:11, color:"#64748b", marginBottom:16 }}>新規IPO銘柄が出たら、以下の順番で実行してください。<br/><strong>① → ⑦ → ② → ③ → ④⑤⑥一括 → 視覚化</strong></p>

              <div style={{ marginBottom:14 }}>
                <label style={labelStyle}>📌 分析する銘柄を選択 *</label>
                <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", gap:12, marginBottom:6, fontSize:11, color:"#475569" }}>
                  <span>✅ 分析終了　🟡 途中　⬜ 未分析</span>
                  <label style={{ display:"inline-flex", alignItems:"center", gap:4, cursor:"pointer", fontWeight:700 }}>
                    <input type="checkbox" checked={onlyTodo} onChange={e=>setOnlyTodo(e.target.checked)} />
                    分析が終わっていない銘柄だけ表示
                  </label>
                </div>
                <select onChange={e=>{ const c=companies.find(x=>x.id===e.target.value); if(c) handleSelectCompany(c); }} style={inputStyle} value={selectedCompany?.id??""}>
                  <option value="">-- 銘柄を選択してください --</option>
                  {(() => {
                    // 上場月ごとに分ける(新しい月が上。上場日未定は一番上)。月の中は上場日が早い順
                    const list = companies.filter(c => !onlyTodo || markOf(c).kind !== "done" || c.id === selectedCompany?.id);
                    const groups: Record<string, any[]> = {};
                    list.forEach(c => { const k = c.listing_date ? String(c.listing_date).slice(0, 7) : "未定"; (groups[k] = groups[k] ?? []).push(c); });
                    const keys = Object.keys(groups).sort((x, y) => x === "未定" ? -1 : y === "未定" ? 1 : y.localeCompare(x));
                    return keys.map(k => {
                      const g = groups[k];
                      const doneN = g.filter(c => markOf(c).kind === "done").length;
                      const label = k === "未定"
                        ? `■ 上場日未定（${g.length}社）`
                        : `■ ${k.slice(0, 4)}年${Number(k.slice(5, 7))}月（${g.length}社${Object.keys(progressSummary).length ? `・分析終了 ${doneN}社` : ""}）`;
                      return (
                        <optgroup key={k} label={label}>
                          {g.map(c => {
                            const m = markOf(c);
                            const text = `${m.icon ? `${m.icon} ${m.text}｜` : ""}${c.name}（${c.listing_date ?? "上場日未定"}）［${stageOf(c).label}］${isPublicFree(c) ? " 🌟全員無料" : ""}`;
                            return <option key={c.id} value={c.id}>{text}</option>;
                          })}
                        </optgroup>
                      );
                    });
                  })()}
                </select>
              </div>

              {selectedCompany && (
                <>
                  <div style={{ background:"#f0fdf4", borderRadius:8, padding:"8px 12px", marginBottom:14, fontSize:12, color:"#166534" }}>
                    ✅ 選択中：<strong>{selectedCompany.name}</strong>
                    <span style={{ marginLeft:8, fontSize:10, fontWeight:800, padding:"2px 8px", borderRadius:999, color:stageOf(selectedCompany).color, background:stageOf(selectedCompany).bg }}>{stageOf(selectedCompany).label}</span>
                    {markOf(selectedCompany).kind !== "unknown" && (
                      <span style={{ marginLeft:6, fontSize:10, fontWeight:800, padding:"2px 8px", borderRadius:999, color: markOf(selectedCompany).kind==="done" ? "#166534" : markOf(selectedCompany).kind==="part" ? "#92400e" : "#475569", background: markOf(selectedCompany).kind==="done" ? "#bbf7d0" : markOf(selectedCompany).kind==="part" ? "#fef3c7" : "#e2e8f0" }}>{markOf(selectedCompany).icon} {markOf(selectedCompany).text}</span>
                    )}
                  </div>
                  <div style={{ background:"#fefce8", borderRadius:8, padding:"8px 12px", marginBottom:14, border:"1px solid #fde68a" }}>
                    <label style={{ display:"flex", alignItems:"flex-start", gap:8, fontSize:12, color:"#713f12", fontWeight:700, cursor:"pointer" }}>
                      <input type="checkbox" checked={isPublicFree(selectedCompany)} onChange={e=>setPublicFree(selectedCompany, e.target.checked)} style={{ marginTop:2 }} />
                      <span>🌟 この銘柄を、誰でも無料で読めるように公開する<br/><span style={{ fontWeight:400, fontSize:11, color:"#92400e" }}>毎月の「最初の2銘柄が無料」の枠とは別扱いです。ANTHROPICは、はじめから公開に設定されています。</span></span>
                    </label>
                    {publicFreeMsg && <div style={{ fontSize:11, marginTop:4, color:"#713f12" }}>{publicFreeMsg}</div>}
                  </div>
                  <div style={{ background:"#fffbeb", borderRadius:8, padding:12, marginBottom:14, border:"1px solid #fde68a" }}>
                    <label style={{ ...labelStyle, color:"#92400e" }}>💵 公募価格（ドル）※価格決定後に入力</label>
                    <div style={{ display:"flex", gap:8 }}>
                      <input type="number" value={ipoPriceInput} onChange={e=>setIpoPriceInput(e.target.value)} placeholder="例：16" style={{ ...inputStyle, flex:1 }}/>
                      <button onClick={handleSetIpoPrice} disabled={ipoPriceLoading} style={{ padding:"8px 14px", backgroundColor:ipoPriceLoading?"#94a3b8":"#d97706", color:"white", border:"none", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:12, whiteSpace:"nowrap" }}>
                        {ipoPriceLoading?"保存中...":"保存"}
                      </button>
                    </div>
                    {ipoPriceResult && <p style={{ marginTop:6, fontSize:11, color:ipoPriceResult.startsWith("❌")?"#dc2626":"#166534" }}>{ipoPriceResult}</p>}
                  </div>
                  {/* 2026/10/24削除: 「日本の証券会社での取扱い」の手入力欄。今後は手動入力しない方針のため */}
                  <div style={{ marginBottom:14 }}>
                    <label style={labelStyle}>SEC書類のURL（空白で自動検索。通常は入力不要）</label>
                    <input value={edinetDocId} onChange={e=>setEdinetDocId(e.target.value)} placeholder="例：https://www.sec.gov/Archives/edgar/data/…/xxxx.htm" style={inputStyle}/>
                    <p style={{ marginTop:4, fontSize:11, color:"#64748b" }}>会社番号(CIK)から最新のS-1を自動で探します。別の書類を使いたいときだけ、そのURLを入れてください。</p>
                  </div>
                  <div style={{ borderTop:"2px dashed #C7D3E3", paddingTop:14, marginBottom:4 }}>
                    <p style={{ fontSize:11, fontWeight:700, color:"#3D5A85", marginBottom:10 }}>▼ 以下の順番で実行してください</p>
                  </div>
                  {renderProgressPanel()}
                  <StepRow num="1" color="#3b82f6" title="STEP 1｜SECからテキスト取得" desc="SEC EDGARのS-1(目論見書)のテキストをDBに保存します（約10〜30秒）" btnLabel="① テキストを取得する" onClick={handleStep1}/>
                  <StepRow num="7" color="#0369a1" title="STEP 2｜市場・競合情報収集" desc="主幹事証券・競合企業・業界PER・直近IPO事例を収集します（約20〜30秒）" btnLabel="⑦ 市場・競合情報を収集する" onClick={handleStep7}/>
                  <StepRow num="2" color="#16a34a" title="STEP 3｜財務データを構造化" desc="テキストから財務・株主・ロックアップ情報をJSON化します（約15〜25秒）" btnLabel="② 財務データを構造化する" onClick={handleStep2}/>
                  <StepRow num="3" color="#0e7490" title="STEP 4｜スコア・シナリオ生成" desc="総合スコア→まずここに注目→株価シナリオの順に3回に分けて生成します（約40〜60秒）" btnLabel="③ スコア・シナリオを生成する" onClick={handleStep3}/>
                  <div style={{ borderRadius:10, padding:"12px 14px", marginBottom:10, border:`1px solid ${(stepResult["4"]||stepResult["5"]||stepResult["6"])?.startsWith("❌")?"#fecaca":stepResult["6"]?"#bbf7d0":"#e2e8f0"}`, background:(stepResult["4"]||stepResult["5"]||stepResult["6"])?.startsWith("❌")?"#fef2f2":stepResult["6"]?"#f0fdf4":"#f8fafc" }}>
                    <div style={{ fontWeight:900, color:"#7c3aed", fontSize:13, marginBottom:3 }}>STEP 5｜9軸 詳細分析（一括実行）</div>
                    {!allAxesLoading && !["4","5","6"].some(n=>stepResult[n]) && renderBadge(["4","5","6"], true)}
                    <p style={{ fontSize:11, color:"#64748b", margin:"2px 0 8px" }}>超短期・短期・長期の9軸をすべて自動で順番に分析します（約2〜4分）</p>
                    <button onClick={handleAllAxes} disabled={allAxesLoading||autoRunning} style={btnStyle("#7c3aed", allAxesLoading||autoRunning)}>
                      {allAxesLoading?"⏳ 分析中（しばらくお待ちください）...":"④⑤⑥ 9軸を一括分析する"}
                    </button>
                    {["4","5","6"].map(n=>stepResult[n]&&(
                      <div key={n} style={{ marginTop:6, fontSize:11, lineHeight:1.7, padding:"4px 8px", borderRadius:6, background:stepResult[n]?.startsWith("❌")?"#fef2f2":"#f0fdf4", color:stepResult[n]?.startsWith("❌")?"#dc2626":"#166534", whiteSpace:"pre-wrap" }}>
                        {stepResult[n]}
                      </div>
                    ))}
                    {["4","5","6"].map(n=>(<div key={`pd${n}`}>{renderProofDetails(n)}</div>))}
                  </div>
                  <div style={{ borderRadius:10, padding:"12px 14px", marginBottom:10, border:`1px solid ${vizResult?.startsWith("❌")?"#fecaca":vizResult?.includes("完了")?"#bbf7d0":"#e2e8f0"}`, background:vizResult?.startsWith("❌")?"#fef2f2":vizResult?.includes("完了")?"#f0fdf4":"#f8fafc" }}>
                    <div style={{ fontWeight:900, color:"#1E3A66", fontSize:13, marginBottom:3 }}>STEP 6｜視覚化データ生成</div>
                    {!vizLoading && !vizResult && renderBadge(["viz"])}
                    <p style={{ fontSize:11, color:"#64748b", margin:"2px 0 8px" }}>グラフ・表データをまとめて生成します（約30〜60秒）</p>
                    <button onClick={handleVisualize} disabled={vizLoading||autoRunning} style={btnStyle("#1E3A66", vizLoading||autoRunning)}>
                      {vizLoading?"⏳ 生成中...":"📊 視覚化データを生成"}
                    </button>
                    {vizResult && <div style={{ marginTop:6, fontSize:11, padding:"4px 8px", borderRadius:6, background:vizResult.startsWith("❌")?"#fef2f2":"#f0fdf4", color:vizResult.startsWith("❌")?"#dc2626":"#166534" }}>{vizResult}</div>}
                  </div>
                </>
              )}
            </div>

          </div>{/* 右カラム終わり */}

        </div>{/* admin-layout終わり */}
      </div>
    </div>
  );
}