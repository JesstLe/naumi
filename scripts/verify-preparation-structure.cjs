const fs=require('node:fs'),assert=require('node:assert/strict');
const baseline=process.argv.includes('--baseline');let checks=0;
const read=p=>fs.readFileSync(p,'utf8'),check=(a,b,label)=>{assert.equal(a,b,label);checks++;};
const server=read('src/lib/billing/server.ts'),request=read('src/lib/model-config/requests.ts'),plan=read('src/lib/imagegen/plan.ts');
if(baseline){
 check(server.includes('new Request("http://internal/api/billing/quote")'),true,'old typed billing fabricates HTTP');
 check(plan.includes('preparedImage'),false,'old plans have no prepared decision');
 check(read('src/lib/model-config/billing-model.ts').includes('from "./requests"'),true,'old quote reader imports request orchestration');
}else{
 const core=read('src/lib/billing/quotation.ts'),prep=read('src/lib/model-config/image-preparation.ts'),quality=read('src/lib/model-config/image-quality-selection.ts');
 check(/new (Request|Response|Headers|FormData)|resolveUserEmail|\.headers\./.test(core),false,'quotation core is transport-neutral');
 check(request.includes('qualityMalformed'),false,'HTTP does not duplicate quality rule');check(prep.includes('selectImageQuality('),true,'HTTP preparation uses actual shared rule');check(plan.includes('selectImageQuality('),true,'planner uses same rule');check(core.includes('selectImageQuality('),true,'quote uses same rule');
 check(quality.includes('malformed-quality-value'),true,'single audit reason owner');
 for(const p of ['billing-model','business-billing'])check(read('src/lib/model-config/'+p+'.ts').includes('from "./requests"'),false,p+' detached from HTTP orchestration');
 check(plan.includes('preparedImage'),true,'plan stores preparation');check(read('src/lib/imagegen/quotes.ts').includes('delete step.preparedImage'),true,'public plan strips server-only decision');
 for(const p of ['generation-operation','cutout-operation'])check(read('src/lib/imagegen/'+p+'.ts').includes('preparedImage:step.preparedImage'),true,p+' consumes saved decision');
 check(read('src/lib/model-config/execution.ts').includes('allowResolutionFallback:false'),true,'prepared execution does not choose new fallback');
 check(read('scripts/verify-quality-fallback-contract.ts').includes('selectImageQuality(config'),true,'quality regression tests real function, not copied logic');
}
console.log(`PREPARATION_STRUCTURE=${baseline?'BASELINE':'MODIFIED'} PASS checks=${checks} TRANSPORT_FREE_QUOTE=${baseline?0:1} SHARED_QUALITY=${baseline?0:1} SAVED_PREPARATION=${baseline?0:1}`);
