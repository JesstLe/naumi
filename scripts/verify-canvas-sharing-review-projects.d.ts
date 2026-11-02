/** Test-only port. The runner loads the unmodified current CanvasClient grouping
 * body through esbuild, never a fabricated implementation or a product stub. */
export function actualProjects(works: any[], names: Record<string, string>, textNodes?: any[], videoNodes?: any[], timelineNodes?: any[]): { projects: Array<{ key: string }> };
