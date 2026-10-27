import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createModelFixture} from './model-config-fixture';
import {fixtureConfig} from './billing-unit-fixture';
import {createModelExecutor} from '../src/lib/model-config/execution';
import {apimartImageParameters} from '../src/lib/model-config/apimart-image-parameters';
import {applyImageMappingEditor} from '../src/lib/model-config/image-mapping-editor';
import {canonicalConfig} from '../src/lib/model-config/repository';
async function main(){
 const f=await createModelFixture();let checks=0;const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;};
 try{
  const cfg=structuredClone(f.config),u=cfg.upstreamModels[0];u.capabilities.verified=false;u.capabilities.qualities=[];u.capabilities.nativeResolutions=[];
  u.parameterMap={qualityPolicy:{mode:'map',choices:[{id:'medium',label:'标准',value:'medium'},{id:'high',label:'高',value:'medium'}]},resolutionPolicy:{mode:'map',field:'resolution',ratioField:'size',values:{'1K':'1k','2K':'2k','4K':'2k'}}};cfg.publicModels[0].displayResolutions=['1K','2K','4K'];
  const snapshot={version:150,config:cfg,digest:createHash('sha256').update(canonicalConfig(cfg)).digest('hex')},billing={version:8,config:fixtureConfig()};
  let discovery=0;
  const executor=createModelExecutor({runtime:{byVersion:async(v)=>{eq(v,150);return snapshot;},prepareExecution:async()=>{discovery++;throw Error('No router/discovery');}},credentials:f.credentials,billingByVersion:async()=>billing,gateway:()=>({baseUrl:f.origin,apiKey:'fixture'}),trustedOrigins:[f.origin]});
  const facts={task:'product' as const,quality:'high',resolution:'4K',requestedResolution:'4K',ratio:'1:1',needsEdit:true,needsMask:false,preserveIdentity:true,needsText:false,nativeResolution:false,references:1};
  const frozen=await executor.resolve({feature:'canvas.image',binding:'image.edit',requestedModelId:'image-a',snapshot,billing,facts});
  eq(frozen.imageParameterPlanVersion,1);eq(frozen.imageParameterPlans?.u1.wire,{quality:'medium',resolution:'2k',size:'1:1'});
  await f.sql.query('CREATE TABLE parameter_plan_fixture(id text PRIMARY KEY, payload jsonb NOT NULL)');await f.sql.query('INSERT INTO parameter_plan_fixture VALUES($1,$2::jsonb)',['original',JSON.stringify(frozen)]);
  const saved=(await f.sql.query('SELECT payload FROM parameter_plan_fixture WHERE id=$1',['original'])).rows[0].payload;
  const scope=await executor.describe(saved);const parameters=apimartImageParameters({...scope,connection:{...scope.connection,protocol:'apimart-images'}},{quality:'high',resolution:'4K',ratio:'1:1'});
  eq(parameters.upstream,{quality:'medium',resolution:'2k',size:'1:1'});eq(discovery,0);
  const later=structuredClone(cfg);later.upstreamModels[0].parameterMap.resolutionPolicy!.values['4K']='1k';eq(saved.imageParameterPlans.u1.wire.resolution,'2k');
  const old={...saved};delete old.imageParameterPlanVersion;delete old.imageParameterPlans;const oldScope=await executor.describe(old);eq(oldScope.frozen.imageParameterPlanVersion,undefined);
  const edit={qualities:['medium','high'] as ('medium'|'high')[],resolutions:['1K','2K','4K'] as ('1K'|'2K'|'4K')[],routes:[{upstreamId:'u1',quality:u.parameterMap.qualityPolicy!,resolution:u.parameterMap.resolutionPolicy!}]};
  const edited=applyImageMappingEditor(cfg,['image-a'],['u1'],edit);eq(edited.upstreamModels[0].parameterMap.resolutionPolicy!.values['4K'],'2k');eq(cfg,snapshot.config);
  const broken=structuredClone(edit);delete broken.routes[0].resolution.values['4K'];assert.throws(()=>applyImageMappingEditor(cfg,['image-a'],['u1'],broken));checks++;
  const wrong=structuredClone(saved);wrong.modelDigest='b'.repeat(64);await assert.rejects(executor.describe(wrong));checks++;
  const tampered=structuredClone(saved);tampered.imageParameterPlans.u1.wire.resolution='4k';await assert.rejects(executor.describe(tampered));checks++;
  const invalid=structuredClone(saved);invalid.imageParameterPlans.u1.version=2;await assert.rejects(executor.describe(invalid));checks++;
  console.log(`IMAGE_PARAMETER_PLAN_PG=PASS CHECKS=${checks} FROZEN_ROUNDTRIP=PASS OLD_VERSION=UNCHANGED DISCOVERY=${discovery} SUPPLIER_CALLS=0`);
 }finally{await f.cleanup();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
