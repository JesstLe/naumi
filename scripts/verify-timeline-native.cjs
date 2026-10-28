const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process'),{pathToFileURL}=require('node:url'),esbuild=require('esbuild');
const mode=process.argv[2]||'MODIFIED',root=path.resolve(process.argv[3]||'.'),out=path.resolve(process.argv[4]||'output/timeline-core');
const model=path.join(root,'src/lib/timeline/project.ts');
const menuSource=esbuild.buildSync({stdin:{contents:"export {canvasNodeMenuItems} from './src/components/canvas/node-menu-items';",loader:'ts',resolveDir:root},bundle:true,write:false,platform:'node',format:'cjs',nodePaths:[path.resolve('node_modules')]});const menuModule={exports:{}};vm.runInThisContext('(function(module,exports,require){'+menuSource.outputFiles[0].text+'\n})')(menuModule,menuModule.exports,require);const menu=menuModule.exports.canvasNodeMenuItems({L:zh=>zh,readOnly:false,videoDisabled:false,onCreate(){}});assert.equal(menu.find(item=>item.id==='multitrack').disabled,true);assert.equal(menu.find(item=>item.id==='audio').disabled,false);
if(mode!=='MODIFIED'){assert.equal(fs.existsSync(model),false);assert.equal(fs.existsSync(path.join(root,'src/lib/timeline/render.ts')),false);console.log(`${mode}_TIMELINE=PASS MODEL=ABSENT MENU=DISABLED EXISTING_AUDIO=PRESERVED EXIT=0`);process.exit(0);}
function load(){const built=esbuild.buildSync({stdin:{contents:"export * from './src/lib/timeline/project';export * from './src/lib/timeline/render';",loader:'ts',resolveDir:root},bundle:true,write:false,platform:'node',format:'cjs',nodePaths:[path.resolve('node_modules')]});const module={exports:{}};vm.runInThisContext('(function(module,exports,require){'+built.outputFiles[0].text+'\n})')(module,module.exports,require);return module.exports;}
const lib=load();let cases=0;const check=fn=>{fn();cases++;},clip=(id,artworkId,position,duration,fields={})=>({id,artworkId,position,inPoint:0,duration,gain:1,fadeIn:0,fadeOut:0,audioEnabled:true,transitionIn:0,...fields});
function run(args,binary='ffmpeg'){const r=spawnSync(binary,args,{windowsHide:true,maxBuffer:32*1024*1024});assert.equal(r.status,0,String(r.stderr));return r.stdout;}
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function main(){
 fs.mkdirSync(out,{recursive:true});const project=lib.newTimelineProject();project.width=320;project.height=180;
 project.tracks[0].clips=[clip('red','red',0,2,{inPoint:.25,gain:.5}),clip('blue','blue',1.5,2,{transitionIn:.5})];
 project.tracks[1].clips=[clip('music','music',.5,2,{gain:.25,fadeIn:.25,fadeOut:.25})];project.tracks.push({id:'overlay',name:'插图',kind:'video',muted:false,gain:1,clips:[clip('green','green',2.5,.5)]});
 const sources=[{artworkId:'red',kind:'video',durationSeconds:3,hasAudio:true},{artworkId:'blue',kind:'video',durationSeconds:3,hasAudio:false},{artworkId:'music',kind:'audio',durationSeconds:3,hasAudio:true},{artworkId:'green',kind:'image',durationSeconds:null,hasAudio:false}],original=JSON.stringify(project),plan=lib.planTimeline(project,sources);
 check(()=>assert.equal(plan.duration,3.5));check(()=>assert.equal(JSON.stringify(project),original));
 check(()=>assert.deepEqual(lib.timelineProjectSchema.parse(project),project));
 for(const invalid of [{width:321},{height:181},{fps:29},{background:'red;evil'},{masterGain:NaN},{version:2}])check(()=>assert.equal(lib.timelineProjectSchema.safeParse({...project,...invalid}).success,false));
 for(const fields of [{position:-1},{duration:0},{gain:5},{inPoint:Infinity},{fadeIn:3},{fadeOut:3},{transitionIn:3}])check(()=>assert.equal(lib.timelineClipSchema.safeParse({...project.tracks[0].clips[0],...fields}).success,false));
 check(()=>assert.throws(()=>lib.planTimeline(lib.newTimelineProject(),[])));
 check(()=>assert.throws(()=>lib.planTimeline(project,sources.slice(1))));
 check(()=>assert.throws(()=>lib.planTimeline(project,[...sources,sources[0]])));
 check(()=>assert.throws(()=>lib.planTimeline(project,sources.map(s=>s.artworkId==='red'?{...s,durationSeconds:1}:s))));
 const change=(track,index,fields)=>{const next=structuredClone(project);Object.assign(next.tracks[track].clips[index],fields);return next;};
 check(()=>assert.throws(()=>lib.planTimeline(change(0,0,{artworkId:'music'}),sources)));
 check(()=>assert.throws(()=>lib.planTimeline(change(1,0,{artworkId:'green'}),sources)));
 check(()=>assert.throws(()=>lib.planTimeline(change(0,1,{transitionIn:0}),sources)));
 check(()=>assert.throws(()=>lib.planTimeline(change(0,1,{transitionIn:.25}),sources)));
 check(()=>assert.throws(()=>lib.planTimeline(change(1,0,{transitionIn:.25}),sources)));
 check(()=>assert.throws(()=>lib.planTimeline(change(2,0,{inPoint:.25}),sources)));
 check(()=>assert.throws(()=>lib.planTimeline(change(1,0,{id:'red'}),sources)));
 const triple=structuredClone(project);triple.tracks[0].clips.push(clip('third','blue',1.75,1,{transitionIn:1.75}));check(()=>assert.throws(()=>lib.planTimeline(triple,sources)));
 const sample=lib.sampleTimeline(plan,1.8);check(()=>assert.deepEqual(sample.video.map(c=>c.id),['red','blue']));check(()=>assert.ok(Math.abs(sample.video[1].opacity-.6)<1e-9));check(()=>assert.ok(Math.abs(sample.audio.find(c=>c.id==='red').gain-.2)<1e-9));
 check(()=>assert.deepEqual(lib.sampleTimeline(plan,-1),{video:[],audio:[]}));check(()=>assert.deepEqual(lib.sampleTimeline(plan,plan.duration),{video:[],audio:[]}));check(()=>assert.equal(lib.sampleTimeline(plan,3).video.length,1));
 const muted=structuredClone(project);muted.tracks.forEach(track=>track.muted=true);check(()=>assert.equal(lib.planTimeline(muted,sources).duration,plan.duration));check(()=>assert.equal(lib.planTimeline(muted,sources).clips.length,0));
 const red=path.join(out,'red.mp4'),blue=path.join(out,'blue.mp4'),music=path.join(out,'music.wav'),green=path.join(out,'green.png');
 run(['-y','-v','error','-f','lavfi','-i','color=c=red:s=320x180:r=30:d=3','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=3','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',red]);
 run(['-y','-v','error','-f','lavfi','-i','color=c=blue:s=320x180:r=30:d=3','-c:v','libx264','-pix_fmt','yuv420p',blue]);
 run(['-y','-v','error','-f','lavfi','-i','sine=frequency=660:sample_rate=48000:duration=3','-c:a','pcm_s16le',music]);
 run(['-y','-v','error','-f','lavfi','-i','color=c=lime:s=160x90','-frames:v','1','-update','1',green]);
 const files={red,blue,music,green},hashes=Object.fromEntries(Object.entries(files).map(([key,file])=>[key,digest(file)]));
 const recipe=lib.timelineMediaRequest(project,sources,crypto.randomUUID(),'tree:timeline-core');check(()=>assert.equal(recipe.request.action,'ffmpeg'));check(()=>assert.deepEqual(recipe.request.inputs,['red','blue','music','green']));
 const graph=recipe.request.args[recipe.request.args.indexOf('-filter_complex')+1],output=path.join(out,'timeline.mp4');fs.writeFileSync(path.join(out,'timeline.ffscript'),graph);const engine=await import(pathToFileURL(path.join(root,'scripts/video-fusion/media-engine.mjs')).href);
 check(()=>engine.validateMediaAuxiliaryText(graph));
 const argv=engine.nativeMediaArgs(recipe.request.args,recipe.request.inputs.map(id=>files[id]),[output],'ffmpeg');run(['-v','error',...argv]);
 const probe=JSON.parse(run(['-v','error','-show_streams','-show_format','-of','json',output],'ffprobe').toString());check(()=>assert.equal(probe.streams.find(s=>s.codec_type==='video').width,320));check(()=>assert.equal(probe.streams.find(s=>s.codec_type==='video').height,180));check(()=>assert.equal(probe.streams.find(s=>s.codec_type==='audio').sample_rate,'48000'));check(()=>assert.ok(Math.abs(Number(probe.format.duration)-3.5)<.04));
 const pixel=(t,file=output)=>[...run(['-v','error','-ss',String(t),'-i',file,'-frames:v','1','-vf','scale=1:1','-pix_fmt','rgb24','-f','rawvideo','-'])],pixels=Object.fromEntries([.5,1.8,2.25,2.75,3.25].map(t=>[t,pixel(t)]));
 check(()=>assert.ok(pixels[.5][0]>240&&pixels[.5][2]<12));check(()=>assert.ok(pixels[1.8][0]>70&&pixels[1.8][0]<140&&pixels[1.8][2]>120&&pixels[1.8][2]<190));check(()=>assert.ok(pixels[2.25][2]>240&&pixels[2.25][0]<12));check(()=>assert.ok(pixels[2.75][1]>240&&pixels[2.75][0]<12));check(()=>assert.ok(pixels[3.25][2]>240&&pixels[3.25][1]<12));
 const decoded=run(['-v','error','-i',output,'-map','0:a:0','-ac','1','-f','f32le','-']),source440=run(['-v','error','-i',red,'-map','0:a:0','-ac','1','-f','f32le','-']),source660=run(['-v','error','-i',music,'-ac','1','-f','f32le','-']);
 function amplitude(buffer,time,hz){let re=0,im=0;const start=Math.round(time*48000),n=4800;for(let j=0;j<n;j++){const x=buffer.readFloatLE((start+j)*4),phase=2*Math.PI*hz*j/48000;re+=x*Math.cos(phase);im-=x*Math.sin(phase);}return 2*Math.hypot(re,im)/n;}
 const redGain=amplitude(decoded,.8,440)/amplitude(source440,1.05,440),musicGain=amplitude(decoded,.8,660)/amplitude(source660,.3,660);check(()=>assert.ok(Math.abs(redGain-.5)<.04));check(()=>assert.ok(Math.abs(musicGain-.25)<.04));
 check(()=>assert.ok(amplitude(decoded,2.8,440)<.002));check(()=>assert.ok(amplitude(decoded,2.8,660)<.002));
 for(const [key,file] of Object.entries(files))check(()=>assert.equal(digest(file),hashes[key]));
 const allMuted=lib.timelineMediaRequest(muted,sources,crypto.randomUUID(),'tree:timeline-muted');check(()=>assert.equal(allMuted.request.inputs.length,0));check(()=>engine.validateMediaAuxiliaryText(allMuted.request.args[allMuted.request.args.indexOf('-filter_complex')+1]));
 const renderAnother=(project,file)=>{const candidate=lib.timelineMediaRequest(project,sources,crypto.randomUUID(),'tree:timeline-core-extra');run(['-v','error',...engine.nativeMediaArgs(candidate.request.args,candidate.request.inputs.map(id=>files[id]),[file],'ffmpeg')]);return candidate;};
 const mutedOutput=path.join(out,'muted.mp4');renderAnother(muted,mutedOutput);check(()=>assert.ok(pixel(.8,mutedOutput).every(x=>x<5)));const mutedAudio=run(['-v','error','-i',mutedOutput,'-map','0:a:0','-ac','1','-f','f32le','-']);check(()=>assert.ok(amplitude(mutedAudio,.8,440)<1e-7));
 const repeat=lib.newTimelineProject();repeat.width=320;repeat.height=180;repeat.tracks[0].clips=[clip('one','blue',0,.5),clip('two','blue',.5,.5)];repeat.tracks[1].clips=[clip('tone-one','music',0,1),clip('tone-two','music',.25,.5)];
 const repeatOutput=path.join(out,'repeated-source.mp4');renderAnother(repeat,repeatOutput);check(()=>assert.ok(pixel(.8,repeatOutput)[2]>240));const repeatAudio=run(['-v','error','-i',repeatOutput,'-map','0:a:0','-ac','1','-f','f32le','-']),repeatGain=amplitude(repeatAudio,.4,660)/amplitude(source660,.4,660);check(()=>assert.ok(Math.abs(repeatGain-2)<.08));
 const gaps=lib.newTimelineProject();gaps.width=320;gaps.height=180;gaps.tracks[0].clips=[clip('gap-red','red',.5,.5,{audioEnabled:false}),clip('gap-blue','blue',1.5,.5)];const gapOutput=path.join(out,'gaps.mp4');renderAnother(gaps,gapOutput);check(()=>assert.ok(pixel(.2,gapOutput).every(x=>x<5)));check(()=>assert.ok(pixel(1.2,gapOutput).every(x=>x<5)));check(()=>assert.ok(pixel(.8,gapOutput)[0]>240));check(()=>assert.ok(pixel(1.8,gapOutput)[2]>240));
 for(const [key,file] of Object.entries(files))check(()=>assert.equal(digest(file),hashes[key]));
 for(const bad of [{...sources[0],kind:'unknown'},{...sources[0],durationSeconds:null},{...sources[3],hasAudio:true}])check(()=>assert.throws(()=>lib.planTimeline(project,[bad,...sources.filter(x=>x.artworkId!==bad.artworkId)])));
 const large=lib.newTimelineProject();large.tracks[0].clips=Array.from({length:100},(_,i)=>clip('large-'+i,'blue',i,1));check(()=>assert.throws(()=>lib.timelineMediaRequest(large,sources,crypto.randomUUID(),'tree:timeline-technical-capacity')));
 const result={cases,realFfmpeg:true,existingEngineVirtualCommand:true,previewPlanShared:true,duration:Number(probe.format.duration),pixels,redGain,musicGain,sourceHashesUnchanged:hashes,repeatedSourceGain:repeatGain,mutedAndGapsMeasured:true,menuEnabled:false,apiImplemented:false,recipe:recipe.request};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));assert.equal(JSON.parse(fs.readFileSync(path.join(out,'result.json'))).cases,cases);
 console.log(`TIMELINE_CORE=PASS CASES=${cases} REAL_FFMPEG=PASS VIDEO_DISSOLVE_IMAGE_OVERLAY=MEASURED AUDIO_MIX_GAIN=MEASURED SOURCE_HASH=UNCHANGED EXISTING_MEDIA_RECIPE=PASS UI=NOT_ENABLED EXIT=0`);
}
main().catch(error=>{console.error(error);process.exitCode=1});
