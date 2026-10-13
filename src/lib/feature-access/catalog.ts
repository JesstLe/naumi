import { TOOLS } from "@/lib/tool-meta";

/** One catalogue for administrator configuration, navigation and request gates. */
export const ACCESS_FEATURES = [
  { id: "workspace", label: "工作台", group: "基础页面", href: "/dashboard" },
  { id: "tools", label: "创作工具中心", group: "基础页面", href: "/tools" },
  { id: "canvas", label: "画布", group: "基础页面", href: "/canvas" },
  { id: "works", label: "作品库", group: "基础页面", href: "/works" },
  { id: "templates", label: "模板库", group: "基础页面", href: "/templates" },
  { id: "team", label: "团队管理", group: "基础页面", href: "/team" },
  { id: "comfyui", label: "ComfyUI 工作流", group: "创作功能", href: "" },
  ...TOOLS.map(tool => ({ id: tool.slug, label: tool.key, group: tool.category, href: tool.href })),
];
export type AccessPolicy = { mode: "default" | "custom"; allowed: string[]; version: number };
export const ALL_FEATURE_IDS = ACCESS_FEATURES.map(feature => feature.id);
export const DEFAULT_POLICY: AccessPolicy = { mode: "default", allowed: ALL_FEATURE_IDS, version: 0 };
export function allows(policy: AccessPolicy, feature: string) {
  return ALL_FEATURE_IDS.includes(feature) && (policy.mode === "default" || policy.allowed.includes(feature));
}
export function pageFeature(raw: string): string | undefined {
  const path = raw.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (path === "/brain" || path === "/genchat") return "agent";
  return ACCESS_FEATURES.find(feature => feature.href && (path === feature.href || path.startsWith(feature.href + "/")))?.id;
}
export type AccessRequirement = { all?: string[]; any?: string[] };
export function meets(policy: AccessPolicy, requirement: AccessRequirement) {
  return (requirement.all || []).every(id => allows(policy, id)) && (!requirement.any || requirement.any.some(id => allows(policy, id)));
}
/** Shared data endpoints retain existing ownership checks. Entry headers/body never grant authority. */
export function requestRequirement(path: string, method = "GET"): AccessRequirement | undefined {
  path = decodeURIComponent(path).replace(/\/+$/, "");
  if (!path.startsWith("/api/")) { const id = pageFeature(path); return id ? { all: [id] } : undefined; }
  if (path.startsWith("/api/canvas/assistant")) return { all: ["canvas", "agent"] };
  if (/^\/api\/canvas\/(image-tasks|expand|annotate|text-edit)(\/|$)/.test(path)) return { all: ["canvas", "generate"] };
  if (path.startsWith("/api/canvas/")) return { all: ["canvas"] };
  const root = path.split("/")[2];
  if (path === "/api/team/access") return undefined;
  if (root === "generate-image") return { any: ["generate", "batchshot", "variations", "fuse"] };
  if (path === "/api/pro/templates-export") return { all: ["templates"] };
  if (/^\/api\/video\/tasks\/[^/]+\/send-to-canvas$/.test(path)) return { all: ["video", "canvas"] };
  const aliases: Record<string, string> = { "generate-image": "generate", "title-gen": "titles", extract: "printextract", "image-skills": "agent", genchat: "agent", comfyui: "comfyui" };
  const id = aliases[root] || root;
  if (ALL_FEATURE_IDS.includes(id)) return { all: [id] };
  if (root === "templates" || root === "tpl-image") return { all: ["templates"] };
  if (root === "favorites") return { any: ["works", "canvas", "templates"] };
  if (root === "artworks" || root === "projects") return { any: ["works", "canvas"] };
  // Upload/sign/download are shared by all creative tools, not a route to enable a disabled tool.
  if (root === "media" || root === "download") return { any: ALL_FEATURE_IDS.filter(id => !["workspace", "tools", "templates"].includes(id)) };
  if (root === "prompt-assist") return { any: ["generate", "canvas", "agent", "competitors"] };
  return undefined;
}
export const TOOL_ACCESS: Record<string, string> = {
  search_templates: "templates", list_my_artworks: "works", generate_image: "generate",
  retouch_product: "retouch", recolor_product: "recolor", replicate_hot: "replicate",
  generate_suite: "suite", generate_aplus: "aplus", review_aplus_source: "aplus", continue_aplus_generation: "aplus",
  generate_packaging_3d: "packaging3d", list_comfy_workflows: "comfyui", run_comfy_workflow: "comfyui",
  generate_video: "video", extend_video: "video", edit_video: "video", get_video_task: "video", list_video_models: "video", plan_video_shot: "video", plan_video_storyboard: "video",
  cutout_image: "cutout", cutout_avatar: "avatar", upscale_image: "upscale", inpaint_image: "inpaint",
  transfer_style: "style", remove_watermark: "dewatermark", try_on_clothing: "tryon", extract_garment: "garment",
  generate_garment_3d: "garment3d", dewrinkle_clothing: "dewrinkle", extract_print: "printextract",
  check_image_ip: "ipcheck", prepare_print_file: "printfile", generate_variations: "variations", fuse_images: "fuse",
  generate_titles: "titles", list_competitor_items: "competitors", import_competitor_image: "competitors",
  analyze_competitor: "competitors", replicate_competitor: "competitors", edit_competitor: "competitors",
  get_balance: "agent", verify_image_output: "agent", list_agent_tools: "agent",
};
