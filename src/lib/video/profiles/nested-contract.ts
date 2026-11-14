import {videoDiagnostic,type VideoExecutionDraft,type VideoProfileOutput,type VideoExecutionIntent,type VideoResult} from '../execution-contract';
import type {NativeVideoRecipe} from './native-profile';
import type {NestedVideoLayout} from './nested-layouts';
export type NestedJson=VideoProfileOutput['wireTemplate']['body'];
export const nestedFailure=(code:string,field:string,reason:string):VideoResult<never>=>({ok:false,diagnostics:[videoDiagnostic('mapping',code,field,reason,'调整输入用途或明确发布实际协议映射')]});
export type Media=VideoExecutionDraft['inputs'][number]&{kind:'image'|'video'|'audio'};
export type NestedLayoutContext={layout:NestedVideoLayout;recipe:NativeVideoRecipe;model:string;intent:VideoExecutionIntent;prompt:string;media:Media[];images:Media[];videos:Media[];audios:Media[];ordinary:Media[];first?:Media;last?:Media;
 effective:Record<string,NestedJson>;options:Record<string,NestedJson>;slot:(id:string)=>{$videoAsset:string}};


export function assertNestedOptions(ctx:NestedLayoutContext,fields:string[]):VideoResult<true>{
 const unknown=Object.keys(ctx.options).find(key=>!fields.includes(key));if(unknown)return nestedFailure('PARAMETER_MAPPING_MISSING',unknown,'此分支没有该参数的实际请求字段');
 if(ctx.effective.width!==undefined||ctx.effective.height!==undefined)return nestedFailure('PARAMETER_MAPPING_MISSING','width','此嵌套协议没有独立宽高字段');return {ok:true,value:true};
}
export const nestedContent=(ctx:NestedLayoutContext):NestedJson[]=>[{type:'text',text:ctx.prompt},...ctx.media.map(i=>({type:`${i.kind}_url`,[`${i.kind}_url`]:{url:ctx.slot(i.id)},role:i.role==='first_frame'||i.role==='last_frame'?i.role:`reference_${i.kind}`}))];
