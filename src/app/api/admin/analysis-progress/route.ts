import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 2026/11/7新設(米国版): 管理画面の「分析の進み具合」の記録。
// 画面を閉じても、どのSTEPまで完了したか(完了日時つき)が分かるように、ipo_companies.analysis_progress(jsonb)に保存する。
//   GET  ?company_id=…  … { progress: 記録済み, inferred: 既存データから推定した完了(この機能の導入前に作った分析用), column_ready }
//   POST { company_id, key, status: "done" | "failed", note? } … 1つのSTEPの結果を記録する(日時はサーバーの時刻)
// このURL(/api/admin/...)は管理画面にログインしている人だけが使える(src/proxy.ts が門番)。
// analysis_progress 列がまだ無いとき(SQL未実行)は、GETは推定だけを返し、POSTは何もせず成功を返す(管理画面の分析は止めない)。
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const KEYS = new Set(["1", "7", "2", "3", "4", "5", "6", "viz"]);

const hasObj = (v: any) => !!v && typeof v === "object" && Object.keys(v).length > 0;
const AXES_ROWS: { key: string; column: string; ids: string[] }[] = [
  { key: "4", column: "analysis_axes_short", ids: ["float", "lockup", "timing"] },
  { key: "5", column: "analysis_axes_mid", ids: ["valuation", "vc_sell", "growth"] },
  { key: "6", column: "analysis_axes_long", ids: ["management", "unit_econ", "competitor"] },
];

// すでに保存されているデータから「完了している」STEPを推定する(日時が分かるものだけ at を付ける)
// 画面のSTEP番号と内部キー: "1"=SEC取得, "7"=市場・競合情報, "2"=財務データ構造化, "3"=スコア・シナリオ, "4/5/6"=9軸(超短期/短期/長期), "viz"=視覚化データ
function infer(co: any): Record<string, { at: string | null }> {
  const out: Record<string, { at: string | null }> = {};
  if (hasObj(co.raw_prospectus)) out["1"] = { at: null };
  if (hasObj(co.analysis_market)) out["7"] = { at: null };
  if (hasObj(co.structured_data)) out["2"] = { at: null };
  if (hasObj(co.analysis_summary)) out["3"] = { at: co.analysis_summary.generated_at ?? null };
  for (const row of AXES_ROWS) {
    const col = co[row.column];
    if (hasObj(col) && row.ids.every((id) => col[id]?.report)) out[row.key] = { at: null };
  }
  if (hasObj(co.visualization_data)) out["viz"] = { at: null };
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const companyId = new URL(req.url).searchParams.get("company_id");
    if (!companyId) return NextResponse.json({ error: "company_id is required" }, { status: 400 });
    const supabase = getSupabase();
    const { data: co, error } = await supabase.from("ipo_companies").select("*").eq("id", companyId).maybeSingle();
    if (error || !co) return NextResponse.json({ error: error?.message ?? "銘柄が見つかりません" }, { status: 404 });
    return NextResponse.json({
      progress: hasObj((co as any).analysis_progress) ? (co as any).analysis_progress : {},
      inferred: infer(co),
      column_ready: "analysis_progress" in (co as any),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { company_id, key, status, note } = await req.json();
    if (!company_id || !KEYS.has(String(key)) || (status !== "done" && status !== "failed")) {
      return NextResponse.json({ error: "リクエストの形式が不正です" }, { status: 400 });
    }
    const supabase = getSupabase();
    const { data: co, error } = await supabase.from("ipo_companies").select("*").eq("id", company_id).maybeSingle();
    if (error || !co) return NextResponse.json({ error: error?.message ?? "銘柄が見つかりません" }, { status: 404 });
    // 列がまだ無い(SQL未実行)なら、何もせずに成功を返す
    if (!("analysis_progress" in (co as any))) return NextResponse.json({ success: true, recorded: false });
    const current = hasObj((co as any).analysis_progress) ? (co as any).analysis_progress : {};
    const next = { ...current, [String(key)]: { status, at: new Date().toISOString(), note: String(note ?? "").slice(0, 300) } };
    const { error: upErr } = await supabase.from("ipo_companies").update({ analysis_progress: next }).eq("id", company_id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    return NextResponse.json({ success: true, recorded: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "error" }, { status: 500 });
  }
}
