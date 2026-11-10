import type {CanvasComfyNode} from "./comfy-node-schema";
import type {CanvasTimelineNode} from "./timeline-node-schema";
import type {CanvasAudioNode} from "./audio-node-schema";
import {isCanvasImageVersion} from "./image-versions";
import type {CanvasSceneNode} from "./scene-node-schema";
import type {CanvasCharacterNode} from "./character-node-schema";
import type {Artwork} from "@/lib/mock-data";
import type {CanvasTextNode} from "./history-model";
import type {CanvasDirectorNode} from "./director-node-schema";
import type {CanvasVideoNode} from "./video-node-schema";
import {isHostedImageUrl as hasRenderableImage} from "@/lib/media-url";
import {createProjectRootResolver} from "./project-roots";

export type CanvasProject = {
  key: string;
  members: Artwork[];
  textNodes: CanvasTextNode[];
  videoNodes?: CanvasVideoNode[];
  directorNodes?:CanvasDirectorNode[];characterNodes?:CanvasCharacterNode[];sceneNodes?:CanvasSceneNode[];audioNodes?:CanvasAudioNode[];timelineNodes?:CanvasTimelineNode[];comfyNodes?:CanvasComfyNode[];
  isSuite: boolean;
  cover: string;
  count: number;
  name: string;
  latestAt: string;
};
export type CanvasWorkflowKey="hero"|"detail"|"views"|"copy";

function rootOf(a: Artwork, byId: Map<string, Artwork>): Artwork {
  let cur = a;
  let guard = 0;
  while (cur.parentId && byId.has(cur.parentId) && guard++ < 200) {
    cur = byId.get(cur.parentId) as Artwork;
  }
  return cur;
}

function isSuiteBatch(id?: string | null): boolean {
  return !!id && id.startsWith("suite-");
}

function projectKey(a: Artwork, byId: Map<string, Artwork>, resolveRoot = (art: Artwork) => rootOf(art, byId)): string {
  const r = resolveRoot(a);
  if (isSuiteBatch(r.batchId)) return `batch:${r.batchId}`;
  // 稳定分组:优先用 group_id(删中间节点也不变,下游节点不会跑去别的项目);
  // 没有 group_id 的老数据回退到"血缘树根 id"。
  return `tree:${a.groupId || r.id}`;
}
// Blank image completion migrates its live draft to the same authoritative
// project projection as cards and deep links, including suite batches/old trees.
export {projectKey as canvasArtworkProjectKey};

