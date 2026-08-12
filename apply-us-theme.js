/**
 * ipo-scout-us 米国版カラー・フォント一括適用スクリプト
 * 実行方法: プロジェクトのルート(package.jsonがある場所)で
 *   node apply-us-theme.js
 * を実行してください。
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "src");

// ① カラー置換マップ（ティファニー系 → ネイビー/クリーム系）
const COLOR_MAP = {
  "66c3c6": "1E3A66", // ベース → ネイビー
  "4aafb3": "16294D", // ダーク(ホバー用) → 濃ネイビー
  "082b2e": "0F1F36", // ディープ(本文文字色) → 濃ネイビー文字
  "0d4f52": "1E3A66", // ミッド(ヘッダー・ナビ) → ネイビー
  "2a7a7e": "3D5A85", // ミュート(補助文字) → 中間ネイビー
  "e8f9f9": "E8EDF5", // ライト(カード背景) → ネイビー淡色
  "f4fbfc": "F5F4EF", // ペール(ページ背景) → クリーム
  "b3e8ea": "C7D3E3", // ボーダー → ネイビーボーダー
  "dff3f4": "E3E8F0", // ボーダー淡 → ネイビーボーダー淡
};

const exts = new Set([".ts", ".tsx", ".css"]);
let fileCount = 0;
let replaceCount = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(full);
    } else if (exts.has(path.extname(entry.name))) {
      let content = fs.readFileSync(full, "utf8");
      let changed = false;

      for (const [oldHex, newHex] of Object.entries(COLOR_MAP)) {
        const re = new RegExp("#" + oldHex, "gi");
        const matches = content.match(re);
        if (matches) {
          replaceCount += matches.length;
          content = content.replace(re, "#" + newHex);
          changed = true;
        }
      }

      // ② globals.css の変数名を tiffany → navy にリネーム
      if (full.endsWith("globals.css") && content.includes("tiffany")) {
        content = content.replace(/tiffany/g, "navy");
        changed = true;
      }

      if (changed) {
        fs.writeFileSync(full, content, "utf8");
        fileCount++;
      }
    }
  }
}

walk(ROOT);

// ③ globals.css にフォント変数・アクセントカラー変数を追記
const globalsCssPath = path.join(ROOT, "app", "globals.css");
let globalsCss = fs.readFileSync(globalsCssPath, "utf8");
if (!globalsCss.includes("--font-score")) {
  globalsCss = globalsCss.replace(
    "--navy-border-light: #E3E8F0;\n}",
    `--navy-border-light: #E3E8F0;

  /* 米国版フォント */
  --font-score:  "Anton", sans-serif;
  --font-heading:"Oswald", "Noto Sans JP", sans-serif;
  --font-body:   "Inter", "Noto Sans JP", sans-serif;
  --font-ticker: "IBM Plex Mono", monospace;

  /* 米国版アクセントカラー */
  --accent-red:    #B31942;
  --chart-blue:    #8FB6EE;
  --chart-purple:  #A99BCF;
  --chart-sakura:  #F0AFC4;
}`
  );
  fs.writeFileSync(globalsCssPath, globalsCss, "utf8");
  console.log("✓ globals.css にフォント・アクセントカラー変数を追加しました");
}

// ④ layout.tsx に Google Fonts を追加
const layoutPath = path.join(ROOT, "app", "layout.tsx");
let layout = fs.readFileSync(layoutPath, "utf8");
const oldFontLink =
  'family=Noto+Sans+JP:wght@400;500;700;900&display=swap';
const newFontLink =
  'family=Noto+Sans+JP:wght@400;500;700;900&family=Inter:wght@400;500;600;700&family=Oswald:wght@500;600;700&family=Anton&family=IBM+Plex+Mono:wght@500;600&display=swap';
if (layout.includes(oldFontLink)) {
  layout = layout.replace(oldFontLink, newFontLink);
  fs.writeFileSync(layoutPath, layout, "utf8");
  console.log("✓ layout.tsx にGoogle Fonts(Oswald/Anton/Inter/IBM Plex Mono)を追加しました");
} else {
  console.log("△ layout.tsxのフォントリンクが見つからず、スキップしました(すでに変更済みの可能性)");
}

console.log(`\n完了: ${fileCount}ファイル、${replaceCount}箇所のカラーコードを置換しました。`);
