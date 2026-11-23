import {isTerminalBillingFailure} from "../billing/client-response";
import {createRetainedBillingSubmission,type RetainedBillingSubmission} from "../billing/client-submission";
import type {CanvasDocumentScope} from "./document-scope";
import {rebaseText,type CanvasTextNode} from "./text-document-model";
import {withTextProduct,type CanvasTextTaskRequest} from "./text-task-request";
import {browserRandomUUID} from "../browser-crypto";
import {partialCanvasText,type PartialText} from "./text-output-policy";

export type CanvasTextTaskState={busy:boolean;phase:"idle"|"submitting"|"saving"|"retry"|"rejected"|"succeeded"|"incomplete";error:string;hasResult:boolean;partial?:PartialText};
export type CanvasTextTaskPorts={
  submit:(request:CanvasTextTaskRequest,submission:RetainedBillingSubmission,scope:CanvasDocumentScope)=>Promise<Response>;
  document:{getSnapshot:()=>{nodes:CanvasTextNode[]};set:(update:(nodes:CanvasTextNode[])=>CanvasTextNode[])=>void;save:(node:CanvasTextNode)=>Promise<CanvasTextNode|null>};
  history:(node:CanvasTextNode)=>void;model:(value:string)=>void;changed:()=>void;errorText:string;
  historyBatch?:(nodes:CanvasTextNode[])=>void;
  prepare?:(request:CanvasTextTaskRequest,scope:CanvasDocumentScope)=>Promise<void>;
  historyEdit?:(before:CanvasTextNode,after:CanvasTextNode)=>void;
};
/** One paid text intent and one known answer. Saving or resuming never re-quotes
 * or regenerates a known answer; browser scope controls new submission, while
 * the originating document can accept completed work after project navigation. */
