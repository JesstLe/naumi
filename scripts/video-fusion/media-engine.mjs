import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,lstat,readdir,link,copyFile,chown,chmod,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {inspectMediaBundle} from './media-bundle.mjs';

export const MEDIA_LIMITS=Object.freeze({inputBytes:250*1024*1024,outputBytes:500*1024*1024,outputs:1000,timeoutMs:180000,concurrency:2,logBytes:1024*1024,queue:8,terminalJobs:128,requestBytes:2*1024*1024,auxiliaryBytes:512*1024});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const namePattern=/^[a-zA-Z0-9_%.$-]+(?:\/[a-zA-Z0-9_%.$-]+)*$/;
export function safeMediaName(name){
  if(typeof name!=='string'||name.length>160||!namePattern.test(name)||name.split('/').some(p=>p==='.'||p==='..'))throw new Error('INVALID_MEDIA_NAME');
  return name;
}
export function mediaJobDirectory(root,id){if(!uuid.test(id))throw new Error('INVALID_JOB_ID');return path.join(root,id);}
export function parseProbe(json){
  const value=typeof json==='string'?JSON.parse(json):json;
  const streams=Array.isArray(value.streams)?value.streams:[];
  const video=streams.find(item=>item.codec_type==='video'&&item.disposition?.attached_pic!==1);
  const audios=streams.filter(item=>item.codec_type==='audio');
  const durations=[Number(value.format?.duration),...streams.map(item=>Number(item.duration))].filter(n=>Number.isFinite(n)&&n>0);
  const rate=String(video?.avg_frame_rate||'0/1').split('/').map(Number);
  return {durationSeconds:durations.length?Math.max(...durations):0,width:Number(video?.width)||0,height:Number(video?.height)||0,
    videoCodec:video?.codec_name||null,audioCodecs:audios.map(item=>item.codec_name||'unknown'),formatName:String(value.format?.format_name||''),
    frameRate:rate[1]&&rate[0]>0?rate[0]/rate[1]:null};
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
export function replaceVirtual(value,inputs,outputs,auxiliary=[]){
  return value.replace(/\bassets:([a-z0-9]{1,8})\b/g,(_match,extension)=>{
    if(!inputs.length||inputs.some((file,index)=>path.basename(file)!==`input-${index}.${extension}`))throw new Error('IMAGE_SEQUENCE_INPUTS_MUST_MATCH');
    return path.join(path.dirname(inputs[0]),`input-%d.${extension}`).replaceAll('\\','/');
  }).replace(/\b(asset|output|aux):(\d+)/g,(_match,type,index)=>{
    const item=(type==='asset'?inputs:type==='output'?outputs:auxiliary)[Number(index)];
    if(!item)throw new Error('UNKNOWN_VIRTUAL_MEDIA_PATH');return item.replaceAll('\\','/');
  });
}
/** Native expressions remain available inside the chroot; explicit file arguments
 * must name owned virtual inputs or job outputs. Network syscalls are denied too. */
export function validateMediaAuxiliaryText(value){
  if(typeof value!=='string'||value.includes('\0')||/(?:^|[\s=,:"'])\/(?:[A-Za-z_.])|[A-Za-z]:[\\/]|\.\.[\\/]|(?:https?|tcp|udp|rtmp|rtsp|srt|ftp|unix|file|crypto):/im.test(value))throw new Error('AUXILIARY_MEDIA_PATH_FORBIDDEN');
}
export function nativeMediaArgs(args,inputs,outputs,binary,auxiliary=[],localProtocols='file,pipe'){
  if(!Array.isArray(args)||args.length>512||args.some(v=>typeof v!=='string'||v.length>16384||v.includes('\0')))throw new Error('INVALID_MEDIA_ARGS');
  const forbidden=new Set(['-protocol_whitelist','-protocol_blacklist','-progress','-report','-stdin','-y','-n']);
  const fileOptions=new Set(['-i','-filter_script','-filter_complex_script','-vstats_file','-passlogfile','-attach','-dump_attachment','-segment_list','-hls_segment_filename','-hls_key_info_file']);
  const result=[];let inputFormat=null;
  for(let i=0;i<args.length;i++){
    const value=args[i];if(forbidden.has(value)||/^-dump_attachment(?::|$)/.test(value))throw new Error('CONTROLLED_MEDIA_OPTION');
    if(args[i-1]!=='-metadata'&&/(?:^|[=,:"'])\/(?:[A-Za-z_.])|[A-Za-z]:[\\/]|\.\.[\\/]/.test(value))throw new Error('MEDIA_EMBEDDED_PATH_FORBIDDEN');
    if(/^(?:https?|tcp|udp|rtmp|rtsp|srt|ftp|crypto|subfile|concat|file|pipe|unix):/i.test(value))throw new Error('MEDIA_PROTOCOL_FORBIDDEN');
    if(value==='-f'){inputFormat=args[i+1];}
    if(value==='-i'||fileOptions.has(value)){
      const next=args[++i];if(!next||(!(/^(?:asset|output|aux):\d+(?:\/[\w%.$-]+)*$|^assets:[a-z0-9]{1,8}$/.test(next))&&!(value==='-i'&&inputFormat==='lavfi')))throw new Error('VIRTUAL_MEDIA_PATH_REQUIRED');
      inputFormat=null;
      result.push(value,replaceVirtual(next,inputs,outputs,auxiliary));continue;
    }
    if((value.startsWith('/')||/^[a-z]:[\\/]/i.test(value)||value.includes('../')||value.includes('..\\'))&&!value.includes('asset:')&&!value.includes('output:')&&!value.includes('aux:'))throw new Error('MEDIA_PATH_FORBIDDEN');
    if(/^(asset|output|aux):/.test(value)&&!/^((asset|output|aux):\d+)(?:\/[\w%.$-]+)*$/.test(value))throw new Error('INVALID_VIRTUAL_MEDIA_PATH');
    if((value==='-init_seg_name'||value==='-media_seg_name')&&(!args[i+1]||!/^[\w%.$-]+$/.test(args[i+1])))throw new Error('SEGMENT_NAME_MUST_BE_LOCAL');
    result.push(replaceVirtual(value,inputs,outputs,auxiliary));
  }
  const restricted=['-protocol_whitelist',localProtocols];
  return binary==='ffmpeg'?['-hide_banner','-nostdin','-y',...restricted,'-threads','2','-filter_threads','2','-filter_complex_threads','2',...result]:[...restricted,...result];
}
export function presetMediaCommand(request,inputs,outputs,probes){
  const first=probes[0];
  const encode=['-c:v','libx264','-preset','veryfast','-threads','2','-c:a','aac','-movflags','+faststart'];
  switch(request.action){
    case 'frame':{
      if(!first?.videoCodec||!first.durationSeconds)throw new Error('VIDEO_STREAM_REQUIRED');
      const timestamp=request.timestamp==='last'?Math.max(0,first.durationSeconds-1/(first.frameRate||25)):request.timestamp==='first'?0:Number(request.timestamp??0);
      if(!Number.isFinite(timestamp)||timestamp<0||timestamp>=first.durationSeconds)throw new Error('FRAME_TIMESTAMP_OUT_OF_RANGE');
      return ['-ss',String(timestamp),'-i','asset:0','-map','0:v:0','-frames:v','1','-update','1','output:0'];
    }
    case 'extract_audio': if(!first?.audioCodecs.length)throw new Error('AUDIO_STREAM_REQUIRED');return ['-i','asset:0','-map','0:a:0','-vn','-c:a','pcm_s16le','output:0'];
    case 'separate': if(!first?.videoCodec||!first.audioCodecs.length)throw new Error('VIDEO_AND_AUDIO_STREAMS_REQUIRED');return ['-i','asset:0','-map','0:v:0','-c:v','copy','-an','-movflags','+faststart','output:0','-map','0:a:0','-vn','-c:a','pcm_s16le','output:1'];
    case 'trim':{
      if(!first?.videoCodec||!Number.isFinite(request.start)||!Number.isFinite(request.end)||request.start<0||request.end<=request.start||request.end>first.durationSeconds+0.001)throw new Error('TRIM_RANGE_INVALID');
      return ['-i','asset:0','-ss',String(request.start),'-t',String(request.end-request.start),'-map','0:v:0','-map','0:a?',...encode,'output:0'];
    }
    case 'concat':{
      if(probes.length<2||probes.some(p=>!p.videoCodec))throw new Error('CONCAT_VIDEO_INPUTS_REQUIRED');
      const audio=probes.every(p=>p.audioCodecs.length>0),width=first.width-widthParity(first.width),height=first.height-widthParity(first.height);
      const chains=probes.map((_p,i)=>`[${i}:v:0]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25,setpts=PTS-STARTPTS[v${i}]${audio?`;[${i}:a:0]aformat=sample_rates=48000:channel_layouts=stereo,asetpts=PTS-STARTPTS[a${i}]`:''}`);
      const joined=probes.map((_p,i)=>`[v${i}]${audio?`[a${i}]`:''}`).join('');
      return [...inputs.flatMap((_p,i)=>['-i',`asset:${i}`]),'-filter_complex',`${chains.join(';')};${joined}concat=n=${inputs.length}:v=1:a=${audio?1:0}[v]${audio?'[a]':''}`,'-map','[v]',...(audio?['-map','[a]']:[]),...encode,'output:0'];
    }
    default: return request.args||[];
  }
}
const widthParity=n=>n%2;

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
        const bytes=await readFile(file);if(createHash('sha256').update(bytes).digest('hex')!==input.sha256)throw new Error('MEDIA_INPUT_CHANGED');
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
          const bytes=await readFile(file);collected.push({name,bytes:info.size,sha256:createHash('sha256').update(bytes).digest('hex'),file});
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
