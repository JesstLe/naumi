// Fixture-only Docker lifecycle owner. No Docker socket in the product runtime.
// Every container uses the caller's fixed local image and current driver network.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,readdir,rename} from 'node:fs/promises';
import path from 'node:path';

const evidence=path.resolve(process.argv[2]),image=process.argv[3],phase=process.argv[4]||'modified-runtime';
assert(image?.startsWith('sha256:'));assert(/^[a-z-]+$/.test(phase));
await mkdir(evidence,{recursive:true});const scratch=path.join(evidence,'scratch');await mkdir(scratch,{recursive:true});
const driverName='naumi-combined-interrupt-driver-20261115',prefix='naumi-combined-interrupt-worker-20261115-';
const docker=(args)=>execFileSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:120000}).trim();
assert(!docker(['ps','-aq','--filter','name=^/'+driverName+'$']),'Existing owned driver must be settled, not replaced');
const commands=['run','--rm','--name',driverName,'--network','container:naumi-video-compiler-pg-20261114','--user','0:0','--read-only','--tmpfs','/tmp:rw,nosuid,size=1g','--mount',`type=bind,source=${evidence},target=/evidence`,'--mount',`type=bind,source=${scratch},target=/scratch`,'--env','NAUMI_VERIFY_ISOLATED_DB=1','--env','DATABASE_URL=postgresql://postgres:video_compiler_local_fixture@127.0.0.1:5432/video_compiler_fixture','--env',`VIDEO_PROCESS_EVIDENCE=/evidence/${phase}`,'--env','NODE_PATH=/app/node_modules','--entrypoint','node',image,'/evidence/driver.cjs','--production-package','--projected-worker-env','--combined-interrupt'];
await writeFile(path.join(evidence,'HOST_COMMAND.json'),JSON.stringify(['docker',...commands],null,2));
const driver=spawn('docker',commands,{windowsHide:true,stdio:['ignore','pipe','pipe']});let finished=false,code,driverLog='',current,sequence=0;const containers=[],handled=new Set();
driver.stdout.on('data',b=>{process.stdout.write(b);driverLog+=b;});driver.stderr.on('data',b=>{process.stderr.write(b);driverLog+=b;});
driver.once('exit',exit=>{finished=true;code=exit;});driver.once('error',error=>{finished=true;code=1;driverLog+=String(error);});
const inspect=name=>JSON.parse(docker(['inspect',name]))[0];
const archive=async(name)=>{
 const info=inspect(name);await writeFile(path.join(evidence,name+'.log'),docker(['logs',name]));await writeFile(path.join(evidence,name+'.json'),JSON.stringify(info,null,2));return {running:info.State.Running,exitCode:info.State.ExitCode,image:info.Image,containerId:info.Id};
};
async function act(command,root){
 assert(['start','signal','inspect','wait','cleanup'].includes(command.action));
 if(command.action==='start'){
  if(current){assert(!inspect(current).State.Running,'Previous combined container still active');await archive(current);docker(['rm',current]);}
  const env=command.env;assert.equal(env.SOURCE_COMMIT,docker(['image','inspect',image,'--format','{{range .Config.Env}}{{println .}}{{end}}']).split('\n').find(s=>s.startsWith('SOURCE_COMMIT=')).slice(14));assert(env.NAUMI_WORKER_STATE_FILE.startsWith('/evidence/'));assert.equal(env.MEDIA_JOB_DIR,'/scratch');
  const envPath=path.join(evidence,'combined-env-'+(++sequence)+'.txt');await writeFile(envPath,Object.entries(env).map(([key,value])=>{assert(/^[A-Z_][A-Z0-9_]*$/.test(key));assert(!/[\r\n]/.test(String(value)));return key+'='+value;}).join('\n'));
  current=prefix+sequence;containers.push(current);
  const args=['run','--detach','--name',current,'--network','container:'+driverName,'--user','0:0','--read-only','--tmpfs','/tmp:rw,nosuid,size=1g','--tmpfs','/tmp/naumi-media-sandbox:rw,exec,nosuid,nodev,size=1g,mode=755','--mount',`type=bind,source=${evidence},target=/evidence`,'--mount',`type=bind,source=${scratch},target=/scratch`,'--env-file',envPath,'--entrypoint','node',image,'/app/scripts/video-worker-with-media.mjs'];
  const id=docker(args);await writeFile(path.join(root,'START-'+sequence+'.json'),JSON.stringify({args,containerId:id,image},null,2));
  return {containerId:id,image,pid1:true};
 }
 if(command.action==='signal'){assert(['SIGTERM','SIGKILL'].includes(command.signal));docker(['kill','--signal',command.signal,current]);return {signal:command.signal,containerId:current};}
 if(command.action==='inspect'){
  const info=inspect(current);let processes=[];
  if(info.State.Running){const probe="const fs=require('node:fs');console.log(JSON.stringify(fs.readdirSync('/proc').filter(s=>/^\\d+$/.test(s)).flatMap(s=>{try{const cmd=fs.readFileSync('/proc/'+s+'/cmdline','utf8').split('\\0').filter(Boolean),status=fs.readFileSync('/proc/'+s+'/status','utf8');return cmd.some(a=>a.includes('/app/scripts/video-'))?[{pid:Number(s),uid:Number(status.match(/^Uid:\\s+(\\d+)/m)[1]),cmd}]:[]}catch{return[]}})))";processes=JSON.parse(docker(['exec',current,'node','-e',probe]));}
  return {running:info.State.Running,exitCode:info.State.ExitCode,containerId:info.Id,processes};
 }
 if(command.action==='wait'){const exited=Number(docker(['wait',current]));const value=await archive(current);assert.equal(value.exitCode,exited);return value;}
 // Only owned fixture containers; no name-pattern mass stop or volume deletion.
 for(const name of containers){if(!docker(['ps','-aq','--filter','name=^/'+name+'$']))continue;if(inspect(name).State.Running)docker(['stop','--time','30',name]);await archive(name);docker(['rm',name]);}
 current=undefined;return {closed:true,containers:containers.length};
}
try{
 while(!finished){
  const phaseRoot=path.join(evidence,phase);let roots=[];try{roots=await readdir(phaseRoot);}catch{}
  for(const name of roots.filter(n=>n.startsWith('run-'))){const root=path.join(phaseRoot,name),dir=path.join(root,'combined-commands');let files=[];try{files=await readdir(dir);}catch{}
   for(const file of files.filter(n=>/^cmd-[a-f0-9-]+\.json$/.test(n))){const key=path.join(dir,file);if(handled.has(key))continue;let command;try{command=JSON.parse(await readFile(key,'utf8'));}catch{continue;}handled.add(key);
    let result;try{result={ok:true,value:await act(command,root)};}catch(error){result={ok:false,error:String(error)};}
    const target=path.join(dir,file.replace('cmd-','result-')),temp=target+'.tmp';await writeFile(temp,JSON.stringify(result));await rename(temp,target);
   }
  }
  await new Promise(resolve=>setTimeout(resolve,80));
 }
 assert.equal(code,0,'Actual combined verifier failed');
}finally{
 if(!finished){try{docker(['kill','--signal','TERM',driverName]);}catch{}await new Promise(resolve=>driver.once('exit',resolve));}
 await act({action:'cleanup'},evidence);await writeFile(path.join(evidence,'HOST_DRIVER.log'),driverLog);await writeFile(path.join(evidence,'HOST_RESULT.json'),JSON.stringify({exit:code,ownedContainers:containers.length,allRemoved:true,image},null,2));
 console.log('COMBINED_HOST_CLEANUP=PASS OWNED_CONTAINERS='+containers.length+' DRIVER_EXIT='+code);
}
