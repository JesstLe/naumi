import {storyboardProductionRoute} from "@/lib/storyboard/production-route";
import {prepareAudioReview} from "@/lib/storyboard/audio-review-service";
export const runtime="nodejs",dynamic="force-dynamic",maxDuration=240;
export function POST(request:Request){return storyboardProductionRoute(request,async(actor,body)=>({job:await prepareAudioReview(actor,body)}));}
