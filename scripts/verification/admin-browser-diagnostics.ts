import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import type {BrowserContext,Page,Request} from "@playwright/test";
export function annotateAdminFailure(error:unknown,title="Native admin browser acceptance failed"){
  const message=error instanceof Error?error.stack||error.message:String(error);
  const annotation=message.slice(0,8000).replace(/%/g,"%25").replace(/\r/g,"%0D").replace(/\n/g,"%0A");
  console.error(`::error title=${title}::${annotation}`);
}

/** Observe only this acceptance run's pages. Capture the original error before
 * closing them; annotations keep the failed assertion readable when raw CI
 * log/artifact transport is unavailable. No route mocks or response changes. */
export function observeAdminBrowser(contexts:BrowserContext[],folder:string){
  const pages=new Map<Page,{events:unknown[];pending:Map<Request,unknown>}>();
  const location=(value:string)=>{try{const u=new URL(value);return u.origin+u.pathname;}catch{return value;}};
  for(const context of contexts)context.on("page",page=>{
    const data={events:[] as unknown[],pending:new Map<Request,unknown>()};pages.set(page,data);
    page.on("request",request=>{const entry={url:location(request.url()),method:request.method(),type:request.resourceType()};data.pending.set(request,entry);data.events.push({kind:"request",...entry});});
    page.on("response",response=>data.events.push({kind:"response",url:location(response.url()),status:response.status()}));
    page.on("requestfinished",request=>{data.pending.delete(request);});
    page.on("requestfailed",request=>{data.events.push({kind:"requestfailed",url:location(request.url()),error:request.failure()?.errorText});data.pending.delete(request);});
    page.on("pageerror",error=>data.events.push({kind:"pageerror",error:error.message}));
  });
  return async(error:unknown)=>{
    await mkdir(folder,{recursive:true});
    const snapshots=[];let index=0;
    for(const[page,data]of pages){
      const id=index++,snapshot:{id:number;url:string;pending:unknown[];events:unknown[];state?:unknown;captureError?:string}={id,url:location(page.url()),pending:[...data.pending.values()],events:data.events};
      try{
        snapshot.state=await page.evaluate(()=>({readyState:document.readyState,text:document.body.innerText.slice(0,16000)}));
        await writeFile(path.join(folder,`page-${id}.html`),await page.content());
        await page.screenshot({path:path.join(folder,`page-${id}.png`),fullPage:true,timeout:5000});
      }catch(capture){snapshot.captureError=String(capture);}
      snapshots.push(snapshot);
    }
    const message=error instanceof Error?error.stack||error.message:String(error);
    await writeFile(path.join(folder,"FAILURE.json"),JSON.stringify({error:message,pages:snapshots},null,2)+"\n");
    annotateAdminFailure(error);
  };
}
