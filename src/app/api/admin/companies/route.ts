import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createSupabaseServerClient();
  if (!supabase) return NextResponse.json([]);
  const { data } = await supabase
    .from("ipo_companies")
    .select("id, name, sector, listing_date, analysis_detail, edinet_doc_id, ipo_price, cik, ticker, exchange, price_range_min, price_range_max, sec_stage, sec_last_form, sec_last_filed, price_track")
    .order("listing_date", { ascending: true });
  return NextResponse.json(data ?? []);
}
