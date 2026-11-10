"use client";
import {useMemo} from "react";
import {Workflow} from "lucide-react";
import {projectComfyGraph,type ComfyDocument} from "@/lib/comfyui/document";
export function ComfyProjectCover({document}:{document:ComfyDocument}){
 const graph=useMemo(()=>projectComfyGraph(document),[document]),byId=new Map(graph.nodes.map(node=>[node.id,node]));
 return <div className="relative h-full w-full bg-slate-50 p-4" data-testid="comfy-project-cover">
  <div className="mb-2 flex items-center gap-2 text-xs text-slate-600"><Workflow size={14}/>工作流<span className="ml-auto">{graph.nodes.length}</span></div>
  <svg width="100%" height="75%" viewBox={`0 0 ${graph.width} ${graph.height}`} aria-label="工作流节点预览">
   {graph.edges.map(edge=>{const a=byId.get(edge.source)!,b=byId.get(edge.target)!;return <path key={edge.id} d={`M ${a.x+a.width} ${a.y+50} L ${b.x} ${b.y+50}`} fill="none" stroke="#a5b4fc" strokeWidth={5}/>;})}
   {graph.nodes.map(node=><g key={node.id}><rect x={node.x} y={node.y} width={node.width} height={node.height} rx={10} fill="white" stroke="#cbd5e1" strokeWidth={3}/><rect x={node.x+12} y={node.y+14} width={node.width-24} height={24} rx={5} fill="#e0e7ff"/><text x={node.x+16} y={node.y+67} fontSize={18} fill="#64748b">{node.title.slice(0,20)}</text></g>)}
  </svg>
 </div>;
}
