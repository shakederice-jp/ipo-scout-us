"use client";

import { useEffect } from "react";

// 2026/10/31新設(米国版の紹介制度): 日本版の ReferralCapture と同じ。
// 招待リンクは `https://ipo-us.finance-tower.com/?ref=コード` のようにトップページへ案内する形になっているが、
// 登録画面(/auth)を直接開いた瞬間のURLにしか反応しないと、トップページを見てから別のリンクを辿って登録画面に
// 進んだ人の紹介コードが失われてしまう。これを防ぐため、サイトのどのページであっても`?ref=`付きのURLで
// 訪れた時点でコードをブラウザに一時保存しておき(30日間有効)、実際の登録時(/auth側)に読み取って使う。
// 全ページ共通のlayout.tsxから読み込む、表示なしのコンポーネント。
export default function ReferralCapture() {
  useEffect(() => {
    try {
      const urlRef = new URLSearchParams(window.location.search).get("ref");
      if (urlRef && urlRef.trim()) {
        localStorage.setItem(
          "pendingReferralCode",
          JSON.stringify({ code: urlRef.trim(), savedAt: Date.now() })
        );
      }
    } catch {
      // localStorageが使えない環境では何もしない(紹介コードが保存されないだけ)
    }
  }, []);

  return null;
}
