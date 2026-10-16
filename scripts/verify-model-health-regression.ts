import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {createModelFixture} from "./model-config-fixture";
async function main(){
  const mode=process.argv[2];assert.ok(["baseline","modified","rollback"].includes(mode));
  const f=await createModelFixture();
  try{
    let state:string;
    if(existsSync("src/lib/model-health/repository.ts")){
      const path="../src/lib/model-health/repository";
      const targetPath="../src/lib/model-health/targets";
      const {createHealthRepository}=await import(path);
      const {configuredHealthTargets}=await import(targetPath);
      const repo=createHealthRepository(f.sql),snapshot=await f.repo.current(),target=configuredHealthTargets(snapshot.config)[0];
      await repo.observe(target,{success:true,reason:null,status:200,latencyMs:1});
      await repo.observe(target,{success:false,reason:"authentication",status:401,latencyMs:1});
      state=(await repo.overview(snapshot)).providers[0].models[0].state;
    }else{
      const {supplierChannelKey,channelHealthSummary}=await import("../src/lib/model-config/channel-scheduler");
      const key=supplierChannelKey({providerId:"p1",baseUrl:f.config.providers[0].baseUrl,wireModel:f.config.upstreamModels[0].model});
      await f.sql.query("INSERT INTO app_model_channel_health(key,failures,last_status,last_success_at) VALUES($1,1,401,now())",[key]);
      state=(await channelHealthSummary(f.sql,f.config))["u1"].state;
    }
    assert.equal(state,mode==="modified"?"unhealthy":"available");
    console.log(`${mode.toUpperCase()} LATEST_FAILURE_STATE=${state}; EXIT=0`);
  }finally{await f.cleanup();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
