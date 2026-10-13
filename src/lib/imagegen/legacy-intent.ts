import {imagegenRequestSchema} from "./schema";
import {resolveImagegenIntent} from "./intent";
/** Legacy requests get the same natural-language rules, without a paid classifier. */
export function legacyImagegenIntent(body:Record<string,unknown>,references=0){
 const prompt=String(body.userPrompt||body.prompt||"").trim();if(!prompt)return null;
 const parsed=imagegenRequestSchema.safeParse({version:1,operationId:"00000000-0000-4000-a000-000000000001",entry:body.origin==="canvas"?"canvas":"workbench",mode:references?"edit":"generate",prompt,inputs:references?[{artworkId:"legacy-target",role:"edit-target"}]:[],output:body.transparent===true||body.transparent==="1"?{background:"transparent",backgroundOrigin:"current-ui"}:{}});
 return parsed.success?resolveImagegenIntent(parsed.data):null;
}
