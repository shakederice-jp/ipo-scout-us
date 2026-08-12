import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyAdmin } from "@/lib/notify-admin";
import Anthropic from "@anthropic-ai/sdk";

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// SECのフェアアクセスポリシーに従い、組織名+連絡先を名乗るUser-Agentを付与する
const SEC_USER_AGENT = "ipo-scout-us shakederice@gmail.com";

type IdxRow = {
  formType: string;
  companyName: string;
  cik: string;
  dateFiled: string;
  fileName: string; // 例: edgar/data/1234567/0001234567-26-000123.txt
};

// EDGARの日次インデックス(form.YYYYMMDD.idx)を取得してパースする
async function fetchDailyIndex(date: Date): Promise<IdxRow[]> {
  const yyyy = date.getFullYear();
  const qtr = Math.floor(date.getMonth() / 3) + 1;
  const yyyymmdd = date.toISOString().slice(0, 10).replace(/-/g, "");
  const url = `https://www.sec.gov/Archives/edgar/daily-index/${yyyy}/QTR${qtr}/form.${yyyymmdd}.idx`;

  const res = await fetch(url, {
    headers: { "User-Agent": SEC_USER_AGENT },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return []; // 休日・週末は該当日のファイルが存在しない

  const text = await res.text();
  const lines = text.split("\n");

  // ヘッダー行(区切り線 "-----...")の次の行からがデータ本体
  const startIdx = lines.findIndex(l => l.startsWith("----"));
  if (startIdx === -1) return [];

  const rows: IdxRow[] = [];
  for (const line of lines.slice(startIdx + 1)) {
    if (!line.trim()) continue;
    // 固定幅フォーマット: Form Type / Company Name / CIK / Date Filed / File Name
    const formType = line.slice(0, 12).trim();
    const companyName = line.slice(12, 74).trim();
    const cik = line.slice(74, 86).trim();
    const dateFiled = line.slice(86, 98).trim();
    const fileName = line.slice(98).trim();
    if (formType && cik && fileName) {
      rows.push({ formType, companyName, cik, dateFiled, fileName });
    }
  }
  return rows;
}

// 新規上場の登録届出書(S-1、修正版のS-1/Aは除外)のみを対象にする
function isNewRegistration(row: IdxRow): boolean {
  return row.formType === "S-1";
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const results: string[] = [];

  // 直近5日分(土日を含む)をスキャン。土日はファイルが無いだけなので空配列が返る
  const dates: Date[] = [];
  for (let i = 0; i <= 4; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d);
  }

  // 既存銘柄をCIKで突き合わせるため取得
  const { data: existing } = await supabase
    .from("ipo_companies")
    .select("id, cik, name");

  for (const date of dates) {
    let rows: IdxRow[] = [];
    try {
      rows = await fetchDailyIndex(date);
    } catch {
      continue; // タイムアウト等は次の日付へ
    }

    const newRegs = rows.filter(isNewRegistration);

    for (const row of newRegs) {
      // 秒間10リクエストのSEC制限を守るため軽くウェイトを入れる
      await new Promise(r => setTimeout(r, 150));

      const already = (existing ?? []).find(c => c.cik === row.cik);
      if (already) {
        results.push(`スキップ(登録済み): ${row.companyName}`);
        continue;
      }

      // 提出書類本体のURLを組み立てる
      // fileName例: edgar/data/1234567/0001234567-26-000123.txt
      const docUrl = `https://www.sec.gov/Archives/${row.fileName}`;

      try {
        const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const analysisMsg = await claude.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 512,
          messages: [{
            role: "user",
            content: `米国の新規上場(IPO)候補企業「${row.companyName}」(SEC CIK: ${row.cik})について、一般的な知識をもとに事業内容を推定してください。JSON形式のみで回答してください（前後の説明文は不要）。\n\n{"sector":"業種名(日本語)","biz_type":"事業内容の一言説明(日本語)","ai_summary":"150文字程度の事業概要説明(日本語)"}`
          }],
        });
        const rawAnalysis = (analysisMsg.content[0] as any).text;
        const jsonMatch = rawAnalysis.match(/\{[\s\S]*\}/);
        const analysisText = jsonMatch ? jsonMatch[0] : rawAnalysis.replace(/```json|```/g, "").trim();
        let analysis: any;
        try {
          analysis = JSON.parse(analysisText);
        } catch {
          analysis = { sector: "不明", biz_type: "不明", ai_summary: "自動検出のため詳細情報は後日更新されます" };
        }

        const { error: insertError } = await supabase
          .from("ipo_companies")
          .insert({
            name: row.companyName,
            cik: row.cik,
            sec_doc_url: docUrl,
            exchange: "NASDAQ/NYSE(要確認)",
            sector: analysis.sector,
            biz_type: analysis.biz_type,
            ai_summary: analysis.ai_summary,
            status: "自動検出・要確認",
          });

        if (insertError) {
          results.push(`❌ 新規登録失敗: ${row.companyName} - ${insertError.message}`);
        } else {
          results.push(`🆕 新規IPO候補として自動登録: ${row.companyName}（CIK:${row.cik}）`);
          await notifyAdmin(
            `🆕 米国新規IPO発見: ${row.companyName}`,
            `SEC EDGARで新規上場候補(S-1提出)を発見し、自動登録しました。\n\n` +
            `会社名: ${row.companyName}\n` +
            `CIK: ${row.cik}\n` +
            `提出日: ${row.dateFiled}\n` +
            `書類URL: ${docUrl}\n` +
            `業種: ${analysis.sector}\n\n` +
            `管理画面から分析を進めてください。\n` +
            `https://ipo-us.finance-tower.com/admin`,
            "info"
          );
        }
      } catch (e: any) {
        results.push(`❌ 新規登録エラー: ${row.companyName} - ${String(e)}`);
      }
    }
  }

  const errors = results.filter(r => r.startsWith("❌"));
  if (errors.length > 0) {
    await notifyAdmin(
      `SECスキャン エラーあり（${errors.length}件）`,
      `実行日時: ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}\n\n結果:\n${results.join("\n")}`,
      "warn"
    );
  }

  return NextResponse.json({ success: true, results });
}
