/** Native Windows deny-delete sharing; no mocked filesystem call. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {syncBuiltinESMExports} from 'node:module';
const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const source=path.resolve(option('--source-root','.')),baseline=args.includes('--baseline');
if(process.platform!=='win32'){console.log('MEDIA_NATIVE_SHARE=NOT_APPLICABLE PLATFORM='+process.platform);process.exit(0);}
const root=path.resolve(option('--out','output/media-native-share'),randomUUID());await fs.mkdir(root,{recursive:true});
const {createMediaStateStore}=await import(pathToFileURL(path.join(source,'services/media-worker/state-store.mjs'))),store=createMediaStateStore(root);await store.initialize();
const id=randomUUID(),dir=path.join(root,id);await fs.mkdir(dir);const target=path.join(dir,'worker-state.json'),marker=path.join(root,'locked');await fs.writeFile(target,JSON.stringify({id,status:'queued'}));
const exe=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
const command="$ErrorActionPreference='Stop'; $f=[System.IO.File]::Open($env:NAUMI_ATOMIC_TARGET,[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::ReadWrite); try{[System.IO.File]::WriteAllText($env:NAUMI_ATOMIC_MARKER,'ready'); Start-Sleep -Milliseconds 140} finally{$f.Dispose()}";
const child=spawn(exe,['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',command],{env:{...process.env,NAUMI_ATOMIC_TARGET:target,NAUMI_ATOMIC_MARKER:marker},windowsHide:true,stdio:['ignore','pipe','pipe']});let stderr='';child.stderr.on('data',b=>stderr+=b);const closed=new Promise(r=>child.once('close',code=>r(code)));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ready=false;for(let n=0;n<2000;n++){if(await fs.stat(marker).catch(()=>null)){ready=true;break;}await sleep(2);}assert(ready,'native lock marker');
const native=fs.rename.bind(fs);let attempts=0,codes=[];fs.rename=async(from,to)=>{attempts++;try{return await native(from,to);}catch(error){codes.push(error.code);throw error;}};syncBuiltinESMExports();let error;const start=Date.now();
try{await store.save({id,view:{id,status:'processing'}});}catch(e){error=e;}finally{fs.rename=native;syncBuiltinESMExports();}
assert.equal(await closed,0,stderr);const result=JSON.parse(await fs.readFile(target,'utf8'));assert(codes.includes('EPERM'),'actual native rename must contend, not just injected fault');
if(baseline){assert.equal(error?.code,'EPERM');assert.equal(attempts,1);assert.equal(result.status,'queued');}
else{assert.equal(error,undefined);assert(attempts>1&&attempts<=6);assert.equal(result.status,'processing');}
assert.equal((await fs.readdir(dir)).filter(x=>x.endsWith('.tmp')).length,0);
console.log('MEDIA_NATIVE_SHARE='+ (baseline?'REPRODUCED':'PASS')+' PLATFORM=win32 NATIVE_LOCK=deny_delete_140ms MOCKED_FS_CALLS=0 CODES='+codes.join(',')+' ATTEMPTS='+attempts+' FINAL_STATE='+result.status+' ELAPSED_MS='+(Date.now()-start)+' ENGINE_CALLS=0 SUPPLIER_CALLS=0');
