import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,lstat,readdir,link,copyFile,chown,chmod,readFile,rm} from 'node:fs/promises';
import path from 'node:path';

export const MEDIA_LIMITS=Object.freeze({inputBytes:250*1024*1024,outputBytes:500*1024*1024,outputs:1000,timeoutMs:180000,concurrency:2,logBytes:1024*1024});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const namePattern=/^[a-zA-Z0-9_%.-]+(?:\/[a-zA-Z0-9_%.-]+)*$/;
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
function replaceVirtual(value,inputs,outputs){
  return value.replace(/\b(asset|output):(\d+)/g,(_match,type,index)=>{
    const item=(type==='asset'?inputs:outputs)[Number(index)];
    if(!item)throw new Error('UNKNOWN_VIRTUAL_MEDIA_PATH');return item;
  });
}
/** Native expressions remain available inside the chroot; explicit file arguments
 * must name owned virtual inputs or job outputs. Network syscalls are denied too. */
export function nativeMediaArgs(args,inputs,outputs,binary){
  if(!Array.isArray(args)||args.length>512||args.some(v=>typeof v!=='string'||v.length>16384||v.includes('\0')))throw new Error('INVALID_MEDIA_ARGS');
  const forbidden=new Set(['-protocol_whitelist','-protocol_blacklist','-progress','-report','-stdin','-y','-n']);
  const fileOptions=new Set(['-i','-filter_script','-filter_complex_script','-vstats_file','-passlogfile','-attach','-dump_attachment','-segment_list','-hls_segment_filename','-hls_key_info_file','-init_seg_name','-media_seg_name']);
  const result=[];let inputFormat=null;
  for(let i=0;i<args.length;i++){
    const value=args[i];if(forbidden.has(value)||/^-dump_attachment(?::|$)/.test(value))throw new Error('CONTROLLED_MEDIA_OPTION');
    if(args[i-1]!=='-metadata'&&/(?:^|[=,:"'])\/(?:[A-Za-z_.])|[A-Za-z]:[\\/]|\.\.[\\/]/.test(value))throw new Error('MEDIA_EMBEDDED_PATH_FORBIDDEN');
    if(/^(?:https?|tcp|udp|rtmp|rtsp|srt|ftp|crypto|subfile|concat|file|pipe|unix):/i.test(value))throw new Error('MEDIA_PROTOCOL_FORBIDDEN');
    if(value==='-f'){inputFormat=args[i+1];}
    if(value==='-i'||fileOptions.has(value)){
      const next=args[++i];if(!next||(!(/^(?:asset|output):\d+(?:\/[\w%.-]+)*$/.test(next))&&!(value==='-i'&&inputFormat==='lavfi')))throw new Error('VIRTUAL_MEDIA_PATH_REQUIRED');
      inputFormat=null;
      result.push(value,replaceVirtual(next,inputs,outputs));continue;
    }
    if((value.startsWith('/')||/^[a-z]:[\\/]/i.test(value)||value.includes('../')||value.includes('..\\'))&&!value.includes('asset:')&&!value.includes('output:'))throw new Error('MEDIA_PATH_FORBIDDEN');
    if(/^(asset|output):/.test(value)&&!/^((asset|output):\d+)(?:\/[\w%.-]+)*$/.test(value))throw new Error('INVALID_VIRTUAL_MEDIA_PATH');
    result.push(replaceVirtual(value,inputs,outputs));
  }
  const restricted=['-protocol_whitelist','file,pipe'];
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
      if(!Array.isArray(request.inputs)||request.inputs.length>32||!Array.isArray(request.outputs)||request.outputs.length>32)throw new Error('INVALID_MEDIA_MANIFEST');
      let totalInput=0;const inputs=[];
      for(let i=0;i<request.inputs.length;i++){
        const input=request.inputs[i];safeMediaName(input.name);
        if(input.name.includes('/'))throw new Error('INPUT_MUST_BE_FLAT');
        const file=path.join(shared,'inputs',input.name),info=await lstat(file);
        if(!info.isFile()||info.isSymbolicLink()||info.size!==input.bytes||!Number.isSafeInteger(input.bytes)||input.bytes<1)throw new Error('MEDIA_INPUT_CHANGED');
        totalInput+=info.size;if(totalInput>MEDIA_LIMITS.inputBytes)throw new Error('MEDIA_INPUT_TOO_LARGE');
        const bytes=await readFile(file);if(createHash('sha256').update(bytes).digest('hex')!==input.sha256)throw new Error('MEDIA_INPUT_CHANGED');
        const copy=path.join(source,input.name);await copyFile(file,copy);await chmod(copy,0o444);
        inputs.push(this.fixture?copy:`/inputs/${input.name}`);
      }
      const outputs=[];
      for(const name of request.outputs){safeMediaName(name);const file=path.join(out,name);await mkdir(path.dirname(file),{recursive:true,mode:0o700});
        if(!this.fixture)await chown(path.dirname(file),uid,uid);outputs.push(this.fixture?file:`/work/out/${name}`);}
      const execute=async(binary,args,progress=false)=>{
        if(control.cancelled)throw new Error('MEDIA_JOB_CANCELLED');
        const argv=nativeMediaArgs(args,inputs,outputs,binary);
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
      const binary=request.action==='ffprobe'?'ffprobe':'ffmpeg';
      const args=presetMediaCommand(request,inputs,outputs,probes);
      const query=request.action==='ffprobe'||!outputs.length;
      const stdout=await execute(binary,args.length?args:['-v','error','-show_streams','-show_format','-of','json','asset:0'],!query);
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
      // Probe each actual media file before exporting it. Playlists are data, never probe URLs.
      const outputMetadata=[];
      for(const item of collected){
        const probeFile=this.fixture?item.file:`/work/out/${item.name}`;
        let probe=null;if(!/\.(m3u8|mpd|txt|json)$/i.test(item.name)){
          const original=inputs.length;inputs.push(probeFile);
          try{probe=parseProbe(await execute('ffprobe',['-v','error','-show_streams','-show_format','-of','json',`asset:${original}`]));}
          finally{inputs.pop();}
          if(!probe.videoCodec&&!probe.audioCodecs.length)throw new Error('MEDIA_OUTPUT_STREAM_MISSING');
        }
        const dest=path.join(shared,'results',item.name);await mkdir(path.dirname(dest),{recursive:true,mode:0o700});await copyFile(item.file,dest);
        if(!this.fixture){
          let directory=path.dirname(dest);const boundary=path.join(shared,'results');
          for(;;){await chown(directory,1001,1001);if(directory===boundary)break;directory=path.dirname(directory);}
          await chown(dest,1001,1001);
        }await chmod(dest,0o600);
        outputMetadata.push({name:item.name,bytes:item.bytes,sha256:item.sha256,probe});
      }
      if(!this.fixture)await chown(path.join(shared,'results'),1001,1001).catch(()=>{});
      if(control.cancelled)throw new Error('MEDIA_JOB_CANCELLED');
      return {outputs:outputMetadata,probes,stdout:stdout.slice(0,MEDIA_LIMITS.logBytes)};
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);cancel();this.active.delete(id);await rm(sandbox,{recursive:true,force:true});}
  }
}
