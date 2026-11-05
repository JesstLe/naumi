import {browserRandomUUID} from '../browser-crypto';
import {catalogCapability,videoNodeCreationDefaults,videoModeRoles} from '../video/client-settings';
import type {VideoInputChoice} from '../video/input-choice';
import type {CanvasDocumentScope} from './document-scope';
import type {CanvasVideoNode,VideoNodeWrite} from './video-node-schema';
import type {CanvasHistoryAction,VideoPatchFields} from './history-model';

type Catalog=Parameters<typeof videoNodeCreationDefaults>[0];
type Ports={
  writable:()=>boolean;allowed:()=>boolean;catalog:()=>Catalog&{loading:boolean;refresh:()=>Promise<unknown>};
  location:(at:{x:number;y:number},id:string)=>{projectKey:string;x:number;y:number};
  store:{getNode:(id:string)=>CanvasVideoNode|undefined;flush:(id:string)=>Promise<unknown>;save:(id:string,patch:Partial<Omit<VideoNodeWrite,'id'|'operationId'>>)=>Promise<CanvasVideoNode>};
  created:(node:CanvasVideoNode)=>void;history:(action:CanvasHistoryAction)=>void;busy:(value:boolean)=>void;notice:(message:string)=>void;english:boolean;
};

/** Current catalog -> native video draft, not task submission or billing.
 * No deferred creation is queued while refreshing a catalog. */
export function createCanvasVideoNodeActions(){
  const creating=new Set<string>();
  return {isCreating:(key:string)=>creating.has(key),bind(scope:CanvasDocumentScope,ports:Ports){
    return {
      isCreating:()=>creating.has(scope.key),
      async create(input:{at:{x:number;y:number};blank:boolean;prompt:string;choices:VideoInputChoice[]}){
        if(!ports.writable()||!ports.allowed()||creating.has(scope.key))return;scope.assertView();creating.add(scope.key);if(scope.viewCurrent())ports.busy(true);
        try{
          const id=`vnode-${browserRandomUUID()}`,location=ports.location(input.at,id),catalog=ports.catalog(),creation=videoNodeCreationDefaults(catalog);
          if(!creation){if(catalog.loading)ports.notice(ports.english?'Loading video models…':'视频模型加载中…');else await catalog.refresh();return;}
          const {model}=creation,choices=input.choices,config={...creation.config,prompt:input.blank?'':input.prompt};
          const images=choices.filter(choice=>choice.kind==='image').length,proposed=choices.length===0?'text':choices.length===1&&images===1?'single_image':'reference';
          if(catalogCapability(model).modes?.includes(proposed))config.mode=proposed;
          const inputs=videoModeRoles(choices.map(choice=>({id:`ref-${browserRandomUUID()}`,nodeId:choice.nodeId,kind:choice.kind,role:choice.kind==='text'?'context' as const:choice.kind==='video'?'source_video' as const:choice.kind==='audio'?'source_audio' as const:'reference' as const,value:choice.value})),config.mode);
          const ratio=config.aspectRatio?.match(/^([1-9]\d*):([1-9]\d*)$/),aspect=ratio?Number(ratio[1])/Number(ratio[2]):16/9;
          scope.assertView();const node=await ports.store.save(id,{...location,title:'视频',width:384,height:Math.max(160,Math.min(680,Math.round(384/aspect))),config,inputs});
          if(scope.documentCurrent())ports.history({kind:'video-add',records:[node]});if(scope.viewCurrent())ports.created(node);return node;
        }finally{creating.delete(scope.key);if(scope.viewCurrent())ports.busy(false);}
      },
      async patch(id:string,patch:VideoPatchFields&{expectedRevision?:number}){
        scope.assertView();await ports.store.flush(id);scope.assertView();const before=ports.store.getNode(id);if(!before)throw new Error('视频节点不存在');
        const {expectedRevision,...fields}=patch,from:VideoPatchFields={};for(const key of Object.keys(fields) as Array<keyof VideoPatchFields>)Object.assign(from,{[key]:structuredClone(before[key])});
        const result=await ports.store.save(id,{...fields,expectedRevision:expectedRevision??before.revision});
        if(scope.documentCurrent()&&JSON.stringify(from)!==JSON.stringify(fields))ports.history({kind:'video-patch',id,from,to:fields});return result;
      },
    };
  }};
}
