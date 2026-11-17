"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {SUPPLIER_CHAIN_PAGE_SIZE,supplierChainUrl,type SupplierChainPage,type SupplierChainLegacy,type SupplierChainRead} from "@/lib/supplier-cost/chain-contract";

type Finance="billing"|"reviews"|"adjustments";
const link="text-primary underline disabled:opacity-40";
const text=(value:unknown)=>JSON.stringify(value,null,2);
const date=(value:string|null)=>value?new Date(value).toLocaleString("zh-CN"):"—";
const financeLabels={billing:"账务记录",reviews:"费用复核",adjustments:"退款 / 费用修订"};
type RequestChain=(url:string,body?:unknown,signal?:AbortSignal)=>Promise<any>;
export function SupplierCostChainDialog({operation,initial,request,close,money,labels}:{
 operation:string;initial:SupplierChainPage|SupplierChainLegacy;request:RequestChain;close:()=>void;
 money:(value:any,currency?:string)=>string;labels:Record<string,string>;
}){
 const legacy="view"in initial?null:initial;
 const legacyOutputs=useMemo(()=>{
   const byCall=new Map<string,Record<string,any>[]>();
   for(const output of legacy?.outputs??[]){
     const rows=byCall.get(output.call_id);if(rows)rows.push(output);else byCall.set(output.call_id,[output]);
   }
   return byCall;
 },[legacy]);
 const [calls,setCalls]=useState<SupplierChainPage>(()=>"view"in initial?initial:{
   view:"calls",rows:initial.rows.slice(0,SUPPLIER_CHAIN_PAGE_SIZE),next:initial.rows.length>SUPPLIER_CHAIN_PAGE_SIZE?"local":null,
 });
 const [callsBusy,setCallsBusy]=useState(false),[callsError,setCallsError]=useState(false);
 const [detail,setDetail]=useState<{id:string;data?:unknown;error?:boolean}|null>(null);
 const [finance,setFinance]=useState<{view:Finance;data?:unknown;page?:SupplierChainPage;error?:boolean}|null>(null);
 const [financeBusy,setFinanceBusy]=useState(false);
 const requests=useRef<Partial<Record<"calls"|"detail"|"finance",AbortController>>>({});
 function cancel(slot:keyof typeof requests.current){requests.current[slot]?.abort();delete requests.current[slot];}
 useEffect(()=>()=>{for(const controller of Object.values(requests.current))controller?.abort();requests.current={};},[]);
 function start(slot:keyof typeof requests.current,input:SupplierChainRead,done:(data:any)=>void,fail:()=>void,finish:()=>void){
   const controller=new AbortController();requests.current[slot]=controller;
   const current=()=>requests.current[slot]===controller&&!controller.signal.aborted;
   void request(supplierChainUrl(operation,input),undefined,controller.signal)
     .then(value=>{if(current()){if(value.view!==input.view)throw new Error("Invalid supplier chain response");done(value);}})
     .catch(()=>{if(current())fail();})
     .finally(()=>{if(current()){delete requests.current[slot];finish();}});
 }
 function moreCalls(){
   if(!calls.next||requests.current.calls)return;
   if(legacy){
     const rows=legacy.rows.slice(0,calls.rows.length+SUPPLIER_CHAIN_PAGE_SIZE);
     setCalls({view:"calls",rows,next:rows.length<legacy.rows.length?"local":null});return;
   }
   setCallsBusy(true);setCallsError(false);
   start("calls",{view:"calls",after:calls.next},value=>{
      setCalls(previous=>({...value,rows:[...previous.rows,...value.rows]}));
   },()=>setCallsError(true),()=>setCallsBusy(false));
 }
 function toggleDetail(id:string){
   const same=detail?.id===id;
   cancel("detail");
   if(same&&!detail.error){setDetail(null);return;}
   if(legacy){
     const row=calls.rows.find(item=>item.id===id)!;
     setDetail({id,data:{parameters:row.parameters,usage:row.usage,fx:row.fx,evidence:row.evidence,outputs:legacyOutputs.get(id)??[]}});return;
   }
   setDetail({id});start("detail",{view:"call",call:id},value=>setDetail({id,data:value.detail}),()=>setDetail({id,error:true}),()=>{});
 }
 function loadFinance(view:Finance,after?:string){
   cancel("finance");
   const previous=finance?.view===view?finance.page:undefined;
   if(legacy){
     if(view==="billing"){setFinance({view,data:legacy.billing??null});return;}
     const all=(view==="reviews"?legacy.feeReviews:legacy.adjustments)??[],rows=all.slice(0,(after?previous?.rows.length??0:0)+SUPPLIER_CHAIN_PAGE_SIZE);
     setFinance({view,page:{view,rows,next:rows.length<all.length?"local":null}});return;
   }
   setFinance({view,page:previous});setFinanceBusy(true);
   start("finance",view==="billing"?{view}:{view,after},value=>{
     setFinance(view==="billing"?{view,data:value.billing}:{view,page:{...value,rows:after?[...(previous?.rows??[]),...value.rows]:value.rows}});
   },()=>setFinance({view,page:previous,error:true}),()=>setFinanceBusy(false));
 }
 return <div className="fixed inset-0 z-50 overflow-auto bg-black/30 p-6" role="dialog" aria-modal="true" aria-label="完整调用链">
   <section className="mx-auto max-w-5xl border border-c-border bg-white p-6">
    <div className="mb-4 flex justify-between"><h2 className="font-semibold">完整调用链</h2><button className={link} onClick={close}>关闭</button></div>
    <nav className="mb-3 flex flex-wrap gap-4 text-sm" aria-label="调用链账务分区">{(Object.keys(financeLabels) as Finance[]).map(view=>
      <button key={view} className={link} aria-pressed={finance?.view===view} onClick={()=>{if(finance?.view===view){cancel("finance");setFinance(null);setFinanceBusy(false);}else loadFinance(view);}}>{financeLabels[view]}</button>
    )}</nav>
    {finance&&<section className="mb-4 border border-c-border p-3 text-sm" aria-label={financeLabels[finance.view]}>
      {financeBusy&&<p role="status">正在读取…</p>}
      {finance.error&&<p role="alert">读取失败。 <button className={link} onClick={()=>loadFinance(finance.view,finance.page?.next??undefined)}>重试</button></p>}
      {finance.data!==undefined&&<pre className="overflow-auto text-xs">{text(finance.data)}</pre>}
      {finance.page&&<><pre className="overflow-auto text-xs">{text(finance.page.rows)}</pre>{finance.page.next&&!finance.error&&
        <button disabled={financeBusy} className={link} onClick={()=>loadFinance(finance.view,finance.page?.next??undefined)}>加载更多记录</button>}</>}
    </section>}
    {!calls.rows.length&&<p className="text-sm">没有调用记录</p>}
    {calls.rows.map(row=><article key={row.id} className="border-t border-c-border py-4 text-xs" data-testid="supplier-chain-call">
      <div className="font-semibold">{row.phase} · {row.provider_id} / {row.actual_model||row.model} · {money(row.amount_micros,row.currency)} · {labels[row.cost_status]}</div>
      <dl className="mt-3 grid gap-2 md:grid-cols-2">{[
        ["业务操作",row.operation_id],["本次尝试",row.attempt_id],["供应商任务",row.task_id||"—"],["供应商 request_id",row.request_id||"—"],
        ["开始",date(row.started_at)],["完成",date(row.completed_at)],["费用确认",date(row.cost_confirmed_at)],
        ["配置版本",`${row.model_version||"—"} / ${row.billing_version||"—"}`],["人民币折算",money(row.cny_micros)],["命中规则",row.matched_rule_id||"默认"],
      ].map(([key,value])=><div key={key}><dt className="text-c-muted">{key}</dt><dd className="mt-1 break-all font-mono">{value}</dd></div>)}</dl>
      <button className={`${link} mt-3`} aria-expanded={detail?.id===row.id} onClick={()=>toggleDetail(row.id)}>
        {detail?.id===row.id?(detail.error?"重试调用详情":"收起调用详情"):"查看调用详情"}
      </button>
      {detail?.id===row.id&&(detail.error?<p role="alert">调用详情读取失败</p>:detail.data===undefined
        ?<p role="status">正在读取调用详情…</p>:<pre className="mt-3 overflow-auto border border-c-border p-3">{text(detail.data)}</pre>)}
    </article>)}
    {callsError&&<p role="alert">读取更多调用失败</p>}
    {calls.next&&<button disabled={callsBusy} className={link} onClick={moreCalls}>{callsBusy?"正在读取…":"加载更多调用"}</button>}
   </section>
 </div>;
}
