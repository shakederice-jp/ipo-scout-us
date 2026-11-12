// 2026/11/12新設: 「誰でも無料で読める銘柄」の判定。
// ふだんの無料枠は「毎月、上場日が早い順の最初の2銘柄」だが、注目度が特に高い銘柄(例: ANTHROPIC, PBC)は、
// その月の2枠とは別に、全員に無料で公開する。
//  ・ipo_companies.is_public_free(true/false)が入っていれば、それを最優先する(管理画面のチェックで切り替え)。
//  ・列が空(null)・未作成のときは、下の「既定の公開銘柄」(社名で判定)に当てはまるかどうかで決める。
export type PublicFreeInput = { name?: string | null; is_public_free?: boolean | null };

// 既定で全員に無料公開する銘柄(社名の先頭が一致したら対象)
const DEFAULT_PUBLIC_FREE: RegExp[] = [/^anthropic\b/i];

export function isPublicFree(c: PublicFreeInput): boolean {
  if (typeof c.is_public_free === "boolean") return c.is_public_free;
  return DEFAULT_PUBLIC_FREE.some((re) => re.test((c.name ?? "").trim()));
}

// Anthropic 専用ページ(特別なSEO)の対象かどうか
export function isAnthropicCompany(c: { name?: string | null }): boolean {
  return /^anthropic\b/i.test((c.name ?? "").trim());
}
