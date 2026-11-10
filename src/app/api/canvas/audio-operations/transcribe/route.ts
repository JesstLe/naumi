import {submitAudio} from "../submit";
export const runtime="nodejs",dynamic="force-dynamic",maxDuration=300;
export const POST=(request:Request)=>submitAudio(request,"transcribe");
