import { Clapperboard, Compass, Images, PanelsTopLeft, Shapes, Sparkles } from "lucide-react";

export const creationNavigation = [
  { label: "创作", href: "/", Icon: Sparkles },
  { label: "模板中心", href: "/templates", Icon: Compass },
  { label: "创作工具", href: "/tools", Icon: Shapes },
  { label: "我的作品", href: "/works", Icon: Images },
];
export const creationWorkspaces = [
  { label: "无限画布", href: "/canvas", Icon: PanelsTopLeft },
  { label: "参考工作台", href: "/batchshot", Icon: PanelsTopLeft },
  { label: "视频工作台", href: "/video", Icon: Clapperboard },
];
