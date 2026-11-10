import {storyboardProductionRoute} from "@/lib/storyboard/production-route";
import {applyStoryboardRoughcut} from "@/lib/storyboard/production-service";
export const runtime="nodejs",dynamic="force-dynamic";
export function POST(request:Request){return storyboardProductionRoute(request,applyStoryboardRoughcut);}
