import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { IpoCompany } from "@/types/ipo";
import { isPublicFree } from "@/lib/public-free";

function getEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return { url, key };
}

export function createSupabaseServerClient(): SupabaseClient | null {
  const { url, key } = getEnv();
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function createSupabaseRouteClient() {
  const { url, key } = getEnv();
  if (!url || !key) return null;
  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {}
      },
    },
  });
}

export async function fetchIpoCompanies(): Promise<{
  data: IpoCompany[] | null;
  error: string | null;
}> {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return {
      data: null,
      error: "Supabase の環境変数（NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY）が設定されていません。",
    };
  }

  const baseCols = "id,name,sector,listing_date,ai_summary,ticker,created_at,status,highlight,ai_score,exchange,biz_type";
  // 2026/11/12追加: is_public_free(全員に無料公開する銘柄のしるし)の列が、まだ作られていない場合でも止まらないようにする
  let { data, error } = await supabase
    .from("ipo_companies")
    .select(baseCols + ",is_public_free")
    .order("listing_date", { ascending: true, nullsFirst: false });
  if (error) {
    const retry = await supabase
      .from("ipo_companies")
      .select(baseCols)
      .order("listing_date", { ascending: true, nullsFirst: false });
    data = retry.data as any;
    error = retry.error;
  }

  if (error) {
    return { data: null, error: error.message };
  }

  // 月ごと（現在・過去・未来を問わず）に、上場日が早い順で先頭2社を無料開放とする
  // ただし「全員に無料公開する銘柄」(例: ANTHROPIC, PBC)は、いつでも無料で、その月の2枠には数えない
  const monthFreeCount: Record<string, number> = {};
  const result = ((data ?? []) as unknown as IpoCompany[]).map((company) => {
    if (isPublicFree(company as any)) {
      return { ...company, is_free: true };
    }
    const monthKey = company.listing_date
      ? company.listing_date.slice(0, 7)
      : "unknown";
    if (monthKey === "unknown") {
      return { ...company, is_free: false };
    }
    monthFreeCount[monthKey] = (monthFreeCount[monthKey] ?? 0) + 1;
    const isFree = monthFreeCount[monthKey] <= 2;
    return {
      ...company,
      is_free: isFree,
    };
  });

  return { data: result, error: null };
}

export async function fetchIpoCompaniesForCalendar(): Promise<{
  data: IpoCompany[] | null;
  error: string | null;
}> {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return {
      data: null,
      error: "Supabase の環境変数が設定されていません。",
    };
  }
  const { data, error } = await supabase
  .from("ipo_companies")
  .select("*")
  .order("listing_date", { ascending: true, nullsFirst: false });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as IpoCompany[], error: null };
}

export async function fetchIpoCompanyById(id: string): Promise<{
  data: IpoCompany | null;
  error: string | null;
  order: number | null;
}> {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { data: null, error: "Supabase の環境変数が設定されていません。", order: null };
  }

  const { data, error } = await supabase
    .from("ipo_companies")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return { data: null, error: error?.message ?? "銘柄が見つかりません", order: null };
  }

  const { data: allData } = await supabase
    .from("ipo_companies")
    .select("id")
    .order("listing_date", { ascending: true, nullsFirst: false });

  const order = allData ? allData.findIndex((c) => c.id === id) + 1 : null;

  return { data: data as IpoCompany, error: null, order };
}