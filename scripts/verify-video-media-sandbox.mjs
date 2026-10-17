import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,cp,chown,chmod,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {MediaEngine,mediaJobDirectory,parseProbe} from './video-fusion/media-engine.mjs';

// Run only in a dedicated fixed-source Linux fixture container. No formal DB,
// provider credentials, object-store credentials or business media is mounted.
assert.equal(process.platform,'linux');assert.equal(process.getuid(),0);assert.equal(process.env.NODE_ENV,'production');
assert.equal(process.env.MEDIA_SANDBOX_VERIFY_OWNER,'canvas-video-fusion-20261013');
assert.match(process.env.SOURCE_COMMIT||'',/^[a-f0-9]{40}$/);
for(const key of ['DATABASE_URL','SETTINGS_SECRET','R2_SECRET_ACCESS_KEY','S3_SECRET_ACCESS_KEY','VIDEO_API_KEY'])assert.equal(process.env[key],undefined);
const scratch='/scratch',assets='/fixture-assets',engine=new MediaEngine({sharedRoot:scratch});
const manifest=JSON.parse(await readFile(path.join(assets,'manifest.json'),'utf8'));
const video=manifest.files.find(file=>file.name==='landscape-4-audio.mp4'),original=await readFile(path.join(assets,video.name));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');assert.equal(sha(original),video.sha256);
const ids=[],sandboxIds=[];
const prepare=async()=>{const id=randomUUID();ids.push(id);const directory=mediaJobDirectory(scratch,id);await mkdir(path.join(directory,'inputs'),{recursive:true,mode:0o700});await writeFile(path.join(directory,'inputs','input-0.mp4'),original,{mode:0o600});return {id,input:{name:'input-0.mp4',bytes:original.length,sha256:sha(original)}};};
const command=(binary,args)=>new Promise((resolve,reject)=>{const child=spawn(binary,args,{env:{PATH:'/usr/bin',LANG:'C'},stdio:['ignore','pipe','pipe']});let stdout='',stderr='';const timeout=setTimeout(()=>child.kill('SIGKILL'),20000);child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);child.once('error',error=>{clearTimeout(timeout);reject(error);});child.once('close',code=>{clearTimeout(timeout);resolve({code,stdout,stderr});});});
let networkHits=0;const server=createServer((_request,response)=>{networkHits++;response.writeHead(200,{'content-type':'video/mp4'});response.end(original);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
  const changed=await prepare();await assert.rejects(()=>engine.run(changed.id,{action:'frame',timestamp:1,inputs:[{...changed.input,sha256:'0'.repeat(64)}],outputs:['changed.png']}),/MEDIA_INPUT_CHANGED/);
  const frame=await prepare(),result=await engine.run(frame.id,{action:'frame',timestamp:1.25,inputs:[frame.input],outputs:['frame.png']});assert.equal(result.outputs[0].probe.videoCodec,'png');assert.equal(result.outputs[0].probe.width,1280);
  const trim=await prepare(),trimmed=await engine.run(trim.id,{action:'trim',start:1,end:3,inputs:[trim.input],outputs:['trim.mp4']});assert.ok(Math.abs(trimmed.outputs[0].probe.durationSeconds-2)<0.12);assert.equal(trimmed.outputs[0].probe.videoCodec,'h264');
  const cancel=await prepare(),controller=new AbortController();let progressed=false;
  const running=engine.run(cancel.id,{action:'ffmpeg',inputs:[cancel.input],outputs:['slow.mp4'],args:['-re','-stream_loop','-1','-i','asset:0','-t','120','-c','copy','output:0']},seconds=>{if(seconds>0){progressed=true;controller.abort();}},controller.signal);
  await assert.rejects(()=>running);assert.equal(progressed,true);assert.equal(engine.active.has(cancel.id),false);
  // Bypass JS validation for independent launcher tests: the Linux boundary must
  // reject reachable network input and host/cross-job files on its own.
  const id=randomUUID();sandboxIds.push(id);const sandbox=mediaJobDirectory('/tmp/naumi-media-sandbox',id);await cp('/opt/naumi-media-runtime',sandbox,{recursive:true});
  await mkdir(path.join(sandbox,'work'),{recursive:true});await chown(path.join(sandbox,'work'),10000,10000);await chmod(path.join(sandbox,'work'),0o700);
  await writeFile(path.join(sandbox,'inputs','valid.mp4'),original,{mode:0o444});
  const launch=args=>command('/usr/local/bin/naumi-media-sandbox',[sandbox,'10000','ffprobe',...args]);
  const positive=await launch(['-v','error','-show_streams','-show_format','-of','json','/inputs/valid.mp4']);assert.equal(positive.code,0,positive.stderr);assert.equal(parseProbe(positive.stdout).width,1280);
  const url=`http://127.0.0.1:${server.address().port}/video`;assert.equal((await fetch(url)).status,200);networkHits=0;
  const network=await launch(['-v','error',url]);assert.notEqual(network.code,0);assert.equal(networkHits,0);assert.match(network.stderr,/Operation not permitted|Permission denied/i);
  const crossJob=`/scratch/${frame.id}/inputs/input-0.mp4`;assert.equal(sha(await readFile(crossJob)),video.sha256);
  for(const file of ['/fixture-assets/landscape-4-audio.mp4','/proc/self/environ',crossJob])assert.notEqual((await launch(['-v','error',file])).code,0);
  const forbidden=await prepare();await assert.rejects(()=>engine.run(forbidden.id,{action:'ffmpeg',inputs:[forbidden.input],outputs:['bad.mp4'],args:['-i','/etc/passwd','output:0']}));
  assert.equal(sha(await readFile(path.join(assets,video.name))),video.sha256);
  const evidence={owner:process.env.MEDIA_SANDBOX_VERIFY_OWNER,sourceCommit:process.env.SOURCE_COMMIT,actualLinux:true,actualLauncher:true,tamperedInputHashRejected:true,frame:true,trim:true,cancelAfterProgress:true,networkDeniedByKernel:true,hostAndCrossJobDenied:true,sourceUnchanged:true};
  await writeFile(path.join(scratch,'linux-sandbox-evidence.json'),JSON.stringify(evidence));console.log('VIDEO_LINUX_SANDBOX=PASS '+JSON.stringify(evidence));
}finally{
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  // UUID paths created in this isolated container only; keep the evidence file.
  for(const id of ids)await rm(mediaJobDirectory(scratch,id),{recursive:true,force:true});
  for(const id of sandboxIds)await rm(mediaJobDirectory('/tmp/naumi-media-sandbox',id),{recursive:true,force:true});
}
