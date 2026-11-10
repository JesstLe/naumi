/** Endpoint-free ComfyUI document. Raw input is authoritative and round-trips
 * unchanged; graph/layout are projections, never an executable substitute. */
import {detectWorkflowFormat, type ApiWorkflow} from "./workflow";

export type ComfyDocument={version:1;format:"api"|"ui";raw:Record<string,unknown>;positions:Record<string,{x:number;y:number}>;collapsed:boolean};
export type ComfyField={key:string;label:string;value:unknown};
export type ComfyGraphNode={id:string;title:string;classType:string;x:number;y:number;width:number;height:number;fields:ComfyField[];inputs:string[];outputs:string[];outputSlots:number[]};
export type ComfyGraph={nodes:ComfyGraphNode[];edges:{id:string;source:string;target:string;sourceSlot:number;targetPort:string}[];groups:{title:string;x:number;y:number;width:number;height:number}[];width:number;height:number};
export type ComfyObjectInfo=Record<string,{input?:{required?:Record<string,unknown[]>;optional?:Record<string,unknown[]>};input_order?:{required?:string[];optional?:string[]};output?:string[];output_node?:boolean}>;
const row=(x:unknown):Record<string,any>=>x&&typeof x==="object"&&!Array.isArray(x)?x as Record<string,any>:{};
const own=(o:object,k:string)=>Object.prototype.hasOwnProperty.call(o,k);
const point=(v:unknown,fallback:number)=>typeof v==="number"&&Number.isFinite(v)&&Math.abs(v)<=1e7?v:fallback;
const pair=(v:unknown)=>Array.isArray(v)?v:Object.values(row(v));
const ident=(v:unknown)=>typeof v==="string"||typeof v==="number"?String(v):"";
export function parseComfyDocument(value:unknown):ComfyDocument{
  const raw=typeof value==="string"?JSON.parse(value):value,format=detectWorkflowFormat(raw);
  if(!format)throw new Error("不是有效的 ComfyUI 工作流 JSON");
  if(JSON.stringify(raw).length>8*1024*1024)throw new Error("工作流文件超过 8 MiB");
  const data=row(raw),ids=format==="ui"?data.nodes.map((n:unknown)=>ident(row(n).id)):Object.keys(data);
  if(!ids.length||ids.some((id:string)=>!id)||new Set(ids).size!==ids.length)throw new Error("工作流节点编号为空或重复");
  if(format==="api"&&Object.values(data).some(n=>typeof row(n).class_type!=="string"||!row(n).inputs||Array.isArray(row(n).inputs)))throw new Error("API 工作流节点格式无效");
  if(format==="ui"&&data.nodes.some((n:unknown)=>typeof row(n).type!=="string"))throw new Error("工作流节点缺少类型");
  if(format==="api")for(const n of Object.values(data))for(const v of Object.values(row(row(n).inputs))){if(Array.isArray(v)&&v.length===2&&own(data,String(v[0]))&&typeof v[1]==="number"&&(!Number.isInteger(v[1])||v[1]<0||!Number.isSafeInteger(v[1])))throw new Error("工作流端口编号无效");}
  if(format==="ui")for(const value of Array.isArray(data.links)?data.links:[]){const l=Array.isArray(value)?value:[0,0,row(value).origin_slot,0,row(value).target_slot];if([l[2],l[4]].some(slot=>!Number.isInteger(slot)||slot<0||!Number.isSafeInteger(slot)))throw new Error("工作流端口编号无效");}
  return {version:1,format,raw:structuredClone(data),positions:{},collapsed:false};
}
export function validateComfyDocument(value:unknown):ComfyDocument{
  const doc=row(value);if(doc.version!==1)throw new Error("工作流文档版本无效");
  const parsed=parseComfyDocument(doc.raw);if(doc.format!==parsed.format)throw new Error("工作流格式不一致");
  const positions:ComfyDocument["positions"]={};
  for(const [id,p]of Object.entries(row(doc.positions))){const v=row(p);if(point(v.x,NaN)!==v.x||point(v.y,NaN)!==v.y)throw new Error("工作流节点位置无效");Object.defineProperty(positions,id,{value:{x:v.x,y:v.y},enumerable:true,writable:true,configurable:true});}
  return {...parsed,positions,collapsed:doc.collapsed===true};
}
function apiLink(value:unknown,raw:Record<string,unknown>):value is [string|number,number]{return Array.isArray(value)&&value.length===2&&(typeof value[0]==="string"||typeof value[0]==="number")&&Number.isInteger(value[1])&&value[1]>=0&&own(raw,String(value[0]));}
export function projectComfyGraph(doc:ComfyDocument):ComfyGraph{
  const nodes:ComfyGraphNode[]=[],edges:ComfyGraph["edges"]=[],groups:ComfyGraph["groups"]=[];
  if(doc.format==="api"){
    for(const [id,value]of Object.entries(doc.raw)){
      const n=row(value),fields:ComfyField[]=[],inputs:string[]=[];
      for(const [key,value]of Object.entries(row(n.inputs))){if(apiLink(value,doc.raw)){inputs.push(key);edges.push({id:`${id}:${key}`,source:String(value[0]),sourceSlot:value[1],target:id,targetPort:key});}else fields.push({key,label:key,value});}
      nodes.push({id,title:typeof row(n._meta).title==="string"?row(n._meta).title:n.class_type,classType:n.class_type,x:0,y:0,width:270,height:Math.max(100,68+fields.length*60+inputs.length*20),fields,inputs,outputs:[],outputSlots:[]});
    }
    const levels=new Map<string,number>(),indegree=new Map(nodes.map(n=>[n.id,0])),out=new Map<string,string[]>();
    for(const e of edges){indegree.set(e.target,(indegree.get(e.target)||0)+1);out.set(e.source,[...out.get(e.source)||[],e.target]);}
    const queue=nodes.filter(n=>!indegree.get(n.id)).map(n=>n.id);
    for(let i=0;i<queue.length;i++){const id=queue[i],level=levels.get(id)||0;for(const target of out.get(id)||[]){levels.set(target,Math.max(levels.get(target)||0,level+1));indegree.set(target,indegree.get(target)!-1);if(!indegree.get(target))queue.push(target);}}
    const bottoms=new Map<number,number>();for(const n of nodes){const level=Math.min(levels.get(n.id)||0,nodes.length);n.x=level*330;n.y=bottoms.get(level)||0;bottoms.set(level,n.y+n.height+55);}
  }else{
    const rawNodes=row(doc.raw).nodes as unknown[];
    for(const value of rawNodes){const n=row(value),pos=pair(n.pos),size=pair(n.size),fields:ComfyField[]=[];
      if(Array.isArray(n.widgets_values))n.widgets_values.forEach((value:unknown,index:number)=>fields.push({key:String(index),label:`参数 ${index+1}`,value}));
      else for(const [key,value]of Object.entries(row(n.widgets_values)))fields.push({key,label:key,value});
      const inputs=(Array.isArray(n.inputs)?n.inputs:[]).map((p:unknown,i:number)=>String(row(p).name||`输入 ${i+1}`));
      nodes.push({id:ident(n.id),title:typeof n.title==="string"?n.title:n.type,classType:n.type,x:point(pos[0],0),y:point(pos[1],0),width:Math.max(270,Math.min(1000,point(size[0],270))),height:Math.max(point(size[1],0),100,68+fields.length*60+inputs.length*20),fields,inputs,outputSlots:[],outputs:(Array.isArray(n.outputs)?n.outputs:[]).map((p:unknown,i:number)=>String(row(p).name||`输出 ${i+1}`))});
    }
    for(const value of Array.isArray(doc.raw.links)?doc.raw.links:[]){const l=Array.isArray(value)?value:[row(value).id,row(value).origin_id,row(value).origin_slot,row(value).target_id,row(value).target_slot];const target=nodes.find(n=>n.id===ident(l[3]));if(target&&nodes.some(n=>n.id===ident(l[1])))edges.push({id:ident(l[0]),source:ident(l[1]),sourceSlot:Number(l[2])||0,target:target.id,targetPort:target.inputs[Number(l[4])]||`输入 ${Number(l[4])+1}`});}
    for(const value of Array.isArray(doc.raw.groups)?doc.raw.groups:[]){const g=row(value),b=pair(g.bounding);groups.push({title:String(g.title||"分组"),x:point(b[0],0),y:point(b[1],0),width:Math.max(20,point(b[2],300)),height:Math.max(20,point(b[3],200))});}
  }
  const left=Math.min(0,...nodes.map(n=>n.x),...groups.map(g=>g.x)),top=Math.min(0,...nodes.map(n=>n.y),...groups.map(g=>g.y));
  for(const n of nodes){const pos=own(doc.positions,n.id)?doc.positions[n.id]:undefined;n.x=pos?.x??n.x-left+32;n.y=pos?.y??n.y-top+48;const labels=n.outputs;n.outputSlots=[...new Set([...labels.map((_,index)=>index),...edges.filter(e=>e.source===n.id).map(e=>e.sourceSlot)])].sort((a,b)=>a-b);n.outputs=n.outputSlots.map(slot=>labels[slot]||`输出 ${slot+1}`);n.height=Math.max(n.height,80+n.outputs.length*18);}
  for(const g of groups){g.x-=left-32;g.y-=top-48;}
  return {nodes,edges,groups,width:Math.max(380,...nodes.map(n=>n.x+n.width+40)),height:Math.max(180,...nodes.map(n=>n.y+n.height+40))};
}
export function editComfyField(doc:ComfyDocument,id:string,key:string,value:unknown):ComfyDocument{
  const next=structuredClone(doc);
  if(doc.format==="api"){if(!own(next.raw,id)||!own(row(next.raw[id]).inputs,key))throw new Error("工作流参数不存在");row(next.raw[id]).inputs[key]=value;}
  else{const node=row(next.raw).nodes.find((n:unknown)=>ident(row(n).id)===id);if(!node||!own(node.widgets_values,key))throw new Error("工作流参数不存在");node.widgets_values[key]=value;}
  return next;
}
/** UI widget ordering requires the actual endpoint schema. Unknown/custom
 * serializers and bypass semantics are never guessed into a runnable prompt. */
