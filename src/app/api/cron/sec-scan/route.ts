import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyAdmin } from "@/lib/notify-admin";
import Anthropic from "@anthropic-ai/sdk";
import {
  SEC_USER_AGENT, fetchSubmissions, fetchDocText, extractBusinessExcerpt, extractTerms, sleep,
  isExcludedByName, isBlankCheckText,
} from "@/lib/sec-edgar";
import { xDraftBlock } from "@/lib/x-link";
import { STYLE_RULE } from "@/lib/writing-style";

// 事業内容の要約に使うモデル(Haiku 4.5。将来Haiku 5.5へ変える場合はここだけ変更)
const SUMMARY_MODEL = "claude-haiku-4-5";

// 1回の実行で複数社を処理するため、最大実行時間を60秒に延ばす
export const maxDuration = 60;

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    // 日次インデックスの日付は「20261015」の形式。SECの提出書類一覧と比べられるよう「2026-10-15」に直す
    const rawDate = line.slice(86, 98).trim();
    const dateFiled = /^\d{8}$/.test(rawDate) ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}` : rawDate;
    const fileName = line.slice(98).trim();
    if (formType && cik && fileName) {
      rows.push({ formType, companyName, cik, dateFiled, fileName });
    }
  }
  return rows;
}

// 2026/10変更: 「上場が決まった銘柄」だけを拾うため、登録の対象を次の書類に広げ、
// 本文に価格帯(または公募価格)が書かれているものだけを登録する。
//   ・S-1 / F-1(外国企業) / S-1/A / F-1/A … 価格帯が書かれていれば、募集が始まった(ロードショー)とみなす
//   ・424B4 … 最終目論見書(価格決定)
// 価格帯が空欄($[●])の「上場申請だけの段階」は、まだ上場が決まっていないため登録しない。
const CANDIDATE_FORMS = new Set(["S-1", "S-1/A", "F-1", "F-1/A", "424B4"]);
function isCandidate(row: IdxRow): boolean {
  return CANDIDATE_FORMS.has(row.formType);
}
// すでに上場している会社の増資は、新規IPOではない。見分け方:
//   ・年次・四半期報告書(10-K・10-Q・20-F・40-F)を、この書類より前に出している
//   ・この書類より30日以上前に、すでに最終目論見書(424B4など)を出している
// (8-K・6-Kは、上場前後にも出るため、見分けには使わない)
const REPORT_FORMS = new Set(["10-K", "10-Q", "20-F", "40-F"]);

// 日次インデックスのファイル名(例: edgar/data/1234567/0001234567-26-000123.txt)から書類番号を取り出す
function accessionFromFileName(fileName: string): string | null {
  const m = fileName.match(/(\d{10}-\d{2}-\d{6})\.txt$/);
  return m ? m[1] : null;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const results: string[] = [];
  const startedAt = Date.now();

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

  // 直近5日分の書類をまとめて集め、同じ会社は1件にする(価格決定=424B4を優先し、残りは順番を混ぜる)
  const allRows: IdxRow[] = [];
  for (const date of dates) {
    try {
      allRows.push(...(await fetchDailyIndex(date)));
    } catch {
      continue; // タイムアウト等は次の日付へ
    }
  }
  const byCik = new Map<string, IdxRow>();
  for (const r of allRows.filter(isCandidate)) {
    const cur = byCik.get(r.cik);
    if (!cur || (r.formType === "424B4" && cur.formType !== "424B4")) byCik.set(r.cik, r);
  }
  const candidates = Array.from(byCik.values()).sort((a, b) => {
    const pa = a.formType === "424B4" ? 0 : 1, pb = b.formType === "424B4" ? 0 : 1;
    return pa !== pb ? pa - pb : Math.random() - 0.5;
  });

  {
    for (const row of candidates) {
      // 秒間10リクエストのSEC制限を守るため軽くウェイトを入れる
      await sleep(150);

      // 2026/10追加: SPAC・ファンド・ETF等は、通常のIPO銘柄ではないため自動登録しない
      // (登録済みのものより先に判定する。手動で登録したい場合は管理画面から追加できる)
      if (isExcludedByName(row.companyName)) {
        results.push(`スキップ(SPAC・ファンド等): ${row.companyName}`);
        continue;
      }

      const already = (existing ?? []).find(c => c.cik === row.cik);
      if (already) {
        results.push(`スキップ(登録済み): ${row.companyName}`);
        continue;
      }

      // 関数の制限時間(60秒)に収める。時間切れで見送った会社は、翌日以降のスキャンで再び見つかる
      if (Date.now() - startedAt > 38000) {
        results.push(`持ち越し(時間切れ): ${row.companyName}（CIK:${row.cik}）`);
        continue;
      }

      // 既上場企業(ティッカーシンボルを既に持っている)は新規IPOではないため除外
      // 情報が取れない場合は「新規の可能性あり」として扱う(誤って除外しないよう安全側)
      const sub = await fetchSubmissions(row.cik);
      const isPriced = row.formType === "424B4";
      // 価格決定(424B4)の時点では、EDGAR上のティッカー欄がすでに埋まっていることがあるため、ここでは見ない
      if (!isPriced && sub && sub.tickers.length > 0) {
        results.push(`スキップ(既上場企業): ${row.companyName}（CIK:${row.cik}）`);
        continue;
      }
      const earlierDay = (d: string) => {
        const t = new Date(d + "T00:00:00Z");
        if (isNaN(t.getTime())) return ""; // 日付を読めなければ、この判定は行わない
        t.setUTCDate(t.getUTCDate() - 30);
        return t.toISOString().slice(0, 10);
      };
      if (sub && sub.filings.some((f) =>
        (REPORT_FORMS.has(f.form) && f.filed < row.dateFiled) ||
        ((f.form === "424B4" || f.form === "424B1") && !!earlierDay(row.dateFiled) && f.filed < earlierDay(row.dateFiled))
      )) {
        results.push(`スキップ(既上場企業・増資など): ${row.companyName}（CIK:${row.cik}）`);
        continue;
      }

      // 提出書類本体のURLを組み立てる
      // fileName例: edgar/data/1234567/0001234567-26-000123.txt
      const docUrl = `https://www.sec.gov/Archives/${row.fileName}`;

      try {
        // 2026/10変更: 会社名だけでAIに事業内容を推測させるのをやめ、S-1の本文(目論見書要約)から要約する。
        // (無名の上場前企業はAIが知らず、もっともらしい作り話が入るおそれがあったため)
        const acc = accessionFromFileName(row.fileName);
        const filing = acc ? sub?.filings.find((f) => f.accession === acc) : undefined;
        const docText = filing?.url ? await fetchDocText(filing.url, 20000) : null;
        // 会社名にAcquisition等が入っていないSPACも、本文(blank check company等の記載)で見分けて除外する
        if (docText && isBlankCheckText(docText)) {
          results.push(`スキップ(SPAC): ${row.companyName}（CIK:${row.cik}）`);
          continue;
        }
        const terms = docText ? extractTerms(docText, isPriced) : null;
        // 価格帯(または公募価格)の記載がなければ、上場はまだ先。登録せず、翌日以降に再確認する
        if (!terms || terms.priceLow == null) {
          results.push(`見送り(価格帯の記載なし・上場はまだ先): ${row.companyName}（${row.formType}）`);
          continue;
        }

        let analysis: any = {
          sector: "不明",
          biz_type: "不明",
          ai_summary: "自動検出のためS-1本文を取得できていません。管理画面のSTEP 1(SEC書類の取得)の後に、事業内容が反映されます。",
        };
        let fromDoc = false;

        if (docText) {
          const excerpt = extractBusinessExcerpt(docText, 6000);
          const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
          const analysisMsg = await claude.messages.create({
            model: SUMMARY_MODEL,
            max_tokens: 700,
            messages: [{
              role: "user",
              content:
                `次は、米国の新規上場(IPO)候補企業「${row.companyName}」がSECに提出したS-1(登録届出書)の冒頭の要約部分です。` +
                `この文章に書かれている内容だけを根拠に、事業内容を日本語でまとめてください。` +
                `書かれていないことは推測せず、分からない項目は「不明」としてください。` +
                `JSON形式のみで回答してください(前後の説明文は不要)。\n\n` +
                `{"sector":"業種名(日本語)","biz_type":"事業内容の一言説明(日本語・30字程度)","ai_summary":"150文字程度の事業概要説明(日本語)"}\n\n` +
                STYLE_RULE.trimStart() + `\n--- S-1の本文(抜粋) ---\n${excerpt}`,
            }],
          });
          const rawAnalysis = (analysisMsg.content[0] as any).text ?? "";
          const jsonMatch = rawAnalysis.match(/\{[\s\S]*\}/);
          try {
            analysis = JSON.parse(jsonMatch ? jsonMatch[0] : rawAnalysis.replace(/```json|```/g, "").trim());
            fromDoc = true;
          } catch {
            analysis = {
              sector: "不明",
              biz_type: "不明",
              ai_summary: "S-1の要約に失敗しました。管理画面のSTEP 1の後に、事業内容が反映されます。",
            };
          }
        }

        const docUrlToSave = filing?.url || docUrl;

        const { error: insertError } = await supabase
          .from("ipo_companies")
          .insert({
            name: row.companyName,
            cik: row.cik,
            sec_doc_url: docUrlToSave,
            exchange: terms?.exchange ?? "NASDAQ/NYSE(要確認)",
            ticker: terms?.ticker ?? null,
            price_range_min: terms?.priceLow ?? null,
            price_range_max: terms?.priceHigh ?? null,
            sector: analysis.sector,
            biz_type: analysis.biz_type,
            ai_summary: analysis.ai_summary,
            status: "自動検出・要確認",
          });

        if (insertError) {
          results.push(`❌ 新規登録失敗: ${row.companyName} - ${insertError.message}`);
        } else {
          results.push(`🆕 新規IPO候補として自動登録: ${row.companyName}（CIK:${row.cik}）`);
          const priceText = terms.priceLow === terms.priceHigh ? `$${terms.priceLow}` : `$${terms.priceLow}〜$${terms.priceHigh}`;
          const xDraft =
            (isPriced
              ? `【米国IPO】${row.companyName}が公募価格を決定(${priceText})\n\n`
              : `【米国IPO】${row.companyName}が募集条件を発表(価格帯 ${priceText})\n\n`) +
            `${analysis.biz_type && analysis.biz_type !== "不明" ? analysis.biz_type + "\n\n" : ""}` +
            `詳しい分析は準備ができ次第お届けします。\n\n#米国IPO #IPO`;
          await notifyAdmin(
            `🆕 米国新規IPO発見: ${row.companyName}`,
            `SEC EDGARで、価格${isPriced ? "が決まった" : "帯が発表された"}新規上場候補(${row.formType}提出)を発見し、自動登録しました。\n\n` +
            `価格: ${priceText}\n` +
            `会社名: ${row.companyName}\n` +
            `CIK: ${row.cik}\n` +
            `提出日: ${row.dateFiled}\n` +
            `書類URL: ${docUrlToSave}\n` +
            `業種: ${analysis.sector}\n` +
            `事業内容: ${analysis.biz_type}${fromDoc ? "" : "(S-1本文から取得できていません)"}\n\n` +
            `管理画面から分析を進めてください。\n` +
            `https://ipo-us.finance-tower.com/admin\n\n` +
            xDraftBlock(xDraft),
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