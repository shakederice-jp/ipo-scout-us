import type { Metadata } from "next";
import "./globals.css";
import Script from "next/script";
import AppHeader from "@/components/AppHeader";
import InstallPwaButton from "@/components/InstallPwaButton";
import ReferralCapture from "@/components/ReferralCapture";
import { AppProvider } from "@/contexts/AppContext";

export const metadata: Metadata = {
  title: {
    default: "米国IPO企業情報AI分析レポート｜大手町調査室九課",
    template: "%s",
  },
  description: "AI分析で米国のIPO投資判断をサポート。初日騰落率の見通し・スコアリング・需給分析・財務分析を提供します。",
  keywords: ["IPO", "米国IPO", "新規上場", "投資", "分析", "米国株", "SEC", "S-1"],
  verification: {
    // Search Consoleの所有権確認用。米国版(ipo-us)の確認用に追加した分と、以前からある分の両方を残す
    google: ["QkiBSGZYFOhFzNmdi5-3AYgYYFSxUXuVEzStGB8IuZ8", "zxV54LwwUEhL4EUHpiVivnO2KykbnhJ3CGS6w01bYH4"],
  },
};

// 米国版専用のGA4(プロパティ「IPO Scout-US」)。以前の別サイト用ID(G-27Z6…)から差し替え
const GA_ID = "G-FQ31NQ4DV6";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&family=Inter:wght@400;500;600;700&family=Oswald:wght@500;600;700&family=Anton&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet" />
        {/* 2026/10/29追加: 「ホーム画面に追加」対応。設定ファイル・アイコン・iPhone用のアイコン名を設定し、
            Service Workerを登録する(オフラインのキャッシュ等はせず、追加できるようにするための最低限の対応)。
            ?v=2 は、古いアイコンの記憶を避けるための印。 */}
        <link rel="manifest" href="/manifest.json?v=2" />
        <meta name="theme-color" content="#1E3A66" />
        <meta name="apple-mobile-web-app-title" content="AI×IPO 米国" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2" />
        <link rel="icon" href="/icon-192.png?v=2" type="image/png" />
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
        <Script id="sw-register" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function () {
              navigator.serviceWorker.register('/sw.js').catch(function () {});
            });
          }
        `}</Script>
        <Script id="ga4-init" strategy="afterInteractive">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}');
        `}</Script>
      </head>
      <body>
        <AppProvider>
          <AppHeader />
          <div className="app-content">{children}</div>
          {/* 2026/10/29: ホーム画面に追加の案内(スマホで2ページ目以降を見たときだけ、下に小さく出る) */}
          <InstallPwaButton />
          {/* 2026/10/31: 友達紹介のリンク(?ref=コード)で来た人の紹介コードを、どのページからでも一時保存する(表示なし) */}
          <ReferralCapture />
        </AppProvider>
      </body>
    </html>
  );
}