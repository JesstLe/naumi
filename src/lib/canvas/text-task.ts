import {createRetainedBillingSubmission,type RetainedBillingSubmission} from "../billing/client-submission";
import type {CanvasDocumentScope} from "./document-scope";
import {rebaseText,type CanvasTextNode} from "./text-document-model";
import {withTextProduct,type CanvasTextTaskRequest} from "./text-task-request";
import {browserRandomUUID} from "../browser-crypto";

export type CanvasTextTaskState={busy:boolean;phase:"idle"|"submitting"|"saving"|"retry"|"rejected"|"succeeded";error:string;hasResult:boolean};
export type CanvasTextTaskPorts={
  submit:(request:CanvasTextTaskRequest,submission:RetainedBillingSubmission,scope:CanvasDocumentScope)=>Promise<Response>;
  document:{getSnapshot:()=>{nodes:CanvasTextNode[]};set:(update:(nodes:CanvasTextNode[])=>CanvasTextNode[])=>void;save:(node:CanvasTextNode)=>Promise<CanvasTextNode|null>};
  history:(node:CanvasTextNode)=>void;model:(value:string)=>void;changed:()=>void;errorText:string;
};
/** One paid text intent and one known answer. Saving or resuming never re-quotes
 * or regenerates a known answer; browser scope controls new submission, while
 * the originating document can accept completed work after project navigation. */
export function createCanvasTextTask(original:CanvasTextTaskRequest){
  const request=structuredClone(original);let submission=createRetainedBillingSubmission();
  let result:{text:string;model?:string}|undefined,recorded=false,inserted=false,pending:CanvasTextNode|undefined,flight:Promise<boolean>|undefined;
  let state:CanvasTextTaskState={busy:false,phase:"idle",error:"",hasResult:false};
  const publish=(ports:CanvasTextTaskPorts,patch:Partial<CanvasTextTaskState>)=>{state={...state,...patch,hasResult:!!result};ports.changed();};
  const run=async(scope:CanvasDocumentScope,ports:CanvasTextTaskPorts)=>{
    if(state.phase==="rejected"){submission=createRetainedBillingSubmission();request.operationId=browserRandomUUID();}
    const document=ports.document;
    const live=()=>document.getSnapshot().nodes.find(node=>node.id===request.node.id);
    let rejected=false;
    try{
      scope.assertView();publish(ports,{busy:true,phase:result?"saving":"submitting",error:""});
      if(!inserted){
        pending={...request.node,status:"generating",updatedAt:new Date().toISOString()};
        if(!request.created&&!live())throw new Error("文字节点已移除");
        document.set(nodes=>request.created&&!nodes.some(node=>node.id===pending!.id)?[...nodes,pending!]:nodes.map(node=>node.id===pending!.id?{...node,...pending}:node));inserted=true;
      }else if(scope.documentCurrent())document.set(nodes=>nodes.map(node=>node.id===request.node.id?{...node,status:"generating"}:node));
      if(!result){
        const response=await ports.submit(request,submission,scope),data=await response.json().catch(()=>null);
        if(response.ok&&typeof data?.text==="string"&&data.text.trim())result={text:data.text,model:typeof data.model==="string"?data.model:undefined};
        if(!result){rejected=data?.accepted===false||!['OPERATION_PENDING','OPERATION_CONFLICT'].includes(data?.code)&&[400,401,402,403,404,413,415,422,429].includes(response.status);throw new Error(data?.error||ports.errorText);}
      }
      publish(ports,{phase:"saving"});
      if(!scope.documentCurrent())throw new Error("文字已生成，请返回原账号保存");
      const current=live();if(!current)throw new Error("文字已生成，原节点已移除");
      const completed={...pending!,content:request.productTitle?withTextProduct(result.text,request.productTitle):result.text,status:"completed" as const,updatedAt:new Date().toISOString()};
      const next={...rebaseText(completed,pending,current),status:"completed" as const};
      document.set(nodes=>nodes.map(node=>node.id===next.id?next:node));
      const saved=await document.save(next);if(!saved)throw new Error("文字已生成，保存失败，请重试保存");
      if(scope.documentCurrent()&&request.created&&!recorded){ports.history(saved);recorded=true;}
      if(scope.viewCurrent()&&result.model)ports.model(result.model);
      publish(ports,{phase:"succeeded",error:""});return true;
    }catch(error){
      const message=error instanceof Error?error.message:ports.errorText;
      if(scope.documentCurrent()&&live()&&!result){
        const failed={...live()!,status:"failed" as const,updatedAt:new Date().toISOString()};document.set(nodes=>nodes.map(node=>node.id===failed.id?failed:node));await document.save(failed);
      }
      publish(ports,{phase:rejected?"rejected":"retry",error:message});return false;
    }finally{publish(ports,{busy:false});}
  };
  return {request,getSnapshot:()=>state,run(scope:CanvasDocumentScope,ports:CanvasTextTaskPorts){
    if(state.phase==="succeeded")return Promise.resolve(true);
    if(!flight)flight=run(scope,ports).finally(()=>{flight=undefined;});return flight;
  }};
}
