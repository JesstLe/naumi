import {newCharacterProject,characterReferenceText,type CharacterProject} from '../character/project';
import {newSceneProject,sceneReferenceText,type SceneProject} from '../scene/project';
import type {Artwork} from '../mock-data';
import type {VideoInputChoice} from '../video/input-choice';
import type {CanvasDocumentScope} from './document-scope';
import {createCanvasNativeEdits,type NativeEditPorts} from './native-edit-commands';
import {placeGenerationPreview} from './generation-feedback';

type Kind='character'|'scene';
type Definition={character:CharacterProject;scene:SceneProject};
type Box={x:number;y:number;width:number;height:number};
type Ports<K extends Kind>=NativeEditPorts<K>&{
  english:boolean;uneditable:string;upload:(files:File[],project:string)=>Promise<VideoInputChoice[]>;merge:(ids:string[])=>Promise<Artwork[]>;
  previewSize:{width:number;height:number};occupied:()=>Box[];
  draft:(input:Box&{prompt:string;referenceArtworkIds:string[]})=>void;
};

/** Character and scene reference assets share node editing and reference-file
 * preparation. Their actual definitions/prompts stay in the existing domains;
 * image generation still starts in the ordinary draft/task application. */
export function createCanvasReferenceAssetActions<K extends Kind>(kind:K){
  const edits=createCanvasNativeEdits(kind);
  return {bind(scope:CanvasDocumentScope,ports:Ports<K>){
    const label=(zh:string,en:string)=>ports.english?en:zh;
    const editable=(id:string)=>{scope.assertView();const node=ports.store.getNode(id);if(!node||!ports.writable()||ports.locked(id))throw new Error(ports.uneditable);return node;};
    const commands=edits.bind(scope,ports);
    return {...commands,
      create:(at:{x:number;y:number})=>commands.create(at,()=>{
        if(kind==='character'){const character=newCharacterProject(label('角色','Character'));return {title:character.name,character} as Parameters<typeof ports.store.save>[1];}
        const scene=newSceneProject(label('场景','Scene'));return {title:scene.name,scene} as Parameters<typeof ports.store.save>[1];
      }),
      async upload(id:string,files:File[]){
        const node=editable(id),choices=await ports.upload(files,node.projectKey);scope.assertView();
        const fresh=await ports.merge(choices.map(choice=>choice.nodeId));scope.assertView();
        if(fresh.length)ports.history({kind:'add',records:fresh});return choices;
      },
      async reference(id:string,definition:Definition[K],variantId:string){
        const node=editable(id);
        const variant=kind==='character'?(definition as CharacterProject).appearances.find(item=>item.id===variantId):(definition as SceneProject).states.find(item=>item.id===variantId);
        if(!variant)throw new Error(ports.uneditable);
        if(variant.referenceArtworkIds.length)await ports.merge(variant.referenceArtworkIds);
        scope.assertView();
        const point=placeGenerationPreview({x:node.x+node.width+96,y:node.y},ports.previewSize,ports.occupied());
        ports.draft({...point,...ports.previewSize,referenceArtworkIds:[...variant.referenceArtworkIds],
          prompt:kind==='character'?characterReferenceText(definition as CharacterProject,variantId):sceneReferenceText(definition as SceneProject,variantId)});
      },
    };
  }};
}
