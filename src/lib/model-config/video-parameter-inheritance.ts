import documented from './video-parameter-sources.json';
import {inheritVideoParameterContract,videoParameterContractSchema,type VideoParameterContract} from '../video/parameter-contract';
import {videoDefinitionParameters} from '../supplier-models/video-parameters';
import type {SupplierVideoDefinition} from '../supplier-models/video-access';
import type {PublishedVideoExecution} from '../video/published-execution';
import type {ModelProvider} from './types';

/** Called only while freezing a NEW model publication. Existing frozen rows
 * and accepted tasks never consult latest supplier observations again. */
export function inheritPublishedVideoParameters(execution:PublishedVideoExecution,provider:Pick<ModelProvider,'baseUrl'>,wireModel:string,supplier:SupplierVideoDefinition|null):{execution:PublishedVideoExecution;sourceRevision?:SupplierVideoDefinition['sourceRevision'];conflicts?:Array<{fields:string[];reason:string}>}{
  if(execution.profileId==='workflow-video')return {execution};
  const origin=new URL(provider.baseUrl).origin;
  const endpoint=new URL(provider.baseUrl).href.replace(/\/$/,'');
  const supplierContract=supplier?videoDefinitionParameters(supplier.definition):undefined;
  const sourceOrigin=supplierContract?.providerOrigin??(supplier?new URL(supplier.sourceRevision.sourceUrl).origin:undefined);
  let contract:VideoParameterContract|undefined,sourceRevision:SupplierVideoDefinition['sourceRevision']|undefined;
  if(supplierContract&&sourceOrigin===origin&&(supplierContract.providerEndpoint?supplierContract.providerEndpoint===endpoint:endpoint===origin)){contract=supplierContract;sourceRevision=supplier!.sourceRevision;}
  else{
    const source=['/','/v1','/v1/'].includes(new URL(provider.baseUrl).pathname)?documented.items.find(item=>item.providerOrigin===origin&&item.model===wireModel):undefined;
    if(source){contract=videoParameterContractSchema.parse(source.contract);sourceRevision=source.sourceRevision;}
  }
  if(!contract)return {execution};
  const conflicts:Array<{fields:string[];reason:string}>=[];
  const recipe=inheritVideoParameterContract(execution.recipe,contract,reason=>conflicts.push({fields:['parameterConditions'],reason}));
  return {execution:{...execution,recipe} as PublishedVideoExecution,sourceRevision,...(conflicts.length?{conflicts}:{})};
}
