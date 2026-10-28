/** Local regression UI: actual billing provider, quality control and Canvas actions. */
import React, {useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import {BillingProvider} from '@/lib/billing/client';
import {ImageQualityControl} from '@/components/image-quality-control';
import {GenerationSubmitAction} from '@/components/canvas/generation-submit-action';
const listeners=new Set<()=>void>();
let state={quality:'high',resolution:'1K',ratio:'auto',quantity:2};
function update(patch:Partial<typeof state>){state={...state,...patch};listeners.forEach(fn=>fn());}
function useFixture(){return useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>state);}
export const useAuth=()=>({user:{email:'quote@example.test'},ready:true});
export const authHeader=async()=>({'x-fixture-owner':'quote@example.test'});
export const useToast=()=>({toast:()=>{}});
export const useFeatureModels=()=>({selected:'gpt-image-2'});
export const chosenFeatureModel=()=> 'gpt-image-2';
export const FEATURE_MODEL_SELECTION='fixture:model-selected';
export const MODEL_CATALOG_REFRESH='fixture:model-refresh';
export const usePathname=()=>'/canvas';
export function useImageQuality(){const s=useFixture();return {quality:s.quality,setQuality:(quality:string)=>update({quality}),qualityLabels:{low:'低',medium:'中',high:'高',xhigh:'超高',max:'极致'},capable:true,experimental:false,allowedQualities:['low','medium','high','xhigh','max'],modelConfig:null};}
export const useI18n=()=>({t:(key:string)=>(({'gen.qualityLabel':'品质','gen.qLow':'低','gen.qMedium':'中','gen.qHigh':'高','gen.qXhigh':'超高','gen.qMax':'极致'} as Record<string,string>)[key]||key)});
(window as any).quoteFixture={update};
function App(){const s=useFixture();return <main>
 <header><h1>图片生成报价</h1><span>本地回归 · 测试价格 · 未上线</span></header>
 <section>
  <textarea aria-label="图片提示词" defaultValue="保留产品外观，生成一张干净的产品展示图。"/>
  <div className="flex flex-wrap items-center gap-3 py-4">
   <label>比例 <select aria-label="比例" value={s.ratio} onChange={e=>update({ratio:e.target.value})}><option value="auto">自动 / 跟随参考图</option><option>3:4</option></select></label>
   <label>清晰度 <select aria-label="清晰度" value={s.resolution} onChange={e=>update({resolution:e.target.value})}>{['1K','2K','4K'].map(v=><option key={v}>{v}</option>)}</select></label>
   <label>张数 <select aria-label="张数" value={s.quantity} onChange={e=>update({quantity:Number(e.target.value)})}>{[1,2,4].map(v=><option key={v}>{v}</option>)}</select></label>
  </div>
  <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4">
   <ImageQualityControl compact feature="canvas.image" modelId="gpt-image-2" resolution={s.resolution} ratio={s.ratio} quantity={s.quantity}/>
   <GenerationSubmitAction generating={false} onGenerate={()=>{throw Error('Fixture: no paid generation')}}/>
  </div>
 </section>
 </main>}
createRoot(document.getElementById('root')!).render(<BillingProvider><App/></BillingProvider>);
