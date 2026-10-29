import {browserRandomUUID} from '../browser-crypto';
import {newDirectorProject} from '../director/project';
import type {Artwork} from '../mock-data';
import type {VideoInputChoice} from '../video/input-choice';
import type {CanvasDocumentScope} from './document-scope';
import type {CanvasDirectorNode} from './director-node-schema';
import {createCanvasNativeEdits,type NativeEditPorts} from './native-edit-commands';
import {placeGenerationPreview} from './generation-feedback';

type Ports=NativeEditPorts<'director'>&{
  english:boolean;uneditable:string;upload:(files:File[],project:string)=>Promise<VideoInputChoice[]>;merge:(ids:string[])=>Promise<Artwork[]>;
  occupied:()=>Array<{x:number;y:number;width:number;height:number}>;
  position:(operationId:string,artworkId:string,point:{x:number;y:number})=>Promise<unknown>;
  refresh:()=>Promise<unknown>;
  attach:(id:string,artworkId:string,kind:'image'|'video',revision:number,operationId:string)=>Promise<CanvasDirectorNode>;
  conflict:(error:unknown)=>boolean;
};
type Attempt={artworkId?:string;operationId:string;expectedRevision:number;position?:{x:number;y:number};positionOperationId?:string;addedToHistory?:boolean};

/** Director output adoption retains original upload/position/attach identities.
 * The File cache is partitioned by the originating document scope, rather than
 * allowing another account/workspace/project to inherit an old artwork ID. */
export function createCanvasDirectorActions(){
  const edits=createCanvasNativeEdits('director'),outputs=new WeakMap<File,Map<string,Attempt>>();
  return {bind(scope:CanvasDocumentScope,ports:Ports){
    const commands=edits.bind(scope,ports);
    const assert=()=>{scope.assertView();if(!ports.writable())throw new Error(ports.uneditable);};
    return {...commands,
      create:(at:{x:number;y:number})=>commands.create(at,()=>{const project=newDirectorProject();project.name=ports.english?'3D director':'3D 导演台';return {title:project.name,project};}),
      async output(id:string,file:File,kind:'image'|'video',expectedRevision:number){
        assert();const node=ports.store.getNode(id);if(!node||node.deletedAt||ports.locked(id))throw new Error(ports.uneditable);
        let attempts=outputs.get(file);if(!attempts){attempts=new Map();outputs.set(file,attempts);}
        const key=JSON.stringify([scope.key,id]);let attempt=attempts.get(key);
        if(!attempt){attempt={operationId:browserRandomUUID(),expectedRevision};attempts.set(key,attempt);}
        if(!attempt.artworkId){const choices=await ports.upload([file],node.projectKey);attempt.artworkId=choices[0].nodeId;}
        assert();const fresh=await ports.merge([attempt.artworkId]);assert();const art=fresh.find(item=>item.id===attempt!.artworkId);
        if(art&&art.canvasX==null&&art.canvasY==null){
          attempt.position??=placeGenerationPreview({x:node.x+node.width+96,y:node.y},{width:384,height:280},ports.occupied());
          attempt.positionOperationId??=browserRandomUUID();await ports.position(attempt.positionOperationId,art.id,attempt.position);assert();await ports.merge([art.id]);
        }
        if(!attempt.addedToHistory&&art){ports.history({kind:'add',records:[art]});attempt.addedToHistory=true;}
        assert();try{return await ports.attach(id,attempt.artworkId,kind,attempt.expectedRevision,attempt.operationId);}
        catch(error){
          if(!ports.conflict(error))throw error;
          await ports.refresh();assert();const latest=ports.store.getNode(id);if(!latest||latest.deletedAt)throw error;
          if(latest.outputs.some(output=>output.artworkId===attempt!.artworkId))return latest;
          attempt.expectedRevision=latest.revision;attempt.operationId=browserRandomUUID();return ports.attach(id,attempt.artworkId,kind,attempt.expectedRevision,attempt.operationId);
        }
      },
    };
  }};
}