/** Pure projection shared by browser cards and active project selection. */
export function canvasProjects({works,names,t,readOnly,pinnedNode,textNodes,videoNodes,directorNodes=[],characterNodes=[],sceneNodes=[],audioNodes=[],timelineNodes=[],comfyNodes=[]}:{works:Artwork[]|null;names:Record<string,string>;t:(key:string)=>string;readOnly:boolean;pinnedNode:string|null;textNodes:CanvasTextNode[];videoNodes:CanvasVideoNode[];directorNodes?:CanvasDirectorNode[];characterNodes?:CanvasCharacterNode[];sceneNodes?:CanvasSceneNode[];audioNodes?:CanvasAudioNode[];timelineNodes?:CanvasTimelineNode[];comfyNodes?:CanvasComfyNode[]}):CanvasProject[]{
    const arts = (works ?? []).filter(
      (a) => a.status === "completed" && a.origin!=="workbench" && !isCanvasImageVersion(a) && (hasRenderableImage(a.image) || Boolean(a.videoUrl))
    );
    const byId = new Map(arts.map((a) => [a.id, a]));
    const groups = new Map<string, Artwork[]>();
    const resolveRoot = createProjectRootResolver(byId);
    for (const a of arts) {
      const k = projectKey(a, byId, resolveRoot);
      const arr = groups.get(k) ?? [];
      arr.push(a);
      groups.set(k, arr);
    }
    // 画布只是"高级工作台":单一作品库不分家,但项目列表只展示真正在画布作业过的项目 ——
    //   · 套图批次(本来就是一组)
    //   · 多节点血缘树(用户在画布上迭代/衍生过)
    //   · 含"显式加入画布"的节点(上传/复制/历史/拉线衍生 = source∈下表)
    //   · 用户重命名过的(说明在意它)
    // 那些从没在画布动过的、孤张一次性生图(生图页/套图页直接产出的单图)不在画布出现,
    // 它们仍在作品库/生图页可见。轻度用户因此基本不会看到画布。
    const CANVAS_SOURCES = new Set(["canvas-add", "derived", "upload"]);
    const imageProjects: CanvasProject[] = Array.from(groups.entries())
      .map(([key, members]) => {
        members.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
        const latest = members[members.length - 1];
        const root =
          members.find((m) => !(m.parentId && byId.has(m.parentId))) ??
          members[0];
        const isSuite = key.startsWith("batch:");
        const defaultName = isSuite ? t("canvas.suiteProject") : root.title;
        return {
          key,
          members,
          textNodes: [],
          isSuite,
          cover: latest.image,
          count: members.length,
          name: names[key] ?? defaultName,
          latestAt: latest.createdAt,
        };
      })
      .filter(
        (p) =>
          // 管理员只读查看用户作品时不过滤:让单张一次性生图也能进画布(否则深链找不到→空白)
          readOnly ||
          p.isSuite ||
          p.members.length > 1 && !p.members.every(member=>member.origin==="workbench") ||
          p.members.some((m) => m.source && CANVAS_SOURCES.has(m.source)) ||
          p.members.some((m) => m.origin === "canvas") ||
          p.members.some((m) => m.marked) ||
          names[p.key] != null ||
          // ?node= 深链进来的那张(如抠图「送画布」):即使单张也放行,否则落到空列表
          (pinnedNode != null && p.members.some((m) => m.id === pinnedNode))
      );
    const projectMap = new Map(imageProjects.map((project) => [project.key, project]));
    for (const textNode of textNodes) {
      const existing = projectMap.get(textNode.projectKey);
      if (existing) {
        existing.textNodes.push(textNode);
        existing.count = existing.members.length + existing.textNodes.length;
        if (textNode.updatedAt > existing.latestAt) existing.latestAt = textNode.updatedAt;
        continue;
      }
      projectMap.set(textNode.projectKey, {
        key: textNode.projectKey,
        members: [],
        textNodes: [textNode],
        isSuite: false,
        cover: "",
        count: 1,
        name: names[textNode.projectKey] ?? textNode.title ?? t("canvas.textProject"),
        latestAt: textNode.updatedAt || textNode.createdAt,
      });
    }
    for(const videoNode of videoNodes){
      const existing=projectMap.get(videoNode.projectKey);
      if(existing){existing.videoNodes=[...(existing.videoNodes||[]),videoNode];existing.count++;if(videoNode.updatedAt>existing.latestAt)existing.latestAt=videoNode.updatedAt;}
      else projectMap.set(videoNode.projectKey,{key:videoNode.projectKey,members:[],textNodes:[],videoNodes:[videoNode],isSuite:false,cover:"",count:1,name:names[videoNode.projectKey]||videoNode.title,latestAt:videoNode.updatedAt});
    }
    for(const node of comfyNodes){
      const existing=projectMap.get(node.projectKey);
      if(existing){existing.comfyNodes=[...(existing.comfyNodes||[]),node];existing.count++;if(node.updatedAt>existing.latestAt)existing.latestAt=node.updatedAt;}
      else projectMap.set(node.projectKey,{key:node.projectKey,members:[],textNodes:[],comfyNodes:[node],isSuite:false,cover:"",count:1,name:names[node.projectKey]||node.title,latestAt:node.updatedAt});
    }
    for(const node of directorNodes){
      const existing=projectMap.get(node.projectKey);
      if(existing){existing.directorNodes=[...(existing.directorNodes||[]),node];existing.count++;if(node.updatedAt>existing.latestAt)existing.latestAt=node.updatedAt;}
      else projectMap.set(node.projectKey,{key:node.projectKey,members:[],textNodes:[],directorNodes:[node],isSuite:false,cover:"",count:1,name:names[node.projectKey]||node.title,latestAt:node.updatedAt});
    }
    for(const node of characterNodes){
      const existing=projectMap.get(node.projectKey);
      if(existing){existing.characterNodes=[...(existing.characterNodes||[]),node];existing.count++;if(node.updatedAt>existing.latestAt)existing.latestAt=node.updatedAt;}
      else projectMap.set(node.projectKey,{key:node.projectKey,members:[],textNodes:[],characterNodes:[node],isSuite:false,cover:"",count:1,name:names[node.projectKey]||node.title,latestAt:node.updatedAt});
    }
    for(const node of sceneNodes){
      const existing=projectMap.get(node.projectKey);
      if(existing){existing.sceneNodes=[...(existing.sceneNodes||[]),node];existing.count++;if(node.updatedAt>existing.latestAt)existing.latestAt=node.updatedAt;}
      else projectMap.set(node.projectKey,{key:node.projectKey,members:[],textNodes:[],sceneNodes:[node],isSuite:false,cover:"",count:1,name:names[node.projectKey]||node.title,latestAt:node.updatedAt});
    }
    for(const node of audioNodes){
      const existing=projectMap.get(node.projectKey);
      if(existing){existing.audioNodes=[...(existing.audioNodes||[]),node];existing.count++;if(node.updatedAt>existing.latestAt)existing.latestAt=node.updatedAt;}
      else projectMap.set(node.projectKey,{key:node.projectKey,members:[],textNodes:[],audioNodes:[node],isSuite:false,cover:"",count:1,name:names[node.projectKey]||node.title,latestAt:node.updatedAt});
    }
    for(const node of timelineNodes){
      const existing=projectMap.get(node.projectKey);
      if(existing){existing.timelineNodes=[...(existing.timelineNodes||[]),node];existing.count++;if(node.updatedAt>existing.latestAt)existing.latestAt=node.updatedAt;}
      else projectMap.set(node.projectKey,{key:node.projectKey,members:[],textNodes:[],timelineNodes:[node],isSuite:false,cover:"",count:1,name:names[node.projectKey]||node.title,latestAt:node.updatedAt});
    }
    const projects = Array.from(projectMap.values());
    projects.sort((a, b) => (a.latestAt < b.latestAt ? 1 : -1));
    return projects;
  }

export function canvasProjectMonths(projects:CanvasProject[],language:string){
    const formatter = new Intl.DateTimeFormat(language, {
      year: "numeric",
      month: "long",
    });
    const sections = new Map<string, { label: string; projects: CanvasProject[] }>();
    for (const project of projects) {
      const date = new Date(project.latestAt);
      const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
      const key = `${safeDate.getFullYear()}-${String(safeDate.getMonth() + 1).padStart(2, "0")}`;
      const section = sections.get(key) ?? {
        label: formatter.format(safeDate),
        projects: [],
      };
      section.projects.push(project);
      sections.set(key, section);
    }
    return Array.from(sections.entries()).map(([key, section]) => ({
      key,
      ...section,
    }));
  }
