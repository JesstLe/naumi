/* Actual source modules/expressions and OCR route; only auth, billing, media and
 * model I/O are explicit fixture ports. No provider or production requests. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const arg=(k,d)=>process.argv.includes(k)?process.argv[process.argv.indexOf(k)+1]:d;
const root=path.resolve(arg('--source-root','.')),mode=arg('--mode','MODIFIED'),fixed=mode==='MODIFIED';
const out=path.resolve(arg('--output-root','output/canvas-toolbar-audit'));
const req=createRequire(path.join(process.env.REVIEW_DEPS||path.join(process.cwd(),'node_modules'),'package.json'));
const ts=req('typescript'),esbuild=req('esbuild'),sharp=req('sharp');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
function moduleFrom(file,imports){const code=ts.transpileModule(read(file),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText,mod={exports:{}};
 vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{console,process,Buffer,Response,Request,Headers,FormData,File,Blob,AbortSignal,URL,setTimeout,clearTimeout,TextDecoder,TextEncoder,fetch:async()=>{throw Error('UNEXPECTED_NETWORK');}})(id=>id==='server-only'?{}:imports?.[id]??req(id),mod,mod.exports);return mod.exports;}
function pure(file){const code=esbuild.buildSync({entryPoints:[path.join(root,file)],bundle:true,write:false,format:'cjs',platform:'node',packages:'external'}).outputFiles[0].text,mod={exports:{}};vm.runInNewContext(code,{require:req,module:mod,exports:mod.exports,console,process,Buffer});return mod.exports;}
const sf=ts.createSourceFile('canvas.tsx',read('src/components/canvas/canvas-client.tsx'),99,true,4);
function disabledFor(call){let expression;function walk(n){if(ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n)){const attrs=n.attributes.properties;if(attrs.some(a=>ts.isJsxAttribute(a)&&a.name.getText(sf)===call[0]&&a.initializer?.getText(sf).includes(call[1]))){const disabled=attrs.find(a=>ts.isJsxAttribute(a)&&a.name.getText(sf)==='disabled');if(disabled&&ts.isJsxExpression(disabled.initializer))expression=disabled.initializer.expression.getText(sf);}}ts.forEachChild(n,walk);}walk(sf);assert.ok(expression,call.join(':'));return expression;}
async function main(){fs.mkdirSync(out,{recursive:true});const checks=[],report={mode,sourceRoot:root,externalCalls:0,productionCalls:0};const check=(name,run)=>{run();checks.push(name);};
 const failure=pure('src/lib/canvas/generation-failure.ts'),http=pure('src/lib/imagegen/http.ts');
 // Keep instanceof identity by loading the failure module against the same class.
 const actualFailure=moduleFrom('src/lib/canvas/generation-failure.ts',{'../imagegen/http':http});
 check('unknown is distinct from a definite terminal failure',()=>assert.equal(actualFailure.classifyGenerationFailure(new Error('结果待核查，请查询原任务'),{attempted:true,terminal:false}).kind,fixed?'uncertain':'failed'));
 check('public recovery instruction is retained',()=>assert.equal(actualFailure.generationFailureMessage({kind:'uncertain',message:'结果待核查，请查询原任务，勿重复提交'}),fixed?'结果待核查，请查询原任务，勿重复提交':'本次未取得图片，请重试'));
 check('definite rejection and saved-result projection',()=>{assert.equal(actualFailure.classifyGenerationFailure(new http.ImagegenHttpError('not accepted',400,false),{attempted:true}).kind,'not-started');assert.equal(actualFailure.classifyGenerationFailure(new Error('terminal'),{attempted:true,terminal:true}).kind,'failed');assert.equal(actualFailure.classifyGenerationFailure(new Error('sync'),{attempted:true,hasResults:true}).kind,'sync');});
 check('unknown title states what remains unconfirmed',()=>assert.equal(failure.generationFailureTitle({kind:'uncertain',message:''}),fixed?'任务待核查':'生成未完成'));
 const source={id:'source',image:'/owned.png'},toolState=fixed?pure('src/lib/canvas/image-tool-state.ts').canvasImageToolState:null;
 const disabledExpressions=[['onClick','onCutout('],['onPick','onHd('],['onPick','onRatioGen('],['ref','expandButtonRef']].map(disabledFor);
 check('locked image actions are disabled rather than silent no-op',()=>{const tools=toolState?.({source,ready:true,readOnly:false,locked:true,cutoutReady:true});for(const expression of disabledExpressions){const value=vm.runInNewContext(expression,{selected:source,selectedGenerating:false,readOnly:false,selectedImageTools:tools,generationParameters:{resolutions:['1K']}});assert.equal(value,fixed,expression);}});
 if(fixed){
  check('missing-image loading read-only and processor readiness',()=>{for(const patch of [{source:null},{source:{image:''}},{ready:false},{readOnly:true},{locked:true}])assert.equal(toolState({source,ready:true,readOnly:false,locked:false,cutoutReady:true,...patch}).canMutate,false);const unavailable=toolState({source,ready:true,readOnly:false,locked:false,cutoutReady:false,cutoutError:'模型未配置'});assert.equal(unavailable.canMutate,true);assert.equal(unavailable.canCutout,false);assert.equal(unavailable.cutoutReason,'模型未配置');assert.equal(toolState({source,ready:true,readOnly:false,locked:true}).canView,true);});
  check('409 pending or conflict never proves non-acceptance',()=>{for(const code of ['OPERATION_PENDING','OPERATION_CONFLICT']){const error=actualFailure.canvasGenerationHttpError(409,{code,error:'查询原任务'},'failed');assert.equal(error.accepted,undefined);assert.equal(actualFailure.classifyGenerationFailure(error,{attempted:true}).kind,'uncertain');}assert.equal(actualFailure.canvasGenerationHttpError(422,{accepted:false,error:'input rejected'},'failed').accepted,false);});
 }
 const bytes=await sharp({create:{width:3200,height:1600,channels:3,background:'#eeeedd'}}).png().toBuffer();
 const routes=[];
 for(const required of [true,false]){
  const calls={paddle:0,vision:0,wire:null};
  const old={...process.env};Object.assign(process.env,{PADDLE_OCR_BASE_URL:'http://fixture.invalid/ocr',PADDLE_OCR_REQUIRED:String(required),PADDLE_OCR_MAX_ATTEMPTS:'1',PADDLE_OCR_API_KEY:'fixture-only'});
  const context={currentModelExecution:()=>({capabilities:{vision:true}})};
  const client={chat:{completions:{create:async body=>{calls.vision++;calls.wire=body;return {choices:[{message:{content:JSON.stringify({segments:[{text:'原文',confidence:.99,box:{x:100,y:100,width:300,height:60}}]})}}]};}}}};
  const ocrLibrary=pure('src/lib/canvas-ocr.ts');
  const route=moduleFrom('src/app/api/canvas/ocr/route.ts',{
   '@/lib/supplier-cost/collect':{supplierCostFetch:()=>async()=>{calls.paddle++;return Response.json({error:'fixture CPU service absent'},{status:503});}},
   '@/lib/model-config/context':context,'@/lib/model-config/clients':{modelAwareOpenAI:()=>client},'@/lib/model-config/chat-completion-response':pure('src/lib/model-config/chat-completion-response.ts'),'@/lib/bi/model-calls':{observeOpenAI:x=>x},'@/lib/bi/request':{withBiRequest:(_r,run)=>run()},
   'next/server':{NextResponse:Response},'@/lib/text-models':{requestedTextModel:r=>r.headers.get('x-naumi-text-model')||'fixture-default'},
   '@/lib/request-auth':{authenticatedEmail:async()=> 'owner@fixture.test'},'@/platform/db/pool':{dbEnabled:true},'@/lib/artworks/repository':{listArtworksByIds:async()=>[{id:'source',image:'/owned.png',width:3200,height:1600}]},
   '@/lib/canvas-image-input':{readCanvasImage:async()=>({buffer:bytes,mimeType:'image/png'})},'@/lib/settings':{getOpenAISettings:async()=>({apiKey:'fixture-only'})},'@/lib/openai-base':{getOpenAIBaseUrl:async()=> 'http://fixture.invalid/v1'},
   '@/lib/vision-image':{toVisionDataUrl:async buffer=>'data:image/jpeg;base64,'+(await sharp(buffer).resize(1024,1024,{fit:'inside'}).jpeg().toBuffer()).toString('base64')},
   '@/lib/ip':{clientIp:()=> '127.0.0.1'},'@/lib/rate-limit-http':{checkRateLimit:async()=>true},'@/lib/api-error':{safeError:(_e,fallback)=>fallback},'@/lib/canvas-ocr':ocrLibrary,
   '@/lib/billing/synchronous':{withBillingRequest:(_r,_f,run)=>run()},'@/lib/billing/synchronous-operation':{configuredToolCost:async()=>0,markBillingUpstream:()=>{}},
  });
  try{
   const response=await route.POST(new Request('http://fixture/api/canvas/ocr',{method:'POST',headers:{'content-type':'application/json','x-naumi-text-model':'fixture-selected-vision'},body:'{"artworkId":"source"}'})),data=await response.json();
   assert.equal(response.status,fixed||!required?200:502);assert.equal(calls.paddle,fixed?0:1);assert.equal(calls.vision,fixed||!required?1:0);
   if(calls.vision){const content=calls.wire.messages.at(-1).content,img=content.find(x=>x.type==='image_url').image_url.url,meta=await sharp(Buffer.from(img.split(',')[1],'base64')).metadata();assert.equal(calls.wire.model,'fixture-selected-vision');assert.equal(meta.width,fixed?2400:1024);assert.match(content.find(x=>x.type==='text').text,/2400×1200/);assert.equal(data.image.width,3200);assert.ok(data.segments.length>0);}
   routes.push({required,status:response.status,paddle:calls.paddle,vision:calls.vision,engine:data.engine});checks.push('actual OCR route '+(required?'legacy-required flag':'optional legacy service'));
  }finally{for(const key of Object.keys(process.env))if(!(key in old))delete process.env[key];Object.assign(process.env,old);}
 }
 const cutoutCalls={image:0,legacy:0};
 const cutout=moduleFrom('src/lib/imagegen/cutout.ts',{
  './context':{currentImagegenStep:()=>null},'../model-config/context':{currentModelExecution:()=>({frozen:{feature:'tool.cutout',publicModelId:'fixture-image'}})},
  './postprocess':{inspectImagegenPixels:async()=>({transparentPixels:10,visiblePixels:10})},'../billing/synchronous-operation':{configuredToolCost:async()=>0,currentSynchronousBilling:()=>({upstream:'unobserved'}),checkpointSynchronousResult:async()=>{},synchronousChargedCredits:()=>0},
  '@/lib/billing/legacy-credit-reservation':{},'@/lib/billing/legacy-ledger':{},'@/platform/db/pool':{dbEnabled:false},'@/lib/artworks/writer':{},'@/lib/accounts/session':{},'@/lib/accounts/repository':{},
  '../object-storage/runtime':{storageEnabled:false},'../media-upload':{},'../settings':{getCutoutSettings:async()=>({backend:'replicate',replicateToken:'fixture-old-service',openaiModel:'legacy-image-model'}),getOpenAISettings:async()=>({apiKey:''})},
  '../api-error':{safeError:(_e,fallback)=>fallback},'./cutout-provider':{cutoutOpenAI:async(_b,_t,key)=>{assert.equal(key,'managed');cutoutCalls.image++;return Buffer.from('fixture-png');},cutoutReplicate:async()=>{cutoutCalls.legacy++;throw Error('legacy segmentation service deliberately absent');}},
 });
 const cutoutResult=await cutout.executeCutout({bytes:Buffer.from('fixture-input'),type:'image/png',email:'',parentId:'source',title:'source',category:'main',ratio:'1:1',resolution:'1K',quality:'fine'},{actor:async()=>null,ip:'127.0.0.1'});
 assert.equal(cutoutResult.status,fixed?200:500);assert.equal(cutoutCalls.image,fixed?1:0);assert.equal(cutoutCalls.legacy,fixed?0:1);checks.push('managed cutout takes priority over obsolete processor and needs no legacy key');
 report.checks=checks;report.ocr=routes;report.cutout=cutoutCalls;fs.writeFileSync(path.join(out,mode+'.json'),JSON.stringify(report,null,2));
 console.log(`${mode}=PASS CHECKS=${checks.length} LOCKED_TOOLS=${fixed?'DISABLED':'CLICKABLE'} UNKNOWN=${fixed?'DISTINCT':'FAILED'} CPU_REQUIRED=${fixed?'REMOVED':'REPRODUCED'} OCR_COORDINATES=${fixed?'MATCH':'MISMATCH'} PRODUCTION_CALLS=0`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
