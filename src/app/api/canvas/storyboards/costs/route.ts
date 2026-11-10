import {storyboardProductionRoute} from "@/lib/storyboard/production-route";
import {inspectStoryboardCosts} from "@/lib/storyboard/cost-service";
export const runtime="nodejs";
export function POST(request:Request){return storyboardProductionRoute(request,inspectStoryboardCosts,true);}
