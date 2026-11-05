/** Full-source pure contract differential and actual import/bundle boundaries.
 * No native processing, PG, sockets or real suppliers are claimed here. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),{build}=require('esbuild');
const arg=name=>{const n=process.argv.indexOf(name);return n<0?undefined:process.argv[n+1];};
const workspace=path.resolve(fileURLToPath(new URL('..',import.meta.url))),root=path.resolve(arg('--source-root')||workspace),mode=arg('--mode')||'modified',out=path.resolve(arg('--evidence')||'output/refactor-r5f-20261026');
assert.ok(['baseline','modified','rollback'].includes(mode));fs.mkdirSync(out,{recursive:true});
const modern=fs.existsSync(path.join(root,'services/media-worker/engine.mjs')),contract=await import(pathToFileURL(path.join(root,modern?'src/modules/media/contract.mjs':'scripts/video-fusion/media-engine.mjs')).href),bundle=await import(pathToFileURL(path.join(root,modern?'src/modules/media/bundle.mjs':'scripts/video-fusion/media-bundle.mjs')).href);
const legacy=await import(pathToFileURL(path.join(root,'scripts/video-fusion/media-engine.mjs')).href),engine=modern?await import(pathToFileURL(path.join(root,'services/media-worker/engine.mjs')).href):legacy;
let checks=0;const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
for(const name of ['MEDIA_LIMITS','safeMediaName','mediaJobDirectory','parseProbe','replaceVirtual','validateMediaAuxiliaryText','nativeMediaArgs','presetMediaCommand'])eq(legacy[name],contract[name],name+' original compatibility identity');eq(legacy.MediaEngine,engine.MediaEngine,'same engine class');
const rows=[],capture=(name,fn)=>{try{rows.push({name,value:fn()??null});}catch(e){rows.push({name,error:e.message});}};
for(const name of ['input-0.mp4','frames/frame-%02d.png','bundle-0/movie.m3u8','../secret','a/../b','/absolute','C:\\private','a//b','','x'.repeat(161),'ok.$_%'])capture('name/'+name,()=>contract.safeMediaName(name));
for(const id of ['12345678-1234-1234-1234-123456789abc','not-a-uuid','../a','a'.repeat(36)])capture('job/'+id,()=>contract.mediaJobDirectory('/fixture',id));
for(const value of [{streams:[{codec_type:'video',codec_name:'h264',width:1280,height:720,avg_frame_rate:'30000/1001',duration:'4'},{codec_type:'audio',codec_name:'aac',duration:'4.02'}],format:{duration:'4',format_name:'mov,mp4'}},{streams:[{codec_type:'video',codec_name:'png',disposition:{attached_pic:1}},{codec_type:'audio',codec_name:'pcm_s16le'}]},null,'{invalid',{}, {streams:[],format:{duration:'NaN'}}])capture('probe/'+JSON.stringify(value),()=>contract.parseProbe(value));
const inputs=['/inputs/input-0.mp4','/inputs/input-1.mp4'],outputs=['/work/out/result.mp4','/work/out/frame.png'],aux=['/inputs/aux-0.txt'];
for(const args of [['-i','asset:0','-c','copy','output:0'],['-filter_complex','[0:v]scale=160:90[v]','-map','[v]','output:0'],['-i','assets:png','output:0'],['-f','lavfi','-i','color=c=red:s=32x32','output:0'],['-filter_script','aux:0','output:0'],['-i','http://127.0.0.1/private','output:0'],['-i','/etc/passwd'],['-report'],['-protocol_whitelist','http'],['-metadata','title=/text','output:0'],['-i','asset:99','output:0'],['-media_seg_name','../bad']])for(const binary of ['ffmpeg','ffprobe'])capture('args/'+binary+'/'+JSON.stringify(args),()=>contract.nativeMediaArgs(args,inputs,outputs,binary,aux));
for(const text of ['drawbox=x=0:y=0:w=8:h=8','movie=asset:0','file:///etc/passwd','/etc/passwd','../bad','https://fixture.test/x','\0'])capture('aux/'+text,()=>contract.validateMediaAuxiliaryText(text));
const probe={durationSeconds:4,width:1280,height:720,videoCodec:'h264',audioCodecs:['aac'],frameRate:25};
for(const action of ['frame','trim','concat','separate','extract_audio','ffmpeg','ffprobe'])for(const timestamp of ['first','last',1.25,4,-1])capture('preset/'+action+'/'+timestamp,()=>contract.presetMediaCommand({action,timestamp,start:1,end:3,args:['-version']},inputs,outputs,[probe,probe]));
const cases=[['hls/index.m3u8','#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:1,\nseg0.ts\n',['hls/index.m3u8','hls/key.bin','hls/seg0.ts']],['manifest.mpd','<MPD><Period><AdaptationSet><Representation id="0"><SegmentTemplate initialization="init-$RepresentationID$.m4s" media="seg-$Number%05d$.m4s"/></Representation></AdaptationSet></Period></MPD>',['manifest.mpd','init-0.m4s','seg-00001.m4s']],['a.m3u8','#EXTM3U\nhttps://fixture.test/private\n',['a.m3u8']],['a.m3u8','#EXTM3U\n../secret\n',['a.m3u8']],['a.mpd','<!DOCTYPE MPD SYSTEM "file:///etc/passwd"><MPD/>',['a.mpd']],['a.mpd','<MPD><Period><BaseURL>missing/</BaseURL></Period></MPD>',['a.mpd']],['a.m3u8','#EXTM3U\nmissing.ts\n',['a.m3u8']]];
for(const [name,text,files] of cases)capture('bundle/'+name+'/'+text,()=>bundle.inspectMediaBundle(name,text,files));
capture('limits',()=>contract.MEDIA_LIMITS);
if(modern){
 for(const file of ['docker-compose.yml','deploy/staging/docker-compose.yml']){assert.match(fs.readFileSync(path.join(root,file),'utf8'),/cap_add: \[SYS_CHROOT, SETUID, SETGID, CHOWN, DAC_OVERRIDE, FOWNER, KILL\]/);checks++;}
 assert.match(fs.readFileSync(path.join(root,'scripts/ops/release_video_media.py'),'utf8'),/CAPS = .*'KILL'/);checks++;
 const staging=fs.readFileSync(path.join(root,'scripts/staging/prepare-media-worker.sh'),'utf8');assert.ok(staging.includes('--cap-add KILL'));checks++;assert.ok(staging.includes('"FOWNER","KILL"'));checks++;
}
const snapshot={rows};const saved=path.join(out,'BASELINE_VALUES.json');if(mode==='baseline')fs.writeFileSync(saved,JSON.stringify(snapshot,null,2)+'\n');else eq(snapshot,JSON.parse(fs.readFileSync(saved,'utf8')),'all original values/errors');
const leaf=await build({stdin:{contents:`export {nativeMediaArgs,validateMediaAuxiliaryText,safeMediaName} from ${JSON.stringify('./'+(modern?'src/modules/media/contract.mjs':'scripts/video-fusion/media-engine.mjs'))}`,resolveDir:root,loader:'js'},absWorkingDir:root,write:false,bundle:true,metafile:true,platform:'node',format:'esm'});
const sourceFiles=Object.keys(leaf.metafile.inputs),emitted=leaf.outputFiles[0].text;const imports=Object.values(leaf.metafile.outputs).flatMap(x=>x.imports).filter(x=>x.external).map(x=>x.path).sort();if(modern){eq(sourceFiles.length,2,'stdin + single pure owner');eq(imports,['node:path'],'no filesystem or child_process');assert.ok(!emitted.includes('MediaEngine'));checks++;}
fs.writeFileSync(path.join(out,mode.toUpperCase()+'_CONTRACT.json'),JSON.stringify({status:'PASS',mode,root,modern,checks,cases:rows.length,sourceFiles,externalImports:imports,bundleBytes:leaf.outputFiles[0].contents.length,baselineSnapshotSha256:createHash('sha256').update(fs.readFileSync(saved)).digest('hex'),nativeProcessing:false},null,2)+'\n');
console.log(`MEDIA_RUNTIME_BOUNDARY=PASS mode=${mode} cases=${rows.length} checks=${checks} DIFFERENTIAL=${mode==='baseline'?'CAPTURED':'EXACT'} LEAF_INPUTS=${sourceFiles.length} CHILD_PROCESS_IMPORT=${imports.includes('node:child_process')?1:0} FS_IMPORT=${imports.some(x=>x.startsWith('node:fs'))?1:0} NATIVE=0 HTTP=0 PG=0`);
