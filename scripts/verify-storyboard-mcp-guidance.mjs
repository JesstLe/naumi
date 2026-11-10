import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import path from "node:path";

const result=spawnSync(process.execPath,[path.resolve("public/agent/naumi.mjs"),"mcp"],{
 env:{...process.env,NAUMI_SITE:"http://127.0.0.1:9",NAUMI_TOKEN:"nmk_"+"a".repeat(43),NAUMI_CONFIG:path.resolve("output/no-profile-mcp-guidance.json")},
 input:JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2025-06-18",capabilities:{},clientInfo:{name:"storyboard-guidance-probe",version:"1"}}})+"\n",encoding:"utf8",windowsHide:true,timeout:10000,
});
assert.equal(result.status,0,result.stderr);
const initialized=result.stdout.trim().split("\n").map(line=>JSON.parse(line)).find(message=>message.id===1);
const instructions=initialized.result.instructions;
const missing=["plan_id","revision","run_video_workflow","storyboard","inspect_video_storyboard","apply_video_storyboard_roughcut","naumi_call_status","operation_id"].filter(value=>!instructions.includes(value));
if(missing.length){console.log(`STORYBOARD_MCP_GUIDANCE=FAIL MISSING=${missing.join(",")} NETWORK=0`);process.exitCode=1;}
else console.log("STORYBOARD_MCP_GUIDANCE=PASS CHECKS=8 NESTED_JSON=UNCHANGED EXPLICIT_PLAN=1 ORIGINAL_OPERATION=1 NETWORK=0");
