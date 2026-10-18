import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile,appendFile,access} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const self=fileURLToPath(import.meta.url),sleep=ms=>new Promise(r=>setTimeout(r,ms));
export function parseCgroup(text){
 const sections=Object.fromEntries(text.split(/^@@/m).filter(Boolean).map(part=>{const i=part.indexOf('\n');return [part.slice(0,i).trim(),part.slice(i+1).trim()];}));
 const number=v=>/^\d+$/.test(v||'')&&Number.isSafeInteger(Number(v))?Number(v):null;
 const map=v=>Object.fromEntries((v||'').split('\n').filter(Boolean).map(line=>{const [k,x]=line.trim().split(/\s+/);return [k,number(x)];}));
 return {memoryCurrentBytes:number(sections['memory.current']),memoryLifetimePeakBytes:number(sections['memory.peak']),memoryLimitBytes:sections['memory.max']==='max'?null:number(sections['memory.max']),memoryEvents:map(sections['memory.events']),cpu:map(sections['cpu.stat']),pids:number(sections['pids.current'])};
}
export function summarizeResources(samples,targets){
 assert(samples.length>=2&&targets.length>0,'RESOURCE_SAMPLES_REQUIRED');
 assert(new Set(targets.map(t=>t.id)).size===targets.length,'RESOURCE_TARGETS_DUPLICATED');
 const errors=samples.flatMap(s=>s.errors||[]);
 if(samples.some((s,i)=>!Number.isFinite(Date.parse(s.at))||(i>0&&Date.parse(s.at)<=Date.parse(samples[i-1].at))))errors.push('RESOURCE_TIMELINE_INVALID');
 if(samples.some(s=>s.containers.length!==new Set(s.containers.map(c=>c.id)).size||s.containers.some(c=>!targets.some(t=>t.id===c.id))))errors.push('RESOURCE_INVENTORY_INVALID');
 const roles=targets.map(t=>{const values=samples.map(s=>s.containers.find(c=>c.id===t.id)).filter(Boolean);const complete=values.length===samples.length&&values.every(x=>Number.isSafeInteger(x.metrics.memoryCurrentBytes)&&Number.isSafeInteger(x.metrics.memoryLifetimePeakBytes)&&Number.isSafeInteger(x.metrics.memoryEvents.oom_kill));if(!complete)errors.push('CGROUP_INCOMPLETE_'+t.role);
  return {role:t.role,id:t.id,imageId:t.imageId,samples:values.length,maxObservedCurrentBytes:complete?Math.max(...values.map(x=>x.metrics.memoryCurrentBytes)):null,lifetimePeakBytes:complete?Math.max(...values.map(x=>x.metrics.memoryLifetimePeakBytes)):null,oomKillsSinceContainerStart:complete?Math.max(...values.map(x=>x.metrics.memoryEvents.oom_kill)):null,memoryLimitBytes:values.at(-1)?.metrics.memoryLimitBytes??null};});
 const complete=errors.length===0;
 return {version:1,sampleCount:samples.length,startedAt:samples[0].at,endedAt:samples.at(-1).at,elapsedMs:Date.parse(samples.at(-1).at)-Date.parse(samples[0].at),complete,errors:[...new Set(errors)],containers:roles,maxSampledSumBytes:complete?Math.max(...samples.map(s=>s.containers.reduce((n,c)=>n+c.metrics.memoryCurrentBytes,0))):null,sumOfContainerLifetimePeaksBytes:complete?roles.reduce((n,r)=>n+r.lifetimePeakBytes,0):null,providerCalls:0,measurement:'cgroup v2 raw usage including cache and measurement processes; samples collected sequentially; sum of lifetime peaks is not simultaneous peak',target47CapacityAccepted:false};
}
export async function startResourceSampler({targets,out}){
 const path=join(out,'RESOURCE_TARGETS.json');await writeFile(path,JSON.stringify(targets),{flag:'wx'});
 const child=spawn(process.execPath,[self,'--targets',path,'--output',out],{stdio:['ignore','ignore','ignore'],windowsHide:true});
 const ended=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code));});
 return {async finish(){await writeFile(join(out,'RESOURCE_STOP'),'stop');assert.equal(await ended,0,'RESOURCE_COLLECTOR_FAILED');const report=JSON.parse(await readFile(join(out,'RESOURCE_MEASUREMENT.json'),'utf8'));assert(report.complete,'RESOURCE_MEASUREMENT_INCOMPLETE');return report;},async cancel(){await writeFile(join(out,'RESOURCE_STOP'),'stop');await ended;}};
}
if(process.argv[1]&&resolve(process.argv[1])===self){
 const a=process.argv.slice(2);assert(a.length===4&&a[0]==='--targets'&&a[2]==='--output');const out=resolve(a[3]),targets=JSON.parse(await readFile(a[1],'utf8')),samples=[];
 const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:15000,maxBuffer:1024*1024});
 assert(targets.length>=3&&targets.length<=8&&targets.every(t=>/^[a-f0-9]{64}$/.test(t.id)&&typeof t.role==='string'));
 const started=Date.now();
 try{
  await writeFile(join(out,'RESOURCE_SAMPLES.jsonl'),'',{flag:'wx'});
  for(;;){const sample={at:new Date().toISOString(),containers:[],errors:[]};
   for(const t of targets)try{const c=JSON.parse(docker(['inspect',t.id]))[0];assert(c.Config.Labels['naumi.fixture']==='enterprise-production-composition'&&c.Image===t.imageId&&c.State.Running===true);const raw=docker(['exec',t.id,'sh','-c','for f in memory.current memory.peak memory.max memory.events cpu.stat pids.current; do printf "@@%s\\n" "$f"; cat "/sys/fs/cgroup/$f"; done']);sample.containers.push({id:t.id,role:t.role,metrics:parseCgroup(raw)});}catch{sample.errors.push('SAMPLE_FAILED_'+t.role);}
   samples.push(sample);await appendFile(join(out,'RESOURCE_SAMPLES.jsonl'),JSON.stringify(sample)+'\n');
   let stop=false;try{await access(join(out,'RESOURCE_STOP'));stop=true;}catch{}
   if(stop&&samples.length>=2)break;
   assert(Date.now()-started<900000,'RESOURCE_COLLECTOR_TIMEOUT');await sleep(2000);
  }
  const report=summarizeResources(samples,targets);await writeFile(join(out,'RESOURCE_MEASUREMENT.json'),JSON.stringify(report,null,2));if(!report.complete)process.exitCode=1;
 }catch{await writeFile(join(out,'RESOURCE_ERROR.json'),JSON.stringify({error:'RESOURCE_COLLECTION_FAILED',samples:samples.length}));process.exitCode=1;}
}
