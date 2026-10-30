/** Real HTTP regression of the original,non-mixed synthetic provider.
 * Run inside the saved complete application image with --network none.
 * This does not substitute for the full runtime/timeline acceptance suite. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const require=createRequire('/app/package.json'),sharp=require('sharp');
const checks=[];
const pass=name=>{checks.push(name);console.log('PASS '+name);};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const origin='http://127.0.0.1:3300';
async function request(path,body){
 const response=await fetch(origin+path,{
  method:body===undefined?'GET':'POST',
  ...(body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)}),
  signal:AbortSignal.timeout(10000),
 });
 const bytes=Buffer.from(await response.arrayBuffer());
 return {status:response.status,bytes,json:()=>JSON.parse(bytes.toString('utf8'))};
}
async function verifyPixels(bytes){
 const {data,info}=await sharp(bytes).removeAlpha().raw().toBuffer({resolveWithObject:true});
 assert.equal(info.width,1024);assert.equal(info.height,1024);
 assert.deepEqual([...data.subarray(0,3)],[182,212,239]);
}
try{
 assert.notEqual(process.env.NAUMI_MIXED_PROVIDER,'1');
 await import(pathToFileURL(process.env.VERIFY_PROVIDER_MODULE||'/verification/provider.mjs').href);
 let stats=(await request('/fixture/stats')).json();
 assert.equal(stats.calls,0);assert.equal(stats.held,true);assert.equal(stats.waiting,0);
 for(const key of ['mixedTrace','delayMs','active','peak'])assert.equal(key in stats,false);
 pass('default flag retains original stats/held contract with no mixed fields');

 let replied=false;
 const generated=request('/v1/images/generations',{model:'original-fixture',n:1,quality:'medium',size:'1024x1024',prompt:'ordinary prompt without mixed identity'}).then(r=>{replied=true;return r;});
 for(let i=0;i<100;i++){stats=(await request('/fixture/stats')).json();if(stats.waiting===1)break;await sleep(10);}
 assert.equal(stats.calls,1);assert.equal(stats.waiting,1);assert.equal(replied,false);
 assert.deepEqual(stats.wires,[{model:'original-fixture',n:1,quality:'medium',size:'1024x1024'}]);
 pass('generation remains held and original non-mixed prompts/wire remain accepted');
 assert.equal((await request('/fixture/release',{})).json().held,false);
 const result=await generated;assert.equal(result.status,200);
 const image=Buffer.from(result.json().data[0].b64_json,'base64');await verifyPixels(image);
 pass('release delivers original 1024 PNG bytes and pixels');

 const edited=await request('/v1/images/edits',{});assert.equal(edited.status,200);
 assert.deepEqual(Buffer.from(edited.json().data[0].b64_json,'base64'),image);
 pass('original edit protocol and bytes remain unchanged');
 assert.deepEqual(Object.keys((await request('/object_info')).json()),['LoadImage','CLIPTextEncode','SaveImage']);
 assert.equal((await request('/upload/image',{})).json().name,'fixture-comfy-input.png');
 const prompt={prompt:{node:{class_type:'SaveImage'}}};
 assert.equal((await request('/prompt',prompt)).json().prompt_id,'comfy-1');
 const history=(await request('/history/comfy-1')).json()['comfy-1'];
 assert.equal(history.status.completed,true);assert.equal(history.outputs.save.images.length,2);
 assert.deepEqual((await request('/view?filename=first.png')).bytes,image);
 pass('original Comfy upload/prompt/history/view protocol remains intact');
 assert.equal((await request('/fixture/hold',{})).json().held,true);
 const missing=await request('/not-a-fixture-endpoint');assert.equal(missing.status,404);
 assert.equal(missing.json().error,'Unexpected fixture endpoint');
 stats=(await request('/fixture/stats')).json();
 assert.equal(stats.calls,1);assert.equal(stats.edits,1);assert.equal(stats.comfyPrompts,1);
 assert.deepEqual(stats.comfyWires,[prompt]);assert.equal(stats.unexpected,1);
 pass('hold,404 and original request counters remain explicit');
 console.log('REFACTOR_DEFAULT_PROVIDER=PASS CHECKS='+checks.length+' ACTUAL_HTTP=1 DEFAULT_MODE=1 ORIGINAL_PIXELS=1 NETWORK=NONE FULL_RUNTIME=NOT_RUN');
 process.kill(process.pid,'SIGTERM');
}catch(error){console.error(error);process.exit(1);}
