import type {Artwork} from "../mock-data";
import type {CanvasPoint} from "./stable-placement";
import {assertGenerationResultsPresent} from "./generation-failure";
import {canvasImageTaskHeaders,type CanvasImageTaskScope} from "./image-task-scope";
import {readImagegenResponse} from "../imagegen/http";
import type {CanvasImageAttachment} from "./image-versions";
import type {CanvasHistoryAction} from "./history-model";

export type CanvasResultImage={id:string;url?:string;width?:number;height?:number};
type Layout={kind:"pixels";gap:number}|{kind:"detail";gap:number;height:(art:Artwork)=>number}|{kind:"single"}|{kind:"offset";step:number};
type Services={
  position:()=>CanvasPoint|undefined;layout:Layout;saveErrorText:string;
  merge:(ids:string[],current:()=>boolean)=>Promise<Artwork[]>;
  history:(ids:string[],artworks:Artwork[])=>void;
  attached?:(images:CanvasResultImage[],artworks:Artwork[])=>Promise<void>|void;
};

/** Only attachment belongs here, not submission/billing/polling. Successfully
 * placed outputs are not moved again during recovery. Undo is recorded once for
 * each attached group, including partial delivery. All requests use task scope. */
export function createCanvasResultAttachment(input:Services){
  const placed=new Set<string>(),recorded=new Set<string>();let linked=false;
  return async(scope:CanvasImageTaskScope,images:CanvasResultImage[])=>{
    scope.assertCurrent();const ids=images.map(image=>image.id),point=input.position();
    let metadata=new Map<string,Artwork>();
    if(input.layout.kind==="detail"&&images.some(image=>!placed.has(image.id))){
      const headers=await canvasImageTaskHeaders(scope),response=await fetch(`/api/artworks/get?ids=${ids.map(encodeURIComponent).join(",")}`,{cache:"no-store",headers});
      const body=await readImagegenResponse<{artworks:Artwork[]}>(response,input.saveErrorText);scope.assertCurrent();
      assertGenerationResultsPresent(ids,body.artworks||[]);metadata=new Map(body.artworks.map(art=>[art.id,art]));
    }
    let y=point?.y??0;
    for(const [index,image] of images.entries()){
      if(!placed.has(image.id)&&point){
        const headers=await canvasImageTaskHeaders(scope);headers.set("content-type","application/json");scope.assertCurrent();
        const offset=input.layout.kind==="offset"?index*input.layout.step:0;
        const body={...(input.layout.kind==="single"||input.layout.kind==="offset"?{}:{email:scope.owner}),id:image.id,x:Math.round(point.x+offset),y:Math.round(y+offset)};
        const response=await fetch("/api/artworks/position",{method:"POST",headers,body:JSON.stringify(body)});
        await readImagegenResponse(response,input.saveErrorText);placed.add(image.id);scope.assertCurrent();
      }
      if(input.layout.kind==="pixels")y+=(image.height||110)+input.layout.gap;
      if(input.layout.kind==="detail"&&metadata.size)y+=input.layout.height(metadata.get(image.id)!)+input.layout.gap;
    }
    const artworks=await input.merge(ids,scope.isCurrent);scope.assertCurrent();assertGenerationResultsPresent(ids,artworks);
    if(!linked){await input.attached?.(images,artworks);scope.assertCurrent();linked=true;}
    const added=ids.filter(id=>!recorded.has(id));
    if(added.length){input.history(added,artworks);added.forEach(id=>recorded.add(id));}
    return artworks;
  };
}

/** An in-place result changes the existing display, never its canvas placement.
 * Task completion and explicit original-receipt recovery share this path. A
 * later version choice stays authoritative and cannot become a new undo step. */
export function createCanvasImageVersionAttachment(input:{
  nodeId:string;merge:Services["merge"];
  history?:(action:Extract<CanvasHistoryAction,{kind:"image-version"}>)=>void;
}){
  const recorded=new Set<string>();
  return async(scope:Pick<CanvasImageTaskScope,"assertCurrent"|"isCurrent">,attachment:CanvasImageAttachment|undefined)=>{
    scope.assertCurrent();
    if(!attachment||attachment.nodeId!==input.nodeId)throw new Error("生成已完成，节点版本尚未同步；请检查原任务，不要重复生成");
    if(attachment.reason==="deleted")throw new Error("原节点已删除，生成结果已保存在创作记录");
    const fresh=await input.merge([input.nodeId],scope.isCurrent);scope.assertCurrent();
    assertGenerationResultsPresent([input.nodeId],fresh);
    const node=fresh.find(art=>art.id===input.nodeId)!;
    if((node.canvasImageRevision||0)<attachment.revision)throw new Error("节点版本尚未同步，请检查原任务");
    if(attachment.applied&&node.canvasImageRevision===attachment.revision){
      if(node.canvasImageVersionId!==attachment.versionId)throw new Error("节点版本尚未同步，请检查原任务");
      const key=JSON.stringify([attachment.nodeId,attachment.versionId,attachment.revision]);
      if(input.history&&!recorded.has(key)){
        input.history({kind:"image-version",id:input.nodeId,from:{versionId:attachment.previousVersionId,image:attachment.previousImage},to:{versionId:attachment.versionId,image:node.image}});
        recorded.add(key);
      }
    }
    return fresh;
  };
}
