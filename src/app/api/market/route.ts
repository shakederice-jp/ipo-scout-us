import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

// Web検索つきの調査と、結果のJSON整形に使うモデル（Haiku 4.5。将来Haiku 5.5へ変える場合はここだけ変更）
const MARKET_MODEL = 'claude-haiku-4-5';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { companyId } = await req.json();
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 });

    const { data: company } = await supabase
      .from('ipo_companies')
      .select('name, sector, structured_data')
      .eq('id', companyId)
      .single();

    if (!company) return NextResponse.json({ error: 'company not found' }, { status: 404 });

    const companyName = company.name;
    const structured: any = company.structured_data || {};
    const businessDesc = structured.business_summary || structured.business_description || '';
    const sector = company.sector || structured.sector || '';
    const venue = structured.ipo_details?.listing_venue || '';
    const knownUnderwriters = structured.ipo_details?.underwriters || '';

    // Step1: Web検索で情報収集（米国市場）
    const searchResponse = await anthropic.messages.create({
      model: MARKET_MODEL,
      max_tokens: 3000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' } as any],
      messages: [{
        role: 'user',
        content: `米国IPO企業「${companyName}」（${sector}${venue ? '、' + venue : ''}）について、以下を英語・日本語どちらの情報源でも構わないので検索してください：

1. 主幹事（Lead underwriters / bookrunners）の会社名${knownUnderwriters ? `（目論見書では ${knownUnderwriters} と記載あり。裏付けがあれば確認）` : ''}
2. 競合・同業の米国上場企業（3〜5社）。必ずティッカーシンボルと特徴を含めること
3. 同業界の現在のバリュエーション水準（株価売上高倍率 P/S、EV/Sales、PERなど）
4. 直近2〜3年以内の米国（NYSE・Nasdaq）同セクターのIPO事例を5社以上。それぞれ「IPO価格（公募価格）に対する上場初日の終値の騰落率」を数値で教えてください。例：「IPO価格比+36.1%」「IPO価格比-5.2%」のように必ず数値で表してください
5. 米国IPO市場全体の最近のトレンド（IPO件数、初日騰落の傾向、金利・市場環境の影響など）

必ず複数社の初日パフォーマンスを数値付きで調べてください。`
      }],
    });

    const searchText = searchResponse.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n');

    // Step2: 収集した情報をJSONに整形
    const formatResponse = await anthropic.messages.create({
      model: MARKET_MODEL,
      max_tokens: 2500,
      messages: [{
        role: 'user',
        content: `以下の情報を元に、JSONのみで出力してください。マークダウン不要。日本語で記述すること。

収集情報：
${searchText}

企業名：${companyName}
セクター：${sector}
事業概要：${businessDesc}

【重要】
・recent_iposには必ず3〜5社を含めてください。"result"フィールドは必ず「+36.1%」「-5.2%」のように符号付きの数値パーセント（IPO価格に対する上場初日終値の騰落率）で表してください。「好調」「IPO価格を上回った」などの文章表現は不可です。
・competitorsは米国上場企業とし、ティッカーシンボル（例：CRM、SNOW）を"ticker"に必ず入れてください。ティッカーが確認できない企業は含めないでください。
・調査で確認できなかった項目は推測せず、空文字または空配列にしてください。

出力形式（JSONのみ、説明文不要）：
{
  "lead_underwriter": "主幹事（引受会社）名。複数あればカンマ区切り。不明なら空文字",
  "competitors": [{"name": "企業名", "ticker": "TICKER", "feature": "特徴"}],
  "industry_per": "業界のバリュエーション水準（P/S・EV/Sales・PERなど）",
  "recent_ipos": [
    {"name": "企業名", "date": "2025年6月", "result": "+36.1%"},
    {"name": "企業名", "date": "2025年3月", "result": "-5.2%"},
    {"name": "企業名", "date": "2024年12月", "result": "+12.0%"}
  ],
  "market_trend": "米国IPO市場のトレンド",
  "summary": "総合コメント200字"
}`
      }],
    });

    const formatText = formatResponse.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');

    let marketData: any = {};
    try {
      const clean = formatText.replace(/```json|```/g, '').trim();
      const jsonMatch = clean.match(/\{[\s\S]*\}/);
      marketData = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: formatText, raw: true };
    } catch {
      marketData = { summary: formatText, raw: true };
    }

    const { data: updated, error } = await supabase
      .from('ipo_companies')
      .update({ analysis_market: marketData })
      .eq('id', companyId)
      .select('id');

    if (error) throw error;
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: '保存できませんでした（書き込み権限を確認してください）' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: marketData });
  } catch (err: any) {
    console.error('market route error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
