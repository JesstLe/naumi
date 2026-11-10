import "server-only";
import {createHash} from "node:crypto";
import type {PoolClient} from "pg";
import {getCharacterNode,listCharacterNodes,ensureCharacterNodeSchema} from "../canvas/character-node-repository";
import {getSceneNode,listSceneNodes,ensureSceneNodeSchema} from "../canvas/scene-node-repository";
import {characterInputIdentity,characterReferenceText} from "../character/project";
import {sceneInputIdentity,sceneReferenceText} from "../scene/project";
import {listArtworksByIds} from "../artworks/repository";
import {expandVisualReferences} from "../canvas/visual-references";
import type {OrderedInput} from "../video/references";
import type {ContinuityBinding} from "./continuity";
import {continuityPrompt} from "./continuity";
import type {StoryboardShot} from "./plan";
import {ModelConfigError} from "../model-config/types";
import {canonicalConfig} from "../model-config/snapshot-value";

export async function ensureContinuitySources(){await Promise.all([ensureCharacterNodeSchema(),ensureSceneNodeSchema()]);}
export async function continuityCatalog(actor:string,projectKey:string):Promise<ContinuityBinding[]>{
  const [characters,scenes]=await Promise.all([listCharacterNodes(actor),listSceneNodes(actor)]);
  return [
    ...characters.filter(node=>node.projectKey===projectKey&&!node.deletedAt).flatMap(node=>node.character.appearances.map(appearance=>({identity:characterInputIdentity(node.id,appearance.id),kind:"character" as const,nodeId:node.id,variantId:appearance.id,revision:node.revision,title:`${node.character.name} · ${appearance.name}`,text:characterReferenceText(node.character,appearance.id),artworkIds:appearance.referenceArtworkIds}))),
    ...scenes.filter(node=>node.projectKey===projectKey&&!node.deletedAt).flatMap(node=>node.scene.states.map(state=>({identity:sceneInputIdentity(node.id,state.id),kind:"scene" as const,nodeId:node.id,variantId:state.id,revision:node.revision,title:`${node.scene.name} · ${state.name}`,text:sceneReferenceText(node.scene,state.id),artworkIds:state.referenceArtworkIds}))),
  ];
}
export async function validateContinuityBindings(actor:string,projectKey:string,shot:StoryboardShot,previous:StoryboardShot|undefined,tx:PoolClient,trusted:readonly ContinuityBinding[]=[]){
  for(const binding of shot.continuity?.bindings||[]){
    if([...(previous?.continuity?.bindings||[]),...trusted].some(old=>canonicalConfig(old)===canonicalConfig(binding)))continue;
    let expected:ContinuityBinding|undefined;
    if(binding.kind==="character"){
      const node=await getCharacterNode(actor,binding.nodeId,false,tx),variant=node?.character.appearances.find(item=>item.id===binding.variantId);
      if(node?.projectKey===projectKey&&variant)expected={identity:characterInputIdentity(node.id,variant.id),kind:"character",nodeId:node.id,variantId:variant.id,revision:node.revision,title:`${node.character.name} · ${variant.name}`,text:characterReferenceText(node.character,variant.id),artworkIds:variant.referenceArtworkIds};
    }else{
      const node=await getSceneNode(actor,binding.nodeId,false,tx),variant=node?.scene.states.find(item=>item.id===binding.variantId);
      if(node?.projectKey===projectKey&&variant)expected={identity:sceneInputIdentity(node.id,variant.id),kind:"scene",nodeId:node.id,variantId:variant.id,revision:node.revision,title:`${node.scene.name} · ${variant.name}`,text:sceneReferenceText(node.scene,variant.id),artworkIds:variant.referenceArtworkIds};
    }
    if(!expected||canonicalConfig(expected)!==canonicalConfig(binding))throw new ModelConfigError("STORYBOARD_REFERENCE_CHANGED","角色或场景已改变，请读取最新设定后选择",409);
  }
}
/** Only the stored chosen snapshot is expanded. Current source revisions are advisory. */
export async function composeStoryboardContext(actor:string,shot:StoryboardShot,originalInputs:readonly OrderedInput[],prompt:string){
  const inputs=originalInputs.map(input=>({...input})),definitions=[];
  const ids=new Set(inputs.map(input=>input.id));
  const unique=(base:string)=>{let id=base;while(ids.has(id))id+="_";ids.add(id);return id;};
  for(const binding of shot.continuity?.bindings||[]){
    let input=inputs.find(input=>input.nodeId===binding.identity);
    if(!input){input={id:unique(`continuity-${createHash("sha256").update(binding.identity).digest("hex").slice(0,24)}`),nodeId:binding.identity,kind:"text",role:"context",value:binding.text};inputs.push(input);}
    input.kind="text";input.role="context";
    const arts=await listArtworksByIds(actor,binding.artworkIds);
    const images=binding.artworkIds.map(artworkId=>{const art=arts.find(art=>art.id===artworkId);if(!art||art.status!=="completed"||!art.image)throw new ModelConfigError("STORYBOARD_REFERENCE_UNAVAILABLE","所选设定的参考图片已不可用",422);return {inputId:unique(`${input!.id}-image-${imagesIndex(binding.artworkIds,artworkId)}`),artworkId,value:art.image};});
    definitions.push({inputId:input.id,text:binding.text,referenceLabel:binding.kind==="character"?"角色参考" as const:"场景参考" as const,frozenNodeId:`inline:${binding.identity}@${binding.revision}`,images});
  }
  const context=continuityPrompt(shot.continuity);
  return expandVisualReferences(inputs,[prompt,context].filter(Boolean).join("\n\n"),definitions);
}
function imagesIndex(ids:readonly string[],id:string){return ids.indexOf(id);}
