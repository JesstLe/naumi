import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { generateNewApiImage } from '../src/lib/new-api-image';
import { runModelExecution } from '../src/lib/model-config/context';
async function main() {
 const calls: any[]=[];
 const server=createServer(async (req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);calls.push({path:req.url,body:JSON.parse(Buffer.concat(chunks).toString())});res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{b64_json:Buffer.from('fixture-image').toString('base64')}]}));});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${(server.address() as any).port}`;
 const scope:any={connection:{protocol:'new-api-flow',providerId:'fixture',baseUrl:origin+'/v1',apiKey:'fixture',wireModel:'jimeng-image-5.0-pro',timeoutMs:1000},frozen:{facts:{ratio:'3:4',resolution:'2K'}},capabilities:{maxReferenceImages:6},parameterMap:{}};
 try {
  const image=await runModelExecution(scope,()=>generateNewApiImage({model:'wrong',prompt:'fixture',settings:scope.connection,execution:scope,trustedOrigins:[origin],images:[{buffer:Buffer.from('reference'),mimeType:'image/png'}]}));
  assert.equal(calls.length,1);assert.equal(calls[0].path,'/v1/images/generations');assert.equal(calls[0].body.model,'jimeng-image-5.0-pro');assert.equal(calls[0].body.ratio,'3:4');assert.equal(calls[0].body.resolution,'2k');assert.equal(calls[0].body.filePaths.length,1);assert.equal(image.buffer.toString(),'fixture-image');
  console.log('PASS Jimeng image endpoint, frozen ratio/resolution, references and single submission');
 } finally {server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
