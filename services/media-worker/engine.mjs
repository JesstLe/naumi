import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,lstat,readdir,link,copyFile,chown,chmod,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {inspectMediaBundle} from '../../src/modules/media/bundle.mjs';
import {MEDIA_LIMITS,safeMediaName,mediaJobDirectory,parseProbe,replaceVirtual,validateMediaAuxiliaryText,nativeMediaArgs,presetMediaCommand} from '../../src/modules/media/contract.mjs';
export {MEDIA_LIMITS,safeMediaName,mediaJobDirectory,parseProbe,replaceVirtual,validateMediaAuxiliaryText,nativeMediaArgs,presetMediaCommand} from '../../src/modules/media/contract.mjs';

async function mediaFileSha256(file){
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(file,{highWaterMark:64*1024}))hash.update(chunk);
  return hash.digest('hex');
}

async function cloneRuntime(source,destination){
  await mkdir(destination,{recursive:true,mode:0o755});
  for(const entry of await readdir(source,{withFileTypes:true})){
    const from=path.join(source,entry.name),to=path.join(destination,entry.name);
    if(entry.isDirectory())await cloneRuntime(from,to);
    else if(entry.isFile())await link(from,to).catch(()=>copyFile(from,to));
    else throw new Error('MEDIA_RUNTIME_MUST_NOT_CONTAIN_SYMLINKS');
  }
}

