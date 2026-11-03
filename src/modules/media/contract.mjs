/** Pure media execution contract. No child process, runtime or filesystem I/O. */
import path from 'node:path';

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
  const timeBase=String(video?.time_base||'0/1').split('/').map(Number),clock=String(video?.tags?.DURATION||video?.tags?.duration||'').match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  // Container duration may include an audio tail beyond the final video frame.
  // Keep its existing meaning while exposing a separately verified video length.
  const videoDurations=[Number(video?.duration),Number(video?.duration_ts)*timeBase[0]/timeBase[1],clock?Number(clock[1])*3600+Number(clock[2])*60+Number(clock[3]):0,Number(video?.nb_frames)*rate[1]/rate[0]];
  const videoDurationSeconds=videoDurations.find(n=>Number.isFinite(n)&&n>0)??null;
  return {durationSeconds:durations.length?Math.max(...durations):0,videoDurationSeconds,width:Number(video?.width)||0,height:Number(video?.height)||0,
    videoCodec:video?.codec_name||null,audioCodecs:audios.map(item=>item.codec_name||'unknown'),formatName:String(value.format?.format_name||''),
    frameRate:rate[1]&&rate[0]>0?rate[0]/rate[1]:null};
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

export function validateMediaAuxiliaryText(value){
  if(typeof value!=='string'||value.includes('\0')||/(?:^|[\s=,:"'])\/(?:[A-Za-z_.])|[A-Za-z]:[\\/]|\.\.[\\/]|(?:https?|tcp|udp|rtmp|rtsp|srt|ftp|unix|file|crypto):/im.test(value))throw new Error('AUXILIARY_MEDIA_PATH_FORBIDDEN');
}

export function nativeMediaArgs(args,inputs,outputs,binary,auxiliary=[],localProtocols='file,pipe'){
  if(!Array.isArray(args)||args.length>512||args.some(v=>typeof v!=='string'||v.length>16384||v.includes('\0')))throw new Error('INVALID_MEDIA_ARGS');
  const forbidden=new Set(['-protocol_whitelist','-protocol_blacklist','-progress','-report','-stdin','-y','-n']);
  const fileOptions=new Set(['-i','-filter_script','-filter_complex_script','-vstats_file','-passlogfile','-attach','-dump_attachment','-segment_list','-hls_segment_filename','-hls_key_info_file']);
  const result=[];let inputFormat=null,codecFileStart=0;
  // Codec options belong to the next input/output file, not to the process.
  // Repeat the existing default per file, before explicit codec options so
  // request-specific values and stream specifiers retain their precedence.
  const codecFile=()=>{if(binary==='ffmpeg')result.splice(codecFileStart,0,'-threads','2');codecFileStart=result.length;};
  for(let i=0;i<args.length;i++){
    const value=args[i];if(forbidden.has(value)||/^-dump_attachment(?::|$)/.test(value))throw new Error('CONTROLLED_MEDIA_OPTION');
    if(args[i-1]!=='-metadata'&&/(?:^|[=,:"'])\/(?:[A-Za-z_.])|[A-Za-z]:[\\/]|\.\.[\\/]/.test(value))throw new Error('MEDIA_EMBEDDED_PATH_FORBIDDEN');
    if(/^(?:https?|tcp|udp|rtmp|rtsp|srt|ftp|crypto|subfile|concat|file|pipe|unix):/i.test(value))throw new Error('MEDIA_PROTOCOL_FORBIDDEN');
    if(value==='-f'){inputFormat=args[i+1];}
    if(value==='-i'||fileOptions.has(value)){
      const next=args[++i];if(!next||(!(/^(?:asset|output|aux):\d+(?:\/[\w%.$-]+)*$|^assets:[a-z0-9]{1,8}$/.test(next))&&!(value==='-i'&&inputFormat==='lavfi')))throw new Error('VIRTUAL_MEDIA_PATH_REQUIRED');
      inputFormat=null;
      result.push(value,replaceVirtual(next,inputs,outputs,auxiliary));if(value==='-i')codecFile();continue;
    }
    if((value.startsWith('/')||/^[a-z]:[\\/]/i.test(value)||value.includes('../')||value.includes('..\\'))&&!value.includes('asset:')&&!value.includes('output:')&&!value.includes('aux:'))throw new Error('MEDIA_PATH_FORBIDDEN');
    if(/^(asset|output|aux):/.test(value)&&!/^((asset|output|aux):\d+)(?:\/[\w%.$-]+)*$/.test(value))throw new Error('INVALID_VIRTUAL_MEDIA_PATH');
    if((value==='-init_seg_name'||value==='-media_seg_name')&&(!args[i+1]||!/^[\w%.$-]+$/.test(args[i+1])))throw new Error('SEGMENT_NAME_MUST_BE_LOCAL');
    result.push(replaceVirtual(value,inputs,outputs,auxiliary));
    if(/^output:\d+(?:\/[\w%.$-]+)*$/.test(value)||value==='-')codecFile();
  }
  const restricted=['-protocol_whitelist',localProtocols];
  return binary==='ffmpeg'?['-hide_banner','-nostdin','-y',...restricted,'-filter_threads','2','-filter_complex_threads','2',...result]:[...restricted,...result];
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
      // The admission path may hold a legacy cached probe; the Worker always
      // probes owned bytes again and supplies the stream-specific duration.
      const durations=probes.map(p=>p.videoDurationSeconds===undefined?p.durationSeconds:p.videoDurationSeconds);
      if(durations.some(seconds=>!Number.isFinite(seconds)||seconds<=0))throw new Error('CONCAT_VIDEO_DURATION_REQUIRED');
      const audio=probes.some(p=>p.audioCodecs.length>0),width=first.width-widthParity(first.width),height=first.height-widthParity(first.height);
      const chains=probes.map((probe,i)=>{
        const seconds=durations[i],video=`[${i}:v:0]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25,setpts=PTS-STARTPTS[v${i}]`;
        if(!audio)return video;
        // Bound both real and synthetic audio to this video segment. An unbound
        // anullsrc/apad would never end; an overlong source would delay every cut.
        const sound=probe.audioCodecs.length?`[${i}:a:0]asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_rates=48000:channel_layouts=stereo,apad,atrim=duration=${seconds}`:`anullsrc=r=48000:cl=stereo,atrim=duration=${seconds}`;
        return `${video};${sound},asetpts=PTS-STARTPTS[a${i}]`;
      });
      const joined=probes.map((_p,i)=>`[v${i}]${audio?`[a${i}]`:''}`).join('');
      return [...inputs.flatMap((_p,i)=>['-i',`asset:${i}`]),'-filter_complex',`${chains.join(';')};${joined}concat=n=${inputs.length}:v=1:a=${audio?1:0}[v]${audio?'[a]':''}`,'-map','[v]',...(audio?['-map','[a]']:[]),...encode,'output:0'];
    }
    default: return request.args||[];
  }
}

const widthParity=n=>n%2;
