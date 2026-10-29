import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import sharp from "sharp";
import {createModelFixture} from "./model-config-fixture";
import {imagegenRequestSchema} from "../src/lib/imagegen/schema";
import {planImagegen} from "../src/lib/imagegen/plan";
import {issueImagegenQuote, frozenImagegenQuote} from "../src/lib/imagegen/quotes";
import {submitImagegen, getImagegenResult} from "../src/lib/imagegen/dispatch";

// Isolated PostgreSQL + real asynchronous adapter/HTTP/queue/storage/settlement.
// The supplier is loopback-only and returns a deterministic PNG, not a paid image.
async function main() {
  let calls=0,uploads=0,origin="";
  const sent:Record<string,any>[]=[],tasks=new Map<string,Record<string,any>>();
  const png=await sharp({create:{width:256,height:256,channels:3,background:"#dbeafe"}}).png().toBuffer();
  const f=await createModelFixture(async(req,res)=>{
    try {
      res.setHeader("content-type","application/json");
      const url=new URL(req.url!,origin);
      if(url.pathname==="/output.png"){res.setHeader("content-type","image/png");return res.end(png);}
      if(url.pathname==="/v1/uploads/images"){uploads++;res.statusCode=400;return res.end('{}');}
      if(url.pathname.startsWith('/v1/tasks/')){
        const id=url.pathname.split('/').at(-1)!,task=tasks.get(id)!;assert.ok(task);
        return res.end(JSON.stringify({data:{id,model:task.model,status:'completed',cost:'0.01',result:{images:[{url:[origin+'/output.png']}]}}}));
      }
      const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));
      const body=JSON.parse(Buffer.concat(chunks).toString());
      assert.equal(url.pathname,'/v1/images/generations');assert.ok(req.headers['idempotency-key']);
      calls++;sent.push(body);const id='text-only-'+calls;tasks.set(id,body);
      res.end(JSON.stringify({data:{id,status:'submitted'}}));
    }catch(error){res.statusCode=500;res.end(JSON.stringify({error:String(error)}));}
  });
  origin=f.origin;
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:'1',MODEL_CONFIG_TRUSTED_ORIGINS:origin,NAUMI_ROUTER_MANAGEMENT_URL:origin,
    NAUMI_ROUTER_MANAGEMENT_TOKEN:'fixture-router-independent-key-123456789',MODEL_CONFIG_ENVELOPE_SECRET:'fixture-envelope-independent-key-123456789',
    STORAGE_DRIVER:'local',MEDIA_PRIVATE:'1',MEDIA_DIR:await mkdtemp(join(tmpdir(),'naumi-text-only-'))});
  const source=f.config.upstreamModels[0];
  f.config.providers[0].protocol='apimart-images';source.model='fixture-async-image';
  source.capabilities.preserveIdentity=true;
  source.parameterMap={apimartImages:{schemaVersion:1,ratios:['1:1','3:4','16:9'],maxOutputs:1,supportsMask:false,outputDimensions:{'1K:1:1':{width:256,height:256}}},
    qualityPolicy:{mode:'map',choices:[{id:'medium',label:'标准',value:'medium'}]},
    resolutionPolicy:{mode:'map',field:'resolution',ratioField:'aspect_ratio',values:{'1K':'1K'}}};
  await f.repo.current();
  const db=await import('../src/lib/db');
  try {
    const {ensureCreationSchema}=await import('../src/lib/saas/creation-schema');await ensureCreationSchema();
    const owner=`text-only-${randomUUID()}@fixture.test`;await db.getOrCreateUser(owner,'Text-only fixture');
    const {createBillingService,withBillingTransaction}=await import('../src/lib/billing/service');
    await withBillingTransaction(db.getPool(),tx=>createBillingService().grantTx(tx,{id:randomUUID(),email:owner,amount:500,source:'admin',reason:'isolated text-only fixture',expiry:{unit:'years',value:1},ledgerId:randomUUID(),fingerprint:randomUUID(),actor:'fixture'}));
    const {uploadImage}=await import('../src/lib/storage'),{withFrozenCreation}=await import('../src/lib/saas/creation-context');
    const nodeId='project-'+randomUUID(),image=await uploadImage(png,'image/png','fixture/'+randomUUID()+'.png',undefined,owner);
    await db.addArtworks(owner,[{id:nodeId,title:'Existing project anchor, not an input',prompt:'untouched',category:'main',status:'completed',image,gradient:'',origin:'canvas',source:'canvas-add',groupId:nodeId,width:256,height:256}]);
    const run=<T>(fn:()=>Promise<T>)=>withFrozenCreation({actorEmail:owner,scopeKind:'personal',tenantId:null,parentContext:`tree:${nodeId}`},fn);
    const raw=imagegenRequestSchema.parse({version:1,operationId:randomUUID(),entry:'canvas',mode:'generate',prompt:'一只白色猫在木桥边，保持自然日光',modelId:'image-a',sourceNodeId:nodeId,inputs:[],parameters:{quality:'medium',resolution:'1K',ratio:'auto'}});
    const before=JSON.stringify(raw),plan=await run(()=>planImagegen(raw,owner));
    assert.equal(JSON.stringify(raw),before);assert.equal(plan.request.parameters.ratio,'1:1');assert.deepEqual(plan.request.inputs,[]);
    assert.equal(plan.steps[0].billingQuote?.facts.ratio,'1:1');assert.equal(calls,0);
    const quoted=await run(()=>issueImagegenQuote(raw,owner,plan));assert.ok(quoted.quote);
    await run(()=>submitImagegen(raw,owner,{quoteId:quoted.quote!.id,confirmed:true}));
    let result;for(let i=0;i<400;i++){result=await run(()=>getImagegenResult(raw.operationId,owner));if(result&&['succeeded','failed','needs_attention'].includes(result.status))break;if(i===80)console.log('PIPELINE_DIAGNOSTIC='+JSON.stringify({calls,uploads,jobs:(await db.getPool().query('SELECT id,kind,snapshot,lease_token FROM app_image_jobs WHERE email=$1',[owner])).rows}));await new Promise(r=>setTimeout(r,100));}
    assert.equal(result?.status,'succeeded',JSON.stringify(result));assert.equal(calls,1);assert.equal(uploads,0);assert.equal(sent[0].aspect_ratio,'1:1');assert.equal(sent[0].image_urls,undefined);
    const output=(await db.listArtworksByIds(owner,[result!.artifacts[0].artworkId!]))[0];assert.ok(output.image);assert.equal(output.width,256);assert.equal(output.height,256);assert.equal(output.prompt,raw.prompt);
    assert.equal((await db.listArtworksByIds(owner,[nodeId]))[0].image,image);
    const {USER_COOKIE,signUserSession}=await import('../src/lib/native-auth'),{GET}=await import('../src/app/api/generate-image/route');
    const response=await GET(new Request(`http://internal/api/generate-image?job=${result!.jobId}`,{headers:{cookie:`${USER_COOKIE}=${signUserSession(owner,Date.now())}`,'x-naumi-workspace':'personal','x-naumi-project-context':`tree:${nodeId}`}}));
    const receipt=await response.json();assert.equal(response.status,200,JSON.stringify(receipt));assert.equal(receipt.status,'done');assert.equal(receipt.images[0].id,output.id);
    await run(()=>submitImagegen(raw,owner,{quoteId:quoted.quote!.id,confirmed:true}));assert.equal(calls,1);
    assert.equal((await db.getPool().query("SELECT count(*)::int n FROM app_billing_operations WHERE email=$1 AND state='settled' AND feature IN ('image.generate','canvas.image')",[owner])).rows[0].n,1);
    const frozen=await run(()=>frozenImagegenQuote(raw,owner,{quoteId:quoted.quote!.id,confirmed:true}));assert.equal(frozen.request.parameters.ratio,'1:1');assert.equal(raw.parameters.ratio,'auto');
    const explicit=await run(()=>planImagegen(imagegenRequestSchema.parse({...raw,operationId:randomUUID(),parameters:{...raw.parameters,ratio:'3:4'}}),owner));assert.equal(explicit.request.parameters.ratio,'3:4');
    console.log('TEXT_ONLY_PIPELINE=PASS INPUTS=0 RATIO=1:1 HTTP_STATUS=200 ARTWORKS=1 SETTLED_OPERATIONS=1 REPLAY_POSTS=0 LOCAL_SUPPLIER_CALLS=1 REAL_SUPPLIER_CALLS=0');
  }finally{await db.getPool().end();await f.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1});
