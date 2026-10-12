/** Legacy registry rows stay in storage but must not expose retired integrations. */
export const RETIRED_BUSINESS_PROJECTS = ["yutang", "scm", "review-monitor"] as const;

export function isRetiredBusinessProject(slug: string): boolean {
  return RETIRED_BUSINESS_PROJECTS.some(value => value === slug.trim().toLowerCase());
}
