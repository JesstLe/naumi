import {NextResponse} from "next/server";
import {authorizedTargetEmail} from "@/lib/request-auth";
import {getActiveComfyEndpoint, listComfyWorkflows, getComfyWorkflow} from "@/lib/comfyui/repository";
import {extractWorkflowInputs,type ApiWorkflow} from "@/lib/comfyui/workflow";
import {knownComfyVideoOutput} from "@/lib/video/byoc";
import type {VideoByocWorkflow} from "@/lib/video/byoc-settings";
export const runtime="nodejs",dynamic="force-dynamic";
export async function GET(request:Request){
  const actor=await authorizedTargetEmail(request,new URL(request.url).searchParams.get("email"),true);if(!actor)return NextResponse.json({error:"未登录或无权访问"},{status:401});
  try{const [endpoint,list]=await Promise.all([getActiveComfyEndpoint(actor),listComfyWorkflows(actor)]),workflows:VideoByocWorkflow[]=[];
    for(const item of list){const workflow=await getComfyWorkflow(actor,item.id);if(!workflow)continue;if(Array.isArray(workflow.apiJson.nodes))continue;const api=workflow.apiJson as ApiWorkflow,inputs=extractWorkflowInputs(api);
      workflows.push({id:item.id,name:item.name,videoOutput:knownComfyVideoOutput(api),inputs,paths:Object.entries(api).flatMap(([nodeId,node])=>Object.entries(node.inputs).filter(([,value])=>!Array.isArray(value)&&!(value&&typeof value==="object")).map(([field])=>({nodeId,field,label:`${node._meta?.title||node.class_type} ${nodeId}.${field}`}))),defaultMappings:inputs.images.map((slot,index)=>({name:`image-${slot.nodeId}`,type:"image",path:[slot.nodeId,"inputs","image"],index,required:true}))});
    }
    return NextResponse.json({endpoint:endpoint?{id:endpoint.id,name:endpoint.name}:null,workflows},{headers:{"cache-control":"private, no-store"}});
  }catch{return NextResponse.json({error:"自备工作流读取失败"},{status:503});}
}
