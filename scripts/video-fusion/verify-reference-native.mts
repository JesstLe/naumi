import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=process.env.VIDEO_REFERENCE_ROOT; if(!root)throw new Error('VIDEO_REFERENCE_ROOT pointing to isolated pinned upstreams and original media is required');
const web=root+'/infinite-canvas/web',origin='http://127.0.0.1:15372';
const axios=(await import(pathToFileURL(web+'/node_modules/axios/index.js').href)).default;
const transport=axios.getAdapter('http'),calls:any[]=[],jobs=new Map<string,any>(),fakeKey='native-fixture-'+randomUUID();
axios.defaults.adapter=async(config:any)=>{
 const url=new URL(config.url,origin);assert.equal(url.origin,origin);
 assert.ok(['/api/ai/direct-request','/api/storage/config'].includes(url.pathname),`Unexpected original API ${url.pathname}`);
 const response=await transport({...config,baseURL:origin,proxy:false});
 calls.push({phase:'original-go-api',path:url.pathname,status:response.status,...(url.pathname.includes('direct-request')?{request:JSON.parse(config.data),plan:response.data}: {})});return response;
};
const {defaultConfig}=await import(pathToFileURL(web+'/src/stores/use-config-store.ts').href);
const {useChannelTranslationStore}=await import(pathToFileURL(web+'/src/stores/use-channel-translation-store.ts').href);
// Official setup method, isolated Node guest cache; no browser storage or source edits.
await useChannelTranslationStore.getState().replace('guest',[]);
const {createVideoGenerationTask,pollVideoGenerationTaskStatus}=await import(pathToFileURL(web+'/src/services/api/video.ts').href);
const files:Record<string,string>={
 'first.png':root+'/fixtures/assets/first.png',
 'last.png':root+'/fixtures/assets/last.png',
 'mosaic.png':root+'/reference/toonAe9e5f/data/workspaces/canvas-video-comparison/assets/native-comparison-092e3873-b883-4c50-9038-8d37dde4bef8/montage.png',
};
const assets=new Map<string,{bytes:Buffer;sha256:string;mime:string}>();
for(const [name,file] of Object.entries(files)){const bytes=await readFile(file);assets.set('https://original-media.invalid/'+name,{bytes,sha256:createHash('sha256').update(bytes).digest('hex'),mime:'image/png'});}
const outputs=new Map<string,any>();
for(const [key,file] of Object.entries({'4-true':root+'/fixtures/assets/landscape-4-audio.mp4','4-false':root+'/fixtures/assets/landscape-4-silent.mp4','12-false':root+'/reference/native-video-assets-20261017/landscape-12-silent.mp4'})){
 const bytes=await readFile(file),probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_format','-show_streams','-of','json',file],{encoding:'utf8'}));
 const [seconds,audio]=key.split('-');assert.ok(Math.abs(Number(probe.format.duration)-Number(seconds))<0.1);assert.equal(probe.streams.some((stream:any)=>stream.codec_type==='audio'),audio==='true');
 outputs.set(key,{bytes,sha256:createHash('sha256').update(bytes).digest('hex'),durationMs:Number(seconds)*1000,audio:audio==='true',probe});
}
const inspectReferences=async(value:any,key=''):Promise<void>=>{
 if(/prompt|description|negative|text/i.test(key))return;
 if(Array.isArray(value)){for(const entry of value)await inspectReferences(entry,key);return;}
 if(value&&typeof value==='object'){for(const [name,entry] of Object.entries(value))await inspectReferences(entry,name);return;}
 if(typeof value!=='string'||!value.startsWith('https://'))return;
 if(assets.has(value)){const asset=assets.get(value)!;calls.push({phase:'supplier-reference-read',url:value,bytes:asset.bytes.length,sha256:asset.sha256});return;}
 const url=new URL(value);assert.equal(url.origin,'https://native-result.invalid');const job=jobs.get(url.pathname.slice(1).replace(/\.mp4$/,''));assert.ok(job?.completed,'Native predecessor must really finish before reference');calls.push({phase:'supplier-predecessor-read',taskId:job.id,url:value,sha256:job.output.sha256,bytes:job.output.bytes.length});
};
const realFetch=globalThis.fetch;
globalThis.fetch=async(input:any,init:any)=>{
 const url=new URL(input instanceof Request?input.url:String(input));
 if(url.origin==='https://native-result.invalid'){const job=jobs.get(url.pathname.slice(1).replace(/\.mp4$/,''));assert.ok(job?.completed);calls.push({phase:'result-read',taskId:job.id,sha256:job.output.sha256,bytes:job.output.bytes.length});return new Response(job.output.bytes,{headers:{'content-type':'video/mp4'}});}
 assert.equal(url.origin,'https://native-reference.invalid','No external network fallback');
 assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+fakeKey);
 if(url.pathname.endsWith('/jobs/createTask')){const body=JSON.parse(init.body);await inspectReferences(body);const id='native-'+randomUUID(),output=outputs.get(String(body.input.duration??4)+'-'+String(body.input.audio??body.input.sound??false));assert.ok(output,'Matching prepared media must exist');jobs.set(id,{id,body,output,completed:false});calls.push({phase:'create',id,path:url.pathname,body});return Response.json({code:200,data:{taskId:id}});}
 assert.ok(url.pathname.endsWith('/jobs/recordInfo'));const id=url.searchParams.get('taskId')!;const job=jobs.get(id);assert.ok(job);job.completed=true;calls.push({phase:'poll',id,path:url.pathname});return Response.json({code:200,data:{taskId:id,state:'success',progress:100,resultJson:JSON.stringify({resultUrls:['https://native-result.invalid/'+id+'.mp4']})}});
};
const folder=root+'/reference/ic-68b37db-20261014/native-video-'+randomUUID();await mkdir(folder);
const image=(name:string)=>({id:name,name,type:'image/png',dataUrl:'',url:'https://original-media.invalid/'+name});
const video=(task:any)=>({id:task.id,name:task.id+'.mp4',type:'video/mp4',url:task.video_url||task.url,durationMs:jobs.get(task.id).output.durationMs,width:1280,height:720,bytes:jobs.get(task.id).output.bytes.length});
const bodyText='原创镜头：角色举起蓝色方块。\n角色逐字说：“第一句完整保留。”\n旁白：“第二句也完整保留。”';
const results:any[]=[];
const generate=async(name:string,model:string,prompt:string,input:any,extra:any={})=>{
 const channel={id:'native-kie-only',protocol:'kie',name:'隔离 KIE 原生模拟',baseUrl:'https://native-reference.invalid/api/v1',apiKey:fakeKey,models:[model]};
 const config={...structuredClone(defaultConfig),channelMode:'local',model,videoModel:model,activeChannelId:channel.id,videoChannelId:channel.id,localChannels:[channel],size:'16:9',videoMode:'std',videoSeconds:'4',videoGenerateAudio:'true',...extra};
 const created=await createVideoGenerationTask(config,prompt,input);assert.ok(created.task.id);
 const completed=await pollVideoGenerationTaskStatus(config,created.task);assert.equal(completed.status,'completed');
 const output=jobs.get(completed.id).output,response=await fetch(completed.video_url||completed.url);assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),output.sha256);
 const wire=calls.find(call=>call.phase==='create'&&call.id===completed.id);assert.ok(wire);assert.equal(wire.body.input.prompt,prompt);
 results.push({name,id:completed.id,model,prompt,wire:wire.body,outputSha256:output.sha256,outputDurationMs:output.durationMs,outputHasAudio:output.audio,completed:true});return completed;
};
try{
 const opening=await generate('opening','kling-3.0/video',bodyText,{references:[image('first.png')]});
 const shots=Array.from({length:4},(_,i)=>({prompt:`面板${i+1}：${bodyText}`,duration:'3'}));
 await generate('mosaic','kling-3.0-omni/reference-to-video','整张拼图作为序列参考，不作开场帧，不显示网格。'+bodyText,{references:[image('mosaic.png'),image('first.png')],videoReferences:[video(opening)]},{videoSeconds:'12',videoMultiShot:'true',videoShotType:'customize',videoMultiPrompt:shots,videoElementList:[{name:'元素甲',description:'保持原创角色身份和方块',references:[{...image('first.png'),kind:'image'},{...video(opening),kind:'video'}]}]});
 const hardcut=await generate('hardcut','kling-3.0-omni/reference-to-video','从视频1硬切到同一世界的新摄影机角度，不复制最后一帧。'+bodyText,{references:[image('first.png')],videoReferences:[video(opening)]});
 const same=await generate('same-camera','kling-3.0-omni/reference-to-video','从视频1最后动作之后继续，保持同机位和构图，只推进新动作。'+bodyText,{references:[image('first.png')],videoReferences:[video(hardcut)]});
 await generate('prequel','kling-3.0-omni/reference-to-video','生成发生在视频1之前4秒的前置动作，在结尾导向其开场，不复制帧。'+bodyText,{references:[image('first.png')],videoReferences:[video(opening)]});
 await generate('editing','kling-3.0-omni/transformation','只把蓝色方块改为红色，保持人物身份、构图、摄影机运动和其他元素。'+bodyText,{references:[image('last.png')],videoReferences:[video(same)]});
 const mosaic=results.find(item=>item.name==='mosaic'),mi=mosaic.wire.input;
 assert.equal(mosaic.outputDurationMs,12000);assert.equal(mosaic.outputHasAudio,false);assert.equal(mi.duration,12);assert.equal(mi.audio,false);assert.equal(mi.aspect_ratio,'auto');assert.equal(mi.customize_multi_shots,true);
 assert.deepEqual(mi.multi_prompt,shots.map(shot=>({prompt:shot.prompt,duration:Number(shot.duration)})));assert.equal(mi.multi_prompt.reduce((sum:number,shot:any)=>sum+shot.duration,0),12);
 assert.deepEqual(mi.image_urls,['https://original-media.invalid/mosaic.png','https://original-media.invalid/first.png']);assert.equal(mi.first_frame_url,undefined);
 assert.deepEqual(mi.elements[0].element_input_urls,['https://original-media.invalid/first.png',video(opening).url]);assert.equal(mi.elements[0].name,'元素甲');assert.equal(mi.elements[0].description,'保持原创角色身份和方块');
 for(const [name,parent] of [['hardcut',opening],['same-camera',hardcut],['prequel',opening],['editing',same]] as const){const result=results.find(item=>item.name===name);assert.deepEqual(result.wire.input.video_urls,[video(parent).url]);assert.ok(result.prompt.endsWith(bodyText));}
 const edit=results.find(item=>item.name==='editing');assert.equal(edit.wire.input.audio,true);assert.equal(edit.wire.input.aspect_ratio,'16:9');assert.equal(edit.wire.input.duration,4);assert.equal(edit.outputHasAudio,true);
 assert.equal(calls.filter(call=>call.phase==='create').length,6);assert.equal(calls.filter(call=>call.phase==='poll').length,6);
 await writeFile(folder+'/calls.json',JSON.stringify(calls,null,2));await writeFile(folder+'/result.json',JSON.stringify({ok:true,sourceCommit:'68b37db04b9083c3ff0af67ffe362f85d04d1f9f',mode:'original-frontend-functions-and-real-original-Go-translator-with-isolated-supplier-transport',formalModelCalls:0,actualLlmStrategyExecuted:false,realExternalSupplierRequests:0,results,predecessorReads:calls.filter(call=>call.phase==='supplier-predecessor-read')},null,2));console.log('IC_NATIVE_VIDEO_CHAIN=PASS '+folder);
}catch(error){await writeFile(folder+'/failure.json',JSON.stringify({ok:false,error:String(error),completed:results.length},null,2));await writeFile(folder+'/calls.json',JSON.stringify(calls,null,2));throw error;}
finally{globalThis.fetch=realFetch;axios.defaults.adapter=transport;}
