import {
  videoDraftSchema,videoExecutionScopeSchema,resolvedVideoAssetSchema,resolvedVideoDraftSchema,videoDiagnostic,
  type VideoExecutionDraft,type ResolvedVideoAsset,type ResolvedVideoDraft,type ResolvedVideoInput,type VideoResult,
} from './execution-contract';

/** These ports belong to the authenticated application assembly, never to an
 * HTTP payload. Media resolution must use verifiedOwnedMedia/owned references,
 * not input.value, URL headers or client-declared MIME/bytes. */
export type VideoInputResolverPorts={
  scope:{actorId:string;projectKey:string|null;workspaceId?:string};
  media:(input:VideoExecutionDraft['inputs'][number])=>Promise<VideoResult<ResolvedVideoAsset>>;
  text:(input:VideoExecutionDraft['inputs'][number])=>Promise<VideoResult<string>>;
};
export async function resolveVideoDraft(raw:unknown,ports:VideoInputResolverPorts):Promise<VideoResult<ResolvedVideoDraft>> {
  const scope=videoExecutionScopeSchema.safeParse(ports.scope);
  if(!scope.success)return {ok:false,diagnostics:[videoDiagnostic('input','INVALID_VIDEO_SCOPE','scope','视频执行作用域无效','重新读取用户和项目')]};
  const parsed=videoDraftSchema.safeParse(raw);
  if(!parsed.success)return {ok:false,diagnostics:[videoDiagnostic('input','INVALID_VIDEO_DRAFT','draft','视频草稿结构无效','检查参数类型与输入结构')]};
  const draft=parsed.data,ids=new Set<string>();
  // Reject structural contradictions before invoking any ownership/media I/O.
  for(const input of draft.inputs){
    if(ids.has(input.id))return {ok:false,diagnostics:[videoDiagnostic('input','DUPLICATE_INPUT','inputs','引用身份重复','为每项引用使用唯一身份',input.id)]};
    ids.add(input.id);
    if(input.kind==='text'?!['context','author'].includes(input.role)
      :['context','author'].includes(input.role)||['first_frame','last_frame'].includes(input.role)&&input.kind!=='image'
        ||input.role==='source_video'&&input.kind!=='video'||input.role==='source_audio'&&input.kind!=='audio')
      return {ok:false,diagnostics:[videoDiagnostic('input','INPUT_ROLE_MISMATCH','inputs','素材角色与类型不一致','选择与素材类型一致的用途',input.id)]};
  }
  const inputs:ResolvedVideoInput[]=[];
  for(const input of draft.inputs){
    if(input.kind==='text'){
      const text=input.nodeId.startsWith('inline:')?{ok:true as const,value:input.value??''}:await ports.text({...input});
      if(!text.ok)return text;
      inputs.push({id:input.id,nodeId:input.nodeId,kind:'text',role:input.role as 'context'|'author',text:text.value});
      continue;
    }
    const media=await ports.media({...input});if(!media.ok)return media;
    const decoded=resolvedVideoAssetSchema.safeParse(media.value);
    if(!decoded.success||!decoded.data.mimeType.startsWith(input.kind+'/')||input.kind!=='image'&&!decoded.data.durationSeconds)
      return {ok:false,diagnostics:[videoDiagnostic('input','INVALID_MEDIA_FACTS','inputs','素材真实类型或元数据无法核对','重新检查媒体资产',input.id)]};
    inputs.push({id:input.id,nodeId:input.nodeId,kind:input.kind,role:input.role as Exclude<typeof input.role,'context'|'author'>,asset:decoded.data});
  }
  const result=resolvedVideoDraftSchema.safeParse({...draft,inputs,scope:scope.data});
  if(!result.success)return {ok:false,diagnostics:[videoDiagnostic('input','INVALID_RESOLVED_DRAFT','draft','解析后的草稿或作用域无效','重新读取项目与素材')]};
  return {ok:true,value:result.data};
}
