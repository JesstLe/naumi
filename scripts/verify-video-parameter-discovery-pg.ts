import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createModelFixture} from './model-config-fixture';
import presets from '../src/lib/model-config/video-execution-presets.json';
import {publishedVideoExecutionSchema} from '../src/lib/video/published-execution';
import {refreshProviderCatalog} from '../src/lib/model-config/catalog-store';
import {freezeManagedVideoCapability} from '../src/lib/video/frozen-capability';
import {supplierVideoDefinition} from '../src/lib/supplier-models/video-access';
import {readSupplierModel,saveSupplierModel} from '../src/lib/supplier-models/repository';
import {projectVideoUiContract} from '../src/lib/video/ui-projection';
import type {ModelProvider,UpstreamModel} from '../src/lib/model-config/types';
import {validateModelConfig} from '../src/lib/model-config/schema';
import {inheritPublishedVideoParameters} from '../src/lib/model-config/video-parameter-inheritance';

async function main(){
 let revision=1,requests=0,authenticatedDocs=0,cases=0;
 const source=()=>({version:String(revision),models:[{id:'brand-new-video',modality:'video',videoParameters:{version:1,parameters:{resolution:{type:'string',values:revision===1?['720p','1080p']:['720p','1080p','4k']},durationSeconds:{type:'integer',minimum:3,maximum:15}},conditions:[{when:{inputs:[{kind:'video',minimum:1}]},parameters:{durationSeconds:{type:'integer',maximum:10}}}]}}]});
 const f=await createModelFixture((req,res)=>{
  requests++;res.setHeader('content-type','application/json');
  if(req.url==='/v1/models'){res.end(JSON.stringify({data:[{id:'brand-new-video'}]}));return;}
  if(req.url==='/metadata/video.json'){if(req.headers.authorization)authenticatedDocs++;res.end(JSON.stringify(revision===3?{version:'3',models:[{id:'brand-new-video',modality:'video',videoDefinition:{durationResolutionMap:[{durations:[5,10],resolutions:['720p']}]}}]}:source()));return;}
  res.writeHead(404);res.end('{}');
 });
 const check=(name:string,fn:()=>void)=>{fn();cases++;console.log('PARAMETER_PG_CHECK='+name+' PASS');};
 try{
  const credential=await f.credentials.importPlain({providerId:'video-provider',plain:'isolated-fixture-only',actor:'fixture'});
  const provider:ModelProvider={id:'video-provider',name:'Video fixture',protocol:'apimart',baseUrl:f.origin+'/v1',credentialRef:credential.id,enabled:true,timeoutMs:120000,maxConcurrent:4,options:{parameterCatalogPath:'/metadata/video.json'}};
  const execution=publishedVideoExecutionSchema.parse(presets.items.find(x=>x.model==='seedance-1-5-pro')!.execution);assert(execution.profileId==='native-video');execution.recipe.parameters.resolution.default='720p';execution.recipe.parameters.durationSeconds.default=5;
  const upstream:UpstreamModel={...structuredClone(f.config.upstreamModels[0]),id:'new-video',providerId:provider.id,model:'brand-new-video',label:'Video fixture',modality:'video',parameterMap:{videoProfile:'apib-video-v2',videoExecution:execution},capabilities:{...structuredClone(f.config.upstreamModels[0].capabilities),generate:true}};
  f.config.providers.push(provider);f.config.upstreamModels.push(upstream);f.config.publicModels.push({id:'public-video',label:'Video fixture',modality:'video',visible:true,enabled:true,target:{type:'upstream',id:upstream.id}});
  f.config.bindings['video.generate']='public-video';
  const discovered=await refreshProviderCatalog(f.sql,provider,f.credentials,[f.origin],undefined,true);
  check('actual-http-directory-to-versioned-supplier-source',()=>{assert.equal(discovered.status,'ok');assert.equal(discovered.metadataSaved,true);assert.equal(authenticatedDocs,0);});
  const a=await supplierVideoDefinition(provider.id,upstream.model,f.sql);assert(a);
  check('source-bound-to-full-endpoint-and-revision',()=>{assert.equal(a.sourceRevision.revision,1);assert.equal(a.definition.parameterContract?.providerEndpoint,provider.baseUrl);});
  validateModelConfig(f.config,{trustedOrigins:[f.origin]});
  publishedVideoExecutionSchema.parse(inheritPublishedVideoParameters(execution,provider,upstream.model,a).execution);
  const version1=await f.repo.current(),frozen1=await freezeManagedVideoCapability(version1,upstream,provider,f.sql);assert(frozen1.execution);
  const contract1=projectVideoUiContract(frozen1.execution,{publicModelId:'public-video',wireModel:upstream.model,connectionId:provider.id});
  check('model-publication-freezes-discovered-domain',()=>assert.deepEqual(contract1.operations[0].parameters.resolution.values,['720p','1080p']));
  const row=(await f.sql.query('SELECT id FROM app_supplier_model_metadata WHERE provider_id=$1 AND model_id=$2',[provider.id,upstream.model])).rows[0];
  const metadata=await readSupplierModel(f.sql,row.id);const {id:_id,providerId:_providerId,providerName:_providerName,modelId:_modelId,label:_label,catalogOwner:_catalogOwner,revision:_revision,lastSeenAt:_lastSeen,updatedAt:_updated,...editable}=metadata;
  editable.notes='manual survives';editable.capabilities.edit=false;
  await saveSupplierModel(f.sql,{id:randomUUID(),modelId:row.id,expectedRevision:metadata.revision,metadata:editable,actor:'fixture-admin'});
  revision=2;await refreshProviderCatalog(f.sql,provider,f.credentials,[f.origin],undefined,true);
  const b=await supplierVideoDefinition(provider.id,upstream.model,f.sql);assert(b);
  check('refresh-creates-separate-source-revision',()=>{assert.equal(b.sourceRevision.revision,2);assert.deepEqual(b.definition.parameterContract?.parameters.resolution.values,['720p','1080p','4k']);});
  const same=await freezeManagedVideoCapability(version1,upstream,provider,f.sql);
  check('refresh-does-not-change-existing-frozen-version',()=>assert.deepEqual(same,frozen1));
  const after=await readSupplierModel(f.sql,row.id);
  check('refresh-keeps-admin-edit-and-explicit-false',()=>{assert.equal(after.notes,'manual survives');assert.equal(after.capabilities.edit,false);});
  const draft=await f.repo.draft('fixture-admin');draft.config.upstreamModels.find(u=>u.id===upstream.id)!.label='Video fixture revision 2';
  const saved=await f.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,config:draft.config,actor:'fixture-admin'}),operation=randomUUID();
  const publication=await f.repo.stage({id:operation,draftId:saved.id,expectedRevision:saved.revision,expectedVersion:version1.version,actor:'fixture-admin',reason:'fixture adopt source revision'});
  const version2=await f.repo.markApplied(operation,publication.digest),frozen2=await freezeManagedVideoCapability(version2,version2.config.upstreamModels.find(u=>u.id===upstream.id)!,provider,f.sql);assert(frozen2.execution);
  const contract2=projectVideoUiContract(frozen2.execution,{publicModelId:'public-video',wireModel:upstream.model,connectionId:provider.id});
  check('new-publication-adopts-new-source-once',()=>{assert.deepEqual(contract2.operations[0].parameters.resolution.values,['720p','1080p','4k']);assert.equal(frozen2.sourceRevision?.revision,2);});
  check('old-version-stays-readable-after-new-publication',()=>assert.deepEqual(same,frozen1));
  const rows=(await f.sql.query('SELECT count(*) n FROM app_video_model_defaults WHERE upstream_id=$1',[upstream.id])).rows;
  check('one-freeze-record-per-model-version',()=>assert.equal(Number(rows[0].n),2));
  const defaults=version2.config.upstreamModels.find(u=>u.id===upstream.id)!.parameterMap.videoExecution!;assert(defaults.profileId==='native-video');
  check('source-import-does-not-rewrite-config-mapping-or-default',()=>{assert.equal(defaults.recipe.parameters.resolution.default,'720p');assert.equal(defaults.recipe.parameters.resolution.values,undefined);assert.equal(JSON.stringify(version2.config.business),JSON.stringify(version1.config.business));});
  revision=3;await refreshProviderCatalog(f.sql,provider,f.credentials,[f.origin],undefined,true);const legacy=await supplierVideoDefinition(provider.id,upstream.model,f.sql);assert(legacy);
  const inheritedLegacy=inheritPublishedVideoParameters(execution,provider,upstream.model,legacy).execution;assert(inheritedLegacy.profileId==='native-video');
  check('legacy-directory-at-v1-is-normalized-and-endpoint-bound',()=>{assert.equal(legacy.definition.parameterContract?.providerEndpoint,provider.baseUrl);assert.equal(legacy.sourceRevision.revision,3);assert.deepEqual(inheritedLegacy.recipe.parameters.resolution.values,['720p']);assert.deepEqual(inheritedLegacy.recipe.parameters.durationSeconds.values,[5,10]);});
  console.log(`VIDEO_PARAMETER_DISCOVERY_PG=PASS CASES=${cases} HTTP_FIXTURE_REQUESTS=${requests} SOURCE_REVISIONS=3 FROZEN_VERSIONS=2 PAID_CALLS=0 PRODUCTION_WRITES=0`);
 }finally{await f.cleanup();}
}
void main().catch(e=>{console.error(e);process.exitCode=1});
