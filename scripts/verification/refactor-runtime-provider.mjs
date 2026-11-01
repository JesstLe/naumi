/** Synthetic supplier for the internal-network full-image acceptance only. */
import http from 'node:http';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire('/app/package.json'),sharp=require('sharp');
const png=await sharp({create:{width:1024,height:1024,channels:3,background:'#b6d4ef'}}).png().toBuffer();
const mixed=process.env.NAUMI_MIXED_PROVIDER==='1',delayMs=mixed?Number(process.env.NAUMI_MIXED_DELAY_MS||3000):0;
const mixedImages=new Map(),mixedTrace=[];let active=0,peak=0;
if(mixed){for(const size of [1024,2048]){const raw=Buffer.alloc(size*size*3);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=(y*size+x)*3;raw[i]=(x*7+y*3)%256;raw[i+1]=(x*2+y*11)%256;raw[i+2]=(x+y*13)%256;}const bytes=await sharp(raw,{raw:{width:size,height:size,channels:3}}).png().toBuffer(),pixel=await sharp(bytes).ensureAlpha().raw().toBuffer();mixedImages.set(size,{bytes,pixelSha256:createHash('sha256').update(pixel).digest('hex'),sha256:createHash('sha256').update(bytes).digest('hex')});}}
let outcomeMode="healthy";const outcomeTrace=[];
let held=true,calls=0,edits=0,unexpected=0,comfyPrompts=0;const waiting=new Set(),wires=[],comfyWires=[];
const server=http.createServer(async(req,res)=>{
 try{
  const chunks=[];for await(const c of req)chunks.push(c);
  res.setHeader('content-type','application/json');
  if(req.url==='/fixture/stats')return res.end(JSON.stringify({calls,edits,unexpected,held,waiting:waiting.size,wires,comfyPrompts,comfyWires,outcomeMode,outcomeTrace,...(mixed?{delayMs,active,peak,mixedTrace}:{} )}));
  if(req.method==='POST'&&req.url==='/fixture/outcome'){
   const mode=JSON.parse(Buffer.concat(chunks)).mode;if(!['healthy','403-no-proof','403-not-charged','accepted-socket-loss'].includes(mode)){res.statusCode=400;return res.end('{}');}
   outcomeMode=mode;return res.end(JSON.stringify({ok:true,mode}));
  }
  if(req.url==='/object_info')return res.end(JSON.stringify({LoadImage:{},CLIPTextEncode:{},SaveImage:{}}));
  if(req.url==='/upload/image')return res.end(JSON.stringify({name:'fixture-comfy-input.png'}));
  if(req.url==='/prompt'){comfyPrompts++;comfyWires.push(JSON.parse(Buffer.concat(chunks)));return res.end(JSON.stringify({prompt_id:'comfy-'+comfyPrompts}));}
  if(req.url.startsWith('/history/comfy-')){const id=req.url.split('/').at(-1);return res.end(JSON.stringify({[id]:{status:{completed:true,status_str:'success'},outputs:{save:{images:[{filename:'first.png'},{filename:'second.png'}]}}}}));}
  if(req.url.startsWith('/view?')){res.setHeader('content-type','image/png');return res.end(png);}
  if(req.method==='POST'&&['/fixture/release','/fixture/hold'].includes(req.url)){
   held=req.url.endsWith('/hold');if(!held){for(const finish of waiting)finish();waiting.clear();}return res.end(JSON.stringify({ok:true,held}));
  }
  if(req.method==='POST'&&req.url==='/v1/images/generations'){
   const body=JSON.parse(Buffer.concat(chunks));calls++;wires.push({model:body.model,n:body.n,quality:body.quality,size:body.size});
   if(held)await new Promise(resolve=>{waiting.add(resolve);req.once('close',()=>{if(res.destroyed){waiting.delete(resolve);resolve();}});});
   if(outcomeMode!=='healthy'){
    const mode=outcomeMode,token=String(body.prompt||'').match(/R10B-FULL:[a-z0-9-]+:([a-f0-9]{32})/)?.[1];
    if(!token)throw Error('OUTCOME_FIXTURE_TOKEN_REQUIRED');
    outcomeTrace.push({token,mode,accepted:mode==='accepted-socket-loss',receivedAt:Date.now()});
    if(mode==='accepted-socket-loss'){res.destroy();return;}
    res.statusCode=403;return res.end(JSON.stringify({error:{message:'fixture supplier quota 0.008416',...(mode==='403-not-charged'?{billing_status:'not_charged'}:{})}}));
   }
   let image=png;
   if(mixed){
    const operationId=String(body.prompt||'').match(/R8J:([a-f0-9-]{36})/i)?.[1],size=/2048|2K/i.test([body.resolution,body.size].join(' '))?2048:1024,selected=mixedImages.get(size);
    if(!operationId||body.n!==undefined&&body.n!==1)throw Error('MIXED_PROVIDER_IDENTITY_OR_COUNT');
    const trace={operationId,width:size,height:size,receivedAt:Date.now(),replyAt:null,sha256:selected.sha256,pixelSha256:selected.pixelSha256,bytes:selected.bytes.length};mixedTrace.push(trace);active++;peak=Math.max(peak,active);
    try{await new Promise(resolve=>setTimeout(resolve,delayMs));trace.replyAt=Date.now();image=selected.bytes;}finally{active--;}
   }
   return res.end(JSON.stringify({created:Math.floor(Date.now()/1000),data:[{b64_json:image.toString('base64')}]}));
  }
  if(req.method==='POST'&&req.url==='/v1/images/edits'){edits++;return res.end(JSON.stringify({data:[{b64_json:png.toString('base64')}]}));}
  unexpected++;res.statusCode=404;res.end(JSON.stringify({error:'Unexpected fixture endpoint',path:req.url}));
 }catch(error){res.statusCode=500;res.end(JSON.stringify({error:String(error)}));}
});
server.listen(3300,'0.0.0.0',()=>console.log('RUNTIME_PROVIDER=READY SYNTHETIC=1'));
process.on('SIGTERM',()=>{held=false;for(const finish of waiting)finish();waiting.clear();server.close(()=>process.exit(0));});
