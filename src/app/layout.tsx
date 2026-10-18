import type { Metadata } from "next";
import "./globals.css";
import Script from "next/script";
import AppHeader from "@/components/AppHeader";
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
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
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
        </AppProvider>
      </body>
    </html>
  );
}