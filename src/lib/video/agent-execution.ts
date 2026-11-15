import 'server-only';
import {videoNodeConfigSchema} from '../canvas/video-node-schema';
import {getVideoNode} from '../canvas/video-node-repository';
import {ModelConfigError} from '../model-config/types';
import {currentModelExecution} from '../model-config/context';
import {withVideoCreationModel} from './creation';
import {prepareVideoExecution} from './prepare-execution';
import {videoSubmissionDraft} from './submission-draft';
import {VideoContractError} from './contract';
import type {CompiledVideoPlan} from './execution-contract';
import type {VideoNodeConfig} from './client-settings';
import type {OrderedInput} from './references';

/** Agent preview and quotation use the video application compiler, not a tool
 * capability matrix. The callback retains the selected model/billing snapshot.
 * No task, reservation, business operation or supplier request is created. */
export async function withPreparedAgentVideo<T>(actor:string,input:{config:VideoNodeConfig;inputs:OrderedInput[];node?:{id:string;revision:number};projectKey?:string;requiredIntent?:'extend'|'video_edit'},run:(plan:CompiledVideoPlan|undefined)=>Promise<T>):Promise<T>{
 let config=videoNodeConfigSchema.parse(input.config),inputs=input.inputs,projectKey=input.projectKey;
 if(input.node){
  const current=await getVideoNode(actor,input.node.id);if(!current)throw new ModelConfigError('VIDEO_NODE_UNAVAILABLE','视频节点不存在',404);
  if(current.revision!==input.node.revision)throw new ModelConfigError('VIDEO_NODE_REVISION_CONFLICT','视频节点已更新，请重新读取后生成',409);
  if(projectKey&&projectKey!==current.projectKey)throw new ModelConfigError('VIDEO_NODE_PROJECT_CONFLICT','视频节点不属于当前项目',409);
  config=current.config;inputs=current.inputs;projectKey=current.projectKey;
 }
 if(config.comfyWorkflowId){
  const {prepareByocVideoPreview}=await import('./byoc-preview');const {videoByocDraft}=await import('./ui-draft');
  if(input.requiredIntent&&!inputs.some(item=>item.kind==='video'&&item.role==='source_video'))throw new VideoContractError('SOURCE_VIDEO_REQUIRED','编辑或续写需要明确的来源视频',['inputs']);
  const result=await prepareByocVideoPreview(actor,{...videoByocDraft(config,inputs),projectKey,draftRevision:0});
  if(!result.ok){const d=result.diagnostics[0];throw new VideoContractError(d.code,d.reason,[d.field]);}
  return run(result.value.plan);
 }
 return withVideoCreationModel(config.modelId,async()=>{
  const execution=currentModelExecution('video');
  if(!execution?.frozen.video?.execution)throw new VideoContractError('VIDEO_EXECUTION_NOT_CONFIGURED','此通道尚未配置新版执行映射',['binding']);
  const draft=videoSubmissionDraft({...config,source:'agent',prompt:config.prompt||'',seconds:String(config.durationSeconds??''),size:config.resolution||'',orderedInputs:inputs.length?inputs:undefined,references:inputs.length?undefined:config.references});
  if(input.requiredIntent&&!draft.inputs.some(item=>item.kind==='video'&&item.role==='source_video'))throw new VideoContractError('SOURCE_VIDEO_REQUIRED','编辑或续写需要明确的来源视频',['inputs']);
  const result=await prepareVideoExecution({actor,projectKey:projectKey??null,draft,execution:execution.frozen.video.execution,identity:{publicModelId:execution.frozen.publicModelId,wireModel:execution.connection.wireModel,connectionId:execution.connection.providerId}});
  if(!result.ok){const diagnostic=result.diagnostics[0];throw new VideoContractError(diagnostic.code,diagnostic.reason,[diagnostic.field]);}
  if(input.requiredIntent&&result.value.intent!==input.requiredIntent&&result.value.intent!=='reference')throw new VideoContractError('VIDEO_INTENT_CONFLICT','已保存草稿的执行意图与编辑或续写请求不一致',['intentPreference']);
  return run(result.value);
 });
}
