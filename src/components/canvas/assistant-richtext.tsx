"use client";

import { Children, isValidElement, memo, useEffect, useMemo, useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy, Zap } from "lucide-react";
import { assistantUrl, splitAssistantContent } from "@/lib/canvas/assistant-richtext";
import styles from "./assistant-richtext.module.css";

function plainText(children: ReactNode): string {
  return Children.toArray(children).map(child => typeof child === "string" || typeof child === "number" ? String(child)
    : isValidElement<{ children?: ReactNode }>(child) ? plainText(child.props.children) : "").join("");
}

function CodeBlock({ children, english, onCopy }: { children: ReactNode; english: boolean; onCopy: (text: string) => Promise<boolean> }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (!copied) return; const timer = window.setTimeout(() => setCopied(false), 1800); return () => window.clearTimeout(timer); }, [copied]);
  const element = Children.toArray(children).find(isValidElement);
  const className = isValidElement<{ className?: string }>(element) ? element.props.className || "" : "";
  const language = /language-([\w+-]+)/.exec(className)?.[1] || (english ? "Code" : "代码");
  return <div className={styles.codeBlock}>
    <div className={styles.codeHeader}><span>{language}</span><button type="button" aria-label={english ? "Copy code" : "复制代码"}
      onClick={() => { void onCopy(plainText(children).replace(/\n$/, "")).then(ok => setCopied(ok)); }}>
      {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? english ? "Copied" : "已复制" : english ? "Copy" : "复制"}
    </button></div><pre tabIndex={0}>{children}</pre>
  </div>;
}

const remarkPlugins = [remarkGfm];
const rehypePlugins: NonNullable<React.ComponentProps<typeof Markdown>["rehypePlugins"]> = [[rehypeHighlight, { detect: false, ignoreMissing: true }]];

/** Read-only output: persisted Markdown remains unchanged; no new Agent actions. */
export const AssistantRichText = memo(function AssistantRichText({ content, light, english = false, onCopy, onGenerate }: {
  content: string; light: boolean; english?: boolean; onCopy: (text: string) => Promise<boolean>; onGenerate?: (prompt: string) => void;
}) {
  const parts = useMemo(() => splitAssistantContent(content), [content]);
  const components = useMemo<NonNullable<React.ComponentProps<typeof Markdown>["components"]>>(() => ({
    pre: ({ children }) => <CodeBlock english={english} onCopy={onCopy}>{children}</CodeBlock>,
    table: ({ children }) => <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={english ? "Table" : "表格"}><table>{children}</table></div>,
    a: ({ href, children }) => href ? <a href={href} target={href.startsWith("#") ? undefined : "_blank"} rel="noopener noreferrer">{children}</a> : <span>{children}</span>,
    img: ({ src, alt }) => src ? <img src={src} alt={alt || ""} loading="lazy" /> : <span>{alt || (english ? "Image" : "图片")}</span>,
  }), [english, onCopy]);
  return <div data-testid="assistant-richtext" data-theme={light ? "light" : "dark"} className={styles.root}>
    {parts.map((part, index) => part.kind === "generate" ? onGenerate && <button key={index} type="button" className={styles.generate}
      onClick={() => onGenerate(part.content)}><Zap size={14} /><span>{part.content}</span><strong>{english ? "Generate" : "生成"}</strong></button>
      : <Markdown key={index} remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} skipHtml urlTransform={assistantUrl} components={components}>{part.content}</Markdown>)}
  </div>;
});
