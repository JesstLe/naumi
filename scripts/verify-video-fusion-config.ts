import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixtureDatabase } from "./video-fusion/fixture";
import { CAP_RICH } from "./video-fusion/harness";
import { recordSupplierVideoDefinition,supplierVideoDefinition } from "../src/lib/supplier-models/video-access";
import { freezeManagedVideoCapability } from "../src/lib/video/frozen-capability";
import { modelConfigDigest,createModelRepository } from "../src/lib/model-config/repository";
import {createCredentialStore} from "../src/lib/model-config/credentials";
import {applyVideoParameters} from "../src/lib/model-config/video-policy";
import {managedModelRows} from "../src/lib/model-config/management";
import { fixtureModelConfig } from "./model-config-unit-fixture";
import { documentedVideoDefinition } from "../src/lib/supplier-models/discovery";
import type {ModelProvider,UpstreamModel,ModelSnapshot} from "../src/lib/model-config/types";
async function main(){


const guard=await fixtureDatabase(),schemaName=`video_config_${randomUUID().replace(/-/g,"")}`;
try{await guard.query(`CREATE SCHEMA ${schemaName}`);}finally{await guard.end();}
const scoped=new URL(process.env.DATABASE_URL!);scoped.searchParams.set("options",`-c search_path=${schemaName}`);process.env.DATABASE_URL=scoped.href;
const sql=await fixtureDatabase();
try{
  const suffix=randomUUID().replace(/-/g,""),provider:ModelProvider={id:`pv-${suffix}`,name:"fixture video",protocol:"ark",baseUrl:"https://fixture.example.test",enabled:true,credentialRef:randomUUID(),timeoutMs:120000,maxConcurrent:2};
  const upstream:UpstreamModel={id:`uv-${suffix}`,providerId:provider.id,model:"wire-video",label:"Fixture video",modality:"video",enabled:true,
    capabilities:{verified:false,generate:true,edit:true,vision:false,transparent:false,preserveIdentity:false,textAccuracy:false,qualityRank:3,qualities:[],nativeResolutions:[],maxReferenceImages:0,expectedLatencyMs:0,
      video:{audio:"disabled",supportsWatermark:false,limits:{images:0}}},parameterMap:{videoProfile:"ark"}};
  const first=await recordSupplierVideoDefinition(sql,{providerId:provider.id,modelId:upstream.model,definition:CAP_RICH,profile:"ark",sourceUrl:"https://supplier.example.test/video-models"});
  const vendor=await supplierVideoDefinition(provider.id,upstream.model);assert.equal(vendor?.sourceRevision.revision,first.revision);
  const config={schemaVersion:1 as const,providers:[provider],upstreamModels:[upstream],publicModels:[],pools:[],bindings:{}};
  const one:ModelSnapshot={version:950001,digest:modelConfigDigest(config),config};
  const frozen=await freezeManagedVideoCapability(one,upstream,provider);
  assert.equal(frozen.definition.limits?.images,0);assert.equal(frozen.definition.audio,"disabled");assert.equal(frozen.definition.supportsWatermark,false);
  await recordSupplierVideoDefinition(sql,{providerId:provider.id,modelId:upstream.model,definition:{...CAP_RICH,durationResolutionMap:[{durations:[30],resolutions:["4K"]}]},profile:"ark",sourceUrl:"https://supplier.example.test/video-models"});
  const still=await freezeManagedVideoCapability(one,upstream,provider);assert.deepEqual(still,frozen);
  const two=await freezeManagedVideoCapability({...one,version:950002},upstream,provider);
  assert.deepEqual(two.definition.durationResolutionMap,[{durations:[30],resolutions:["4K"]}]);
  assert.equal(two.definition.audio,"disabled");
  const old=fixtureModelConfig("https://fixture.example.test",randomUUID());
  const {validateModelConfig}=await import("../src/lib/model-config/schema");
  assert.equal(modelConfigDigest(validateModelConfig(old)),modelConfigDigest(old));
  const imported=documentedVideoDefinition({mode:["text","startFrameOptional",["imageReference:30","videoReference:10","audioReference:10"]],audio:"optional",durationResolutionMap:[{duration:[4,8],resolution:["720p"]}]});
  assert.ok(imported?.modes?.includes("first_optional"));assert.equal(imported?.limits?.images,30);
  assert.equal(documentedVideoDefinition({model:"seedance-anything",durations:[4],resolutions:["720p"]}),undefined);
  const credentials=createCredentialStore(sql);
  const imageKey=await credentials.importPlain({providerId:"p1",plain:randomUUID(),actor:"fixture"});
  const videoKey=await credentials.importPlain({providerId:provider.id,plain:randomUUID(),actor:"fixture"});
  const publishConfig=fixtureModelConfig("https://fixture.example.test",imageKey.id);
  publishConfig.providers.push({...provider,credentialRef:videoKey.id});publishConfig.upstreamModels.push(upstream);
  publishConfig.publicModels.push({id:`video-${suffix}`,label:"Published fixture",modality:"video",enabled:true,visible:true,target:{type:"upstream",id:upstream.id}});
  publishConfig.bindings["video.generate"]=`video-${suffix}`;
  const repo=createModelRepository({pool:sql,initialize:async()=>publishConfig});
  const published=await repo.current();
  if(published.config.upstreamModels.some(model=>model.id===upstream.id)){
    const bound=(await sql.query("SELECT value FROM app_video_model_defaults WHERE model_version=$1 AND upstream_id=$2",[published.version,upstream.id])).rows[0].value;
    await recordSupplierVideoDefinition(sql,{providerId:provider.id,modelId:upstream.model,definition:{...CAP_RICH,audio:"required"},profile:"ark",sourceUrl:"https://supplier.example.test/video-models"});
    // First catalog access after a supplier refresh still reads the publication-time value.
    assert.deepEqual(await freezeManagedVideoCapability(published,upstream,provider,sql),bound);
    const row=managedModelRows(published,[]).find(item=>item.modality==="video")!;
    const updated=applyVideoParameters(published.config,row,[{upstreamId:upstream.id,definition:{limits:{images:0},audio:"disabled"},profile:"ark"}]);
    assert.equal(updated.upstreamModels.find(item=>item.id===upstream.id)!.capabilities.video?.limits?.images,0);
    assert.deepEqual(updated.bindings,published.config.bindings);
    assert.throws(()=>applyVideoParameters(published.config,row,[{upstreamId:"unrelated",definition:{}}]));
    await recordSupplierVideoDefinition(sql,{providerId:provider.id,modelId:upstream.model,definition:CAP_RICH,profile:"kie-kling",sourceUrl:"https://supplier.example.test/mismatched-profile"});
    await assert.rejects(()=>freezeManagedVideoCapability({...published,version:950003},{...upstream,parameterMap:{}},provider),/协议/);
  }else throw new Error("Config verification requires a fresh fixture database/schema");
  process.stdout.write("VIDEO_CONFIG=PASS manual_priority=true published_defaults_frozen=true old_digest_unchanged=true\n");
}finally{await sql.end();const {getPool}=await import("../src/lib/db");await getPool().end();}

}
void main().catch(error=>{console.error(error);process.exitCode=1;});
