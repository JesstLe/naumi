export type DesktopArtwork = {
  id: string; image: string; title?: string; status?: string; createdAt?: string;
  prompt?: string; cost?: number; category?: string; videoUrl?: string | null;
  batchId?: string | null; parentId?: string | null; groupId?: string | null;
  source?: string | null; origin?: string | null; marked?: boolean;
};
export type DesktopText = { id: string; projectKey: string; title?: string; createdAt?: string; updatedAt?: string };
export type DesktopProject = { key: string; title: string; cover: string; count: number; updatedAt: string; nodeId?: string; suite: boolean };
export function desktopProjects(artworks: DesktopArtwork[], texts: DesktopText[], names: Record<string, string>): DesktopProject[] {
  const arts = artworks.filter(a => a.status === "completed" && (a.image || a.videoUrl));
  const byId = new Map(arts.map(a => [a.id, a]));
  const groups = new Map<string, DesktopArtwork[]>();
  for (const art of arts) {
    let root = art;
    const seen = new Set<string>();
    while (root.parentId && byId.has(root.parentId) && !seen.has(root.id)) { seen.add(root.id); root = byId.get(root.parentId)!; }
    const key = root.batchId?.startsWith("suite-") ? `batch:${root.batchId}` : `tree:${art.groupId || root.id}`;
    groups.set(key, [...(groups.get(key) || []), art]);
  }
  const projects = new Map<string, DesktopProject>();
  for (const [key, members] of groups) {
    const suite = key.startsWith("batch:");
    if (!suite && members.length === 1 && !names[key] && !members.some(a => a.origin === "canvas" || a.marked || ["canvas-add", "derived", "upload"].includes(a.source || ""))) continue;
    const sorted = [...members].sort((a,b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    const latest = sorted[0];
    projects.set(key, { key, title: names[key] || (suite ? "商品套图" : members[0].title) || "未命名项目", cover: latest.image, nodeId: latest.id, count: members.length, updatedAt: latest.createdAt || "", suite });
  }
  for (const text of texts) {
    const old = projects.get(text.projectKey);
    if (old) { old.count++; old.updatedAt = [old.updatedAt, text.updatedAt || text.createdAt || ""].sort().pop()!; }
    else projects.set(text.projectKey, {key:text.projectKey, title:names[text.projectKey] || text.title || "文字项目", cover:"", count:1, updatedAt:text.updatedAt || text.createdAt || "", suite:false});
  }
  return [...projects.values()].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
}
