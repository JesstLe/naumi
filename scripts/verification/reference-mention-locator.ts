import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { expect, type Locator, type Page } from "@playwright/test";

/** Follow the editor's public ARIA association, not React's DOM ancestry.
 * ReferenceMentionPanel deliberately portals to body. All waits share the
 * original native interaction's single 90s action budget, including the click.
 */
export async function selectReferenceMention(
  page: Page,
  editor: Locator,
  optionName: string,
  options: { timeout?: number; menuName?: string } = {},
): Promise<{ menuId: string; optionName: string; elapsedMs: number }> {
  const timeout = options.timeout ?? 90_000, started = performance.now();
  assert.ok(Number.isFinite(timeout) && timeout > 0, "mention timeout must be positive and finite");
  const remaining = () => {
    const value = timeout - (performance.now() - started);
    assert.ok(value > 0, `REFERENCE_MENTION_BUDGET_EXHAUSTED: ${optionName}`);
    // Playwright treats zero as unlimited, so never pass a rounded-down zero.
    return Math.max(1, Math.ceil(value));
  };
  await expect(editor).toHaveAttribute("aria-expanded", "true", { timeout: remaining() });
  const controls = (await editor.getAttribute("aria-controls", { timeout: remaining() }))?.trim();
  assert.ok(controls && controls.split(/\s+/).length === 1, "REFERENCE_MENTION_SINGLE_ARIA_CONTROLS_REQUIRED");
  // JSON quoting escapes the generated id for an exact CSS attribute match;
  // the role/name intersection must still identify this one controlled menu.
  const menu = page.getByRole("listbox", { name: options.menuName ?? "选择引用素材", exact: true })
    .and(page.locator(`[id=${JSON.stringify(controls)}]`));
  await expect(menu).toHaveCount(1, { timeout: remaining() });
  await expect(menu).toBeVisible({ timeout: remaining() });
  const option = menu.getByRole("option", { name: optionName, exact: true });
  await expect(option).toBeVisible({ timeout: remaining() });
  await expect(option).toBeEnabled({ timeout: remaining() });
  await expect(editor).toHaveAttribute("aria-expanded", "true", { timeout: remaining() });
  await expect(editor).toHaveAttribute("aria-controls", controls, { timeout: remaining() });
  await option.click({ timeout: remaining() });
  return { menuId: controls, optionName, elapsedMs: performance.now() - started };
}
