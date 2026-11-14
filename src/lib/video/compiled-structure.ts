import type {CompiledVideoPlan} from './execution-contract';
import type {VideoGenerationRequest,VideoReference} from './types';

/** Legacy consumer projection only. Wire execution never recompiles this value.
 * Partition flat manifests back into groups so retries/receipts retain semantics. */
export function compiledVideoStructure(plan:CompiledVideoPlan,references:VideoReference[]){
  const shotText=new Set(plan.structure?.shots?.flatMap(shot=>shot.promptInputId?[shot.promptInputId]:[])??[]);
  const elementIds=new Set(plan.structure?.elements?.flatMap(element=>element.inputIds)??[]);
  const byId=new Map(references.map(ref=>[ref.id,ref]));
  const textById=new Map(plan.inputManifest.flatMap(input=>input.kind==='text'?[[input.id,input.text] as const]:[]));
  const shots:VideoGenerationRequest['shots']=plan.structure?.shots?.map(shot=>({id:shot.id,prompt:shot.promptInputId?textById.get(shot.promptInputId)!:shot.prompt,durationSeconds:shot.durationSeconds}));
  const elements:VideoGenerationRequest['elements']=plan.structure?.elements?.map(element=>({id:element.id,name:element.name,...(element.description!==undefined?{description:element.description}:{}),references:element.inputIds.map(id=>byId.get(id)!)}));
  return {references:references.filter(ref=>!elementIds.has(ref.id)),shots,elements,
    inputs:plan.inputManifest.filter(input=>!elementIds.has(input.id)&&!shotText.has(input.id))};
}
