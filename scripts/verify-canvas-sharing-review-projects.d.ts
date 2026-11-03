/** Test-only port. The runner follows the actual CanvasClient import/call and loads the
 * project-catalog owner through esbuild, without copied grouping policy or a stub. */
export function actualProjects(works: any[], names: Record<string, string>, textNodes?: any[], videoNodes?: any[], timelineNodes?: any[]): { projects: Array<{ key: string }> };
