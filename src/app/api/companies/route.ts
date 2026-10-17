import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const requestCounts = new Map<string, { count: number; resetAt: number }>();

export async function GET(req: Request) {
  // レート制限：同一IPから1分間に30回まで
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const now = Date.now();
  const limit = requestCounts.get(ip);
  if (limit && now < limit.resetAt) {
    if (limit.count >= 30) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    limit.count++;
  } else {
    requestCounts.set(ip, { count: 1, resetAt: now + 60000 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from("ipo_companies")
    // 公開APIなので、分析本文(analysis_*)・目論見書データは返さない(有料部分の流出防止)。
    // 分析があるかどうかだけ、has_analysis として返す。
    .select("id, name, ticker, sector, exchange, listing_date, ai_summary, status, highlight, initial_price, price_change_rate, analysis_summary, price_range_min, sec_stage")
    .order("listing_date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const safe = (data ?? []).map((row: any) => {
    const { analysis_summary, price_range_min, sec_stage, ...rest } = row;
    // 「上場が決まった」とみなす条件: 価格帯が発表済み、または価格決定済み
    const is_decided = price_range_min != null || sec_stage === "launched" || sec_stage === "priced";
    return { ...rest, has_analysis: !!analysis_summary, is_decided };
  });
  return NextResponse.json(safe);
}