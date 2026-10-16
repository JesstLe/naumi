import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { getModelAdministration } from '../src/lib/model-config/server';
import { modelEndpointFetch } from '../src/lib/model-config/transport';
import { mapResolution } from '../src/lib/model-config/resolution-policy';
import { withImageOperation } from '../src/lib/image-gateway';

// One paid request, no automatic retry. An existing marker requires reconciliation.
async function main() {
  const dir='/tmp/banana-edit-proof-20261015',operation='banana-edit-proof-pro-20261015-r1';
  mkdirSync(dir,{recursive:true,mode:0o700});
  assert.ok(!existsSync(`${dir}/REQUESTED.json`),'已有提交记录；只核对原操作，不重放');
  const admin=await getModelAdministration();
  try {
    const snapshot=await admin.repo.current(),upstream=snapshot.config.upstreamModels.find(u=>u.id==='geeknow-nano-banana-pro')!;
    const provider=snapshot.config.providers.find(p=>p.id===upstream.providerId)!;
    assert.ok(upstream.enabled&&upstream.model==='gemini-3-pro-image-preview'&&provider.enabled&&provider.baseUrl==='https://www.geeknow.top/v1');
    const apiKey=await admin.credentials.read(provider.credentialRef!,provider.id);
    const reference=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#f7eddc"/><circle cx="128" cy="128" r="80" fill="#6999dd"/></svg>')).png().toBuffer();
    const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
    const fields:Record<string,string>={model:upstream.model,prompt:'参考图片的蓝色和米白色配色，画一只可爱的小兔子，干净的插画。',n:'1'};
    mapResolution(fields,upstream.parameterMap.resolutionPolicy,'1K','3:4');
    const form=new FormData();for(const [key,value]of Object.entries(fields))form.set(key,value);
    form.append('image[]',new Blob([new Uint8Array(reference)],{type:'image/png'}),'reference.png');
    const submitted={operation,providerId:provider.id,model:upstream.model,upstreamId:upstream.id,modelVersion:snapshot.version,credentialRef:provider.credentialRef,baseUrl:provider.baseUrl,endpoint:'/images/edits',referenceCount:1,referenceSha256:hash(reference),wireFields:fields,createdAt:new Date().toISOString()};
    writeFileSync(`${dir}/REFERENCE.png`,reference,{mode:0o600});writeFileSync(`${dir}/REQUESTED.json`,JSON.stringify(submitted,null,2),{flag:'wx',mode:0o600});
    const transport=modelEndpointFetch(provider.baseUrl,{trustedOrigins:admin.trustedOrigins},{providerId:provider.id,protocol:provider.protocol,apiKey,wireModel:upstream.model,credentialRef:provider.credentialRef,timeoutMs:provider.timeoutMs,maxConcurrent:provider.maxConcurrent});
    const response=await withImageOperation(upstream.model,{id:operation,resolution:'1K',ratio:'3:4',quality:'medium'},()=>transport(`${provider.baseUrl}/images/edits`,{method:'POST',headers:{Authorization:`Bearer ${apiKey}`},body:form,signal:AbortSignal.timeout(180000)}));
    const data=await response.json();assert.equal(response.status,200,`诊断HTTP状态=${response.status}`);
    const image=data.data?.[0];assert.ok(image,'响应没有图片条目');
    let bytes:Buffer;
    if(image.b64_json)bytes=Buffer.from(image.b64_json,'base64');
    else {
      const url=new URL(image.url);assert.ok(url.protocol==='https:'&&!url.username&&!url.password);
      const media=modelEndpointFetch(url.origin,{trustedOrigins:[]});
      const result=await media(url.href,{signal:AbortSignal.timeout(45000)});assert.equal(result.status,200);bytes=Buffer.from(await result.arrayBuffer());
    }
    const info=await sharp(bytes,{limitInputPixels:4096*4096}).metadata();assert.ok(info.width&&info.height&&info.width>=512&&info.height>=512);
    const output=await sharp(bytes).png().toBuffer();writeFileSync(`${dir}/OUTPUT.png`,output,{mode:0o600});
    const calls=await admin.pool.query('SELECT id,state,delivered FROM app_supplier_calls WHERE operation_id=$1 AND provider_id=$2 ORDER BY started_at',[operation,provider.id]);
    assert.equal(calls.rows.length,1,'诊断供应商调用数量异常');assert.equal(calls.rows[0].delivered,1);
    const proof={...submitted,callId:calls.rows[0].id,httpStatus:200,outputSha256:hash(output),width:info.width,height:info.height,outputDecoded:true,actualRequests:1};
    writeFileSync(`${dir}/PROOF.json`,JSON.stringify(proof,null,2),{mode:0o600});
    console.log(`PROBE PASS operation=${operation} call=${proof.callId} references=1 output=${info.width}x${info.height} bytes=${output.length} requests=1`);
  } finally {await admin.pool.end();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
