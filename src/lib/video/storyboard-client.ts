import type {StoryboardContext,ReviewOrigin} from "../storyboard/review";
import type {CanvasVideoNode} from "../canvas/video-node-schema";

export type StoryboardSelection={id:string;reuseCompleted:boolean};
export type StoryboardIntent={id:string;projectKey:string;storyboard?:StoryboardContext;nodes:Array<{id:string;revision:number;reuseCompleted?:boolean}>;assembly?:{nodeIds:string[]}};
export type StoryboardRun={runId:string;projectKey:string;progress:number;cancellationRequestedAt?:string|null;
  nodes:Array<{id:string;status:string;taskId?:string|null;error?:string|null;quote?:{version?:number;credits?:number;authorizedCredits?:number;authorization?:unknown}|null}>;
  plan:{reviewOrigin?:ReviewOrigin;nodes:Array<{id:string;canvasNodeId?:string;request:{prompt?:string;durationSeconds?:number}}>};
  assembly?:{status:string;attempt:number;jobId?:string|null;error?:string|null;outputs?:Array<{artworkId?:string;url:string;mimeType?:string;name?:string}>}|null};

/** This text delegates creative splitting to the existing Agent. The source is
 * a formal node identity, not a truncated copy of the script in a chat message. */
export function storyboardPlanningRequest(source:{id:string;projectKey:string;status:string;content:string},english=false){
  if(source.status!=="completed"||!source.content.trim())throw new Error(english?"Save a completed script first":"请先保存完整剧本");
  const identity=JSON.stringify({projectKey:source.projectKey,textNodeId:source.id});
  return {textNodeId:source.id,text:english
    ?`Read the complete saved script identified by ${identity}. Plan editable storyboard shots in this project using plan_video_storyboard and this formal script_source. Use multi_shot only when the current model explicitly supports structured shots and the complete script fits its legal duration; otherwise use independent shots. Preserve the entire original text and every line of dialogue in order. Query actual configured video capabilities, keep existing model choices, and do not silently switch models. Bind only each shot's original text and necessary existing references. Add dependencies only when a shot requires the previous real result. Prefer independent shots for individual take review. Set script_source.mapping to cinematic; each shot mapping.ranges may overlap or reorder, but their union must cover the source. Add mapping.supplement for shots with no source span. Assign each spoken dialogue range and speaker exactly once through mapping.dialogue. Include scene and purpose. Save the plan only; do not generate images, video or audio, do not run a workflow or assemble media. Report the actual saved node IDs.`
    :`读取正式剧本节点 ${identity} 的完整原文。使用 plan_video_storyboard 在当前项目保存可编辑分镜节点，以该节点作为正式 script_source。现有模型明确支持原生分镜且完整剧本可放入合法总时长时使用 multi_shot，否则使用 independent 独立镜头，不为凑时长删改原稿。按自然动作和对白节拍拆镜，逐字保留全部原文与对白，不遗漏、不重排、不把整份剧本接给每一镜。先查询实际已配置视频能力，沿用已有模型选择，不静默更换模型。每镜只绑定自身原文及必要的现有参考素材；只有确实需要前序真实结果时才建立依赖。优先使用 independent 独立镜头，以便逐镜选片。script_source.mapping 设为 cinematic；每镜 mapping.ranges 关联实际原稿范围，可重叠、倒序，范围并集覆盖全部制作原文。无原文镜头提供 mapping.supplement；mapping.dialogue 按实际原文范围与 speaker 记录本镜发声台词，同一句只能分配一次，反应镜头不重复朗读。填写 scene 和 purpose。本次仅保存分镜方案，不生成图片、视频或音频，不运行制作链，不合成媒体。返回实际保存的节点编号。`};
}

export function storyboardSelections(nodes:readonly CanvasVideoNode[]):StoryboardSelection[]{
  return [...nodes].filter(node=>!node.deletedAt).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)).map(node=>({id:node.id,reuseCompleted:!!(node.displayResultId||node.lastResultId)}));
}
export function storyboardIntent(id:string,projectKey:string,nodes:readonly CanvasVideoNode[],selection:readonly StoryboardSelection[],assemble:boolean):StoryboardIntent{
  if(!selection.length)throw new Error("请选择镜头");
  if(new Set(selection.map(item=>item.id)).size!==selection.length)throw new Error("镜头不能重复");
  const selected=selection.map(item=>{
    const node=nodes.find(node=>node.id===item.id&&node.projectKey===projectKey&&!node.deletedAt);
    if(!node)throw new Error("镜头已改变，请刷新后重试");
    if(item.reuseCompleted&&!node.displayResultId&&!node.lastResultId)throw new Error("镜头还没有可复用结果");
    return {id:node.id,revision:node.revision,...(item.reuseCompleted?{reuseCompleted:true}:{})};
  });
  if(assemble&&selected.length<2)throw new Error("合成至少需要两个镜头");
  return {id,projectKey,nodes:selected,...(assemble?{assembly:{nodeIds:selected.map(node=>node.id)}}:{})};
}
export function storyboardRunActive(run:StoryboardRun){
  return !run.cancellationRequestedAt&&(run.nodes.some(node=>["pending","processing"].includes(node.status))||!!run.assembly&&["waiting","queued","processing"].includes(run.assembly.status));
}
