import { createClient } from "@supabase/supabase-js";

// 2026/10追加: 公開用の銘柄一覧の取得を1か所にまとめる。
//  ・/api/companies(ブラウザ向け)と、トップページ(サーバー側で最初のHTMLに中身を入れる)の両方が使う。
//  ・公開用なので、分析本文(analysis_*)・目論見書データは返さない(有料部分の流出防止)。
//    分析があるかどうかだけ has_analysis として返す。
export async function getPublicCompanies(): Promise<any[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from("ipo_companies")
    .select("id, name, ticker, sector, exchange, listing_date, ai_summary, status, highlight, initial_price, price_change_rate, analysis_summary, price_range_min, sec_stage, ipo_price, price_track")
    .order("listing_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => {
    const { analysis_summary, price_range_min, sec_stage, price_track, ...rest } = row;
    // 100万円シミュレーション用: 最新の終値と、その日付だけ取り出す(終値の推移などの細かい履歴は返さない)
    const latest_price: number | null = price_track?.latest?.close ?? null;
    const latest_date: string | null = price_track?.latest?.date ?? null;
    // 「上場が決まった」とみなす条件: 価格帯が発表済み、または価格決定済み
    const is_decided = price_range_min != null || sec_stage === "launched" || sec_stage === "priced";
    return { ...rest, has_analysis: !!analysis_summary, is_decided, latest_price, latest_date };
  });
}

// 2026/10追加: 「上場スケジュール」ページ用。価格帯・ロックアップ解除日など、表に載せる事実だけを返す(分析本文は返さない)。
export async function getScheduleCompanies(): Promise<any[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from("ipo_companies")
    .select("id, name, ticker, sector, exchange, listing_date, listing_date_confirmed, price_range_min, price_range_max, lockup_90_date, lockup_180_date, sec_stage")
    .order("listing_date", { ascending: true });
  if (error) throw new Error(error.message);
  // 取り下げた銘柄は載せない
  return (data ?? []).filter((r: any) => r.sec_stage !== "withdrawn");
}
