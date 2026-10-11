import React from "react";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { AssistantRichText } from "../src/components/canvas/assistant-richtext";
import { assistantUrl, splitAssistantContent } from "../src/lib/canvas/assistant-richtext";

let checks = 0;
function check(value: unknown, label?: string) { assert.ok(value, label || `check ${checks + 1}`); checks++; }
const render = (content: string, light = true) => renderToStaticMarkup(<AssistantRichText content={content} light={light} onCopy={async () => true} onGenerate={() => { throw new Error("Render must never generate"); }} />);
const sample = "## 商品建议\n\n这是 **重点** 和 *说明*，包含 `sku`。\n\n1. 主图\n2. 详情图\n\n- [x] 已完成\n- [ ] 待确认\n\n> 注意构图\n\n| 尺寸 | 用途 |\n| --- | --- |\n| 1:1 | 主图 |\n\n```json\n{\"sku\": 123}\n```\n\n[官网](https://example.com)\n\n~~删除~~\n\n---\n";
const html = render(sample);
for (const token of ["<h2>", "<strong>", "<em>", "<ol>", "<ul", "<blockquote>", "<table>", "<th>", "<td>", "<pre", "<code", "hljs-", "复制代码", "<del>", "<hr", 'target="_blank"', 'rel="noopener noreferrer"', 'type="checkbox"', 'data-theme="light"']) check(html.includes(token), token);
check(render(sample, false).includes('data-theme="dark"'));
for (let i = 0; i <= sample.length; i++) check(render(sample.slice(0, i)).includes('data-testid="assistant-richtext"'), `prefix ${i}`);
check(render("```unknownlang\nplain text\n```").includes("plain text"));
check(render("    indented code").includes("<pre"));
check(render("<script>alert(1)</script><img src=x onerror=alert(1)>").indexOf("<script") === -1);
check(!render("[bad](javascript:alert%281%29)").includes('href="javascript:'));
check(!render("![track](https://tracking.example/pixel)").includes("<img"));
check(render("![产物](/api/media/test.png)").includes('loading="lazy"'));
for (const bad of ["javascript:alert(1)", "data:text/html,x", "vbscript:x", "//tracking.example/x", "\\evil", "java\nscript:x", " https://exa mple.com "]) check(assistantUrl(bad) === "");
for (const good of ["https://example.com", "http://example.com", "mailto:test@example.com", "/canvas", "#part"]) check(assistantUrl(good) === good);
for (const protectedText of ["`[[GEN]]literal[[/GEN]]`", "```text\n[[GEN]]literal[[/GEN]]\n```", "~~~text\n[[GEN]]literal[[/GEN]]\n~~~", "    [[GEN]]literal[[/GEN]]", "<div>[[GEN]]literal[[/GEN]]</div>"]) {
  check(splitAssistantContent(protectedText).every(part => part.kind === "markdown"));
  check(!render(protectedText).includes("<strong>生成</strong>"));
}
const parts = splitAssistantContent("before\n[[GEN]] real prompt [[/GEN]]\nafter");
check(parts.length === 3 && parts[1].kind === "generate" && parts[1].content === "real prompt");
check(render("[[GEN]]real prompt[[/GEN]]").includes("<button"));
check(!render("before [[GEN]]pending prompt").includes("pending prompt"));
check(!render("before [[GE").includes("[[GE"));
check(render("`[[GEN]]pending`").includes("pending"));
const canvas = readFileSync("src/components/canvas/canvas-client.tsx", "utf8");
const panel = readFileSync("src/components/canvas/canvas-assistant-panel.tsx", "utf8");
const orb = readFileSync("src/components/canvas/canvas-agent-orb.tsx", "utf8");
check(canvas.includes("<AssistantRichText content={content} light={lightCanvas}"));
check(canvas.includes("onActivate={toggleAssistant} light={lightCanvas}"));
check(orb.includes('theme={light ? "naumi" : "pearl"}'));
check(panel.includes("onCopy(turn.content)"));
check(panel.includes("{turn.content}</div>"));
check(!panel.includes('space-y-2 whitespace-pre-wrap break-words canvas-ui-text'));
check(canvas.includes('if(type==="done" && data.ok===true)completed=true;'));
check(canvas.includes('setAssistantOutcome(restoredOrbOutcome(data.session))'));
console.log(`AGENT_RICHTEXT=PASS checks=${checks} STREAMING_PREFIXES=${sample.length + 1} RAW_HISTORY=UNCHANGED REAL_AGENT=REUSED`);
