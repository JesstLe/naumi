import {spawnSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {createHash,randomUUID} from "node:crypto";
import {fileURLToPath} from "node:url";

if(process.env.NAUMI_VERIFY_ISOLATED_DB!=="1"||new URL(process.env.DATABASE_URL||"http://invalid").hostname!=="127.0.0.1")throw new Error("Requires isolated local PostgreSQL");
fs.mkdirSync("output/billing-20261003",{recursive:true});
const root=process.cwd(),args=process.argv.slice(2),index=args.indexOf("--out");
const out=path.resolve(index<0?process.env.BILLING_VERIFY_EVIDENCE||path.join("output/billing-20261003/runner",randomUUID()):args[index+1]);
const relative=path.relative(path.join(root,"output"),out);
if(!relative||relative===".."||relative.startsWith(".."+path.sep)||path.isAbsolute(relative))throw Error("BILLING_EVIDENCE_MUST_BE_INSIDE_OUTPUT");
fs.mkdirSync(path.dirname(out),{recursive:true});fs.mkdirSync(out,{recursive:false});
const names=["baseline","rules","config","wallet","api","image-jobs","tools","async-tasks","entitlements","agent","facts","reconciliation","cost-audit","intents","coverage","canvas-extra","review","performance"];
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const git=fs.existsSync(path.join(root,".git"))?spawnSync("git",["rev-parse","HEAD"],{encoding:"utf8",windowsHide:true}):null;
const report={status:"RUNNING",source:{root,commit:git?.status===0?git.stdout.trim():null,runnerSha256:hash(fs.readFileSync(fileURLToPath(import.meta.url)))},started:new Date().toISOString(),cases:names.map(name=>({name,status:"NOT_RUN",command:[process.execPath,"node_modules/tsx/dist/cli.mjs","--conditions","react-server",`scripts/verify-billing-${name}.ts`],sourceSha256:hash(fs.readFileSync(`scripts/verify-billing-${name}.ts`))}))};
const write=()=>fs.writeFileSync(path.join(out,"REPORT.json"),JSON.stringify(report,null,2)+"\n");write();
const escaped=value=>String(value).replaceAll("%","%25").replaceAll("\r","%0D").replaceAll("\n","%0A");
let exit=0;
for(const row of report.cases){
 row.status="RUNNING";row.started=new Date().toISOString();row.stdout=path.join(out,row.name+".stdout.log");row.stderr=path.join(out,row.name+".stderr.log");write();
 const stdout=fs.openSync(row.stdout,"wx"),stderr=fs.openSync(row.stderr,"wx");let child;
 try{child=spawnSync(row.command[0],row.command.slice(1),{stdio:["inherit",stdout,stderr],env:process.env,windowsHide:true});}
 finally{fs.closeSync(stdout);fs.closeSync(stderr);}
 const output=fs.readFileSync(row.stdout),errors=fs.readFileSync(row.stderr);
 process.stdout.write(output);process.stderr.write(errors);
 Object.assign(row,{status:child.status===0&&!child.error?"PASS":"FAIL",exit:child.status,signal:child.signal,error:child.error?String(child.error):null,finished:new Date().toISOString(),stdoutSha256:hash(output),stderrSha256:hash(errors)});write();
 if(row.status==="FAIL"){
  exit=child.status||1;
  if(process.env.GITHUB_ACTIONS==="true")console.log("::error title=Billing regression failed::"+escaped("source="+report.source.commit+" case="+row.name+" exit="+row.exit+"\n"+(row.error||"")+"\n"+Buffer.concat([output,errors]).subarray(-8000).toString("utf8")));
  break;
 }
}
Object.assign(report,{status:exit?"FAIL":"PASS",passed:report.cases.filter(row=>row.status==="PASS").length,failed:report.cases.filter(row=>row.status==="FAIL").length,notRun:report.cases.filter(row=>row.status==="NOT_RUN").length,finished:new Date().toISOString()});write();
console.log(`BILLING_REGRESSION=${report.status} PASSED=${report.passed} FAILED=${report.failed} NOT_RUN=${report.notRun} REPORT=${path.join(out,"REPORT.json")}`);
process.exitCode=exit;