export function createCanvasTextTask(original:CanvasTextTaskRequest,restored?:{partial?:PartialText;fallback?:PartialText;pending?:boolean}){
  const request=structuredClone(original);let activePorts:CanvasTextTaskPorts|undefined;
  // BillingProvider still selects the identity. Persist it before its paid POST,
  // not only after a response/error (the tab can disappear while awaiting it).
  const newSubmission=()=>createRetainedBillingSubmission(id=>{request.operationId=id;activePorts?.changed();});
  let submission=newSubmission();
  let historyBefore=structuredClone(original.node);
  let prepared=restored?.pending===true;let result:{text:string;model?:string}|undefined,recorded=false,inserted=false,pending:CanvasTextNode|undefined,flight:Promise<boolean>|undefined;
  let state:CanvasTextTaskState={busy:false,phase:restored?.pending?"retry":restored?.partial?"incomplete":"idle",error:restored?.partial?"回复尚未写完，已保留生成内容":"",hasResult:false,...((restored?.partial||restored?.fallback)?{partial:restored.partial||restored.fallback}:{})};
  const publish=(ports:CanvasTextTaskPorts,patch:Partial<CanvasTextTaskState>)=>{state={...state,...patch,hasResult:!!result};ports.changed();};
  const run=async(scope:CanvasDocumentScope,ports:CanvasTextTaskPorts)=>{
    if(state.phase==="incomplete")return false;
    activePorts=ports;
    if(state.phase==="rejected"){submission=newSubmission();request.operationId=browserRandomUUID();}
    const document=ports.document;
    const live=()=>document.getSnapshot().nodes.find(node=>node.id===request.node.id);
    let rejected=false;
    try{
      scope.assertView();publish(ports,{busy:true,phase:result?"saving":"submitting",error:""});
      if(!inserted){
        const current=live();
        if(restored?.pending&&!current)throw new Error("文字节点已移除");
        if(restored?.pending)historyBefore={...current!};
        // Keep the original baseline for result rebase, but never write it over
        // the live document while merely querying an accepted operation.
        pending={...request.node,status:"generating",error:"",updatedAt:new Date().toISOString()};
        if(!request.created&&!live())throw new Error("文字节点已移除");
        document.set(nodes=>request.created&&!nodes.some(node=>node.id===pending!.id)?[...nodes,pending!]:nodes.map(node=>node.id===pending!.id?restored?.pending?{...node,status:"generating",error:""}:{...node,...pending}:node));inserted=true;
      }else if(scope.documentCurrent())document.set(nodes=>nodes.map(node=>node.id===request.node.id?{...node,status:"generating",error:""}:node));
      if(!result){
        if(!prepared){await ports.prepare?.(request,scope);prepared=true;}scope.assertView();
        const response=await ports.submit(request,submission,scope),data=await response.json().catch(()=>null);
        if(submission.operationId)request.operationId=submission.operationId;
        if(response.ok&&typeof data?.text==="string"&&data.text.trim())result={text:data.text,model:typeof data.model==="string"?data.model:undefined};
        const partial=partialCanvasText(data,submission.operationId||request.operationId);
        if(partial){
            if(scope.documentCurrent()&&live()){
              const failed={...live()!,status:"failed" as const,error:String(data.error),updatedAt:new Date().toISOString()};
              document.set(nodes=>nodes.map(node=>node.id===failed.id?failed:node));
              try{await document.save(failed);}catch{/* The durable original receipt remains recoverable. */}
            }
          publish(ports,{phase:"incomplete",partial,error:String(data.error)});return false;
        }
        if(!result){rejected=isTerminalBillingFailure(data,submission.operationId||request.operationId)||data?.accepted===false||!['OPERATION_PENDING','OPERATION_CONFLICT'].includes(data?.code)&&[400,401,402,403,404,413,415,422,429].includes(response.status);throw new Error(data?.error||ports.errorText);}
      }
      publish(ports,{phase:"saving"});
      if(!scope.documentCurrent())throw new Error("文字已生成，请返回原账号保存");
      const current=live();if(!current)throw new Error("文字已生成，原节点已移除");
      const completed={...pending!,content:request.productTitle?withTextProduct(result.text,request.productTitle):result.text,status:"completed" as const,updatedAt:new Date().toISOString()};
      const next={...rebaseText(completed,pending,current),status:"completed" as const,error:""};
      document.set(nodes=>nodes.map(node=>node.id===next.id?next:node));
      const saved=await document.save(next);if(!saved)throw new Error("文字已生成，保存失败，请重试保存");
      if(scope.documentCurrent()&&!recorded){if(request.created)ports.history(saved);else if(saved.content!==historyBefore.content)ports.historyEdit?.(historyBefore,saved);recorded=true;}
      if(scope.viewCurrent()&&result.model)ports.model(result.model);
      publish(ports,{phase:"succeeded",error:"",partial:undefined});return true;
    }catch(error){
      if(submission.operationId)request.operationId=submission.operationId;
      const message=error instanceof Error?error.message:ports.errorText;
      if(scope.documentCurrent()&&live()&&!result){
        const failed={...live()!,status:"failed" as const,error:message.slice(0,2000),updatedAt:new Date().toISOString()};document.set(nodes=>nodes.map(node=>node.id===failed.id?failed:node));
        try{await document.save(failed);}catch{/* The document retains its unsaved draft; keep the original execution failure. */}
      }
      publish(ports,{phase:rejected?(state.partial?"incomplete":"rejected"):"retry",error:message});return false;
    }finally{publish(ports,{busy:false});}
  };
  const execute=(scope:CanvasDocumentScope,ports:CanvasTextTaskPorts)=>{
    if(state.phase==="succeeded")return Promise.resolve(true);
    if(!flight)flight=run(scope,ports).finally(()=>{flight=undefined;});return flight;
  };
  return {request,acceptPartial(scope:CanvasDocumentScope,ports:CanvasTextTaskPorts){
    scope.assertView();if(state.phase!=="incomplete"||!state.partial||flight)return Promise.resolve(false);
    const current=ports.document.getSnapshot().nodes.find(node=>node.id===request.node.id);
    if(!current)return Promise.resolve(false);
    pending={...current};inserted=true;result={text:state.partial.text};
    // Applying is explicit: use the latest document as the undo/CAS baseline.
    historyBefore={...current};Object.assign(request.node,current);state={...state,phase:"saving"};return execute(scope,ports);
  },getSnapshot:()=>state,run:execute};
}
