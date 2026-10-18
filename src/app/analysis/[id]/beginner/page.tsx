import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";

// 2026/10: 初心者向けページは廃止。以前のリンクから来た方は、分析レポート(1種類)へ転送する。
export default async function BeginnerRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/analysis/${encodeURIComponent(id)}`);
}