export function compileComfyDocument(doc:ComfyDocument,info?:ComfyObjectInfo):ApiWorkflow{
  if(doc.format==="api")return structuredClone(doc.raw) as ApiWorkflow;
  if(!info)throw new Error("连接端点后校验节点参数，再运行此工作流");
  const result:ApiWorkflow=Object.create(null),graph=projectComfyGraph(doc);
  for(const value of row(doc.raw).nodes){const n=row(value),id=ident(n.id),definition=info[n.type];
    if(n.mode===2)continue;
    if(n.mode===4||!definition)throw new Error(`节点 ${n.title||n.type} 需要对应节点定义或 API 格式后运行`);
    const inputs:Record<string,unknown>=Object.create(null),widgets=n.widgets_values||[],required=definition.input?.required||{},optional=definition.input?.optional||{};
    const names=[...(definition.input_order?.required||Object.keys(required)),...(definition.input_order?.optional||Object.keys(optional))];let cursor=0;
    for(const key of names){const spec=required[key]||optional[key],linked=graph.edges.find(e=>e.target===id&&e.targetPort===key);if(linked){inputs[key]=[linked.source,linked.sourceSlot];continue;}
      if(!Array.isArray(spec))continue;const type=spec[0],options=row(spec[1]),widget=Array.isArray(type)||["INT","FLOAT","STRING","BOOLEAN"].includes(String(type));
      if(!widget||options.forceInput){if(own(required,key))throw new Error(`节点 ${n.title||n.type} 缺少输入 ${key}`);continue;}
      const present=Array.isArray(widgets)?cursor<widgets.length:own(widgets,key),v=Array.isArray(widgets)?widgets[cursor++]:widgets[key];
      if(!present)throw new Error(`节点 ${n.title||n.type} 的 ${key} 参数待确认，请导入 API 格式`);
      if((type==="INT"||type==="FLOAT")&&typeof v!=="number"||type==="BOOLEAN"&&typeof v!=="boolean"||type==="STRING"&&typeof v!=="string"||Array.isArray(type)&&!type.includes(v))throw new Error(`节点 ${n.title||n.type} 的 ${key} 与端点定义不一致`);
      inputs[key]=v;
      if(Array.isArray(widgets)&&options.control_after_generate){if(["fixed","increment","decrement","randomize"].includes(String(widgets[cursor])))cursor++;else throw new Error(`节点 ${n.title||n.type} 的种子控件待确认`);}
    }
    if(Array.isArray(widgets)&&cursor!==widgets.length)throw new Error(`节点 ${n.title||n.type} 含自定义控件，请导入 API 格式后运行`);
    result[id]={class_type:n.type,inputs,_meta:{title:typeof n.title==="string"?n.title:n.type}};
  }
  for(const node of Object.values(result))for(const v of Object.values(node.inputs))if(Array.isArray(v)&&v.length===2&&typeof v[0]==="string"&&!own(result,v[0]))throw new Error("工作流引用了停用节点，请修正后运行");
  return result;
}
