import {storyboardProductionRoute} from "@/lib/storyboard/production-route";
import {applyStoryboardStructure} from "@/lib/storyboard/structure-service";
export const runtime="nodejs";
export function POST(request:Request){return storyboardProductionRoute(request,applyStoryboardStructure,true);}
