import { createClient } from "@supabase/supabase-js";
import { isAnthropicCompany } from "@/lib/public-free";
import { ANTHROPIC_SLUG } from "@/lib/anthropic-seo";

export default async function sitemap() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: companies } = await supabase
    .from("ipo_companies")
    .select("id, name, ticker, listing_date")
    .order("listing_date", { ascending: false });

  const baseUrl = "https://finance-tower.com/ipo-us";

  const staticPages = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "daily" as const, priority: 1.0 },
    { url: `${baseUrl}/schedule`, lastModified: new Date(), changeFrequency: "daily" as const, priority: 0.95 },
    { url: `${baseUrl}/guide`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.8 },
    { url: `${baseUrl}/plans`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.6 },
    { url: `${baseUrl}/ipo-guide`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.6 },
    { url: `${baseUrl}/how-to-buy`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.7 },
    { url: `${baseUrl}/contact`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.5 },
    { url: `${baseUrl}/tokushoho`, lastModified: new Date(), changeFrequency: "yearly" as const, priority: 0.3 },
    { url: `${baseUrl}/privacy`, lastModified: new Date(), changeFrequency: "yearly" as const, priority: 0.3 },
    { url: `${baseUrl}/install`, lastModified: new Date(), changeFrequency: "yearly" as const, priority: 0.4 },
  ];

  // Anthropicは、専用のURL(/analysis/anthropic)をサイトマップに載せる(優先度も最も高く)
  const companyPages = (companies ?? []).map(c => {
    const anth = isAnthropicCompany(c as any);
    return {
      url: `${baseUrl}/analysis/${anth ? ANTHROPIC_SLUG : ((c as any).ticker ?? c.id)}`,
      lastModified: anth ? new Date() : new Date(c.listing_date ?? new Date()),
      changeFrequency: (anth ? "daily" : "weekly") as "daily" | "weekly",
      priority: anth ? 1.0 : 0.9,
    };
  });

  return [...staticPages, ...companyPages];
}