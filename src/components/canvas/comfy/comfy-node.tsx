"use client";
import {memo,useEffect,useMemo,useRef,useState,type PointerEvent} from "react";
import {useReactFlow,type NodeProps} from "@xyflow/react";
import {ChevronDown,ChevronRight,Download,Play,Workflow} from "lucide-react";
import {projectComfyGraph,type ComfyField,type ComfyGraphNode} from "@/lib/comfyui/document";
import type {CanvasComfyNode,ComfyNodeActions} from "@/lib/canvas/comfy-node-schema";
import styles from "./comfy-node.module.css";

export type ComfyNodeData=Record<string,unknown>&{node:CanvasComfyNode;actions:ComfyNodeActions;readOnly?:boolean;saving?:boolean};
function Field({field,disabled,save}:{field:ComfyField;disabled:boolean;save:(value:unknown)=>Promise<unknown>}){
 const [value,setValue]=useState(field.value),[error,setError]=useState("");useEffect(()=>{setValue(field.value);setError("");},[field.value]);
 const commit=async(next:unknown)=>{setValue(next);if(Object.is(next,field.value))return;try{await save(next);setError("");}catch(e){setError(e instanceof Error?e.message:"保存失败");}};
 return <label className={styles.field}><span>{field.label}</span>{typeof value==="boolean"?<input aria-label={field.label} type="checkbox" checked={value} disabled={disabled} onChange={e=>void commit(e.target.checked)}/>:typeof value==="number"?<input aria-label={field.label} type="number" step="any" value={String(value)} disabled={disabled} onChange={e=>setValue(e.target.value)} onBlur={e=>{const n=Number(e.target.value);if(e.target.value.trim()&&Number.isFinite(n))void commit(n);else setError("请输入有效数值");}}/>:typeof field.value==="number"?<input aria-label={field.label} type="number" step="any" value={String(value)} disabled={disabled} onChange={e=>setValue(e.target.value)} onBlur={e=>{const n=Number(e.target.value);if(e.target.value.trim()&&Number.isFinite(n))void commit(n);else setError("请输入有效数值");}}/>:typeof value==="string"?<textarea aria-label={field.label} rows={2} value={value} disabled={disabled} onChange={e=>setValue(e.target.value)} onBlur={e=>void commit(e.target.value)}/>:<pre title={JSON.stringify(value,null,2)}>{JSON.stringify(value)}</pre>}{error&&<small role="alert">{error}</small>}</label>;
}
function Card({node,zoom,disabled,onMove,onField,preview}:{node:ComfyGraphNode;zoom:()=>number;disabled:boolean;onMove:(x:number,y:number)=>Promise<unknown>;onField:(key:string,value:unknown)=>Promise<unknown>;preview:(point:{x:number;y:number}|null)=>void}){
 const [position,setPosition]=useState({x:node.x,y:node.y}),[error,setError]=useState("");
 const drag=useRef<{x:number;y:number;cx:number;cy:number;zoom:number}|null>(null);
 useEffect(()=>{if(!drag.current)setPosition({x:node.x,y:node.y});},[node.x,node.y]);
 const start=(e:PointerEvent)=>{if(disabled||e.button!==0)return;e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);drag.current={...position,cx:e.clientX,cy:e.clientY,zoom:zoom()};};
 const move=(e:PointerEvent)=>{const d=drag.current;if(d){const next={x:Math.max(8,d.x+(e.clientX-d.cx)/d.zoom),y:Math.max(30,d.y+(e.clientY-d.cy)/d.zoom)};setPosition(next);preview(next);}};
 const end=async(e:PointerEvent)=>{const d=drag.current;if(!d)return;drag.current=null;e.currentTarget.releasePointerCapture(e.pointerId);try{await onMove(position.x,position.y);setError("");}catch(cause){setPosition({x:node.x,y:node.y});setError(cause instanceof Error?cause.message:"位置保存失败");}finally{preview(null);}};
 return <section data-testid="comfy-graph-node" data-node-id={node.id} className={`nodrag nopan ${styles.card}`} style={{left:position.x,top:position.y,width:node.width,minHeight:node.height}}>
  <header onPointerDown={start} onPointerMove={move} onPointerUp={e=>void end(e)} onPointerCancel={()=>{drag.current=null;preview(null);setPosition({x:node.x,y:node.y});}}><b title={node.title}>{node.title}</b><span title={node.classType}>{node.classType}</span></header>
  <div className={styles.ports}>{node.inputs.map((name,i)=><div key={`${name}-${i}`}><i/>{name}</div>)}</div>
  <div className={`nowheel ${styles.fields}`}>{node.fields.map(field=><Field key={field.key} field={field} disabled={disabled} save={value=>onField(field.key,value)}/>)}</div>
  <div className={styles.outputs}>{node.outputs.map((name,i)=><span key={i} title={name}>{name}<i/></span>)}</div>
  {error&&<small role="alert">{error}</small>}
 </section>;
}
function exportWorkflow(node:CanvasComfyNode){
 const raw=structuredClone(node.workflow.raw);
 if(node.workflow.format==="ui"&&Array.isArray(raw.nodes)){const graph=projectComfyGraph(node.workflow);for(const rawNode of raw.nodes){const n=rawNode as Record<string,unknown>,position=node.workflow.positions[String(n.id)];if(Object.keys(node.workflow.positions).length){const view=graph.nodes.find(n2=>n2.id===String(n.id));if(view)n.pos=[view.x,view.y];}}}
 const url=URL.createObjectURL(new Blob([JSON.stringify(raw,null,2)],{type:"application/json"})),a=document.createElement("a");a.href=url;a.download=`${node.title.replace(/[\\/:*?"<>|]/g,"_")}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export const ComfyCanvasNode=memo(function ComfyCanvasNode({data,selected}:NodeProps){
 const {node,actions,readOnly:documentReadOnly=false,saving=false}=data as ComfyNodeData,readOnly=documentReadOnly||!!(data.settings as {locked?:boolean}|undefined)?.locked,flow=useReactFlow(),base=useMemo(()=>projectComfyGraph(node.workflow),[node.workflow]);
 const [previews,setPreviews]=useState<Record<string,{x:number;y:number}>>({});
 const graph={...base,nodes:base.nodes.map(item=>({...item,...previews[item.id]}))};
 const [error,setError]=useState("");
 const toggle=async()=>{try{await actions.collapse(node.id);setError("");}catch(cause){setError(cause instanceof Error?cause.message:"保存失败");}};
 return <div data-testid="comfy-workflow-group" className={`${styles.root} ${selected?styles.selected:""}`} style={{width:node.width,height:node.height}}>
  <div className={`comfy-workflow-handle ${styles.heading}`}><Workflow size={17}/><strong>{node.title}</strong><span>{graph.nodes.length} 节点</span><div className={`nodrag nopan ${styles.buttons}`}>
   <button aria-label={node.workflow.collapsed?"展开工作流":"折叠工作流"} disabled={readOnly||saving} onClick={()=>void toggle()}>{node.workflow.collapsed?<ChevronRight size={16}/>:<ChevronDown size={16}/>}</button>
   <button aria-label="导出工作流" onClick={()=>exportWorkflow(node)}><Download size={16}/></button>
   <button className={styles.run} disabled={readOnly||saving} onClick={()=>actions.run(node.id)}><Play size={13}/>运行</button>
  </div></div>
  {error&&<p role="alert">{error}</p>}
  {!node.workflow.collapsed&&<div className={`nodrag ${styles.graph}`} style={{height:graph.height}}>
   {graph.groups.map((group,i)=><div key={i} className={styles.subgroup} style={{left:group.x,top:group.y,width:group.width,height:group.height}}><span>{group.title}</span></div>)}
   <svg className={styles.edges} width={graph.width} height={graph.height} aria-label="工作流连线">{graph.edges.map(edge=>{const source=graph.nodes.find(n=>n.id===edge.source)!,target=graph.nodes.find(n=>n.id===edge.target)!,x1=source.x+source.width,y1=source.y+58+Math.max(0,source.outputSlots.indexOf(edge.sourceSlot))*18,x2=target.x,y2=target.y+58+Math.max(0,target.inputs.indexOf(edge.targetPort))*20,bend=Math.max(45,Math.abs(x2-x1)/2);return <path key={edge.id} data-testid="comfy-graph-edge" d={`M ${x1} ${y1} C ${x1+bend} ${y1}, ${x2-bend} ${y2}, ${x2} ${y2}`}><title>{`${source.title} → ${target.title} · ${edge.targetPort}`}</title></path>;})}</svg>
   {graph.nodes.map(item=><Card key={item.id} node={item} zoom={()=>flow.getZoom()} preview={point=>setPreviews(current=>{const next={...current};if(point)next[item.id]=point;else delete next[item.id];return next;})} disabled={readOnly||saving} onMove={(x,y)=>actions.move(node.id,item.id,x,y)} onField={(key,value)=>actions.field(node.id,item.id,key,value)}/>)}
  </div>}
 </div>;
});
