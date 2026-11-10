import {storyboardProductionRoute} from "@/lib/storyboard/production-route";
import {forkStoryboardPlan} from "@/lib/storyboard/fork-service";
export const runtime="nodejs",dynamic="force-dynamic";
export function POST(request:Request){return storyboardProductionRoute(request,forkStoryboardPlan);}
