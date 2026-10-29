import type {Artwork} from '../mock-data';
import type {CanvasTextNode} from './text-document-model';
import type {CanvasPendingNode} from './scene-types';
import type {CanvasImageReference} from './image-references';
import {imageReferenceManifest} from './image-references';
import {referenceManifestError} from '../imagegen/reference-labels';
import {canvasBlankImagePrompt} from './image-creation';
import {createCanvasImageTask,type CanvasGeneratedImage} from './image-task-controller';
import {prepareCanvasImageTask,type CanvasImageGenerationOptions,type CanvasImageModelOption} from './image-task-request';
import type {CanvasImageTaskScope} from './image-task-scope';
import {generationPlaceholderSize,generationPositionForTask} from './generation-feedback';
import type {GenerationFailure} from './generation-failure';
import {normalizeCanvasCount} from './generation-parameters';
import type {CanvasGenerationRunContext} from './generation-run-context';

type Task=Parameters<typeof createCanvasImageTask>[0];
type Settings={model:string;quality:string;ratio:string;resolution:string;style:string;count:number};
/** Compose the existing image controller with its original scoped view/document.
 * No new execution, quotation, persistence or receipt state lives here. */
export type CanvasImageRunContext=Pick<CanvasGenerationRunContext,'generation'|'pending'|'geometry'|'document'|'user'|'notice'>&{
  capture:()=>CanvasImageTaskScope;submit:Task['submit'];
  replacementHistory:NonNullable<Task['replacement']>['history'];
  attachTextImages:(sourceIds:string[],images:CanvasGeneratedImage[])=>Promise<void>;
  clearError:()=>void;errorText:string;saveErrorText:string;pendingLabel:string;resultGap:number;
};
export type CanvasBlankImageOptions={pend?:CanvasPendingNode;prompt?:string;ratio?:string;forceStandard?:boolean;referenceInputs?:CanvasImageReference[];isCurrent?:()=>boolean};

/** Derived/replacement application flow; request and recovery stay in the
 * original image-task request/controller, including explicit attachment retry. */
