import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import presets from '../src/lib/model-config/video-family-presets.json';
import {DOCUMENTED_VIDEO_FAMILIES} from '../src/lib/model-config/video-family-capabilities';
import {makeVideoFamilyCapabilityUpgradePlan,rollbackVideoFamilyCapabilityUpgradePlan} from '../src/lib/model-config/video-family-capability-upgrade';
import {createModelFixture} from './model-config-fixture';
import {freezeManagedVideoCapability} from '../src/lib/video/frozen-capability';
import {publicModelCatalog} from '../src/lib/model-config/runtime';
import {legacyVideoView} from '../src/lib/video/model-definition';
import {videoDurations,videoAspectRatios} from '../src/lib/video/legacy-client-settings';
import {resolveVideoCapability} from '../src/lib/video/contract';
import {videoProfileProtocol,type VideoModelDefinition,type VideoWireProfile} from '../src/lib/video/capability-schema';
import type {ModelConfig,ModelSnapshot} from '../src/lib/model-config/types';

/** Real isolated PostgreSQL config publication. No Router/supplier/app POST. */
async function main(){
 const f=await createModelFixture();
 try{
  for(const providerId of new Set(presets.items.map(x=>x.providerId))){
   const item=presets.items.find(x=>x.providerId===providerId)!;
   const key=await f.credentials.importPlain({providerId,plain:'local-capability-fixture-'+randomUUID(),actor:'fixture'});
   f.config.providers.push({id:providerId,name:providerId,protocol:videoProfileProtocol(item.profile as VideoWireProfile),baseUrl:f.origin,credentialRef:key.id,enabled:true,timeoutMs:120000,maxConcurrent:2});
  }
  for(const [i,item] of presets.items.entries()){
   const enabled=item.model!=='wan2.7-videoedit',id='old-video-'+i;
   f.config.upstreamModels.push({...structuredClone(f.config.upstreamModels[0]),id,providerId:item.providerId,model:item.model,modality:'video',enabled,parameterMap:{videoProfile:item.profile as VideoWireProfile},costRef:'preserved-price-'+i,
    capabilities:{...structuredClone(f.config.upstreamModels[0].capabilities),generate:enabled,edit:false,maxReferenceImages:item.definition.limits.images,video:structuredClone(item.definition) as VideoModelDefinition}});
   f.config.publicModels.push({id:item.publicId,label:item.label,modality:'video',enabled,visible:enabled,target:{type:'upstream',id},toolScope:{features:enabled?['video.generate']:[],defaultFor:enabled&&item.publicId===presets.defaultPublicModelId?['video.generate']:[]}});
  }
  f.config.bindings['video.generate']=presets.defaultPublicModelId;
  const old=await f.repo.current();
  const retained=await f.sql.query('SELECT upstream_id,value FROM app_video_model_defaults WHERE model_version=$1 ORDER BY upstream_id',[old.version]);
  const hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex'),oldHash=hash(retained.rows);
  const plan=makeVideoFamilyCapabilityUpgradePlan(old.config,DOCUMENTED_VIDEO_FAMILIES);
  assert.equal(plan.missing.length,0);assert.equal(new Set(plan.patches.map(p=>p.upstreamId)).size,32);
  assert.deepEqual(plan.config.providers,old.config.providers);assert.deepEqual(plan.config.publicModels,old.config.publicModels);assert.deepEqual(plan.config.bindings,old.config.bindings);
  async function publish(config:ModelConfig,expectedVersion:number){
   const actor='capability-fixture:'+expectedVersion;
   const draft=await f.repo.draft(actor);
   const saved=await f.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,actor,config});
   const staged=await f.repo.stage({id:randomUUID(),draftId:saved.id,expectedRevision:saved.revision,expectedVersion,actor,reason:'Isolated capability publication'});
   return f.repo.markApplied(staged.id,staged.digest);
  }
  const next=await publish(plan.config,old.version);assert(next.version>old.version);
  async function catalog(snapshot:ModelSnapshot){
   const rows=publicModelCatalog(snapshot,'video','video.generate').models;
   return Promise.all(rows.map(async model=>{
    const p=snapshot.config.publicModels.find(p=>p.id===model.id)!;
    const u=snapshot.config.upstreamModels.find(u=>u.id===p.target.id)!;
    const provider=snapshot.config.providers.find(p=>p.id===u.providerId)!;
    const frozen=await freezeManagedVideoCapability(snapshot,u,provider,f.sql);
    return {id:model.id,profile:frozen.profile,view:legacyVideoView({...frozen.definition,sources:frozen.sources},{providerId:'managed-video',modelId:model.id,label:model.label})};
   }));
  }
  const expanded=await catalog(next),original=await catalog(await f.repo.byVersion(old.version));
  assert.equal(expanded.length,32);assert.equal(original.length,32);
  for(const row of expanded){
   const doc=DOCUMENTED_VIDEO_FAMILIES.find(x=>x.publicId===row.id)!;
   const expected=resolveVideoCapability({manual:doc.definition});expected.sources.videoProfile='admin';
   assert.deepEqual(row.view.definition,expected);
   assert.equal(row.profile,doc.profile);assert(videoDurations(row.view.definition!).length>1);
  }
  assert(original.every(row=>row.view.durations.length===1&&row.view.resolutions.length===1));
  const seedance=expanded.find(row=>row.id==='video-apib-seedance-2-0')!;
  assert(seedance.view.definition?.modes?.includes('frames_required'));assert(seedance.view.resolutions.includes('4k'));
  assert(videoAspectRatios(seedance.view.definition!,'text','1080p').includes('21:9'));
  const unchanged=await f.sql.query('SELECT upstream_id,value FROM app_video_model_defaults WHERE model_version=$1 ORDER BY upstream_id',[old.version]);
  assert.equal(hash(unchanged.rows),oldHash);assert.deepEqual((await f.repo.byVersion(old.version)).config,old.config);
  const draft=await f.repo.draft('stale-fixture');
  await assert.rejects(f.repo.stage({id:randomUUID(),draftId:draft.id,expectedRevision:draft.revision,expectedVersion:old.version,actor:'stale-fixture',reason:'Stale version control'}),/更新/);
  const reverted=await publish(rollbackVideoFamilyCapabilityUpgradePlan(next.config,plan),next.version);
  assert.deepEqual(reverted.config,old.config);assert((await catalog(reverted)).every(row=>row.view.durations.length===1));
  assert.equal((await f.sql.query('SELECT count(*) AS n FROM app_video_model_defaults WHERE model_version=$1',[next.version])).rows[0].n,'33');
  console.log('VIDEO_CAPABILITY_PUBLICATION=PASS models=32 old_rows=33 old_version_immutable=true new_profiles=3 catalog_expanded=true version_CAS=true rollback_new_version=true SUPPLIER_CALLS=0');
 }finally{await f.cleanup();}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
