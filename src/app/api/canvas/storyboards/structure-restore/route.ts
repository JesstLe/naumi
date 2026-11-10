import {storyboardProductionRoute} from "@/lib/storyboard/production-route";
import {restoreStoryboardStructure} from "@/lib/storyboard/structure-service";
export const runtime="nodejs";
export function POST(request:Request){return storyboardProductionRoute(request,restoreStoryboardStructure,true);}
