/** Actual adapter functions + pinned HTTP transport + PostgreSQL + decoded PNG.
 * Synthetic loopback supplier only. APIMART_SOURCE_FILE selects original bytes. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import sharp from 'sharp';
import {createModelFixture} from './model-config-fixture';

async function main(){
 const out=path.resolve(process.env.CANVAS_TEST_OUT||'output/apimart-response-format');fs.mkdirSync(out,{recursive:true});
 const png=await sharp({create:{width:256,height:256,channels:3,background:'#4b83c4'}}).png().toBuffer(),posts:any[]=[],tasks=new Map<string,any>(),reports:any[]=[];
 let origin='',serial=0;
 const f=await createModelFixture(async(req,res)=>{
  const url=new URL(req.url!,origin);res.setHeader('content-type','application/json');
  if(url.pathname==='/media/result.png'){res.setHeader('content-type','image/png');return res.end(png)}
  if(url.pathname==='/v1/uploads/images'){for await(const _ of req){}return res.end(JSON.stringify({url:'https://fixture.invalid/reference.png'}))}
  if(url.pathname.startsWith('/v1/tasks/')){const id=url.pathname.split('/').at(-1)!,t=tasks.get(id);assert.ok(t);return res.end(JSON.stringify({data:{id,model:t.model,status:'completed',cost:'0.01',result:{images:[{url:[origin+'/media/result.png']}]}}}))}
  const chunks:Buffer[]=[];for await(const p of req)chunks.push(Buffer.from(p));const body=JSON.parse(Buffer.concat(chunks).toString());posts.push(body);
  if(body.model.startsWith('gemini')&&body.output_format&&body.output_format!=='url'){res.statusCode=400;return res.end(JSON.stringify({error:{code:'invalid_request_error',message:`unsupported response format for ${body.model}: ${body.output_format}; only \`url\` is supported`,param:'',type:'invalid_request_error'}}))}
  if(body.prompt==='invalid-json')return res.end('{bad');
  if(body.prompt==='missing-task')return res.end(JSON.stringify({data:{status:'submitted'}}));
  if(body.prompt==='lost-response')return req.socket.destroy();
  const id='task_'+(++serial);tasks.set(id,body);
  if(body.model==='gemini-3-pro-image-preview'){res.statusCode=202;return res.end(JSON.stringify({code:202,data:{id,status:'pending',object:'generation.task'}}))}
  return res.end(JSON.stringify({code:200,data:[{status:'submitted',task_id:id}]}));
 });origin=f.origin;
 process.env.PGOPTIONS=`-c search_path=${f.schemaName}`;process.env.MODEL_CONFIG_TRUSTED_ORIGINS=origin;
 const db=await import('../src/lib/db'),context=await import('../src/lib/model-config/context'),gateway=await import('../src/lib/image-gateway');
 const c:any={console,Request,Response,Headers,FormData,File,Buffer,URL,AbortSignal,Date,JSON,setTimeout,clearTimeout,createHash,sharp,
  ...await import('../src/lib/model-config/apimart-image-parameters'),...await import('../src/lib/model-config/seedream-preflight'),...await import('../src/lib/model-config/channel-availability'),...await import('../src/lib/model-config/transport'),...await import('../src/lib/model-config/image-preset'),...await import('../src/lib/model-config/types'),...gateway,
  ...await import('../src/lib/supplier-cost/collect'),...await import('../src/lib/supplier-cost/runtime'),...await import('../src/lib/supplier-cost/adapters'),...await import('../src/lib/supplier-cost/money'),...await import('../src/lib/supplier-cost/io'),...await import('../src/lib/billing/synchronous'),...await import('../src/lib/model-config/channel-image-response'),...await import('../src/lib/supplier-cost/adapter-failure')};
 const sourcePath=path.resolve(process.env.APIMART_SOURCE_FILE||'src/lib/model-config/apimart-preset.ts'),text=fs.readFileSync(sourcePath,'utf8'),ast=ts.createSourceFile(sourcePath,text,ts.ScriptTarget.Latest,true),found:string[]=[];
 ast.forEachChild(n=>{if(ts.isFunctionDeclaration(n)&&['apimartExecutionParameters','apimartImagesFetch'].includes(n.name?.text||''))found.push(n.getText(ast).replace(/^export\s+/,''))});assert.equal(found.length,2);
 vm.createContext(c);vm.runInContext(ts.transpileModule(found.join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,c);
 const scope=(wire:string,format?:string)=>({capacityReserved:true,frozen:{modality:'image',binding:'image.generate',feature:'canvas.image',modelVersion:1,billingVersion:1,modelDigest:'a'.repeat(64),publicModelId:wire,target:{type:'upstream',id:'u1'},imageParameterPlanVersion:1,facts:{quality:'high',resolution:'4K',ratio:'3:4'}},connection:{providerId:'p1',protocol:'apimart-images',wireModel:wire,baseUrl:origin+'/v1',apiKey:f.marker,timeoutMs:2000},capabilities:{generate:true,edit:true,qualities:['high'],nativeResolutions:['1K','2K','4K'],maxReferenceImages:4},parameterMap:{qualityPolicy:{mode:'map',choices:[{id:'high',label:'高',value:'high'}]},resolutionPolicy:{mode:'map',field:'resolution',ratioField:'size',values:{'1K':'1k','2K':'2k','4K':'4k'}},apimartImages:{schemaVersion:1,maxOutputs:1,supportsMask:false,ratios:['3:4']},...(format?{imagegen:{outputFormat:format}}:{})}} as any);
 const run=(s:any,unit:string,prompt='synthetic',edit=false):Promise<Response>=>context.runModelExecution(s,()=>gateway.withImageOperation(s.frozen.publicModelId,{id:unit},()=>{
  let body:any=JSON.stringify({prompt,n:1});let headers:any={'content-type':'application/json'};
  if(edit){body=new FormData();body.set('prompt',prompt);body.set('image',new File([new Uint8Array(png)],'reference.png',{type:'image/png'}));headers={}}
  return c.apimartImagesFetch(s,{trustedOrigins:[origin]},{pollMs:1})(origin+'/v1/images/'+(edit?'edits':'generations'),{method:'POST',headers,body}) as Promise<Response>;
 }));
 const row=async(unit:string)=>(await f.sql.query('SELECT * FROM app_supplier_calls WHERE billing_unit_id=$1',[unit])).rows[0];
 const check=async(name:string,fn:()=>Promise<void>)=>{try{await fn();reports.push({name,pass:true});console.log('PASS '+name)}catch(e){reports.push({name,pass:false,error:String(e)});console.error('FAIL '+name+': '+e)}};
 try{
  await db.ensureSchema();
  for(const model of ['gemini-3-pro-image-preview','gemini-3.1-flash-image-preview'])await check(model+'_4k_reference',async()=>{
   const s=scope(model),unit=model+'-fixed',response=await run(s,unit,'synthetic',true);assert.equal(response.status,200);const body=await response.json();assert.equal((await sharp(Buffer.from(body.data[0].b64_json,'base64')).metadata()).width,256);assert.equal(posts.at(-1).output_format,undefined);assert.equal(posts.at(-1).resolution,'4k');assert.equal(posts.at(-1).image_urls.length,1);
   const r=await row(unit);assert.ok(r.task_id);assert.equal(r.state,'completed');assert.equal(r.parameters.acceptedOutputs,1);const before=posts.length;await run(s,unit,'synthetic',true);assert.equal(posts.length,before,'accepted recovery never submits again');
  });
  await check('explicit_gpt_format_and_omit_preserved',async()=>{
   for(const value of ['output_format','omit']){const s=scope('gpt-image-2.5-sunburst',value);s.frozen.imageParameterPlans={u1:{version:1,upstreamId:'u1',wireModel:s.connection.wireModel,protocol:'apimart-images',modelVersion:1,requested:{quality:'high',resolution:'4K',ratio:'3:4'},effective:{quality:'high',resolution:'4K',ratio:'3:4'},wire:{quality:'high',resolution:'4k',size:'3:4',...(value==='output_format'?{output_format:'webp'}:{})},clear:['quality','resolution','size','output_format']}};await run(s,'gpt-'+value);assert.equal(posts.at(-1).output_format,value==='output_format'?'webp':undefined)}
  });
  await check('historical_preset_retains_its_png_contract',async()=>{
   const s=scope('fixture-preset');delete s.frozen.imageParameterPlanVersion;
   s.imagePreset={qualityParameter:'quality',resolutions:['4K'],ratios:['3:4'],resolutionMap:{'4K':'4k'},ratioMap:{'3:4':'3:4'},outputDimensions:{'4K:3:4':{width:256,height:256}},prices:[]};
   await run(s,'preset-default');assert.equal(posts.at(-1).output_format,'png');
  });
  await check('http_rejection_diagnosed_without_replay_or_zero_cost',async()=>{
   const s=scope('gemini-3-pro-image-preview');s.frozen.imageParameterPlans={u1:{version:1,upstreamId:'u1',wireModel:s.connection.wireModel,protocol:'apimart-images',modelVersion:1,requested:{quality:'high',resolution:'4K',ratio:'3:4'},effective:{quality:'high',resolution:'4K',ratio:'3:4'},wire:{size:'3:4',resolution:'4k',quality:'high',output_format:'png'},clear:['output_format']}};
   const before=posts.length;await assert.rejects(run(s,'bad-format'),gateway.ImageOperationPending);let r=await row('bad-format');assert.equal(r.state,'unknown');assert.equal(r.task_id,null);assert.equal(r.amount_micros,null);assert.equal(r.evidence.httpStatus,400);assert.equal(r.evidence.failureCategory,'invalid-parameters');assert.equal(r.evidence.upstreamFailure.parameter,'output_format');assert.equal(r.evidence.adapterStage,'submit');assert.equal(r.evidence.adapterReason,'response-format-unsupported');assert.ok(r.parameters.requestHash);
   await assert.rejects(run(s,'bad-format'),gateway.ImageOperationPending);assert.equal(posts.length,before+1);r=await row('bad-format');assert.equal(JSON.stringify(r).includes('only `url`'),false,'raw message never persisted');
  });
  for(const mode of ['invalid-json','missing-task','lost-response'])await check(mode+'_unknown_retained',async()=>{
   const s=scope('gemini-3-pro-image-preview'),before=posts.length;await assert.rejects(run(s,mode,mode),gateway.ImageOperationPending);const r=await row(mode);assert.equal(r.state,'unknown');assert.ok(r.evidence.adapterStage);assert.ok(r.evidence.failureCategory);assert.equal(r.task_id,null);assert.ok(r.parameters.requestHash);await assert.rejects(run(s,mode,mode),gateway.ImageOperationPending);assert.equal(posts.length,before+1);
  });
 }finally{await db.getPool().end();await f.cleanup()}
 const failed=reports.filter(r=>!r.pass).length;fs.writeFileSync(path.join(out,'APIMART_FORMAT.json'),JSON.stringify({sourcePath,sourceSha256:createHash('sha256').update(text).digest('hex'),reports,posts,failed,supplierCalls:0,evidenceTier:'actual adapter function source + actual HTTP transport, PostgreSQL, task queries and decoded PNG; fixture model registry and loopback supplier'},null,2));
 console.log(`APIMART_RESPONSE_FORMAT=${failed?'FAIL':'PASS'} CASES=${reports.length} FAILED=${failed} REAL_SUPPLIER_CALLS=0`);if(failed)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1});
