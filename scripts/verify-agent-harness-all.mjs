import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

if(process.env.NAUMI_VERIFY_ISOLATED_DB!=="1" || new URL(process.env.DATABASE_URL||"http://invalid").hostname!=="127.0.0.1")throw new Error("Requires isolated local DB");
const out=resolve(process.env.HARNESS_EVIDENCE_DIR||"output/agent-harness-20261013");mkdirSync(out,{recursive:true});
const ts="node_modules/tsx/dist/cli.mjs";
const tests=[
  ["unit",[ts,"scripts/verify-agent-harness.ts"]],
  ["runtime",[ts,"scripts/verify-agent-harness-runtime.ts"]],
  ["network",[ts,"scripts/verify-agent-harness-network.ts"]],
  ["bridge",[ts,"scripts/verify-agent-harness-bridge.ts"]],
  ["billing",[ts,"scripts/verify-agent-harness-billing.ts"]],
  ["sessions",[ts,"scripts/verify-agent-session-isolation.ts"]],
  ["canvas",[ts,"scripts/verify-canvas-agent-execution.ts"]],
  ["skills",[ts,"scripts/verify-image-skills.ts"]],
  ["skills-execution",[ts,"scripts/verify-image-skills-execution.ts"]],
  ["tool-coverage",[ts,"scripts/verify-agent-creative-coverage.ts"]],
  ["legacy-policy",[ts,"scripts/verify-agent-guardrails.ts"]],
  ["vision",[ts,"scripts/verify-agent-visual-review.ts"]],
  ["richtext",["scripts/verify-agent-richtext.mjs"]],
  ["types",["node_modules/typescript/bin/tsc","--noEmit","--incremental","false"]],
];
const records=[];
for(const [name,args] of tests){
  const env={...process.env,NODE_OPTIONS:name==="richtext"?"":"--conditions=react-server"};
  const result=spawnSync(process.execPath,args,{encoding:"utf8",env,maxBuffer:8*1024*1024,timeout:240_000});
  const output=(result.stdout||"")+(result.stderr||"");writeFileSync(resolve(out,name+".log"),output);
  records.push({name,command:[process.execPath,...args].join(" "),exit:result.status,output});
  console.log(output.trim()||`${name}=PASS`);
  if(result.status!==0){writeFileSync(resolve(out,"suite.json"),JSON.stringify(records,null,2));throw new Error(`${name} failed (${result.status})`);}
}
writeFileSync(resolve(out,"suite.json"),JSON.stringify(records,null,2));console.log(`AGENT_HARNESS_ALL=PASS modules=${tests.length} real_supplier_calls=0`);
