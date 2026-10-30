import type {Artwork} from '../mock-data';
import {isHostedImageUrl} from '../media-url';
import type {CanvasDocumentScope} from './document-scope';
import type {CanvasPoint} from './stable-placement';
import type {CanvasPendingNode} from './scene-types';
import type {CanvasTextNode} from './text-document-model';
import type {CanvasBlankImageOptions} from './image-runs';
import {buildTextImageRequests,countTextImageReferences,type TextImageMode} from './text-image-inputs';

export type CanvasTextImageMenu={textNodeIds:string[];imageIds:string[];drafts:Record<string,string>;scope:CanvasDocumentScope;current:()=>boolean};
export type CanvasTextImageSnapshot={menu:CanvasTextImageMenu|null;submitting:boolean};
export const EMPTY_TEXT_IMAGE_RUN:CanvasTextImageSnapshot={menu:null,submitting:false};
export type CanvasTextImageContext={
  scope:CanvasDocumentScope;current:()=>boolean;writable:()=>boolean;canGenerate:boolean;ready:boolean;
  project:()=>{key:string;members:Artwork[]}|null;
  texts:()=>CanvasTextNode[];locked:(id:string)=>boolean;draft:{id:string|null;text:string};
  positions:()=>ReadonlyMap<string,CanvasPoint>;nextSequence:()=>number;gap:number;textWidth:number;imageLabel:string;maxImages:number;
  pending:(change:(nodes:CanvasPendingNode[])=>CanvasPendingNode[])=>void;
  generate:(options:CanvasBlankImageOptions)=>Promise<boolean>;
  lockedNotice:()=>void;error:(error:unknown)=>void;
};

/** Session-local text-image menu and serial application flow, not task state.
 * The existing document scope owns identity/ABA; the existing blank-image flow
 * owns requests, quotations, receipts, recovery, attachment and settlement. */
export function createCanvasTextImageRuns(){
  const buckets=new Map<string,{snapshot:CanvasTextImageSnapshot;listeners:Set<()=>void>}>();
  return {bind(scope:CanvasDocumentScope){
    let found=buckets.get(scope.key);if(!found){found={snapshot:EMPTY_TEXT_IMAGE_RUN,listeners:new Set()};buckets.set(scope.key,found);}const state=found;
    const publish=(patch:Partial<CanvasTextImageSnapshot>)=>{state.snapshot={...state.snapshot,...patch};for(const listener of state.listeners)listener();};
    const isCurrent=(menu:CanvasTextImageMenu,ctx:CanvasTextImageContext)=>menu.scope.key===scope.key&&ctx.scope.key===scope.key&&scope.viewCurrent()&&menu.scope.viewCurrent()&&ctx.scope.viewCurrent()&&menu.current()&&ctx.current()&&ctx.writable();
    const requests=(menu:CanvasTextImageMenu,mode:TextImageMode,options:{combine:boolean;useReferences:boolean},ctx:CanvasTextImageContext)=>{
      const project=ctx.project();if(!project||!isCurrent(menu,ctx))return [];
      return buildTextImageRequests({projectKey:project.key,nodes:ctx.texts(),textNodeIds:menu.textNodeIds,
        imageIds:project.members.filter(art=>!art.videoUrl&&!['workflow-decoration','workflow-placeholder'].includes(art.source||'')&&isHostedImageUrl(art.image)).map(art=>art.id),
        selectedImageIds:menu.imageIds,drafts:menu.drafts,mode,combine:options.combine,useReferences:options.useReferences,maxImages:ctx.maxImages});
    };
    return {
      getSnapshot:()=>state.snapshot,
      subscribe(listener:()=>void){state.listeners.add(listener);return()=>{state.listeners.delete(listener);};},
      isCurrent,
      open(textNodeIds:string[],imageIds:string[],ctx:CanvasTextImageContext){
        const project=ctx.project();if(!scope.viewCurrent()||!ctx.scope.viewCurrent()||!ctx.current()||ctx.scope.key!==scope.key||!ctx.writable()||!project||!ctx.canGenerate||!ctx.ready||state.snapshot.submitting)return;
        const texts=ctx.texts(),ids=[...new Set(textNodeIds)].filter(id=>texts.some(node=>node.id===id&&node.projectKey===project.key));
        if(!ids.length||ids.some(id=>ctx.locked(id)||texts.find(node=>node.id===id)?.status==='generating'))return;
        publish({menu:{textNodeIds:ids,imageIds:[...new Set(imageIds)],drafts:ctx.draft.id&&ids.includes(ctx.draft.id)?{[ctx.draft.id]:ctx.draft.text}:{},scope:ctx.scope,current:ctx.current}});
      },
      close(){if(scope.viewCurrent())publish({menu:null});},
      referenceCount(ctx:CanvasTextImageContext){
        const menu=state.snapshot.menu,project=ctx.project();if(!menu||!project||!isCurrent(menu,ctx))return 0;
        return countTextImageReferences({projectKey:project.key,nodes:ctx.texts(),textNodeIds:menu.textNodeIds,selectedImageIds:menu.imageIds});
      },
      async run(mode:TextImageMode,options:{combine:boolean;useReferences:boolean},ctx:CanvasTextImageContext):Promise<void>{
        const menu=state.snapshot.menu;if(!menu||!isCurrent(menu,ctx)||!ctx.canGenerate||!ctx.ready||state.snapshot.submitting)return;
        const current=()=>isCurrent(menu,ctx);publish({submitting:true});
        try{
          const planned=requests(menu,mode,options,ctx);if(!planned.length)return;
          if(planned.some(request=>request.textNodeIds.some(ctx.locked))){publish({menu:null});ctx.lockedNotice();return;}
          // Validate the whole plan before creating any placeholder or purchase.
          publish({menu:null});const graph=ctx.positions();
          for(const request of planned){
            if(!current())return;
            const node=ctx.texts().find(item=>item.id===request.anchorTextId&&item.projectKey===menu.scope.project);if(!node)return;
            const point=graph.get(node.id)||{x:node.canvasX,y:node.canvasY},seq=ctx.nextSequence();
            const pend:CanvasPendingNode={id:`pend-${Date.now()}-${seq}`,x:Math.round(point.x+(node.width||ctx.textWidth)+ctx.gap),y:Math.round(point.y),
              parentId:request.imageIds[0]||node.id,linked:true,label:`${ctx.imageLabel} ${seq}`,uploading:false,progress:0,inputs:[...request.imageIds,...request.textNodeIds]};
            ctx.pending(previous=>current()?[...previous,pend]:previous);
            const succeeded=await ctx.generate({pend,prompt:request.prompt,forceStandard:true,isCurrent:current});
            // False, unknown, cancellation and failure never buy the next item.
            if(!succeeded||!current())return;
          }
        }catch(error){if(current()){publish({menu:null});ctx.error(error);}}
        finally{publish({submitting:false});}
      },
    };
  }};
}
