import {browserRandomUUID} from "../browser-crypto";
import type {Artwork} from "../mock-data";
import {canvasDocumentFetch,type CanvasDocumentScope} from "./document-scope";
import {canvasHistoryScope,type CanvasHistoryAction} from "./history-model";
import type {CanvasArtworkImportInput} from "./artwork-import";

type Ports={writable:()=>boolean;viewCurrent?:()=>boolean;merge:(ids:string[])=>Promise<Artwork[]>;
  history:{record:(scope:CanvasDocumentScope,action:CanvasHistoryAction)=>void};
  open:(id:string,projectKey:string)=>void};
type Attempt={body?:CanvasArtworkImportInput;sent?:boolean;receipt?:{id:string;projectKey:string};recorded?:boolean;flight?:Promise<string>};

/** Template insertion owns lookup -> immutable create intent -> receipt ->
 * document synchronization. Canvas only supplies document/history/navigation
 * ports. An unknown create retains its original operation and frozen body;
 * a known ID retries reads only. No second history or task queue. */
export function createCanvasTemplateImports(){
  const attempts=new Map<string,Attempt>();let latest=0;
  function bind(scope:CanvasDocumentScope,ports:Ports){
    async function apply(templateId:string){
      scope.assertView();if(!ports.writable())throw new Error("当前画布为只读");
      const key=JSON.stringify([scope.account,scope.workspace,templateId]);let attempt=attempts.get(key);
      if(!attempt){attempt={};attempts.set(key,attempt);}if(attempt.flight)return attempt.flight;
      const retained=attempt,ticket=++latest;
      // A template always creates a new root, never inherits a later/old view's
      // project header. Its epoch functions still belong to the initiating view.
      const rootScope={...scope,project:null,key:canvasHistoryScope(scope.account,scope.workspace,null)};
      const run=(async()=>{
        if(!retained.body){
          const response=await canvasDocumentFetch(rootScope,`/api/templates?ids=${encodeURIComponent(templateId)}&pageSize=1`,{cache:"no-store",signal:AbortSignal.timeout(20_000)});
          const data=await response.json();if(!response.ok)throw new Error(data?.error||"模板读取失败，请重试");
          const tpl=(data.templates as Artwork[]|undefined)?.find(row=>row.id===templateId);
          if(!tpl)throw new Error("模板已移除，请选择其他模板");
          if(!scope.documentCurrent())throw new Error("账号或工作空间已切换");
          retained.body={operationId:browserRandomUUID(),src:{image:tpl.image,title:tpl.title||(tpl.prompt?tpl.prompt.slice(0,16):"模板"),category:tpl.category||"main",
            prompt:tpl.prompt||"",style:tpl.style,ratio:tpl.ratio,resolution:tpl.resolution,templateId:tpl.id,width:tpl.width,height:tpl.height}};
        }
        if(!retained.receipt&&retained.sent){
          const response=await canvasDocumentFetch(rootScope,`/api/artworks/add?operationId=${encodeURIComponent(retained.body.operationId!)}`,{cache:"no-store",signal:AbortSignal.timeout(20_000)});
          const data=await response.json();
          if(response.ok){if(!data?.id||data.projectKey!==`tree:${data.id}`)throw new Error("导入结果待同步，请重试原模板");retained.receipt={id:data.id,projectKey:data.projectKey};}
          else if(response.status!==404)throw new Error(data?.error||"原导入结果尚未同步，请重试");
        }
        if(!retained.receipt){
          retained.sent=true;
          const response=await canvasDocumentFetch(rootScope,"/api/artworks/add",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(retained.body),signal:AbortSignal.timeout(20_000)});
          const data=await response.json();if(!response.ok)throw new Error(data?.error||"导入未完成，请重试原模板");
          if(!data?.id||data.projectKey!==`tree:${data.id}`)throw new Error("导入结果待同步，请重试原模板");
          retained.receipt={id:data.id,projectKey:data.projectKey};
        }
        const {id,projectKey}=retained.receipt;
        if(!scope.documentCurrent())throw new Error("模板已保存，请返回原账号和工作空间同步");
        const rows=await ports.merge([id]);
        if(!scope.documentCurrent())throw new Error("模板已保存，请返回原账号和工作空间同步");
        const node=rows.find(row=>row.id===id);if(!node)throw new Error("模板已保存，画布尚未同步，请重试原模板");
        if(!retained.recorded){ports.history.record({...scope,project:projectKey,key:canvasHistoryScope(scope.account,scope.workspace,projectKey)},{kind:"add",records:[node]});retained.recorded=true;}
        attempts.delete(key);
        if(scope.viewCurrent()&&(ports.viewCurrent?.()??true)&&ticket===latest)ports.open(id,projectKey);
        return id;
      })().finally(()=>{retained.flight=undefined;});retained.flight=run;return run;
    }
    return {apply};
  }
  return {bind};
}
