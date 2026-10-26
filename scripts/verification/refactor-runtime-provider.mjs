/** Synthetic supplier for the internal-network full-image acceptance only. */
import http from 'node:http';
import {createRequire} from 'node:module';
const require=createRequire('/app/package.json'),sharp=require('sharp');
const png=await sharp({create:{width:1024,height:1024,channels:3,background:'#b6d4ef'}}).png().toBuffer();
let held=true,calls=0,edits=0,unexpected=0;const waiting=new Set(),wires=[];
const server=http.createServer(async(req,res)=>{
 try{
  const chunks=[];for await(const c of req)chunks.push(c);
  res.setHeader('content-type','application/json');
  if(req.url==='/fixture/stats')return res.end(JSON.stringify({calls,edits,unexpected,held,waiting:waiting.size,wires}));
  if(req.method==='POST'&&['/fixture/release','/fixture/hold'].includes(req.url)){
   held=req.url.endsWith('/hold');if(!held){for(const finish of waiting)finish();waiting.clear();}return res.end(JSON.stringify({ok:true,held}));
  }
  if(req.method==='POST'&&req.url==='/v1/images/generations'){
   const body=JSON.parse(Buffer.concat(chunks));calls++;wires.push({model:body.model,n:body.n,quality:body.quality,size:body.size});
   if(held)await new Promise(resolve=>{waiting.add(resolve);req.once('close',()=>{if(res.destroyed){waiting.delete(resolve);resolve();}});});
   return res.end(JSON.stringify({created:Math.floor(Date.now()/1000),data:[{b64_json:png.toString('base64')}]}));
  }
  if(req.method==='POST'&&req.url==='/v1/images/edits'){edits++;return res.end(JSON.stringify({data:[{b64_json:png.toString('base64')}]}));}
  unexpected++;res.statusCode=404;res.end(JSON.stringify({error:'Unexpected fixture endpoint',path:req.url}));
 }catch(error){res.statusCode=500;res.end(JSON.stringify({error:String(error)}));}
});
server.listen(3300,'0.0.0.0',()=>console.log('RUNTIME_PROVIDER=READY SYNTHETIC=1'));
process.on('SIGTERM',()=>{held=false;for(const finish of waiting)finish();waiting.clear();server.close(()=>process.exit(0));});
