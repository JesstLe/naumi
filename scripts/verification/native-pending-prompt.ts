import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { expect, type Locator } from "@playwright/test";

/** The native reference actions open the existing image draft, whose prompt is
 * an InlineReferenceEditor, not a textarea. These two fixture prompts are plain
 * text: reject tokens rather than pretend textContent is a generic wire reader.
 */
export async function assertPlainPendingPrompt(
  dock: Locator,
  expected: string,
  options: { timeout?: number } = {},
): Promise<{ text: string; tag: string; contentEditable: string | null; ariaReadonly: string | null; tokens: number; elapsedMs: number }> {
  const started = performance.now(), timeout = options.timeout ?? 60_000;
  assert.ok(Number.isFinite(timeout) && timeout > 0, "pending prompt timeout must be positive and finite");
  const remaining = () => {
    const value = timeout - (performance.now() - started);
    assert.ok(value > 0, "PENDING_PLAIN_PROMPT_BUDGET_EXHAUSTED");
    return Math.max(1, Math.ceil(value));
  };
  const composer = dock.getByTestId("image-reference-composer");
  await expect(composer).toHaveCount(1, { timeout: remaining() });
  const editor = composer.getByRole("textbox", { name: "节点提示词", exact: true });
  await expect(editor).toHaveCount(1, { timeout: remaining() });
  await expect(editor).toBeVisible({ timeout: remaining() });
  await expect(editor).toHaveAttribute("role", "textbox", { timeout: remaining() });
  await expect(editor).toHaveAttribute("contenteditable", "true", { timeout: remaining() });
  await expect(editor).toHaveAttribute("aria-readonly", "false", { timeout: remaining() });
  await expect(editor).toHaveAttribute("aria-multiline", "true", { timeout: remaining() });
  await expect(editor.locator("[data-inline-token]")).toHaveCount(0, { timeout: remaining() });
  await expect.poll(() => editor.textContent({ timeout: remaining() }), { timeout: remaining() }).toBe(expected);
  const snapshot = await editor.evaluate(element => ({
    text: element.textContent ?? "", tag: element.tagName,
    contentEditable: element.getAttribute("contenteditable"), ariaReadonly: element.getAttribute("aria-readonly"),
    role: element.getAttribute("role"), multiline: element.getAttribute("aria-multiline"),
    tokens: element.querySelectorAll("[data-inline-token]").length,
  }), undefined, { timeout: remaining() });
  assert.equal(snapshot.text, expected);
  assert.equal(snapshot.tag, "DIV");
  assert.equal(snapshot.role, "textbox");
  assert.equal(snapshot.contentEditable, "true");
  assert.equal(snapshot.ariaReadonly, "false");
  assert.equal(snapshot.multiline, "true");
  assert.equal(snapshot.tokens, 0);
  return { text: snapshot.text, tag: snapshot.tag, contentEditable: snapshot.contentEditable, ariaReadonly: snapshot.ariaReadonly, tokens: snapshot.tokens, elapsedMs: performance.now() - started };
}
