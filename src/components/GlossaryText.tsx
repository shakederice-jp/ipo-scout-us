"use client";
import { useState } from "react";
import { GLOSSARY } from "@/lib/glossary";

// 2026/10追加: 本文の中の難しい用語に、点線の下線と説明の吹き出しを付ける。
// ・パソコンでは、マウスを重ねると表示。スマホでは、タップで表示/もう一度タップで閉じる
// ・同じ用語は、1つの文章の中で最初に出た1回だけに付ける(下線だらけで読みにくくならないように)

const NAVY = "#1E3A66";

// 用語 → 説明 の辞書(長い用語から先に照合する)
const TERM_TEXT = new Map<string, string>();
for (const g of GLOSSARY) for (const t of g.terms) TERM_TEXT.set(t, g.text);
const SORTED_TERMS = Array.from(TERM_TEXT.keys()).sort((a, b) => b.length - a.length);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const TERM_RE = new RegExp(SORTED_TERMS.map(escapeRe).join("|"), "g");
const ASCII_ONLY = /^[A-Za-z0-9\-]+$/;
const isAlnum = (c: string | undefined) => !!c && /[A-Za-z0-9]/.test(c);

function Term({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setOpen((v) => !v)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((v) => !v); } if (e.key === "Escape") setOpen(false); }}
      style={{ position: "relative", cursor: "help", borderBottom: `1.5px dotted ${NAVY}`, color: "inherit" }}
    >
      {label}
      {open && (
        <span
          role="tooltip"
          style={{
            position: "absolute", left: 0, top: "100%", marginTop: 4, zIndex: 30,
            width: 240, maxWidth: "72vw", padding: "8px 10px", borderRadius: 8,
            backgroundColor: NAVY, color: "white", fontSize: 12, fontWeight: 500, lineHeight: 1.7,
            boxShadow: "0 4px 14px rgba(15,31,54,0.25)", whiteSpace: "normal", textAlign: "left",
          }}
        >
          <span style={{ display: "block", fontSize: 10, fontWeight: 800, color: "#A9C1E8", marginBottom: 2 }}>用語メモ：{label}</span>
          {text}
        </span>
      )}
    </span>
  );
}

// 文章を、用語の部分だけ吹き出し付きにした要素の並びにする。
// seen を共有すると、複数の段落にまたがっても、同じ用語は最初の1回だけになる。
export function withGlossary(text: string, seen: Set<string> = new Set()): React.ReactNode[] {
  if (!text) return [];
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  TERM_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TERM_RE.exec(text)) !== null) {
    const term = m[0];
    const start = m.index;
    const end = start + term.length;
    // 英数字だけの用語(PER・VCなど)は、英単語の一部(例:PERIOD)に反応しないようにする
    if (ASCII_ONLY.test(term) && (isAlnum(text[start - 1]) || isAlnum(text[end]))) continue;
    const canon = TERM_TEXT.get(term)!;
    if (seen.has(canon)) continue; // 同じ説明の用語(別表記を含む)は1回だけ
    seen.add(canon);
    if (start > last) out.push(text.slice(last, start));
    out.push(<Term key={`t${key++}`} label={term} text={canon} />);
    last = end;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// 段落(空行で区切られた文章)を、用語の説明つきで表示する
export function GlossaryParagraphs({
  text, style, firstStyle,
}: { text: string; style?: React.CSSProperties; firstStyle?: React.CSSProperties }) {
  const seen = new Set<string>();
  const paras = String(text ?? "").split(/\n\n+/);
  return (
    <>
      {paras.map((p, i) => (
        <p key={i} style={{ ...style, ...(i === 0 ? firstStyle : {}) }}>{withGlossary(p, seen)}</p>
      ))}
    </>
  );
}