export class MediaEngine{
  constructor({sharedRoot,fixture=false,runtimeRoot='/opt/naumi-media-runtime',sandboxBinary='/usr/local/bin/naumi-media-sandbox'}={}){
    this.sharedRoot=path.resolve(sharedRoot);this.fixture=fixture;this.runtimeRoot=runtimeRoot;this.sandboxBinary=sandboxBinary;
    if(fixture&&(process.env.MEDIA_WORKER_FIXTURE_OWNER!=='canvas-video-fusion-20261013'||process.env.NODE_ENV==='production'))throw new Error('MEDIA_FIXTURE_MODE_FORBIDDEN');
    if(!fixture&&(process.platform!=='linux'||process.getuid?.()!==0))throw new Error('MEDIA_SANDBOX_ROOT_REQUIRED');
    this.active=new Map();this.serial=0;
  }
  async run(id,request,onProgress=()=>{},signal){
    const shared=mediaJobDirectory(this.sharedRoot,id);
    const sandbox=this.fixture?path.join(shared,'fixture-sandbox'):mediaJobDirectory('/tmp/naumi-media-sandbox',id);
    const uid=10000+(this.serial++%50000);
    if(this.active.has(id))throw new Error('MEDIA_JOB_ALREADY_RUNNING');
    const control={child:null,cancelled:false};this.active.set(id,control);
    const cancel=()=>{control.cancelled=true;if(control.child){if(process.platform==='win32')control.child.kill('SIGKILL');else try{process.kill(-control.child.pid,'SIGKILL');}catch{}}};
    signal?.addEventListener('abort',cancel,{once:true});
    const timer=setTimeout(cancel,MEDIA_LIMITS.timeoutMs);
    try{
      signal?.throwIfAborted();
      for(const directory of [this.sharedRoot,shared,path.join(shared,'inputs')]){
        const info=await lstat(directory);if(!info.isDirectory()||info.isSymbolicLink())throw new Error('INVALID_MEDIA_INPUT_DIRECTORY');
      }
      if(!this.fixture)await cloneRuntime(this.runtimeRoot,sandbox);
      const work=path.join(sandbox,'work'),source=path.join(sandbox,'inputs'),out=path.join(work,'out');
      await mkdir(source,{recursive:true,mode:0o755});await mkdir(out,{recursive:true,mode:0o700});
      if(!this.fixture){await chown(work,uid,uid);await chmod(work,0o700);await chown(out,uid,uid);}
      if(!Array.isArray(request.inputs)||request.inputs.length>1000||!Array.isArray(request.outputs)||request.outputs.length>32)throw new Error('INVALID_MEDIA_MANIFEST');
      let totalInput=0;const inputs=[],allInputs=[...request.inputs,...(request.bundleFiles||[])];
      if(allInputs.length>1000||new Set(allInputs.map(item=>item.name)).size!==allInputs.length)throw new Error('INVALID_MEDIA_INPUT_INVENTORY');
      for(let i=0;i<allInputs.length;i++){
        const input=allInputs[i];safeMediaName(input.name);
        if(input.name.includes('/')&&!/^bundle-\d+\//.test(input.name))throw new Error('INPUT_BUNDLE_REQUIRED');
        const file=path.join(shared,'inputs',input.name),info=await lstat(file);
        if(!info.isFile()||info.isSymbolicLink()||info.size!==input.bytes||!Number.isSafeInteger(input.bytes)||input.bytes<1)throw new Error('MEDIA_INPUT_CHANGED');
        totalInput+=info.size;if(totalInput>MEDIA_LIMITS.inputBytes)throw new Error('MEDIA_INPUT_TOO_LARGE');
        if(await mediaFileSha256(file)!==input.sha256)throw new Error('MEDIA_INPUT_CHANGED');
        const copy=path.join(source,input.name);await mkdir(path.dirname(copy),{recursive:true,mode:0o755});await copyFile(file,copy);await chmod(copy,0o444);
        if(i<request.inputs.length)inputs.push(this.fixture?copy:`/inputs/${input.name}`);
      }
      for(const input of allInputs)if(/\.(m3u8|mpd)$/i.test(input.name))inspectMediaBundle(input.name,await readFile(path.join(source,input.name),'utf8'),allInputs.map(item=>item.name));
      const outputs=[];
      for(const name of request.outputs){safeMediaName(name.replace(/\/$/,''));const file=path.join(out,name.replace(/\/$/,'')),directory=name.endsWith('/')?file:path.dirname(file);await mkdir(directory,{recursive:true,mode:0o700});
        if(!this.fixture){let owned=directory;for(;;){await chown(owned,uid,uid);if(owned===out)break;owned=path.dirname(owned);}}
        outputs.push(this.fixture?file.replaceAll('\\','/'):`/work/out/${name.replace(/\/$/,'')}`);}
      const auxiliary=[];let auxiliaryBytes=0;
      if((request.auxiliaryInputs||[]).length>16)throw new Error('TOO_MANY_AUXILIARY_FILES');
      for(const item of request.auxiliaryInputs||[]){
        safeMediaName(item.name);if(item.name.includes('/'))throw new Error('AUXILIARY_NAME_MUST_BE_FLAT');
        const file=path.join(shared,'inputs',item.name),info=await lstat(file);auxiliaryBytes+=info.size;
        if(!info.isFile()||info.isSymbolicLink()||info.size!==item.bytes||auxiliaryBytes>MEDIA_LIMITS.auxiliaryBytes)throw new Error('INVALID_AUXILIARY_MEDIA_BYTES');
        const bytes=await readFile(file);if(createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw new Error('AUXILIARY_MEDIA_CHANGED');
        const copied=path.join(source,item.name);await copyFile(file,copied);auxiliary.push(this.fixture?copied.replaceAll('\\','/'):`/inputs/${item.name}`);
      }
      for(let i=0;i<(request.auxiliaryInputs||[]).length;i++){
        const item=request.auxiliaryInputs[i],file=path.join(source,item.name);
        if(item.text){const content=await readFile(file,'utf8');validateMediaAuxiliaryText(content);await writeFile(file,replaceVirtual(content,inputs,outputs,auxiliary));}
        await chmod(file,0o444);
      }
      for(const item of request.auxiliaryOutputs||[]){
        if(!Number.isSafeInteger(item.index)||!auxiliary[item.index])throw new Error('AUXILIARY_OUTPUT_UNAVAILABLE');safeMediaName(item.name);
        const dest=path.join(out,item.name);await mkdir(path.dirname(dest),{recursive:true,mode:0o700});
        if(!this.fixture){let directory=path.dirname(dest);for(;;){await chown(directory,uid,uid);if(directory===out)break;directory=path.dirname(directory);}}
        await copyFile(path.join(source,request.auxiliaryInputs[item.index].name),dest);if(!this.fixture)await chown(dest,uid,uid);await chmod(dest,0o600);
      }
      const execute=async(binary,args,progress=false,bundle=allInputs.some(item=>/\.(m3u8|mpd)$/i.test(item.name)))=>{
        if(control.cancelled)throw new Error('MEDIA_JOB_CANCELLED');
        const argv=nativeMediaArgs(args,inputs,outputs,binary,auxiliary,bundle?'file,pipe,crypto':'file,pipe');
        if(progress)argv.splice(0,0,'-progress','pipe:1','-loglevel','error');
        return new Promise((resolve,reject)=>{
          const child=spawn(this.fixture?binary:this.sandboxBinary,this.fixture?argv:[sandbox,String(uid),binary,...argv],{
            cwd:work,windowsHide:true,detached:process.platform!=='win32',env:{PATH:process.env.PATH||'/usr/bin',LANG:'C',...(process.platform==='win32'?{SystemRoot:process.env.SystemRoot||'C:\\Windows'}:{})},stdio:['ignore','pipe','pipe']});
          control.child=child;const stdout=[],stderr=[];let count=0,errorCount=0,tail='';
          child.stdout.on('data',chunk=>{count+=chunk.length;if(count>MEDIA_LIMITS.logBytes){cancel();return;}stdout.push(chunk);
            if(progress){tail+=chunk.toString();const lines=tail.split('\n');tail=lines.pop()||'';for(const line of lines){if(line.startsWith('out_time_us=')){const seconds=Number(line.slice(12))/1e6;if(Number.isFinite(seconds))onProgress(seconds);}}}});
          child.stderr.on('data',chunk=>{errorCount+=chunk.length;if(errorCount>MEDIA_LIMITS.logBytes){cancel();return;}stderr.push(chunk);});
          child.once('error',reject);child.once('close',code=>{control.child=null;const error=Buffer.concat(stderr).toString();if(control.cancelled)reject(new Error('MEDIA_JOB_CANCELLED'));else if(code!==0)reject(new Error(`MEDIA_PROCESS_FAILED:${error.slice(-2000)}`));else resolve(Buffer.concat(stdout).toString());});
        });
      };
      const probes=[];for(let i=0;i<inputs.length;i++)probes.push(parseProbe(await execute('ffprobe',['-v','error','-show_streams','-show_format','-of','json',`asset:${i}`])));
      if(request.verifyStreams===true)for(let i=0;i<inputs.length;i++)await execute('ffmpeg',['-v','error','-xerror','-err_detect','explode','-i',`asset:${i}`,'-map','0:v?','-map','0:a?','-f','null','-']);
      const binary=request.action==='ffprobe'?'ffprobe':'ffmpeg';
      const args=presetMediaCommand(request,inputs,outputs,probes);
      const query=request.action==='ffprobe'||!outputs.length;
      const stdout=request.inspectOnly===true?'':await execute(binary,args.length?args:['-v','error','-show_streams','-show_format','-of','json','asset:0'],!query);
      const collected=[];let totalOutput=0;
      const collect=async(directory,relative='')=>{
        for(const entry of await readdir(directory,{withFileTypes:true})){
          const name=relative?`${relative}/${entry.name}`:entry.name;safeMediaName(name);const file=path.join(directory,entry.name);
          if(entry.isDirectory()){await collect(file,name);continue;}if(!entry.isFile()||entry.isSymbolicLink())throw new Error('MEDIA_OUTPUT_NOT_REGULAR');
          const info=await lstat(file);totalOutput+=info.size;if(totalOutput>MEDIA_LIMITS.outputBytes||collected.length>=MEDIA_LIMITS.outputs)throw new Error('MEDIA_OUTPUT_TOO_LARGE');
          if(!info.size)throw new Error('MEDIA_OUTPUT_EMPTY');
          collected.push({name,bytes:info.size,sha256:await mediaFileSha256(file),file});
        }
      };
      await collect(out);if(outputs.length&&!collected.length)throw new Error('MEDIA_OUTPUT_MISSING');
      collected.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
      const fragments=new Set(),manifests=new Set();
      for(const item of collected)if(/\.(m3u8|mpd)$/i.test(item.name)){
        const bundle=inspectMediaBundle(item.name,await readFile(item.file,'utf8'),collected.map(file=>file.name));
        manifests.add(item.name);for(const file of bundle.fragments)fragments.add(file);
      }
      // A fragment (including an encrypted HLS segment) is validated by decoding
      // its local manifest. Standalone output files are also completely decoded.
      const outputMetadata=[];
      for(const item of collected){
        const probeFile=this.fixture?item.file:`/work/out/${item.name}`;
        let probe=null;if(manifests.has(item.name)||!fragments.has(item.name)&&!/\.(txt|json|srt|ass|vtt|csv|log|key|bin|md5|ffconcat|fffilter)$/i.test(item.name)){
          const original=inputs.length;inputs.push(probeFile);
          try{probe=parseProbe(await execute('ffprobe',['-v','error','-show_streams','-show_format','-of','json',`asset:${original}`],false,manifests.has(item.name)));
            await execute('ffmpeg',['-v','error','-xerror','-err_detect','explode','-i',`asset:${original}`,'-map','0:v?','-map','0:a?','-f','null','-'],false,manifests.has(item.name));}
          finally{inputs.pop();}
          if(!probe.videoCodec&&!probe.audioCodecs.length)throw new Error('MEDIA_OUTPUT_STREAM_MISSING');
        }
        const dest=path.join(shared,'results',item.name);await mkdir(path.dirname(dest),{recursive:true,mode:0o700});await copyFile(item.file,dest);
        if(!this.fixture){
          let directory=path.dirname(dest);const boundary=path.join(shared,'results');
          for(;;){await chown(directory,1001,1001);if(directory===boundary)break;directory=path.dirname(directory);}
          await chown(dest,1001,1001);
        }await chmod(dest,0o600);
        outputMetadata.push({name:item.name,bytes:item.bytes,sha256:item.sha256,probe,fragment:fragments.has(item.name)});
      }
      if(!this.fixture)await chown(path.join(shared,'results'),1001,1001).catch(()=>{});
      if(control.cancelled)throw new Error('MEDIA_JOB_CANCELLED');
      return {outputs:outputMetadata,probes,stdout:stdout.slice(0,MEDIA_LIMITS.logBytes)};
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);cancel();this.active.delete(id);await rm(sandbox,{recursive:true,force:true});}
  }
}
