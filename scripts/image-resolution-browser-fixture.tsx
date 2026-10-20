import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BillingProvider,BillingEstimate,useBillingEstimate} from '../src/lib/billing/client';
import {ToastProvider} from '../src/components/ui/toast';
let selected='4K';const submissions:any[]=[];let tier='2K';
const realFetch=window.fetch;
window.fetch=async(input,init)=>{
 const path=String(input);
 if(path==='/api/billing/catalog')return Response.json({version:8});
 if(path==='/api/billing/quote')return Response.json({version:8,modelVersion:123,modelId:'fixture-model',credits:12,reserveCredits:12,feature:'image.generate',quantity:1,requestedParameters:{quality:'medium',resolution:'4K',ratio:'1:1'},effectiveParameters:{quality:'medium',resolution:tier,ratio:'1:1'}});
 if(path==='/api/resolution-fixture-generate'){submissions.push({headers:Object.fromEntries(new Headers(init?.headers)),body:JSON.parse(String(init?.body))});return Response.json({ok:true});}
 throw Error('Unmocked request '+path);
};
function App(){
 const [value,setValue]=useState('4K');const billing=useBillingEstimate({feature:'image.generate',modelId:'fixture-model',quantity:1,resolution:value,ratio:'1:1'});
 return <main><h1>图像生成</h1><label>分辨率 <select aria-label="分辨率" value={value} onChange={e=>{selected=e.target.value;setValue(e.target.value)}}><option>1K</option><option>2K</option><option>4K</option></select></label><p><BillingEstimate input={{feature:'image.generate',modelId:'fixture-model',quantity:1,resolution:value,ratio:'1:1'}}/></p><button disabled={!billing.quote} onClick={()=>billing.submit('/api/resolution-fixture-generate',{method:'POST',body:JSON.stringify({model:'fixture-model',resolution:value,prompt:'fixture'})})}>生成</button><output id="submitted">{submissions.length}</output></main>;
}
const root=createRoot(document.getElementById('root')!);root.render(<ToastProvider><BillingProvider><App/></BillingProvider></ToastProvider>);
(window as any).verifyResolutionBrowser=async()=>{
 const check=(ok:any,message:string)=>{if(!ok)throw Error(message)};
 for(let i=0;i<100&&!document.querySelector('[data-testid="billing-estimate"]')?.textContent?.includes('12');i++)await new Promise(r=>setTimeout(r,25));
 const text=document.querySelector('[data-testid="billing-estimate"]')!.textContent!;check(text.includes('12 积分')&&text.includes('4K→2K')&&text.includes('报价不变'),'visible quote and actual resolution');
 check((document.querySelector('select') as HTMLSelectElement).value==='4K','selected UI must not be rewritten');
 (document.querySelector('button') as HTMLButtonElement).click();
 for(let i=0;i<100&&!submissions.length;i++)await new Promise(r=>setTimeout(r,10));
 check(submissions.length===1,'one mock submission');check(submissions[0].headers['x-naumi-billing-credits']==='12','unchanged 12 credit confirmation');check(submissions[0].body.resolution==='4K','raw selected tier remains in request');check(document.body.textContent?.includes('报价保持不变'),'fallback toast shown');
 return {result:'BROWSER=PASS',visibleQuote:text,selected,confirmedCredits:submissions[0].headers['x-naumi-billing-credits'],rawResolution:submissions[0].body.resolution,submissions:submissions.length,supplierCalls:0};
};
