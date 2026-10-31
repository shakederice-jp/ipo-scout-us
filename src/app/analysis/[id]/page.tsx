import { fetchIpoCompanyById, fetchIpoCompanies, createSupabaseServerClient, createSupabaseRouteClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
import { createClient } from "@supabase/supabase-js";
import { syncPlanForUser } from "@/lib/plan-sync";
import { canReadPaidAnalysis } from "@/lib/member-auth";
import AnalysisClient from "@/components/AnalysisClient";
import { notFound } from "next/navigation";
import { buildKeyFaq, jpDate } from "@/components/KeyFacts";
import { fmtUsd } from "@/lib/fx";

async function fetchCompany(id: string) {
  // ハイフンを含む場合はUUID、そうでなければティッカーコードとして検索
  if (id.includes("-")) {
    return fetchIpoCompanyById(id);
  }
  const supabase = createSupabaseServerClient();
  if (!supabase) return { data: null, error: new Error("no client") };
  const { data, error } = await supabase
    .from("ipo_companies")
    .select("*")
    .eq("ticker", id.toUpperCase())
    .single();
  return { data, error };
}

// この銘柄をこのユーザーが閲覧できるかどうかを判定する
// (無料枠の銘柄 / ログイン済みかつ有料プラン加入または紹介特典の期間中 / ログイン済みかつ単品購入済み のいずれか)
async function checkAccess(companyId: string, isFreeCompany: boolean): Promise<boolean> {
  if (isFreeCompany) return true;

  const routeClient = await createSupabaseRouteClient();
  if (!routeClient) return false;
  // getSession() はクッキーを検証しないため、認証サーバーで確認する getUser() を使う
  const { data: { user } } = await routeClient.auth.getUser();
  if (!user) return false;

  const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: profile } = await serviceSupabase
    .from("user_profiles")
    .select("plan, free_until")
    .eq("id", user.id)
    .maybeSingle();
  // 日本版・米国版は共通のプラン。Stripeの契約に合わせてプランを最新にしてから判定する(src/lib/plan-sync.ts)
  const synced = await syncPlanForUser(user);
  const plan = synced ?? profile?.plan;

  // プラン加入、または紹介特典の無料期間中(user_profiles.free_until が未来)なら、有料分析を読める
  if (canReadPaidAnalysis({ plan, free_until: profile?.free_until })) return true;

  const { data: purchase } = await serviceSupabase
    .from("purchased_stocks")
    .select("id")
    .eq("user_id", user.id)
    .eq("company_id", companyId)
    .maybeSingle();

  return !!purchase;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = await fetchCompany(id);
  if (!data) return { title: "米国IPO銘柄分析レポート｜大手町調査室九課" };
  const co = data as any;
  const ticker = co.ticker as string | null;
  const who = ticker ? `${data.name}（${ticker}）` : data.name;
  // タイトル: 検索されやすい言葉(上場日・公募価格・ロックアップ・買い方)を、銘柄名と一緒に入れる
  const title = `${who}のIPO｜上場日・公募価格・ロックアップ・買い方｜米国IPO分析`;
  // 説明文: 登録されている事実(上場日・価格帯)を先頭に。分析の要約は短く添える
  const ld = jpDate(co.listing_date);
  const lo = co.price_range_min, hi = co.price_range_max;
  const priceText = lo != null || hi != null
    ? (lo === hi || hi == null || lo == null ? fmtUsd((lo ?? hi) as number) : `${fmtUsd(lo)}〜${fmtUsd(hi)}`)
    : "";
  const facts = [
    ld ? `上場日${ld}${co.listing_date_confirmed ? "" : "(予定)"}` : "",
    priceText ? `${co.sec_stage === "priced" ? "公募価格" : "想定価格帯"}${priceText}` : "",
  ].filter(Boolean).join("、");
  const summary: string = co.analysis_summary?.summary ?? "";
  const score = co.analysis_summary?.total_score;
  const grade = co.analysis_summary?.grade;
  const tail = score ? `AI総合評価${score}/100(${grade}ランク)。` : "";
  const description = `${who}の米国IPO情報。${facts ? facts + "。" : ""}ロックアップ解除日・主幹事・日本からの買い方を、目論見書(S-1)をもとにAIが日本語で整理。${tail}${summary ? summary.slice(0, 60) : ""}`.slice(0, 200);
  const canonicalId = ticker ?? data.id;
  const url = `https://ipo-us.finance-tower.com/analysis/${canonicalId}`;
  return {
    title,
    description,
    keywords: [data.name, ticker ?? "", `${data.name} IPO`, `${data.name} 上場日`, `${data.name} 公募価格`, `${data.name} ロックアップ`, "米国IPO", "目論見書", "S-1", co.sector ?? ""].filter(Boolean),
    openGraph: {
      title, description, url,
      siteName: "米国IPO企業情報AI分析レポート｜大手町調査室九課",
      locale: "ja_JP",
      type: "article",
      images: [{ url: "https://ipo-us.finance-tower.com/ogp.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title, description,
      images: ["https://ipo-us.finance-tower.com/ogp.png"],
    },
    alternates: { canonical: url },
  };
}

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ data: company }, { data: allCompanies }] = await Promise.all([
    fetchCompany(id),
    fetchIpoCompanies(),
  ]);

  if (!company) notFound();

  const co = company as any;
  const analysisSummary = co.analysis_summary ?? null;
  const axesShort = co.analysis_axes_short ?? null;
  const axesMid = co.analysis_axes_mid ?? null;
  const axesLong = co.analysis_axes_long ?? null;
  const analysisMarket = co.analysis_market ?? null;
  const visualizationData = co.visualization_data ?? null;

  let initialAnalysis: any = null;
  if (analysisSummary) {
    initialAnalysis = {
      ...analysisSummary,
      axes: {
        ultra_short: axesShort ? Object.values(axesShort) : [],
        short: axesMid ? Object.values(axesMid) : [],
        long: axesLong ? Object.values(axesLong) : [],
      },
      market_data: analysisMarket,
      is_new_format: true,
    };
  } else if (co.analysis_detail) {
    initialAnalysis = { ...co.analysis_detail, is_new_format: false };
  }

  // 無料公開対象の銘柄かどうか(月初3銘柄まで)はfetchIpoCompanies側で計算済み
  const isFreeCompany = (allCompanies as any[] | null)?.find((c) => c.id === company.id)?.is_free ?? false;
  const hasAccess = await checkAccess(company.id, isFreeCompany);
  console.error("課金判定診断:", "company.id=", company.id, "isFreeCompany=", isFreeCompany, "hasAccess=", hasAccess);

  // アクセス権が無い場合は、要約・スコアなどの「無料プレビュー」部分だけ残し、
  // 詳細分析(軸別スコア・シナリオ・インサイト)はクライアントに一切送らない
  if (initialAnalysis && !hasAccess) {
    initialAnalysis = {
      summary: initialAnalysis.summary,
      total_score: initialAnalysis.total_score,
      grade: initialAnalysis.grade,
      ultra_short_grade: initialAnalysis.ultra_short_grade,
      short_grade: initialAnalysis.short_grade,
      long_grade: initialAnalysis.long_grade,
      is_new_format: initialAnalysis.is_new_format,
      // 「魅力」は最初の1件だけ無料で見せる(残りと、売り時・注意点は有料)
      highlights: initialAnalysis.highlights?.charms?.length
        ? {
            tagline: initialAnalysis.highlights.tagline ?? "",
            charms: initialAnalysis.highlights.charms.slice(0, 1),
            charms_total: initialAnalysis.highlights.charms.length,
          }
        : null,
    };
  }

  const ticker = co.ticker;
  const canonicalId = ticker ?? company.id;

  // 結論＋主要数値表で使う「公開情報」だけを取り出す(主幹事・ロックアップ期間は目論見書の表紙や条項にある事実)。
  // structured_data 全体は有料部分なので、閲覧権がなくてもこの2つ以外は渡さない。
  const ipoDetails = co.structured_data?.ipo_details ?? {};
  const pick = (v: any) => (typeof v === "string" && v.trim() && !/記載なし|未定/.test(v) ? v.trim() : null);
  const keyFacts = { underwriters: pick(ipoDetails.underwriters), lockupPeriod: pick(ipoDetails.lockup_period) };
  const faq = buildKeyFaq(co, keyFacts);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": `${company.name}${ticker ? `（${ticker}）` : ""}のIPO｜上場日・公募価格・ロックアップ・買い方`,
    "inLanguage": "ja",
    "about": { "@type": "Corporation", "name": company.name, ...(ticker ? { "tickerSymbol": ticker } : {}) },
    "description": analysisSummary?.summary ?? `${company.name}のIPO分析`,
    "publisher": {
      "@type": "Organization",
      "name": "大手町調査室九課",
      "url": "https://ipo-us.finance-tower.com",
    },
    "datePublished": company.listing_date ?? new Date().toISOString(),
    "dateModified": analysisSummary?.generated_at ?? company.listing_date ?? new Date().toISOString(),
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `https://ipo-us.finance-tower.com/analysis/${canonicalId}`,
    },
  };

  // 画面に表示している主要数値表と同じ内容を、よくある質問の形でも伝える
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faq.map((f) => ({ "@type": "Question", "name": f.q, "acceptedAnswer": { "@type": "Answer", "text": f.a } })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <AnalysisClient
        company={(hasAccess ? company : {
          ...co,
          analysis_detail: null, analysis_summary: null,
          analysis_axes_short: null, analysis_axes_mid: null, analysis_axes_long: null,
          analysis_market: null, structured_data: null, raw_prospectus: null, visualization_data: null,
        }) as any}
        initialAnalysis={initialAnalysis}
        visualizationData={hasAccess ? visualizationData : null}
        allCompanies={allCompanies as any[]}
        hasAccess={hasAccess}
        keyFacts={keyFacts}
      />
    </>
  );
}