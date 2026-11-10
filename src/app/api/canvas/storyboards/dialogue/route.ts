import {storyboardProductionRoute} from "@/lib/storyboard/production-route";
import {applyStoryboardDialogue} from "@/lib/storyboard/dialogue-service";
export const runtime="nodejs",dynamic="force-dynamic";
export function POST(request:Request){return storyboardProductionRoute(request,applyStoryboardDialogue);}
