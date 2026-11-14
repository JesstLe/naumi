/** Local release verifier bootstrap/observations, never an application endpoint.
 * Seed only an explicitly named random fixture schema; all accept/execution
 * transitions are made by actual HTTP and the release-created Worker. */
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {fixtureModelConfig} from './model-config-unit-fixture';

async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.match(process.env.PGOPTIONS||'',/^\-c search_path=release_direct_[a-f0-9]+$/);
 const input=JSON.parse(process.argv[2]),actor='release-task@fixture.test',pool=(await import('../src/platform/db/pool')).getPool();
 try{
  if(input.action==='init'){
   await(await import('../src/lib/application/persistence')).initializeApplicationPersistence();
   const {createModelRepository}=await import('../src/lib/model-config/repository');
   const {createCredentialStore}=await import('../src/lib/model-config/credentials');
   const credentials=createCredentialStore(pool);
   const makeConfig=async()=>{
    const credential=await credentials.importPlain({providerId:'p1',plain:'fixture-release-provider-key',actor:'fixture-admin'});
    const config=fixtureModelConfig(input.origin+'/v1',credential.id);
    config.providers[0]={...config.providers[0],protocol:'apimart',options:{videoProfile:'apib-video-v2',idempotencyStrategy:'header'}};
    config.upstreamModels[0]={...config.upstreamModels[0],modality:'video',model:'future-release-model',capabilities:{...config.upstreamModels[0].capabilities,verified:false,generate:false,edit:false,video:{modes:['text'],limits:{images:0}}},parameterMap:{videoExecution:{schemaVersion:1,profileId:'json-video',profileVersion:1,recipe:{createPath:'/v1/videos/generations',modelField:'model',promptField:'prompt',defaults:{ordinaryImage:'single_image',sourceVideo:'reference'},parameters:{durationSeconds:{type:'integer',default:1,wireField:'duration'},resolution:{type:'string',default:'4K',mapping:{'4K':'2K'},wireMapping:{'2K':'2k'},wireField:'resolution'}},operations:[{intent:'text',media:[]},{intent:'single_image',images:{min:1,max:1},media:[{kind:'image',wireField:'image_urls',shape:'urls'}]},{intent:'reference',videos:{min:1,max:1},media:[{kind:'video',wireField:'video_urls',shape:'urls'}]}]}}}};
    config.publicModels[0]={...config.publicModels[0],id:'release-task',modality:'video',toolScope:{features:['video.generate'],defaultFor:['video.generate']}};
    config.bindings={'video.generate':'release-task'};return config;
   };
   const fresh=await makeConfig();
   (await import('../src/lib/model-config/schema')).validateModelConfig(fresh,{trustedOrigins:[input.origin]});
   const repo=createModelRepository({pool,trustedOrigins:[input.origin],initialize:async()=>fresh}),snapshot=await repo.current();
   if(!snapshot.config.publicModels.some(model=>model.id==='release-task')){
    const draft=await repo.draft('fixture-admin'),saved=await repo.saveDraft({id:draft.id,expectedRevision:draft.revision,actor:'fixture-admin',config:await makeConfig()});
    const staged=await repo.stage({id:randomUUID(),draftId:saved.id,expectedRevision:saved.revision,expectedVersion:snapshot.version,actor:'fixture-admin',reason:'explicit fixture binding'});
    await repo.markApplied(staged.id,staged.digest,saved.id);
   }
   const billing=await(await import('../src/lib/billing/runtime')).getBillingRuntime(),bill=await billing.config.current(),config=structuredClone(bill.config);
   config.switches.metering='on';config.features['video.generate'].pricing={mode:'fixed',credits:7};config.features['video.generate'].rules=[];
   await billing.config.publish({id:randomUUID(),actor:'fixture-admin',reason:'release-created Worker fixture',expectedVersion:bill.version,config});
   const db=await import('../src/lib/db');await db.getOrCreateUser(actor,'Release fixture');await db.addCreditBatch(actor,200,{source:'grant',reason:'local fixture only'});await db.setSetting('multi_user_enabled','1');
   const png=await sharp({create:{width:32,height:24,channels:3,background:'#aadeff'}}).png().toBuffer(),key='release-input/'+randomUUID()+'.png';
   await mkdir(path.join(process.env.MEDIA_DIR!,'release-input'),{recursive:true});await writeFile(path.join(process.env.MEDIA_DIR!,key),png);
   await(await import('../src/lib/media-assets')).registerMediaAsset(key,png,'image/png',false,actor,false);
   const artwork='release-input-'+randomUUID();await pool.query("INSERT INTO app_artworks(id,email,title,category,prompt,status,image_url,gradient) VALUES($1,$2,'release input','image','','completed',$3,'')",[artwork,actor,'/media/'+key]);
   const {signUserSession}=await import('../src/lib/native-auth');
   console.log(JSON.stringify({cookie:'nv_user='+signUserSession(actor,Date.now()),actor,modelId:'release-task',artworkId:artwork,inputSha256:createHash('sha256').update(png).digest('hex')}));
  }else if(input.action==='task'){
   const row=(await pool.query('SELECT * FROM app_video_tasks WHERE id=$1',[input.id])).rows[0];
   console.log(JSON.stringify(row?{id:row.id,status:row.status,upstreamId:row.upstream_id,artworkId:row.artwork_id,videoUrl:row.video_url,errorCode:row.error_code,
    version:row.parameters.version,submissionState:row.parameters.submissionState,requested:row.parameters.requestedParameters,effective:row.parameters.effectiveParameters,
    quotedCredits:row.billing_quote?.requestedCredits,planDigest:row.parameters.compiledPlanDigest,lease:row.poll_lock_until}:null));
  }else if(input.action==='due'){
   await pool.query('UPDATE app_video_tasks SET next_poll_at=now() WHERE id=$1',[input.id]);
   await(await import('../src/lib/application/task-execution')).wakeApplicationWorker();console.log(JSON.stringify({due:input.id}));
  }else if(input.action==='change'){
   const {createModelRepository}=await import('../src/lib/model-config/repository'),repo=createModelRepository({pool,trustedOrigins:[input.origin],initialize:async()=>{throw Error('fixture already initialized');}});
   const snapshot=await repo.current(),draft=await repo.draft('fixture-admin'),config=structuredClone(snapshot.config);config.upstreamModels[0].model='changed-release-model';
   const saved=await repo.saveDraft({id:draft.id,expectedRevision:draft.revision,actor:'fixture-admin',config}),staged=await repo.stage({id:randomUUID(),draftId:saved.id,expectedRevision:saved.revision,expectedVersion:snapshot.version,actor:'fixture-admin',reason:'change after original acceptance'});await repo.markApplied(staged.id,staged.digest,saved.id);
   const billing=await(await import('../src/lib/billing/runtime')).getBillingRuntime(),bill=await billing.config.current(),price=structuredClone(bill.config);price.features['video.generate'].pricing={mode:'fixed',credits:17};
   await billing.config.publish({id:randomUUID(),actor:'fixture-admin',reason:'new price after acceptance',expectedVersion:bill.version,config:price});console.log(JSON.stringify({changed:true}));
  }else if(input.action==='ledger'){
   const rows=(await pool.query("SELECT id,delta FROM app_ledger WHERE id=ANY($1::text[]) ORDER BY id",[input.ids.map((id:string)=>'led-video-'+id)])).rows;
   const artifacts=(await pool.query('SELECT id,parent_id,status FROM app_artworks WHERE id=ANY($1::text[])',[input.artworks])).rows;
   console.log(JSON.stringify({rows,artifacts}));
  }else throw Error('UNKNOWN_FIXTURE_ACTION');
 }finally{await pool.end();}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
