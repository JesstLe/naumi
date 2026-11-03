import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

// Real local FFmpeg/FFprobe and the complete MediaEngine. No supplier or DB.
const root=process.cwd(),baseline=process.argv.includes('--baseline');
const out=path.resolve(process.env.STORYBOARD_AUDIO_OUT||'E:/Workspace/naumi/output/storyboard-flow-20261102/audio');
const mode=baseline?'baseline':'modified',dir=path.join(out,mode),assets=path.join(out,'assets');
await mkdir(dir,{recursive:true});await mkdir(assets,{recursive:true});
const commands=[],checks=[],measurements=[];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function command(binary,args){
 const result=spawnSync(binary,args,{windowsHide:true,maxBuffer:16*1024*1024,timeout:60000});
 commands.push({binary,args,exit:result.status});
 assert.equal(result.status,0,result.error?.message||result.stderr?.toString());return result.stdout;
}
async function sourceModule(){
 if(process.env.STORYBOARD_AUDIO_ENGINE)return path.resolve(process.env.STORYBOARD_AUDIO_ENGINE);
 if(!baseline)return path.join(root,'scripts/video-fusion/media-engine.mjs');
 const target=path.join(dir,'source');await mkdir(target,{recursive:true});
 for(const file of ['media-engine.mjs','media-bundle.mjs']){
  const bytes=command('git',['show',`2e795097:scripts/video-fusion/${file}`]);await writeFile(path.join(target,file),bytes);
 }
 return path.join(target,'media-engine.mjs');
}
const source=await sourceModule();
const {MediaEngine,mediaJobDirectory,parseProbe,presetMediaCommand,nativeMediaArgs}=await import(pathToFileURL(source).href);
process.env.MEDIA_WORKER_FIXTURE_OWNER='canvas-video-fusion-20261013';
assert.notEqual(process.env.NODE_ENV,'production');
const engine=new MediaEngine({sharedRoot:path.join(dir,'jobs'),fixture:true});
function probe(file){return JSON.parse(command('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file]).toString())}
async function sample(name,{duration=1.2,audioDuration=duration,frequency=440,color='red',channels='mono',size='320x180',audio=true}={}){
 const file=path.join(assets,name),args=['-hide_banner','-nostdin','-loglevel','error','-y','-f','lavfi','-i',`color=c=${color}:s=${size}:r=25:d=${duration}`];
 if(audio){
  const input=channels==='5.1'?`aevalsrc=0.05*sin(2*PI*${frequency}*t)|0.04*sin(2*PI*${frequency}*t)|0.03*sin(2*PI*${frequency}*t)|0|0.02*sin(2*PI*${frequency}*t)|0.02*sin(2*PI*${frequency}*t):s=48000:d=${audioDuration}:c=5.1`:`sine=frequency=${frequency}:sample_rate=48000:duration=${audioDuration}`;
  args.push('-f','lavfi','-i',input,'-map','0:v:0','-map','1:a:0','-c:a','aac',...(channels==='stereo'?['-ac','2']:[]));
 }else args.push('-an');
 args.push('-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-threads','2','-movflags','+faststart',file);
 command('ffmpeg',args);return {file,raw:probe(file)};
}
const a=await sample('a-tone440.mp4',{duration:1.2,frequency:440});
const mute=await sample('b-silent.mp4',{duration:1.4,audio:false,color:'green',size:'240x320'});
const c=await sample('c-tone880.mp4',{duration:1.6,frequency:880,color:'blue',channels:'stereo'});
const short=await sample('short-audio.mp4',{duration:2,audioDuration:.6,frequency:440,color:'yellow'});
const long=await sample('long-audio.mp4',{duration:1.5,audioDuration:2.5,frequency:660,color:'purple',channels:'stereo'});
const surround=await sample('surround.mp4',{duration:1.2,frequency:660,color:'orange',channels:'5.1'});
const originalHashes=new Map(await Promise.all([a,mute,c,short,long,surround].map(async item=>[item.file,sha(await readFile(item.file))])));
function near(actual,expected,label,tolerance=.055){assert.ok(Math.abs(actual-expected)<=tolerance,`${label}: ${actual} vs ${expected}`);checks.push(label)}
async function concat(label,items){
 const id=randomUUID(),job=mediaJobDirectory(engine.sharedRoot,id),inputDir=path.join(job,'inputs');await mkdir(inputDir,{recursive:true});
 const inputs=[];
 for(const [index,item] of items.entries()){
  const name=`input-${index}.mp4`,bytes=await readFile(item.file);await copyFile(item.file,path.join(inputDir,name));inputs.push({name,bytes:bytes.length,sha256:sha(bytes)});
 }
 const result=await engine.run(id,{action:'concat',inputs,outputs:[label+'.mp4']});
 assert.equal(result.outputs.length,1);const file=path.join(job,'results',result.outputs[0].name),raw=probe(file);
 assert.equal(sha(await readFile(file)),result.outputs[0].sha256);assert.equal(engine.active.size,0);
 const value={label,file,result,raw};measurements.push(value);return value;
}
function decodeAudio(file){
 const bytes=command('ffmpeg',['-hide_banner','-nostdin','-loglevel','error','-i',file,'-map','0:a:0','-ac','2','-ar','48000','-f','f32le','pipe:1']);
 const values=new Float32Array(bytes.length/4);for(let i=0;i<values.length;i++)values[i]=bytes.readFloatLE(i*4);return values;
}
function windowMetrics(pcm,start,end,frequency){
 const begin=Math.floor(start*48000),finish=Math.min(Math.floor(end*48000),pcm.length/2);let energy=0,real=0,imag=0;
 for(let i=begin;i<finish;i++){const value=(pcm[i*2]+pcm[i*2+1])/2,phase=2*Math.PI*frequency*i/48000;energy+=value*value;real+=value*Math.cos(phase);imag+=value*Math.sin(phase)}
 const count=finish-begin;assert.ok(count>1000);return {rms:Math.sqrt(energy/count),amplitude:2*Math.hypot(real,imag)/count};
}
function tone(pcm,start,end,frequency,label){const actual=windowMetrics(pcm,start,end,frequency),wrong=windowMetrics(pcm,start,end,frequency===440?880:440);assert.ok(actual.rms>.012,`${label}: low energy ${actual.rms}`);assert.ok(actual.amplitude>wrong.amplitude*8&&actual.amplitude>.02,`${label}: wrong frequency ${JSON.stringify({actual,wrong})}`);checks.push(label);return actual}
function silence(pcm,start,end,label){const actual=windowMetrics(pcm,start,end,440);assert.ok(actual.rms<.001,`${label}: not silent ${actual.rms}`);checks.push(label);return actual}
try{
 const mixed=await concat('mixed',[a,mute,c]),mixedAudio=mixed.raw.streams.filter(stream=>stream.codec_type==='audio');
 const lengths=await concat('lengths',[short,long,c]);
 if(baseline){
  assert.equal(mixedAudio.length,0);checks.push('mixed voiced and silent inputs lose every audio stream');
  assert.ok(Number(lengths.raw.format.duration)>2+1.5+1.6+.5);checks.push('long audio extends concat beyond video timeline');
  console.log(`STORYBOARD_AUDIO=REPRODUCED CHECKS=${checks.length} MIXED_AUDIO_STREAMS=0 VIDEO_TIMELINE_EXTENDED=1 REAL_FFMPEG=1 SUPPLIER_CALLS=0`);
 }else{
  assert.equal(mixedAudio.length,1);assert.equal(mixedAudio[0].channels,2);checks.push('mixed inputs yield one stereo audio stream');
  near(Number(mixed.raw.format.duration),4.2,'mixed output duration follows all video segments');near(Number(mixedAudio[0].duration),4.2,'mixed audio duration follows video');
  const pcm=decodeAudio(mixed.file);mixed.audioWindows={first:tone(pcm,.2,.9,440,'first voiced segment retained'),middle:silence(pcm,1.5,2.3,'silent middle receives matching silence'),last:tone(pcm,2.9,3.9,880,'last voiced segment retained at original timeline')};
  const video=mixed.raw.streams.find(stream=>stream.codec_type==='video');assert.deepEqual([video.width,video.height,video.avg_frame_rate],[320,180,'25/1']);checks.push('existing dimensions letterbox and25fps retained');
  near(Number(lengths.raw.format.duration),5.1,'short and long audio do not change video timeline');
  const lengthPcm=decodeAudio(lengths.file);lengths.audioWindows={short:tone(lengthPcm,.15,.4,440,'short original audio retained'),pad:silence(lengthPcm,.9,1.7,'short audio padded within its video'),long:tone(lengthPcm,2.2,3.2,660,'long audio retained inside its video'),next:tone(lengthPcm,3.8,4.8,880,'next shot begins on video boundary')};
  const downmixed=await concat('surround',[surround,a]);near(Number(downmixed.raw.format.duration),2.4,'surround timeline length');assert.equal(downmixed.raw.streams.find(stream=>stream.codec_type==='audio').channels,2);checks.push('surround audio downmixed to stereo');const surroundPcm=decodeAudio(downmixed.file);tone(surroundPcm,.2,.9,660,'surround source sound preserved');tone(surroundPcm,1.4,2.1,440,'mono source follows surround');
  const silent=await concat('all-silent',[mute,mute]);assert.equal(silent.raw.streams.filter(stream=>stream.codec_type==='audio').length,0);checks.push('all-silent inputs remain audio-free');near(Number(silent.raw.format.duration),2.8,'all-silent duration');
  near(parseProbe(long.raw).videoDurationSeconds,1.5,'probe distinguishes actual video and long audio');
  assert.ok(parseProbe(long.raw).durationSeconds>2.4);checks.push('existing total-media duration semantics retained');
  const matroska={file:path.join(assets,'long-audio.mkv')};command('ffmpeg',['-hide_banner','-nostdin','-loglevel','error','-y','-i',long.file,'-c','copy',matroska.file]);matroska.raw=probe(matroska.file);
  near(parseProbe(matroska.raw).videoDurationSeconds,1.5,'Matroska stream duration tags are used instead of long audio container duration');
  const mkv=await concat('matroska',[matroska,a]);near(Number(mkv.raw.format.duration),2.7,'Matroska video boundary survives audio tail');const mkvPcm=decodeAudio(mkv.file);tone(mkvPcm,.2,1,660,'Matroska original audio preserved');tone(mkvPcm,1.8,2.4,440,'next shot begins after Matroska video not audio tail');
  const probes=[parseProbe(a.raw),parseProbe(c.raw)];for(const durationSeconds of [0,NaN,Infinity])assert.throws(()=>presetMediaCommand({action:'concat'},['a','b'],['o'],[{...probes[0],videoDurationSeconds:durationSeconds},probes[1]]),/CONCAT_VIDEO_DURATION_REQUIRED/);checks.push('invalid duration rejected before processing');
  const virtual=presetMediaCommand({action:'concat'},['a','b'],['o'],probes);assert.doesNotThrow(()=>nativeMediaArgs(virtual,['/inputs/a.mp4','/inputs/b.mp4'],['/work/out/a.mp4'],'ffmpeg'));assert.throws(()=>nativeMediaArgs(['-i','https://invalid.test/a.mp4'],[],[],'ffmpeg'),/VIRTUAL_MEDIA_PATH_REQUIRED/);checks.push('virtual paths and network rejection retained');
  for(const [file,hash] of originalHashes)assert.equal(sha(await readFile(file)),hash);checks.push('all original source media hashes unchanged');
  console.log(`STORYBOARD_AUDIO=PASS CHECKS=${checks.length} MIXED_AUDIO=RETAINED SILENCE=PADDED LONG_AUDIO=TRIMMED SURROUND=STEREO ORIGINALS=UNCHANGED REAL_FFMPEG=1 SUPPLIER_CALLS=0`);
 }
}finally{
 await writeFile(path.join(dir,'RESULT.json'),JSON.stringify({mode,source,sourceSha256:sha(await readFile(source)),checks,measurements,commands,actualFfmpeg:true,actualMediaEngine:true,productionCalls:0},null,2)+'\n');
}
