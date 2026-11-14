import type {CanvasVideoNode} from '../canvas/video-node-schema';
import type {VideoCatalogModel,VideoNodeConfig} from './client-settings';
import {remapVideoPromptReferences} from './prompt-references';
import {setVideoUiValue,videoUiValue} from './ui-draft';

export const storyboardDraftInputs=(node:CanvasVideoNode)=>node.inputs.filter(input=>input.kind!=='text'||input.role!=='author');
function canonical(value:unknown):string {if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>JSON.stringify(key)+':'+canonical(v)).join(',')+'}';return JSON.stringify(value);}
function mergeSettings(config:VideoNodeConfig){const {prompt:_prompt,durationSeconds:_duration,parameters,...rest}=config;return {...rest,...(parameters?{parameters:Object.fromEntries(Object.entries(parameters).filter(([key])=>key!=='durationSeconds'))}:{})};}
export function editStoryboardDuration(config:VideoNodeConfig,value:unknown,model?:VideoCatalogModel):VideoNodeConfig{
 return model?.execution||config.parameters!==undefined||config.intentPreference!==undefined?setVideoUiValue(config,'durationSeconds',value):{...config,durationSeconds:value as number|undefined};
}
/** Editing creates new drafts, never reconciles a model's execution settings.
 * Merge conflicts remain explicit instead of silently discarding shot B. */
export function restructureVideoDrafts(nodes:CanvasVideoNode[]):VideoNodeConfig[]{
 if(nodes.length!==1&&nodes.length!==2)throw new Error('请选择一个镜头拆分或两个镜头合并');
 const first=nodes[0],promptOf=(node:CanvasVideoNode)=>remapVideoPromptReferences(node.config.prompt||'',node.inputs,storyboardDraftInputs(node));if(nodes.some(node=>node.config.comfyWorkflowId||node.config.shots?.length))throw new Error('原生工作流或多镜头请在节点编辑器修改');
 if(nodes.length===1)return [{...structuredClone(first.config),prompt:promptOf(first)},{...structuredClone(first.config),prompt:''}];
 if(nodes.some(node=>canonical(mergeSettings(node.config))!==canonical(mergeSettings(first.config))||canonical(storyboardDraftInputs(node))!==canonical(storyboardDraftInputs(first))))throw new Error('合镜前请统一模型、参考素材及除描述和时长之外的参数');
 let config:VideoNodeConfig={...structuredClone(first.config),prompt:nodes.map(promptOf).join('\n\n')};
 const durations=nodes.map(node=>videoUiValue(node.config,'durationSeconds'));
 if(durations.every(value=>typeof value==='number'&&Number.isFinite(value)&&value>0))config=editStoryboardDuration(config,(durations as number[]).reduce((sum,value)=>sum+value,0));
 return [config];
}
