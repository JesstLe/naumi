/** Workbench prompt edits live in one localStorage object keyed by reference
 * path. The in-app workbench shares the site's ~5M-character localStorage
 * quota, so the object stays bounded. Edits re-insert their key, so the newest
 * entries are last; trimming keeps those. Pure function: no browser globals. */
export const WORKBENCH_PROMPTS_KEY = "gpt-image-pil-workbench-prompts";
export const WORKBENCH_PROMPTS_BUDGET = 300_000;

export function boundedWorkbenchPrompts(raw: string, budget = WORKBENCH_PROMPTS_BUDGET): string {
  if (raw.length <= budget) return raw;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return "{}"; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "{}";
  const entries = Object.entries(parsed as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string");
  // Estimate from the newest end, then confirm on the real serialization.
  let start = entries.length, size = 2;
  while (start > 0) {
    const [key, value] = entries[start - 1];
    const cost = JSON.stringify(key).length + JSON.stringify(value).length + 2;
    if (size + cost > budget) break;
    size += cost; start--;
  }
  let kept = entries.slice(start), text = JSON.stringify(Object.fromEntries(kept));
  while (text.length > budget && kept.length) { kept = kept.slice(1); text = JSON.stringify(Object.fromEntries(kept)); }
  return text;
}
