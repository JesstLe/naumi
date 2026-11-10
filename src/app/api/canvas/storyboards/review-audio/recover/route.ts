import {z} from "zod";
import {storyboardProductionRoute} from "@/lib/storyboard/production-route";
import {reviewTargetSchema} from "@/lib/storyboard/assisted-review";
import {getAudioReview} from "@/lib/storyboard/audio-review-service";
export const runtime="nodejs",dynamic="force-dynamic";
export function POST(request:Request){return storyboardProductionRoute(request,async(actor,body)=>{const input=z.strictObject({target:reviewTargetSchema,operationId:z.uuid()}).parse(body);return getAudioReview(actor,input.target,input.operationId,true);},true);}
