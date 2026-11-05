import {browserRandomUUID} from '../browser-crypto';
import type {CanvasDocumentScope} from './document-scope';
import type {NativeNodeFor,NativeNodePatch} from './native-node-document';
import type {CanvasHistoryAction} from './history-model';

export type NativeEditPorts<K extends 'character'|'scene'|'director'>={
  writable:()=>boolean;settingsReady:()=>boolean;locked:(id:string)=>boolean;
  store:{getNode:(id:string)=>NativeNodeFor<K>|undefined;flush:()=>Promise<unknown>;save:(id:string,patch:NativeNodePatch<K>)=>Promise<NativeNodeFor<K>>};
  location:(at:{x:number;y:number},id:string)=>{projectKey:string;x:number;y:number};
  created:(node:NativeNodeFor<K>)=>void;history:(action:CanvasHistoryAction)=>void;
  blocked:string;missing:string;
};

/** Only the repeated native node edit transaction: original store/CAS plus
 * scoped history. Domain projects, references, rendering and result adoption
 * remain in their concrete actions; this is not a node registry or executor. */
export function createCanvasNativeEdits<K extends 'character'|'scene'|'director'>(kind:K){
  const creating=new Set<string>();
  return {bind(scope:CanvasDocumentScope,ports:NativeEditPorts<K>){
    const assert=()=>{scope.assertView();if(!ports.writable())throw new Error(ports.blocked);};
    return {
      async create(at:{x:number;y:number},fields:()=>NativeNodePatch<K>){
        assert();if(creating.has(scope.key))return;creating.add(scope.key);
        try{const id=`${kind}-${browserRandomUUID()}`,node=await ports.store.save(id,{...ports.location(at,id),...fields()});
          if(scope.documentCurrent())ports.history({kind:`${kind}-add`,records:[node]} as CanvasHistoryAction);
          if(scope.viewCurrent())ports.created(node);return node;
        }finally{creating.delete(scope.key);}
      },
      async patch(id:string,patch:NativeNodePatch<K>){
        assert();if(!ports.settingsReady()||ports.locked(id))throw new Error(ports.blocked);
        await ports.store.flush();assert();const before=ports.store.getNode(id);if(!before)throw new Error(ports.missing);
        const {expectedRevision,...fields}=patch,from:Record<string,unknown>={};
        for(const key of Object.keys(fields))from[key]=structuredClone((before as unknown as Record<string,unknown>)[key]);
        const result=await ports.store.save(id,{...fields,expectedRevision:expectedRevision??before.revision} as NativeNodePatch<K>);
        if(scope.documentCurrent()&&JSON.stringify(from)!==JSON.stringify(fields))ports.history({kind:`${kind}-patch`,id,from,to:fields} as CanvasHistoryAction);
        return result;
      },
    };
  }};
}
