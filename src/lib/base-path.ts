// 2026/11/10新設(サブディレクトリ化): このアプリは https://finance-tower.com/ipo-us 配下で公開する。
// next.config.ts の basePath と同じ値。画面内リンク(<Link>)や画像(next/image)はNext.jsが自動で付けてくれるが、
// 通常の <a> タグ・fetch・location の書き換え・サーバー側のリダイレクトでは自分で付ける必要があるため、ここに集約する。
export const BASE_PATH = "/ipo-us";

// 公開サイト全体のURL(サーバー側で、リダイレクト先やメール内リンクを作るときに使う)。
// 本番ではプロキシ(finance-tower.com側の転送)を経由するため、リクエストのURLからは正しい値が取れないことがあり、固定にしている。
export const PUBLIC_ORIGIN = "https://finance-tower.com";

// "/analysis/x" → "/ipo-us/analysis/x"。すでに /ipo-us で始まっていれば二重に付けない。
export function withBase(path: string): string {
  if (path === BASE_PATH || path.startsWith(BASE_PATH + "/") || path.startsWith(BASE_PATH + "?") || path.startsWith(BASE_PATH + "#")) return path;
  if (path === "/") return BASE_PATH;
  return BASE_PATH + (path.startsWith("/") ? "" : "/") + path;
}