export async function runCanvasDerivedImage(input:{source:Artwork;prompt:string;options?:CanvasImageGenerationOptions;
  model:string;quality:string;models:CanvasImageModelOption[];failed:(failure:GenerationFailure)=>void;succeeded:()=>void;
},ctx:CanvasImageRunContext):Promise<CanvasGeneratedImage[]>{
  const {source,options:opts}=input,text=input.prompt.trim();
  if(!text&&!opts?.ratiogen)return [];
  const count=opts?.ratiogen?1:Math.max(1,opts?.count??1),operationKey=opts?.operationKey??`node:${source.id}`,view=ctx.generation;
  if(view.busy(operationKey))return [];
  const taskId=`task-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,anchor=ctx.geometry.source(source),previewSize=generationPlaceholderSize(opts?.ratio||source.ratio);
  const preferred=anchor.inScene?{x:anchor.point.x+anchor.size.width+ctx.geometry.gap,y:anchor.point.y+(opts?.taskOffset??view.siblingCount(source.id))*(previewSize.height+ctx.resultGap)}:{x:0,y:0};
  const position=view.start({id:taskId,operationKey,sourceId:source.id,replaceNode:opts?.replaceNode,label:opts?.taskLabel||ctx.pendingLabel,stage:'preparing',startedAt:Date.now(),previewSize,count},
    {preferred:opts?.replaceNode?anchor.point:preferred,occupied:ctx.geometry.occupied(),reserve:!opts?.replaceNode});
  ctx.clearError();const scope=ctx.capture();
  const task=createCanvasImageTask({scope,replacement:opts?.replaceNode?{nodeId:source.id,history:ctx.replacementHistory}:undefined,
    prepare:()=>prepareCanvasImageTask({kind:'derived',scope,operationKey,position,prompt:text,source,options:opts||{},models:input.models,model:input.model,quality:input.quality,referenceInputs:opts?.referenceInputs}),
    submit:ctx.submit,position:()=>view.position(taskId,position),...ctx.document,
    stage:stage=>view.update(taskId,{stage,failure:undefined}),user:ctx.user,notice:ctx.notice,errorText:ctx.errorText,saveErrorText:ctx.saveErrorText,resultGap:ctx.resultGap,
  });
  const activity=view.activity({operationKey,canRetry:scope.isCurrent,clear:()=>view.remove(taskId),
    execute:async({retry,retain}):Promise<CanvasGeneratedImage[]>=>{
      const result=await task.run();
      if(result.status==='failed'){retain();input.failed(result.failure);view.update(taskId,{failure:result.failure,onRetry:retry});return [];}
      if(result.status==='stale'||result.status==='cancelled')return [];
      input.succeeded();if(result.images.length<count)ctx.notice(`请求 ${count} 张，已交付 ${result.images.length} 张`);return result.images;
    },
  });
  return await activity.run()??[];
}

/** Blank/text-linked application flow. The text document owns target links;
 * this owner composes inputs, placeholder projection and the original task. */
export async function runCanvasBlankImage(input:{pend:CanvasPendingNode;prompt:string;settings:Settings;members:Artwork[];textNodes:CanvasTextNode[];
  detail:boolean;referenceInputs?:CanvasImageReference[];invalid:(message:string)=>void;needReferences:string;needPrompt:string;
  runDetail:(source:Artwork,inputs:Artwork[],prompt:string,pend:CanvasPendingNode,refs?:CanvasImageReference[])=>Promise<unknown>;
  failed:(failure:GenerationFailure)=>void;attached:(images:CanvasGeneratedImage[])=>void;completed:()=>void;
},ctx:CanvasImageRunContext):Promise<boolean>{
  const {pend,referenceInputs,settings}=input;
  if(pend.generating||pend.uploading||pend.needsAttention)return false;
  const text=input.prompt.trim(),inputs=pend.inputs.map(id=>input.members.find(art=>art.id===id)).filter((art):art is Artwork=>!!art);
  if(referenceInputs){
    const issue=referenceManifestError(text,imageReferenceManifest(referenceInputs));if(issue){input.invalid(issue);return false;}
    if(pend.inputs.some(id=>!id.startsWith('text-')&&!inputs.some(art=>art.id===id&&art.image&&!art.videoUrl))){input.invalid('已连接的参考图片尚未载入，请同步图片后重试');return false;}
  }
  const textIds=new Set([pend.parentId,...pend.inputs].filter((id):id is string=>!!id?.startsWith('text-'))),texts=[...textIds].map(id=>input.textNodes.find(node=>node.id===id)).filter((node):node is CanvasTextNode=>!!node);
  if(input.detail){if(!inputs.length){ctx.notice(input.needReferences);return false;}await input.runDetail(inputs[0],inputs,text,pend,referenceInputs);return false;}
  if(!text&&!pend.inputs.length){ctx.notice(input.needPrompt);return false;}
  const operationKey=`pend:${pend.id}`,view=ctx.generation,pending=ctx.pending;if(view.busy(operationKey))return false;
  const prompt=canvasBlankImagePrompt(text,texts,inputs);ctx.clearError();
  const size=generationPlaceholderSize(settings.ratio),live=ctx.geometry.position(pend.id,pend),position=generationPositionForTask(live,live,size,[]);
  pending.set(nodes=>nodes.map(node=>node.id===pend.id?{...node,generationFailure:undefined,onGenerationRetry:undefined,generating:true,generationStage:'preparing',generationStartedAt:Date.now(),...position,generationSize:size,generationCount:normalizeCanvasCount(settings.count)}:node));
  const scope=ctx.capture(),task=createCanvasImageTask({scope,
    prepare:()=>prepareCanvasImageTask({kind:'blank',scope,operationKey,position,prompt,...settings,inputs,referenceInputs,textParentId:pend.parentId?.startsWith('text-')&&texts.some(node=>node.id===pend.parentId)?pend.parentId:undefined}),
    submit:ctx.submit,position:()=>ctx.geometry.position(pend.id,position),...ctx.document,
    attached:images=>texts.length?ctx.attachTextImages(texts.map(node=>node.id),images):undefined,
    stage:stage=>pending.set(nodes=>nodes.map(node=>node.id===pend.id?{...node,generating:true,generationStage:stage,generationFailure:undefined}:node)),
    user:ctx.user,notice:ctx.notice,errorText:ctx.errorText,saveErrorText:ctx.saveErrorText,resultGap:ctx.resultGap,
  });
  return await view.activity({operationKey,canRetry:scope.isCurrent,
    execute:async({retry}):Promise<boolean>=>{
      const result=await task.run();if(result.status==='stale')return false;
      if(result.status==='cancelled'){pending.set(nodes=>nodes.map(node=>node.id===pend.id?{...node,generating:false,generationFailure:undefined}:node));return false;}
      if(result.status==='failed'){input.failed(result.failure);pending.set(nodes=>nodes.map(node=>node.id===pend.id?{...node,generating:false,generationFailure:result.failure,onGenerationRetry:retry}:node));return false;}
      input.attached(result.images);pending.set(nodes=>nodes.filter(node=>node.id!==pend.id));input.completed();return result.status==='succeeded';
    },
  }).run()??false;
}
