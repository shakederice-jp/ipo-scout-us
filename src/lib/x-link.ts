// 管理者宛メールに入れる「𝕏 この原稿で投稿する → このリンクを開く」の共通部品(米国版)。
// Xの投稿画面に原稿を入力済みの状態で開くリンクを作るだけで、API料金はかからない。

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildXPostUrl(text: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text.trim())}`;
}

// notifyAdmin の本文(HTMLにそのまま入る)に追記する用
export function xPostLinkHtml(text: string, label = "この原稿で投稿する"): string {
  return `𝕏 ${label} → <a href="${buildXPostUrl(text)}">このリンクを開く</a>`;
}

// 原稿(表示用に文字を置き換えたもの)+リンクを1つにまとめた文字列
export function xDraftBlock(text: string): string {
  return `▼ X投稿の原稿\n\n${escapeHtml(text)}\n\n${xPostLinkHtml(text)}`;
}
