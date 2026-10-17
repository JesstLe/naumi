import type { Locator } from "@playwright/test";

/** Follow the compact mapping row's explicit configuration disclosure. */
export async function expandManagedModelConfig(row: Locator) {
  const toggle = row.locator('button[aria-controls][aria-expanded]').first();
  await toggle.waitFor({ state: "visible" });
  if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
}
