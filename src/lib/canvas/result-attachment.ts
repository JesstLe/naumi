import type {Artwork} from "../mock-data";
import type {CanvasPoint} from "./stable-placement";
import {assertGenerationResultsPresent} from "./generation-failure";
import {canvasImageTaskHeaders,type CanvasImageTaskScope} from "./image-task-scope";
import {readImagegenResponse} from "../imagegen/http";

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
