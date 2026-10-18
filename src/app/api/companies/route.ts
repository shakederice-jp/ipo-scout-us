import { getPublicCompanies } from "@/lib/get-companies";
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

  try {
    return NextResponse.json(await getPublicCompanies());
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "error" }, { status: 500 });
  }
}
