import {storyboardProductionRoute} from "@/lib/storyboard/production-route";
import {inspectStoryboardStructure} from "@/lib/storyboard/structure-service";
export const runtime="nodejs";
export function POST(request:Request){return storyboardProductionRoute(request,inspectStoryboardStructure,true);}
