/** Codec defaults are per file. Pure contract checks; native Linux acceptance
 * remains in verify-refactor-runtime.py against the complete fixed image. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const arg=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const root=path.resolve(arg('--source-root')||'.'),baseline=arg('--mode')==='baseline';
const {nativeMediaArgs}=await import(pathToFileURL(path.join(root,'src/modules/media/contract.mjs')).href);
const inputs=['/inputs/red.mp4','/inputs/blue.mp4','/inputs/music.wav','/inputs/green.png'];
const outputs=['/work/out/timeline.mp4','/work/out/frame.png'];
let checks=0;const eq=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;};
const compile=args=>nativeMediaArgs(args,inputs,outputs,'ffmpeg',['/inputs/filter.txt']);
const sections=argv=>{
 const result=[];let start=0;
 for(let i=0;i<argv.length;i++){
  if(argv[i]==='-i'){result.push({kind:'input',file:argv[i+1],options:argv.slice(start,i)});start=++i+1;}
  else if(['-filter_script','-filter_complex_script','-segment_list'].includes(argv[i]))i++;
  else if(outputs.includes(argv[i])||argv[i]==='-'){result.push({kind:'output',file:argv[i],options:argv.slice(start,i)});start=i+1;}
 }
 return result;
};
const effective=(section,stream='v')=>{
 let value=null;for(let i=0;i<section.options.length-1;i++)if(section.options[i]==='-threads'||section.options[i]==='-threads:'+stream||section.options[i]==='-threads:'+stream+':0')value=section.options[i+1];return value;
};

const multitrack=['-i','asset:0','-i','asset:1','-i','asset:2','-loop','1','-framerate','30','-i','asset:3','-filter_complex','[0:v]scale=320:180[v]','-map','[v]','-c:v','libx264','output:0'];
const files=sections(compile(multitrack));
eq(files.map(x=>x.kind),['input','input','input','input','output'],'four input files and one output');
eq(files.map(x=>effective(x)),baseline?['2',null,null,null,null]:['2','2','2','2','2'],'defaults cover actual codec file scopes');
eq(files.map(x=>x.file),[...inputs,outputs[0]],'virtual input/output identities unchanged');

if(!baseline){
 const explicit=sections(compile(['-threads','1','-i','asset:0','-threads:v','3','-i','asset:1','-threads:v:0','1','-map','0:v','output:0','-map','1:v','output:1']));
 eq(explicit.map(x=>effective(x)),['1','3','1','2'],'explicit generic and stream options retain precedence; next file resets');
 eq(explicit.map(x=>x.options.filter(v=>v==='-threads').length),[2,1,1,1],'one repeated runtime default before explicit file options');
 eq(sections(compile(['-threads:a','1','-i','asset:0','-threads:a','1','output:0'])).map(x=>[effective(x,'v'),effective(x,'a')]),[['2','1'],['2','1']],'audio override does not leave video on automatic threads');
 eq(sections(compile(['-threads','4','-i','asset:0','-threads','4','output:0'])).map(x=>effective(x)),['4','4'],'no newly imposed cap on explicit recipe values');
 eq(sections(compile(['-f','lavfi','-i','color=c=red:s=32x32','output:0'])).map(x=>effective(x)),['2','2'],'lavfi input and encoder defaults');
 eq(sections(compile(['-i','asset:0','-f','null','-'])).map(x=>effective(x)),['2','2'],'decode verification/null output defaults');
 eq(sections(compile(['-filter_complex','color=c=black:s=32x32[v]','-map','[v]','output:0'])).map(x=>effective(x)),['2'],'generated/no-input encoder defaults');
 eq(sections(compile(['-i','asset:0','-filter_script','aux:0','-segment_list','output:1','output:0'])).map(x=>x.kind),['input','output'],'auxiliary file options are not codec boundaries');
 eq(compile(multitrack).filter(v=>v==='-filter_threads').length,1,'existing simple filter scheduling retained');
 eq(compile(multitrack).filter(v=>v==='-filter_complex_threads').length,1,'existing complex filter scheduling retained');
 const query=nativeMediaArgs(['-v','error','-show_streams','-of','json','asset:0'],inputs,outputs,'ffprobe');
 eq(query,['-protocol_whitelist','file,pipe','-v','error','-show_streams','-of','json',inputs[0]],'ffprobe bytes unchanged');
 eq(compile(['-version']),['-hide_banner','-nostdin','-y','-protocol_whitelist','file,pipe','-filter_threads','2','-filter_complex_threads','2','-version'],'no phantom codec file for process-only command');
 for(const [args,error] of [[['-i','http://invalid.test/x'],'VIRTUAL_MEDIA_PATH_REQUIRED'],[['-i','/etc/passwd'],'VIRTUAL_MEDIA_PATH_REQUIRED'],[['-report'],'CONTROLLED_MEDIA_OPTION']]){
  assert.throws(()=>compile(args),e=>e.message===error);checks++;
 }
}

const result={status:'PASS',mode:baseline?'BASELINE':'MODIFIED',checks,baselineReproducesMissingPerFileDefaults:baseline,defaultThreads:2,explicitThreadOptionsPreserved:true,sandboxChanged:false,nativeExecution:false,network:false,files:files.map(x=>({kind:x.kind,file:x.file,videoThreads:effective(x)}))};
if(arg('--out')){const out=path.resolve(arg('--out'));fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n');}
console.log(`MEDIA_CODEC_THREADS=PASS MODE=${result.mode} CHECKS=${checks} DEFAULT=2 FILE_SCOPE=${baseline?'FIRST_INPUT_ONLY':'ALL_INPUTS_AND_OUTPUTS'} EXPLICIT_OPTIONS=PRESERVED SANDBOX=UNCHANGED NATIVE=0 NETWORK=0`);
