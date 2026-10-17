import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { DesktopHome } from "@/components/desktop/desktop-home";
import { WorkbenchClient } from "@/components/home/workbench-client";
import { CanvasClient } from "@/components/canvas/canvas-client";
import { CanvasErrorBoundary } from "@/components/canvas/canvas-error-boundary";
import Page_suite from "@/app/suite/page";
import Page_works from "@/app/works/page";
import Page_tools from "@/app/tools/page";
import Page_account from "@/app/account/page";
import Page_aplus from "@/app/aplus/page";
import Page_avatar from "@/app/avatar/page";
import Page_batchshot from "@/app/batchshot/page";
import Page_competitors from "@/app/competitors/page";
import Page_cutout from "@/app/cutout/page";
import Page_dewatermark from "@/app/dewatermark/page";
import Page_dewrinkle from "@/app/dewrinkle/page";
import Page_extract from "@/app/extract/page";
import Page_fuse from "@/app/fuse/page";
import Page_garment from "@/app/garment/page";
import Page_garment3d from "@/app/garment3d/page";
import Page_generate from "@/app/generate/page";
import Page_inpaint from "@/app/inpaint/page";
import Page_ipcheck from "@/app/ipcheck/page";
import Page_packaging3d from "@/app/packaging3d/page";
import Page_printfile from "@/app/printfile/page";
import Page_recolor from "@/app/recolor/page";
import Page_replicate from "@/app/replicate/page";
import Page_retouch from "@/app/retouch/page";
import Page_style from "@/app/style/page";
import Page_titles from "@/app/titles/page";
import Page_tryon from "@/app/tryon/page";
import Page_upscale from "@/app/upscale/page";
import Page_variations from "@/app/variations/page";
import Page_video from "@/app/video/page";
import Page_studio3d from "@/app/studio3d/page";
const pages = {
  "studio3d": Page_studio3d,
  "suite": Page_suite,
  "works": Page_works,
  "tools": Page_tools,
  "account": Page_account,
  "aplus": Page_aplus,
  "avatar": Page_avatar,
  "batchshot": Page_batchshot,
  "competitors": Page_competitors,
  "cutout": Page_cutout,
  "dewatermark": Page_dewatermark,
  "dewrinkle": Page_dewrinkle,
  "extract": Page_extract,
  "fuse": Page_fuse,
  "garment": Page_garment,
  "garment3d": Page_garment3d,
  "generate": Page_generate,
  "inpaint": Page_inpaint,
  "ipcheck": Page_ipcheck,
  "packaging3d": Page_packaging3d,
  "printfile": Page_printfile,
  "recolor": Page_recolor,
  "replicate": Page_replicate,
  "retouch": Page_retouch,
  "style": Page_style,
  "titles": Page_titles,
  "tryon": Page_tryon,
  "upscale": Page_upscale,
  "variations": Page_variations,
  "video": Page_video
};
export default async function DesktopPage({params,searchParams}: {params:Promise<{segments?:string[]}>;searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const {segments=[]}=await params;
 if(segments.length>1)notFound();
 const view=segments[0] || "home";
 if(view==="batchshot")redirect("/desktop/batchshot/native/workbench");
 if(view==="home")return <DesktopHome/>;
 if(view==="create")return <Suspense fallback={null}><div className="dt-module tool-page"><WorkbenchClient/></div></Suspense>;
 if(view==="canvas"){const q=await searchParams;return <div className="dt-canvas-module"><CanvasErrorBoundary><CanvasClient desktopAppearance initialProject={typeof q.project==="string" ? q.project : undefined}/></CanvasErrorBoundary></div>;}
 const Page=pages[view as keyof typeof pages];
 if(!Page)notFound();
 return <Suspense fallback={<div className="p-8">加载创作工具…</div>}><div className="dt-module tool-page"><Page/></div></Suspense>;
}
