import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createSupabaseServerClient();
  if (!supabase) return NextResponse.json([]);
  const cols = "id, name, sector, listing_date, analysis_detail, edinet_doc_id, ipo_price, cik, ticker, exchange, price_range_min, price_range_max, sec_stage, sec_last_form, sec_last_filed, price_track";
  // jp_brokers 列をまだ作っていない場合でも、管理画面が止まらないようにする
  let { data, error } = await supabase.from("ipo_companies").select(cols + ", jp_brokers").order("listing_date", { ascending: true });
  if (error) {
    const retry = await supabase.from("ipo_companies").select(cols).order("listing_date", { ascending: true });
    data = retry.data as any;
  }
  return NextResponse.json(data ?? []);
}
