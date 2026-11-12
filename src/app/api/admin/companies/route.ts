import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createSupabaseServerClient();
  if (!supabase) return NextResponse.json([]);
  const cols = "id, name, sector, listing_date, analysis_detail, edinet_doc_id, ipo_price, cik, ticker, exchange, price_range_min, price_range_max, sec_stage, sec_last_form, sec_last_filed, price_track";
  // jp_brokers / is_public_free 列をまだ作っていない場合でも、管理画面が止まらないようにする(列がある組み合わせを順に試す)
  const candidates = [", jp_brokers, is_public_free", ", jp_brokers", ", is_public_free", ""];
  let data: any[] | null = null;
  for (const extra of candidates) {
    const r = await supabase.from("ipo_companies").select(cols + extra).order("listing_date", { ascending: true });
    if (!r.error) { data = r.data as any; break; }
  }
  return NextResponse.json(data ?? []);
}
