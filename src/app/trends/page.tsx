import { permanentRedirect } from "next/navigation";

// 2026/10/24廃止: マーケットトレンド(日本語ニュース由来)は米国版では提供しない。
// 以前のURLにアクセスした人・検索エンジンはトップページへ転送する。
export default function TrendsPage() {
  permanentRedirect("/");
}
