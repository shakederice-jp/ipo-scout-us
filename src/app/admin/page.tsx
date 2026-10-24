"use client";
import { useState, useEffect } from "react";
import InitialPriceForm from "@/components/InitialPriceForm";
import { runProofread, collectFields, applyFields } from "@/lib/proofread";

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
    fetch("/api/admin/session", { cache: "no-store" })
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
      const res = await fetch("/api/admin/login", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ password }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) { setPassword(""); setAuthed(true); }
      else setLoginError(data?.error ?? "ログインに失敗しました");
    } catch { setLoginError("通信エラーです。もう一度お試しください"); }
    setLoginLoading(false);
  };

  useEffect(() => {
    if (!authed) return;
    fetch("/api/admin/companies").then(r => r.json()).then(setCompanies).catch(() => {});
    fetch("/api/admin/economic-events").then(r => r.json()).then(data => {
      if (Array.isArray(data)) setEconEvents(data);
    }).catch(() => {});
  }, [authed]);

  const setStep = (key: string, loading: boolean, result?: string) => {
    setStepLoading(prev => ({...prev, [key]: loading}));
    if (result !== undefined) setStepResult(prev => ({...prev, [key]: result}));
  };

  const handleSelectCompany = (c: any) => {
    setSelectedCompany(c);
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
      const res = await fetch("/api/sec", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ company_id:selectedCompany.id, doc_url:edinetDocId||undefined }) });
      const data = await res.json();
      setStep("1", false, data.error ? `❌ ${data.error}` : `✅ ${data.message}`);
    } catch { setStep("1", false, "❌ 通信エラー"); }
  };

  const handleStep7 = async () => {
    if (!selectedCompany) return;
    setStep("7", true);
    try {
      const res = await fetch("/api/market", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ companyId:selectedCompany.id }) });
      const data = await res.json();
      setStep("7", false, data.error ? `❌ ${data.error}` : `✅ 完了・主幹事:${data.data?.lead_underwriter??"不明"}・競合${data.data?.competitors?.length??0}社`);
    } catch { setStep("7", false, "❌ 通信エラー"); }
  };

  const handleStep2 = async () => {
    if (!selectedCompany) return;
    setStep("2", true);
    try {
      const res = await fetch("/api/structure", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ company_id:selectedCompany.id }) });
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
        const res = await fetch("/api/analyze", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ id:selectedCompany.id, part:p.key, ...((p.key === "action" || p.key === "highlights") ? { prior: merged } : {}) }) });
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
      const saveRes = await fetch("/api/analyze", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ id:selectedCompany.id, save_results:merged }) });
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
          const res = await fetch("/api/axes", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ company_id:selectedCompany.id, period, single_axis:axisId, part }) });
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
      const saveRes = await fetch("/api/axes", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ company_id:selectedCompany.id, period, save_results:allResults }) });
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
        const res = await fetch("/api/axes-beginner", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ company_id:selectedCompany.id, period, single_axis:axisId }) });
        const data = await res.json();
        if (data.error) { setStep(stepNum, false, `❌ ${axisId}: ${data.error}`); return false; }
        allResults.push({ id:axisId, report_beginner:data.report_beginner });
      } catch { setStep(stepNum, false, `❌ ${axisId} 通信エラー`); return false; }
    }
    setStepResult(prev => ({...prev, [stepNum]: `⏳ ${label} 保存中...`}));
    try {
      const saveRes = await fetch("/api/axes-beginner", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ company_id:selectedCompany.id, period, save_results:allResults }) });
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
        const res = await fetch("/api/visualize", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ companyId:selectedCompany.id, chart_type:type }) });
        const data = await res.json();
        if (data.error) { setVizResult(`❌ ${labels[type]}: ${data.error}`); setVizLoading(false); return; }
        Object.assign(merged, data.data);
      } catch { setVizResult("❌ 通信エラー"); setVizLoading(false); return; }
    }
    setVizResult("⏳ 保存中...");
    try {
      const saveRes = await fetch("/api/visualize", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ companyId:selectedCompany.id, save_results:merged }) });
      const saveData = await saveRes.json();
      setVizResult(saveData.success ? "✅ 視覚化データ生成完了" : `❌ 保存エラー: ${saveData.error}`);
    } catch { setVizResult("❌ 保存通信エラー"); }
    finally { setVizLoading(false); }
  };

  const handleSaveJpBrokers = async () => {
    if (!selectedCompany) return;
    setJpBrokersLoading(true); setJpBrokersResult(null);
    try {
      const res = await fetch("/api/admin/jp-brokers", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ company_id:selectedCompany.id, brokers:jpBrokers }) });
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
      const res = await fetch("/api/admin/set-ipo-price", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ company_id:selectedCompany.id, ipo_price:ipoPriceInput }) });
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
        const res = await fetch("/api/admin/find-edinet-doc", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ company_name:c.name }) });
        const data = await res.json();
        if (data.error) results.push(`❌ ${c.name}: ${data.error}`);
        else {
          await fetch("/api/admin/set-edinet-doc-id", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ company_id:c.id, edinet_doc_id:data.doc_id }) });
          results.push(`✅ ${c.name}: ${data.doc_id}`);
        }
      } catch { results.push(`❌ ${c.name}: 通信エラー`); }
    }
    setBulkEdinetResult(results.join("\n"));
    fetch("/api/admin/companies").then(r=>r.json()).then(setCompanies).catch(()=>{});
    setBulkEdinetLoading(false);
  };

  const handleCompetitor = async () => {
    if (!selectedCompany) return;
    setCompLoading(true); setCompResult(null);
    try {
      const res = await fetch("/api/competitor", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ company_id:selectedCompany.id }) });
      const data = await res.json();
      if (data.error) setCompResult(`❌ ${data.error}`);
      else setCompResult(data.results.map((r:any)=>r.error?`❌ ${r.name}: ${r.error}`:`✅ ${r.name}: 売上${r.revenue}億`).join("\n"));
    } catch { setCompResult("❌ 通信エラー"); }
    setCompLoading(false);
  };

  const handleAutoFetch = async () => {
    setAutoLoading(true); setAutoResult("IPO情報を取得中...");
    try {
      const res = await fetch("/api/admin/auto-fetch", { method:"POST" });
      const data = await res.json();
      setAutoResult(data.error ? `❌ ${data.error}` : `✅ ${data.added}件追加・${data.skipped}件スキップ`);
    } catch { setAutoResult("❌ 通信エラー"); }
    setAutoLoading(false);
  };

  const handleTestNotify = async () => {
    setNotifyLoading(true); setNotifyResult(null);
    try {
      const res = await fetch("/api/admin/send-notify", { method:"POST" });
      const data = await res.json();
      setNotifyResult(data.error ? `❌ ${data.error}` : `✅ 送信完了・${data.sent}件`);
    } catch { setNotifyResult("❌ 通信エラー"); }
    setNotifyLoading(false);
  };

  const handleHealthCheck = async () => {
    setHealthLoading(true); setHealthResult(null);
    try {
      const res = await fetch("/api/admin/health");
      setHealthResult(await res.json());
    } catch(e) { setHealthResult({ ok:false, error:String(e) }); }
    setHealthLoading(false);
  };

  const handleDbCheck = async () => {
    setDbCheckLoading(true); setDbCheckResult(null);
    try {
      const res = await fetch("/api/cron/db-check");
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
      const res = await fetch("/api/admin/economic-events", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ event_date:econDate, event_type:econType, label:econLabel||null }) });
      const data = await res.json();
      if (data.error) setEconResult(`❌ ${data.error}`);
      else {
        setEconResult("✅ 追加しました"); setEconDate(""); setEconLabel("");
        const updated = await fetch("/api/admin/economic-events").then(r=>r.json());
        if (Array.isArray(updated)) setEconEvents(updated);
      }
    } catch { setEconResult("❌ 通信エラー"); }
    setEconLoading(false);
  };

  const handleDeleteEconEvent = async (id: string) => {
    if (!confirm("このイベントを削除しますか？")) return;
    try {
      await fetch("/api/admin/economic-events", { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ id }) });
      setEconEvents(prev=>prev.filter(e=>e.id!==id));
    } catch {}
  };

  const inputStyle = { width:"100%", padding:"8px 10px", borderRadius:"8px", border:"1px solid #C7D3E3", boxSizing:"border-box" as const, fontSize:"13px" };
  const labelStyle = { fontSize:"11px", fontWeight:"700" as const, color:"#3D5A85", marginBottom:"4px", display:"block" as const };
  const sectionStyle = { background:"white", borderRadius:"12px", padding:"20px", marginBottom:"12px", border:"1px solid #d1f5f7" };
  const btnStyle = (color: string, disabled: boolean) => ({ padding:"9px 16px", backgroundColor:disabled?"#94a3b8":color, color:"white", border:"none", borderRadius:"8px", cursor:disabled?"default":"pointer" as const, fontWeight:700 as const, fontSize:"13px", width:"100%" });

  const StepRow = ({ num, color, title, desc, btnLabel, onClick, disabled }: any) => {
    const isLoading = stepLoading[num];
    const res = stepResult[num];
    const isErr = res?.startsWith("❌");
    const isDone = res?.startsWith("✅");
    return (
      <div style={{ borderRadius:10, padding:"12px 14px", marginBottom:10, border:`1px solid ${isErr?"#fecaca":isDone?"#bbf7d0":"#e2e8f0"}`, background:isErr?"#fef2f2":isDone?"#f0fdf4":"#f8fafc" }}>
        <div style={{ fontWeight:900, color, fontSize:13, marginBottom:3 }}>{title}</div>
        <p style={{ fontSize:11, color:"#64748b", margin:"2px 0 8px" }}>{desc}</p>
        <button onClick={onClick} disabled={isLoading||disabled} style={btnStyle(color, isLoading||disabled)}>
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
                <select onChange={e=>{ const c=companies.find(x=>x.id===e.target.value); if(c) handleSelectCompany(c); }} style={inputStyle} value={selectedCompany?.id??""}>
                  <option value="">-- 銘柄を選択してください --</option>
                  {companies.map(c=><option key={c.id} value={c.id}>{c.name}（{c.listing_date ?? "上場日未定"}）［{stageOf(c).label}］</option>)}
                </select>
              </div>

              {selectedCompany && (
                <>
                  <div style={{ background:"#f0fdf4", borderRadius:8, padding:"8px 12px", marginBottom:14, fontSize:12, color:"#166534" }}>
                    ✅ 選択中：<strong>{selectedCompany.name}</strong>
                    <span style={{ marginLeft:8, fontSize:10, fontWeight:800, padding:"2px 8px", borderRadius:999, color:stageOf(selectedCompany).color, background:stageOf(selectedCompany).bg }}>{stageOf(selectedCompany).label}</span>
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
                  <div style={{ background:"#eff6ff", borderRadius:8, padding:12, marginBottom:14, border:"1px solid #bfdbfe" }}>
                    <label style={{ ...labelStyle, color:"#1d4ed8" }}>🇯🇵 日本の証券会社での公募（抽選）の取扱い ※各社のページで確認してチェック</label>
                    <div style={{ display:"flex", gap:16, alignItems:"center", flexWrap:"wrap" }}>
                      {([["rakuten","楽天証券"],["sbi","SBI証券"]] as [string,string][]).map(([k,n])=>(
                        <label key={k} style={{ display:"flex", alignItems:"center", gap:6, fontSize:13, color:"#1e3a8a", cursor:"pointer" }}>
                          <input type="checkbox" checked={jpBrokers.includes(k)} onChange={e=>setJpBrokers(prev=>e.target.checked?Array.from(new Set([...prev,k])):prev.filter(x=>x!==k))}/>
                          {n}で抽選あり
                        </label>
                      ))}
                      <button onClick={handleSaveJpBrokers} disabled={jpBrokersLoading} style={{ padding:"8px 14px", backgroundColor:jpBrokersLoading?"#94a3b8":"#1d4ed8", color:"white", border:"none", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:12 }}>
                        {jpBrokersLoading?"保存中...":"保存"}
                      </button>
                    </div>
                    <p style={{ marginTop:6, fontSize:10, color:"#64748b", lineHeight:1.7 }}>どちらもチェックしないと「取扱い未定」と表示され、買い方・売り方ガイドは「上場初日の寄り付き付近で買う」前提で書かれます。</p>
                    {jpBrokersResult && <p style={{ marginTop:6, fontSize:11, color:jpBrokersResult.startsWith("❌")?"#dc2626":"#166534" }}>{jpBrokersResult}</p>}
                  </div>
                  <div style={{ marginBottom:14 }}>
                    <label style={labelStyle}>SEC書類のURL（空白で自動検索。通常は入力不要）</label>
                    <input value={edinetDocId} onChange={e=>setEdinetDocId(e.target.value)} placeholder="例：https://www.sec.gov/Archives/edgar/data/…/xxxx.htm" style={inputStyle}/>
                    <p style={{ marginTop:4, fontSize:11, color:"#64748b" }}>会社番号(CIK)から最新のS-1を自動で探します。別の書類を使いたいときだけ、そのURLを入れてください。</p>
                  </div>
                  <div style={{ borderTop:"2px dashed #C7D3E3", paddingTop:14, marginBottom:4 }}>
                    <p style={{ fontSize:11, fontWeight:700, color:"#3D5A85", marginBottom:10 }}>▼ 以下の順番で実行してください</p>
                  </div>
                  <StepRow num="1" color="#3b82f6" title="STEP 1｜SECからテキスト取得" desc="SEC EDGARのS-1(目論見書)のテキストをDBに保存します（約10〜30秒）" btnLabel="① テキストを取得する" onClick={handleStep1}/>
                  <StepRow num="7" color="#0369a1" title="STEP 2｜市場・競合情報収集" desc="主幹事証券・競合企業・業界PER・直近IPO事例を収集します（約20〜30秒）" btnLabel="⑦ 市場・競合情報を収集する" onClick={handleStep7}/>
                  <StepRow num="2" color="#16a34a" title="STEP 3｜財務データを構造化" desc="テキストから財務・株主・ロックアップ情報をJSON化します（約15〜25秒）" btnLabel="② 財務データを構造化する" onClick={handleStep2}/>
                  <StepRow num="3" color="#0e7490" title="STEP 4｜スコア・シナリオ生成" desc="総合スコア→まずここに注目→株価シナリオの順に3回に分けて生成します（約40〜60秒）" btnLabel="③ スコア・シナリオを生成する" onClick={handleStep3}/>
                  <div style={{ borderRadius:10, padding:"12px 14px", marginBottom:10, border:`1px solid ${(stepResult["4"]||stepResult["5"]||stepResult["6"])?.startsWith("❌")?"#fecaca":stepResult["6"]?"#bbf7d0":"#e2e8f0"}`, background:(stepResult["4"]||stepResult["5"]||stepResult["6"])?.startsWith("❌")?"#fef2f2":stepResult["6"]?"#f0fdf4":"#f8fafc" }}>
                    <div style={{ fontWeight:900, color:"#7c3aed", fontSize:13, marginBottom:3 }}>STEP 5｜9軸 詳細分析（一括実行）</div>
                    <p style={{ fontSize:11, color:"#64748b", margin:"2px 0 8px" }}>超短期・短期・長期の9軸をすべて自動で順番に分析します（約2〜4分）</p>
                    <button onClick={handleAllAxes} disabled={allAxesLoading} style={btnStyle("#7c3aed", allAxesLoading)}>
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
                    <p style={{ fontSize:11, color:"#64748b", margin:"2px 0 8px" }}>グラフ・表データをまとめて生成します（約30〜60秒）</p>
                    <button onClick={handleVisualize} disabled={vizLoading} style={btnStyle("#1E3A66", vizLoading)}>
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