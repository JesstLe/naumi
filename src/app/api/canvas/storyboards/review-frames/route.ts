import {storyboardProductionRoute} from "@/lib/storyboard/production-route";
import {prepareReviewFrames} from "@/lib/storyboard/assisted-review-service";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=240;
export function POST(request:Request){return storyboardProductionRoute(request,async(actor,body)=>({job:await prepareReviewFrames(actor,body)}));}
