"use client";
import type {StoryboardContext,ReviewRemake} from "@/lib/storyboard/review";
import {useState} from "react";
import {ArrowDown,ArrowUp,Copy,Film,Plus,Save,X} from "lucide-react";
import type {CanvasVideoNode} from "@/lib/canvas/video-node-schema";
import {nextShotNumber,restructureStoryboardShots,type StoryboardDocument,type StoryboardShot} from "@/lib/storyboard/plan";
import type {StoryboardSelection} from "@/lib/video/storyboard-client";
import type {VideoPrivateFetch} from "./use-video-nodes";
import {useStoryboardPlan} from "./use-storyboard-plan";
import {useStoryboardFork} from "./use-storyboard-fork";
import {StoryboardProductionPanel} from "./storyboard-production-panel";
import type {VideoInputChoice} from "@/lib/video/client-settings";
import {StoryboardRestructure} from "./storyboard-restructure";
import {StoryboardTakes} from "./storyboard-takes";

export function StoryboardPlanEditor({scope,projectKey,nodes,initialNodeIds,request,english=false,blocked,onEditNode,onSubmit,onNodesCreated,choices,onOpenTimeline}:{scope:string;projectKey:string;nodes:CanvasVideoNode[];initialNodeIds:string[];request:VideoPrivateFetch;english?:boolean;blocked:boolean;onEditNode:(id:string)=>void;choices?:VideoInputChoice[];onOpenTimeline?:(id:string)=>Promise<void>|void;onNodesCreated:(nodes:CanvasVideoNode[])=>void;onSubmit:(selection:StoryboardSelection[],assemble:boolean,plan:StoryboardContext)=>Promise<unknown>}){
  const L=(zh:string,en:string)=>english?en:zh;
  const [createdNodes,setCreatedNodes]=useState<CanvasVideoNode[]>([]),[restructure,setRestructure]=useState<{nodes:CanvasVideoNode[];document:StoryboardDocument}|null>(null);
  const available=[...nodes,...createdNodes.filter(node=>!nodes.some(item=>item.id===node.id))];
  const store=useStoryboardPlan({scope,projectKey,nodes:available,initialNodeIds,request});
  const fork=useStoryboardFork(scope,projectKey,request);
  const [open,setOpen]=useState<string|null>(null),[adding,setAdding]=useState(""),[execution,setExecution]=useState<Record<string,"generate"|"reuse"|"skip">>({}),[actionError,setActionError]=useState(""),[acting,setActing]=useState(false);
  const doc=store.draft?.document,locked=blocked||store.busy||acting||!!store.draft?.pending||!!restructure||!!fork.pending;
  const css="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 disabled:opacity-40";
  const update=(next:StoryboardDocument)=>{try{store.update(next);}catch(cause){setActionError(cause instanceof Error?cause.message:"草稿保存失败");}};
  const patch=(shot:StoryboardShot)=>{if(doc)update({...doc,shots:doc.shots.map(item=>item.nodeId===shot.nodeId?shot:item)});};
  const act=async(action:()=>Promise<unknown>)=>{if(acting)return;setActing(true);setActionError("");try{await action();}catch(cause){setActionError(cause instanceof Error?cause.message:"操作失败");}finally{setActing(false);}};
  const selected=doc?.shots.filter(shot=>execution[shot.nodeId]!=="skip")||[];
  const mode=(shot:StoryboardShot)=>execution[shot.nodeId]||(shot.adoptedArtworkId?"reuse":"generate");
  const hasGeneration=selected.some(shot=>mode(shot)==="generate"),canAssemble=selected.length>1&&selected.every(shot=>!!shot.adoptedArtworkId);
  const submit=(assemble:boolean)=>act(async()=>{
    const plan=await store.save();
    await onSubmit(selected.map(shot=>({id:shot.nodeId,reuseCompleted:assemble||mode(shot)==="reuse"})),assemble,{id:plan.id,revision:plan.revision});
  });
  if(store.loading)return <p role="status" className="text-xs text-slate-500">{L("读取镜头方案","Loading shot plan")}</p>;
  return <section className="space-y-3" aria-label={L("镜头方案","Shot plan")}>
    {store.error&&<p role="alert" className="text-xs text-red-600">{store.error}</p>}{actionError&&<p role="alert" className="text-xs text-red-600">{actionError}</p>}
    {doc&&<><div className="flex flex-wrap gap-2">
      <select aria-label={L("已保存方案","Saved plans")} className={`${css} min-w-0 flex-1`} value={store.plans.some(plan=>plan.id===store.draft?.id)?store.draft!.id:""} disabled={locked} onChange={event=>{const plan=store.plans.find(plan=>plan.id===event.target.value);if(plan)void act(async()=>{if(store.dirty)await store.save();store.select(plan);setExecution({});});}}><option value="">{L("新方案","New plan")}</option>{store.plans.map(plan=><option key={plan.id} value={plan.id}>{plan.document.title}</option>)}</select>
      <button type="button" className={css} disabled={locked} onClick={()=>void act(async()=>{if(store.dirty)await store.save();store.copy();})}><Copy size={13}/>{L("共享副本","Shared copy")}</button>
      <button type="button" className={css} disabled={blocked||store.busy||acting||!!store.draft?.pending||!!restructure||!doc.shots.length} onClick={()=>void act(async()=>{
        const value=await fork.submit(async()=>{const plan=store.dirty||!store.draft?.revision?await store.save():store.draft;return {planId:plan.id,revision:plan.revision,title:`${plan.document.title.slice(0,190)} 独立版`,nodes:plan.document.shots.map(shot=>{const node=available.find(node=>node.id===shot.nodeId);if(!node)throw new Error("分叉镜头已移除，请重新读取");return {id:node.id,revision:node.revision};})};});
        setCreatedNodes(old=>[...old.filter(node=>!value.nodes.some(item=>item.id===node.id)),...value.nodes]);onNodesCreated(value.nodes);store.select(value.plan);setExecution({});setOpen(null);
      })}>{fork.pending?L("核对独立版本","Check independent version"):L("独立版本","Independent version")}</button>
      <button type="button" className={css} disabled={blocked||store.busy||acting||!store.dirty&&!store.draft?.pending} onClick={()=>void act(store.save)}><Save size={13}/>{store.draft?.pending?L("核对保存","Check save"):L("保存","Save")}</button>
    </div>
    {!!store.error&&store.plans.some(plan=>plan.id===store.draft?.id)&&!store.draft?.pending&&<button type="button" className={css} disabled={locked} onClick={()=>void act(store.reload)}>{L("载入已保存方案","Load saved plan")}</button>}
    <div className="flex items-center gap-2"><input aria-label={L("方案名称","Plan name")} maxLength={200} className="min-w-0 flex-1 rounded-lg border border-slate-200 p-2 text-sm font-medium" value={doc.title} disabled={locked} onChange={event=>update({...doc,title:event.target.value})}/><span role="status" className="text-xs text-slate-500">{store.busy?L("保存中","Saving"):store.dirty?L("草稿","Draft"):L("已保存","Saved")}</span></div>
    {restructure&&<StoryboardRestructure nodes={restructure.nodes} planId={store.draft!.id} scope={scope} request={request} english={english} onClose={()=>setRestructure(null)} onApplied={async(created)=>{
      const next=restructureStoryboardShots(restructure.document,restructure.nodes.map(node=>node.id),created.map(node=>node.id));
      setCreatedNodes(old=>[...old.filter(node=>!created.some(item=>item.id===node.id)),...created]);onNodesCreated(created);store.update(next);await store.save();
    }}/>}
    <ol className="space-y-3">{doc.shots.map((shot,index)=>{const node=available.find(node=>node.id===shot.nodeId),move=(step:number)=>{const shots=[...doc.shots];[shots[index],shots[index+step]]=[shots[index+step],shots[index]];update({...doc,shots});};return <li key={shot.nodeId} data-testid={`storyboard-shot-${shot.nodeId}`} className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2"><input aria-label={`${L("镜号","Shot number")} ${node?.title||shot.number}`} value={shot.number} maxLength={40} disabled={locked} className="w-12 rounded border border-slate-200 p-1 text-xs" onChange={event=>patch({...shot,number:event.target.value})}/><button type="button" className="min-w-0 flex-1 truncate text-left text-sm font-medium" disabled={locked||!node} onClick={()=>void act(async()=>{await store.save();onEditNode(shot.nodeId);})}>{node?.title||L("镜头已移除","Shot unavailable")}</button><span className="text-xs text-slate-500">{node?.config.durationSeconds??"—"}s</span><button type="button" className={css} aria-label={`${L("移出方案","Remove from plan")} ${shot.number}`} disabled={locked} onClick={()=>update({...doc,shots:doc.shots.filter(item=>item.nodeId!==shot.nodeId)})}><X size={12}/></button></div>
      {node&&<p className="my-2 line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">{node.config.prompt}</p>}
      <div className="flex flex-wrap items-center gap-2"><select aria-label={`${node?.title||shot.number} ${L("执行方式","execution")}`} className={`${css} mr-auto`} disabled={locked||!node} value={mode(shot)} onChange={event=>setExecution(old=>({...old,[shot.nodeId]:event.target.value as "reuse"|"generate"|"skip"}))}><option value="generate">{L("生成新候选","New take")}</option><option value="reuse" disabled={!shot.adoptedArtworkId}>{L("复用采用版本","Reuse adopted take")}</option><option value="skip">{L("本轮跳过","Skip this run")}</option></select><button type="button" className={css} disabled={locked||!node} onClick={()=>setOpen(open===shot.nodeId?null:shot.nodeId)}><Film size={13}/>{L("选片","Review takes")}{shot.adoptedArtworkId?" ✓":""}</button><button type="button" className={css} aria-label={`${L("上移","Move up")} ${node?.title||shot.number}`} disabled={locked||index===0} onClick={()=>move(-1)}><ArrowUp size={13}/></button><button type="button" className={css} aria-label={`${L("下移","Move down")} ${node?.title||shot.number}`} disabled={locked||index===doc.shots.length-1} onClick={()=>move(1)}><ArrowDown size={13}/></button></div>
      <div className="mt-2 flex gap-2"><button type="button" className={css} disabled={locked||!node} onClick={()=>void act(async()=>{await store.save();setRestructure({nodes:[node!],document:structuredClone(doc)});})}>{L("拆镜","Split")}</button><button type="button" className={css} disabled={locked||!node||!doc.shots[index+1]||!available.some(item=>item.id===doc.shots[index+1]?.nodeId)} onClick={()=>void act(async()=>{await store.save();setRestructure({nodes:[node!,available.find(item=>item.id===doc.shots[index+1].nodeId)!],document:structuredClone(doc)});})}>{L("与下一镜合并","Merge with next")}</button></div>
      <details className="mt-2 text-xs text-slate-600"><summary className="cursor-pointer">{L("场景与镜头意图","Scene and intent")}</summary><div className="mt-2 grid gap-2"><input className="rounded border border-slate-200 p-2" aria-label={`${shot.number} ${L("场景","Scene")}`} placeholder={L("场景","Scene")} value={shot.scene} maxLength={200} disabled={locked} onChange={event=>patch({...shot,scene:event.target.value})}/><textarea className="rounded border border-slate-200 p-2" aria-label={`${shot.number} ${L("镜头意图","Shot intent")}`} placeholder={L("这镜让观众知道什么","What does the audience learn?")} value={shot.purpose} rows={2} maxLength={2000} disabled={locked} onChange={event=>patch({...shot,purpose:event.target.value})}/>{shot.source&&<p>{shot.source.mapping.supplement?`${L("创作补充","Added shot")}: ${shot.source.mapping.supplement}`:L("已关联正式原稿","Linked to saved script")} · {shot.source.mapping.dialogue.length} {L("句对白","spoken lines")}</p>}</div></details>
      {open===shot.nodeId&&<StoryboardTakes shot={shot} projectKey={projectKey} request={request} disabled={locked} onChange={patch} english={english} scope={scope} planId={store.draft!.id} onRemake={(review:ReviewRemake)=>act(async()=>{const plan=await store.save();await onSubmit([{id:shot.nodeId,reuseCompleted:false}],false,{id:plan.id,revision:plan.revision,review});})}/>}
    </li>;})}</ol>
    <div className="flex gap-2"><select className={`${css} min-w-0 flex-1`} aria-label={L("添加已有镜头","Add existing shot")} value={adding} disabled={locked} onChange={event=>setAdding(event.target.value)}><option value="">{L("选择镜头","Choose shot")}</option>{available.filter(node=>!doc.shots.some(shot=>shot.nodeId===node.id)).map(node=><option key={node.id} value={node.id}>{node.title}</option>)}</select><button type="button" className={css} disabled={locked||!adding} onClick={()=>{update({...doc,shots:[...doc.shots,{nodeId:adding,number:nextShotNumber(doc.shots),scene:"",purpose:"",takes:[],adoptedArtworkId:null}]});setAdding("");}}><Plus size={13}/>{L("加入方案","Add shot")}</button></div>
    <StoryboardProductionPanel scope={scope} projectKey={projectKey} document={doc} revision={store.draft!.revision} dirty={store.dirty} selection={selected.map(shot=>({id:shot.nodeId,reuseCompleted:mode(shot)==="reuse"}))} choices={choices} request={request} disabled={locked} onSave={store.save} onChange={update} onOpenTimeline={onOpenTimeline}/>
    <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3"><button type="button" className={css} disabled={locked||!hasGeneration||selected.some(shot=>!available.some(node=>node.id===shot.nodeId))} onClick={()=>void submit(false)}>{L("生成所选镜头","Generate selected shots")}</button><button type="button" className={`${css} !bg-slate-900 !text-white`} disabled={locked||!canAssemble} onClick={()=>void submit(true)}>{L("合成采用版本","Assemble adopted takes")}</button></div>
    </>}
  </section>;
}
