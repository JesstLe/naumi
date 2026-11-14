// Fixture Docker owner. Product containers never receive a Docker socket.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,readdir,rename} from 'node:fs/promises';
import path from 'node:path';

const evidence=path.resolve(process.argv[2]),phase=process.argv[3]||'modified-runtime';assert(/^[a-z-]+$/.test(phase));
const images={historic:process.env.MIXED_HISTORIC_IMAGE,rollback:process.env.MIXED_ROLLBACK_IMAGE,current:process.env.MIXED_CURRENT_IMAGE};for(const image of Object.values(images))assert(/^sha256:[a-f0-9]{64}$/.test(image||''));
const docker=args=>execFileSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:120000}).trim();
const metadata=Object.fromEntries(Object.entries(images).map(([key,image])=>{const info=JSON.parse(docker(['image','inspect',image]))[0],env=Object.fromEntries(info.Config.Env.map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)]}));assert(/^[a-f0-9]{40}$/.test(env.SOURCE_COMMIT));return[key,{image,commit:env.SOURCE_COMMIT,version:env.BUILD_VERSION}];}));
await mkdir(evidence,{recursive:true});const previous=await readdir(path.join(evidence,phase)).catch(e=>{if(e.code==='ENOENT')return[];throw e;});assert(!previous.some(name=>name.startsWith('run-')),'Use a fresh evidence phase');
const bundle=process.env.MIXED_DRIVER_BUNDLE||'driver.cjs';assert(/^[a-z-]+\.cjs$/.test(bundle));assert((await readFile(path.join(evidence,bundle))).length);
const driverName='naumi-mixed-driver-20261115-'+phase,prefix='naumi-mixed-peer-20261115-'+phase+'-';assert(!docker(['ps','-aq','--filter','name=^/'+driverName+'$']));
const args=['run','--rm','--name',driverName,'--user','0:0','--read-only','--tmpfs','/tmp:rw,nosuid,size=1g','--tmpfs','/tmp/naumi-media-sandbox:rw,exec,nosuid,nodev,size=1g,mode=755','--mount',`type=bind,source=${evidence},target=/evidence`,'--env','NAUMI_VERIFY_ISOLATED_DB=1','--env','DATABASE_URL=postgresql://postgres:video_compiler_local_fixture@127.0.0.1:5432/video_compiler_fixture','--env',`VIDEO_PROCESS_EVIDENCE=/evidence/${phase}`,'--env','NODE_PATH=/app/node_modules',...Object.entries(images).flatMap(([key,value])=>['--env',`MIXED_${key.toUpperCase()}_IMAGE=${value}`]),'--entrypoint','node',images.current,'/evidence/fixture-pg-relay.mjs','/evidence/'+bundle,'--production-package'];
await writeFile(path.join(evidence,phase+'-COMMAND.json'),JSON.stringify(['docker',...args],null,2));await writeFile(path.join(evidence,'IMAGES.json'),JSON.stringify(metadata,null,2));
const child=spawn('docker',args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let finished=false,exitCode,output='',sequence=0;const owned=new Map(),handled=new Set();
for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{process.stdout.write(b);output+=b;});child.once('exit',code=>{finished=true;exitCode=code;});child.once('error',error=>{finished=true;exitCode=1;output+=String(error);});
const inspect=name=>JSON.parse(docker(['inspect',name]))[0];
const archive=async(name)=>{const info=inspect(name);await writeFile(path.join(evidence,name+'.json'),JSON.stringify(info,null,2));await writeFile(path.join(evidence,name+'.log'),docker(['logs',name]));return {id:info.Id,image:info.Image,running:info.State.Running,exitCode:info.State.ExitCode,restartPolicy:info.HostConfig.RestartPolicy};};
async function act(command){
 assert(['start','stop','cleanup'].includes(command.action));
 if(command.action==='start'){
  const {name,image,role}=command;assert(/^[a-z-]+$/.test(name));assert(['web','worker'].includes(role));assert(Object.values(images).includes(image));assert(!owned.has(name));
  if(role==='worker')for(const value of owned.values())if(value.role==='worker')assert(!inspect(value.name).State.Running,'Previous actual Worker must drain and exit before a replacement starts');
  const meta=Object.values(metadata).find(m=>m.image===image),env={...command.env,NODE_ENV:'production',SOURCE_COMMIT:meta.commit,BUILD_VERSION:meta.version,NAUMI_RELEASE_RUNTIME:'1',NAUMI_RELEASE_ADMISSION_START:role==='worker'?'open':command.env.NAUMI_RELEASE_ADMISSION_START};assert(env.PGOPTIONS?.startsWith('-c search_path=model_test_'));assert(env.MEDIA_DIR?.startsWith('/evidence/'));
  const file=path.join(evidence,phase+'-env-'+(++sequence)+'.txt');await writeFile(file,Object.entries(env).filter(([,v])=>v!==undefined).map(([key,value])=>{assert(/^[A-Z_][A-Z0-9_]*$/.test(key));assert(!/[\r\n]/.test(String(value)));return key+'='+value;}).join('\n'));
  const container=prefix+name;assert(!docker(['ps','-aq','--filter','name=^/'+container+'$']));const run=['run','--detach','--name',container,'--network','container:'+driverName,'--user','1001:1001','--read-only','--tmpfs','/tmp:rw,nosuid,size=256m','--mount',`type=bind,source=${evidence},target=/evidence`,'--env-file',file,'--entrypoint','node',image,role==='web'?'/app/server.js':'/app/scripts/video-worker.mjs'];const id=docker(run);owned.set(name,{name:container,role});return {id,image,commit:meta.commit,role,args:run};
 }
 if(command.action==='stop'){
  const item=owned.get(command.name);assert(item);if(inspect(item.name).State.Running)docker(['kill','--signal','SIGTERM',item.name]);const code=Number(docker(['wait',item.name]));const result=await archive(item.name);assert.equal(code,0,'Owned process did not drain gracefully');return result;
 }
 let count=0;for(const item of owned.values()){if(inspect(item.name).State.Running){docker(['kill','--signal','SIGTERM',item.name]);docker(['wait',item.name]);}await archive(item.name);docker(['rm',item.name]);count++;}owned.clear();return {removed:count};
}
try{
 while(!finished){
  let runs=[];try{runs=await readdir(path.join(evidence,phase));}catch{}
  for(const run of runs.filter(n=>n.startsWith('run-'))){const dir=path.join(evidence,phase,run,'mixed-commands');let files=[];try{files=await readdir(dir);}catch{}
   for(const file of files.filter(n=>/^cmd-[a-f0-9-]+\.json$/.test(n))){const full=path.join(dir,file);if(handled.has(full))continue;let command;try{command=JSON.parse(await readFile(full,'utf8'));}catch{continue;}handled.add(full);let result;try{result={ok:true,value:await act(command)};}catch(error){result={ok:false,error:String(error)};}const target=full.replace('cmd-','result-');await writeFile(target+'.tmp',JSON.stringify(result));await rename(target+'.tmp',target);}
  }
  await new Promise(r=>setTimeout(r,80));
 }
 assert.equal(exitCode,0,'Actual mixed-version verifier failed');
}finally{
 await act({action:'cleanup'});await writeFile(path.join(evidence,phase+'-HOST.log'),output);await writeFile(path.join(evidence,phase+'-HOST_RESULT.json'),JSON.stringify({exitCode,allOwnedPeersRemoved:owned.size===0,images},null,2));console.log('MIXED_HOST_CLEANUP=PASS OWNED_PEERS_REMOVED=1 DRIVER_EXIT='+exitCode);
}
