import assert from "node:assert/strict";
import {createServer} from "node:http";
import sharp from "sharp";

async function main(){
  const png=await sharp({create:{width:120,height:160,channels:3,background:"white"}}).png().toBuffer();
  const bodies:Record<string,FormDataEntryValue>[]=[];
  const server=createServer(async(req,res)=>{
    const chunks:Buffer[]=[];for await(const part of req)chunks.push(Buffer.from(part));
    const form=await new Request('http://fixture/images/edits',{method:'POST',headers:{'content-type':req.headers['content-type']!},body:Buffer.concat(chunks)}).formData();
    bodies.push(Object.fromEntries(form));res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({created:1,data:[{b64_json:png.toString('base64')}]}));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  Object.assign(process.env,{DATABASE_URL:'',NAUMI_MULTI_USER:'0',OPENAI_API_KEY:'fixture-only-not-a-production-key',OPENAI_BASE_URL:origin,OPENAI_IMAGE_MODEL:'gpt-image-2',NAUMI_ROUTER_MANAGEMENT_URL:''});
  const {editImage}=await import('../src/lib/image-edit');
  try{
    const input={images:[png],prompt:'保持原图画幅',size:'1024x1536' as const,quality:'medium' as const};
    await editImage({...input,sourceFrame:{width:1200,height:1600}});assert.equal(bodies[0].size,'1152x1536');
    await editImage({...input,sourceFrame:{width:100,height:600}});assert.equal(bodies[1].size,'auto');
    await editImage(input);assert.equal(bodies[2].size,'1024x1536');
    process.env.OPENAI_IMAGE_MODEL='legacy-custom';
    await editImage({...input,sourceFrame:{width:1200,height:1600}});assert.equal(bodies[3].size,'1024x1536');
    console.log('LEGACY_EDIT_FRAME=PASS CASES=4 EXACT_3_4=1152x1536 UNKNOWN_CONTRACT=UNCHANGED REAL_SUPPLIER_CALLS=0');
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
main().catch(error=>{console.error(error);process.exitCode=1});
