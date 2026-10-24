import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    // 2026/10/24修正: 日本版のURLが既定値になっており、日本版の通知を動かしてしまう恐れがあったため、このサイト自身のURLを使う
    const baseUrl = new URL(request.url).origin;
    const res = await fetch(`${baseUrl}/api/cron/notify`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${process.env.CRON_SECRET}`,
      },
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}