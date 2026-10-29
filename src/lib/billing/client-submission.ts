import type {PublicQuote,QuoteInput,useBilling} from "./client";

type Client=Pick<ReturnType<typeof useBilling>,"quote"|"submit">;
type Prepared={url:string;init:RequestInit;quote:PublicQuote;operationId?:string};
const copyBody=(body:RequestInit["body"])=>{
  if(!(body instanceof FormData))return body;
  const form=new FormData();for(const [key,value] of body.entries())form.append(key,value);return form;
};

/** One explicit task owns its original normalized request, quote and operation.
 * No retry loop or supplier transport here: submit still uses the existing
 * receipt-first BillingProvider/server contract. Never re-quote an unknown POST. */
export function createRetainedBillingSubmission(){
  let prepared:Prepared|undefined;
  const retry=async(client:Client,current:()=>void,credentials?:HeadersInit)=>{
    current();if(!prepared)throw new Error("原提交尚未准备完成");
    const saved=prepared,headers=new Headers(saved.init.headers);
    if(credentials){const fresh=new Headers(credentials);for(const key of ["authorization","cookie"]){headers.delete(key);if(fresh.has(key))headers.set(key,fresh.get(key)!);}}
    if(saved.operationId)headers.set("x-naumi-billing-operation-id",saved.operationId);
    return client.submit(saved.url,{...saved.init,body:copyBody(saved.init.body),headers},saved.quote,id=>{current();saved.operationId=id;});
  };
  return {
    get ready(){return !!prepared;},
    get operationId(){return prepared?.operationId;},
    retry,
    async submit(client:Client,url:string,init:RequestInit,facts:QuoteInput,current:()=>void){
      current();
      if(!prepared){
        const headers=new Headers(init.headers),workspace=headers.get("x-naumi-workspace");
        const quote=await client.quote(facts,workspace?{workspace,projectContext:headers.get("x-naumi-project-context")||undefined}:undefined);current();
        prepared={url,quote,init:{method:init.method,credentials:init.credentials,cache:init.cache,headers:new Headers(init.headers),body:copyBody(init.body)}};
      }
      return retry(client,current);
    },
  };
}
export type RetainedBillingSubmission=ReturnType<typeof createRetainedBillingSubmission>;
