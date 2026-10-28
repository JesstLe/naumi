import {browserRandomUUID} from "../browser-crypto";
import {canvasDocumentFetch,type CanvasDocumentScope} from "./document-scope";
import {readWorkflowClipboard} from "./workflow-clipboard";
import type {WorkflowImportResult} from "./workflow-import-contract";
export type WorkflowImportProgress={done:number;total:number;error?:string;hidden?:boolean};
type Body={operationId:string;html:string;projectKey:string|null;x:number;y:number};
type Attempt={body:Body;result?:WorkflowImportResult;progress:WorkflowImportProgress;flight?:Promise<void>;abort?:AbortController;applied?:boolean};
type Ports={writable:()=>boolean;viewCurrent?:()=>boolean;commit:(result:WorkflowImportResult,scope:CanvasDocumentScope,present:boolean)=>void};

/** Streaming transport and original import receipts live outside React. Project
 * navigation hides presentation, not a committed document mutation. Cancellation
 * keeps the same operation for explicit recovery; retries read a receipt before
 * considering the original idempotent POST. */
export function createCanvasWorkflowImports(){
  const attempts=new Map<string,Attempt>(),selected=new Map<string,Attempt>(),listeners=new Set<()=>void>();
  const notify=()=>listeners.forEach(fn=>fn());
  const subscribe=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
  function bind(scope:CanvasDocumentScope,ports:Ports){
    const key=scope.key;
    const update=(attempt:Attempt,fields:Partial<WorkflowImportProgress>)=>{attempt.progress={...attempt.progress,...fields};notify();};
    const current=()=>{scope.assertView();if(!ports.writable())throw new Error("当前画布为只读");};
    function submit(attempt:Attempt,retry=false):Promise<void>{
      current();if(attempt.flight)return attempt.flight;
      const abort=new AbortController();attempt.abort=abort;update(attempt,{done:0,total:0,error:undefined,hidden:false});
      const run=(async()=>{
        if(retry||attempt.result){
          const response=await canvasDocumentFetch(scope,`/api/canvas/workflow-import?operationId=${encodeURIComponent(attempt.body.operationId)}`,{cache:"no-store",signal:abort.signal});
          const data=await response.json();
          if(response.ok)attempt.result=data.result;
          else if(response.status!==404||attempt.result)throw new Error(data?.error||"原导入结果尚未同步，请重试");
        }
        if(!attempt.result){
          const response=await canvasDocumentFetch(scope,"/api/canvas/workflow-import",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(attempt.body),signal:abort.signal});
          if(!response.ok){const data=await response.json();throw new Error(data.error||"工作流导入失败");}
          if(!response.body)throw new Error("导入连接中断，请重试原操作");
          const reader=response.body.getReader(),decoder=new TextDecoder();let pending="";
          const consume=(line:string)=>{if(!line.trim())return;const event=JSON.parse(line);if(event.type==="progress")update(attempt,{done:event.done,total:event.total});else if(event.type==="error")throw new Error(event.error||"工作流导入失败");else if(event.type==="complete")attempt.result=event.result;};
          try{for(;;){const {done,value}=await reader.read();pending+=done?decoder.decode():decoder.decode(value,{stream:true});
            if(pending.length>8*1024*1024)throw new Error("导入响应过大");
            const lines=pending.split("\n");pending=lines.pop()!;for(const line of lines)consume(line);
            if(done){consume(pending);break;}
          }}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
        }
        const result=attempt.result;
        if(!result||result.operationId!==attempt.body.operationId||attempt.body.projectKey&&result.projectKey!==attempt.body.projectKey)throw new Error("导入连接中断，请重试原操作");
        if(!scope.documentCurrent())throw new Error("工作流已保存，请返回原账号和工作空间同步");
        if(!attempt.applied){ports.commit(result,scope,scope.viewCurrent()&&(ports.viewCurrent?.()??true)&&!attempt.progress.hidden);attempt.applied=true;}
        attempts.delete(result.operationId);if(selected.get(key)===attempt)selected.delete(key);notify();
      })().catch(error=>{update(attempt,{error:abort.signal.aborted?"导入已取消；可重试原操作核对结果":error instanceof Error?error.message:"工作流导入失败"});}).finally(()=>{attempt.flight=undefined;attempt.abort=undefined;});
      attempt.flight=run;return run;
    }
    function paste(html:string,point:{x:number;y:number}){
      if(!scope.viewCurrent()||!ports.writable())return false;
      try{
        if(!readWorkflowClipboard(html))return false;
        const active=selected.get(key);if(active?.flight)return true;
        // A repeated paste after a dismissed/unknown transport retains identity.
        const prior=[...attempts.values()].find(a=>a.body.html===html&&a.body.projectKey===scope.project&&a.body.x===point.x&&a.body.y===point.y&&selected.get(key)===a);
        const attempt=prior||{body:{operationId:browserRandomUUID(),html,projectKey:scope.project,...point},progress:{done:0,total:0}};
        selected.set(key,attempt);attempts.set(attempt.body.operationId,attempt);void submit(attempt,!!prior);
      }catch(error){const attempt={body:{operationId:browserRandomUUID(),html,projectKey:scope.project,...point},progress:{done:0,total:0,error:error instanceof Error?error.message:"工作流格式不正确"}};selected.set(key,attempt);notify();}
      return true;
    }
    return {paste,subscribe,getSnapshot:()=>selected.get(key)?.progress||null,retry:()=>{const attempt=selected.get(key);return attempt?submit(attempt,true):Promise.resolve();},dismiss:()=>{const attempt=selected.get(key);if(attempt){attempt.abort?.abort();update(attempt,{hidden:true});}}};
  }
  return {bind};
}
