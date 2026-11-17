// Actual shipped MCP process + HTTP fixture. No database or supplier calls.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID,createHash} from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {naumiCreationConfig,presentNaumiDownload,installNaumiCreation} from '../integrations/desktop/naumi-creation.mjs';

const out=path.resolve('output/desktop-creation/client-'+(process.argv.includes('--baseline')?'baseline':'modified')+'-'+randomUUID());
await fs.mkdir(out,{recursive:true});const files=path.join(out,'files');await fs.mkdir(files,{recursive:true});
const secret='nmk_fixture_only_'+randomUUID(),tokenFile=path.join(out,'token.private');await fs.writeFile(tokenFile,secret,{mode:0o600});
let checks=0,account='owner@fixture.invalid',disabled=false,revoked=false,disconnect=false,executions=0;const calls=new Map(),requests=[];
const png=Buffer.from('fixture media bytes'),digest=createHash('sha256').update(png).digest('hex');
const catalogue=()=>[{name:'get_balance',description:'read',parameters:{type:'object',properties:{},additionalProperties:false},write:false,billed:false,available:true}, {name:'generate_image',description:'write',parameters:{type:'object',properties:{prompt:{type:'string'}},required:['prompt']},write:true,billed:true,available:!disabled}, {name:'inspect_images',description:'billed read',parameters:{type:'object',properties:{}},write:false,billed:true,available:true}, {name:'disabled_tool',description:'disabled',parameters:{type:'object',properties:{}},write:false,billed:false,available:false}];
const server=createServer(async(req,res)=>{
 try{
  requests.push({path:req.url,workspace:req.headers['x-naumi-workspace'],authorizationMatches:req.headers.authorization===`Bearer ${secret}`});
  if(revoked){res.writeHead(401,{'content-type':'application/json'}).end(JSON.stringify({error:{code:'TOKEN_REVOKED',message:'revoked',submitted:false}}));return;}
  assert.equal(req.headers.authorization,`Bearer ${secret}`);
  const json=value=>res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(value));
  if(req.url.endsWith('/me'))return json({account:{email:account},token:{id:'fixture-token',scopes:['read','write'],remainingToday:10}});
  if(req.url.endsWith('/tools'))return json({tools:catalogue()});
  if(req.url.includes('/media?')){res.writeHead(200,{'content-type':'image/png'}).end(png);return;}
  if(req.url.endsWith('/uploads')){for await(const _ of req){};return json({id:'fixture-art',url:'/media/reference.png'});}
  if(req.url.includes('/calls/'))return json(calls.get(req.url.split('/').at(-1))||{state:'unknown'});
  let raw='';for await(const b of req)raw+=b;const body=JSON.parse(raw);
  if(req.url.endsWith('/quote'))return json({credits:2,allowed:true,billed:true});
  if(req.url.endsWith('/calls')){
   let call=calls.get(body.operationId);
   if(!call){executions++;call={operationId:body.operationId,tool:body.tool,state:'succeeded',credits:2,output:{text:'fixture',media:['/media/result.png'],details:{domainOperation:body.arguments.operation_id}}};calls.set(body.operationId,call);}
   if(disconnect){disconnect=false;req.socket.destroy();return;}
   res.writeHead(200,{'content-type':'application/x-ndjson'}).end(JSON.stringify({type:'result',call})+'\n');return;
  }
  res.writeHead(404).end();
 }catch{res.writeHead(500).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const site='http://127.0.0.1:'+server.address().port;
const cli=path.resolve(process.argv.includes('--baseline')?'output/desktop-creation/naumi-baseline.mjs':'public/agent/naumi.mjs');
const env={NAUMI_SITE:site,NAUMI_ACCOUNT:account,NAUMI_TOKEN_FILE:tokenFile,NAUMI_WORKSPACE:'tenant-fixture',NAUMI_FILE_ROOT:files,NAUMI_TOKEN:secret,NAUMI_CONFIG:path.join(out,'nonexistent.json')};
let client;
const pass=name=>{checks++;console.log('CHECK',name,'PASS');};
try{
 client=new Client({name:'desktop-client-regression',version:'1'});
 await client.connect(new StdioClientTransport({command:process.execPath,args:[cli,'mcp',...(process.argv.includes('--baseline')?[]:['--desktop'])],env,stderr:'pipe'}));
 const names=(await client.listTools()).tools.map(t=>t.name);
 assert(names.includes('naumi_call'),'BASELINE: stable caller-owned MCP operationId envelope is missing');
 assert(!names.includes('generate_image'));assert(!names.includes('inspect_images'));assert(!names.includes('disabled_tool'));pass('Desktop stable envelope; no random-ID writes, billed reads or disabled tools');
 const invoke=(name,args={})=>client.callTool({name,arguments:args});
 const before=calls.size;const invalid=await invoke('naumi_call',{tool:'generate_image',arguments:{},operationId:'not-a-uuid'});assert(invalid.isError);assert.equal(calls.size,before);pass('invalid operation rejected before POST');
 const op=randomUUID(),domain=randomUUID(),intent={tool:'generate_image',arguments:{prompt:'fixture',operation_id:domain},operationId:op};
 disconnect=true;const lost=await invoke('naumi_call',intent);assert(lost.isError);assert.equal(lost.structuredContent.operationId,op);
 const resumed=await invoke('naumi_call_status',{operationId:op});assert.equal(resumed.structuredContent.operationId,op);assert.equal(resumed.structuredContent.output.details.domainOperation,domain);assert.equal(executions,1);
 await invoke('naumi_call',intent);assert.equal(executions,1);pass('disconnect original outer/domain IDs + one execution + original status');
 disabled=true;const fresh=await invoke('naumi_tools');assert.equal(fresh.structuredContent.tools.find(t=>t.name==='generate_image').available,false);pass('tool discovery not process-cached');
 const src=path.join(files,'reference.png');await fs.writeFile(src,png);assert(!(await invoke('naumi_upload_image',{path:src})).isError);
 assert((await invoke('naumi_upload_image',{path:tokenFile})).isError);pass('upload allowed only in current Agent workspace');
 const destination=path.join(files,'final.png');const saved=await invoke('naumi_download_media',{url:'/media/result.png',out:destination});assert(!saved.isError);assert.equal(saved.structuredContent.sha256,digest);assert.equal(saved.structuredContent.bytes,png.length);assert.deepEqual(await fs.readFile(destination),png);
 await invoke('naumi_download_media',{url:'/media/result.png',out:destination});await fs.writeFile(destination,'user edit');assert((await invoke('naumi_download_media',{url:'/media/result.png',out:destination})).isError);assert.equal(await fs.readFile(destination,'utf8'),'user edit');assert(!(await fs.readdir(files)).some(f=>f.endsWith('.part')));pass('atomic download/hash/idempotent readback/no overwrite/part cleanup');
 assert((await invoke('naumi_download_media',{url:'/media/result.png',out:path.join(out,'escape.png')})).isError);pass('download outside workspace rejected');
 const beforeAccountPosts=calls.size;account='other@fixture.invalid';const mismatch=await invoke('naumi_call',{...intent,operationId:randomUUID()});assert(mismatch.isError);assert.equal(mismatch.structuredContent.code,'ACCOUNT_MISMATCH');assert.equal(calls.size,beforeAccountPosts);pass('changed authenticated account blocked before execution');account=env.NAUMI_ACCOUNT;
 revoked=true;const revokedCall=await invoke('naumi_connection');assert(revokedCall.isError);assert.equal(revokedCall.structuredContent.code,'TOKEN_REVOKED');pass('revocation immediately blocks helpers');revoked=false;
 assert(requests.every(r=>r.workspace==='tenant-fixture'&&r.authorizationMatches));pass('all requests carry explicit workspace and protected credential');
 await client.close();client=null;
 const bundle=path.join(out,'bundle');execFileSync(process.execPath,['scripts/package-naumi-desktop.mjs',bundle,'--allow-dirty'],{stdio:'pipe'});
 const opts={bundle,site,account,tokenFile,fileRoot:files,workspace:'tenant-fixture',allowFixtureBundle:true};
 const config=await naumiCreationConfig(opts);assert.equal(config.mcp.serverName,'naumi_creation');assert(!JSON.stringify(config).includes(secret));
 await assert.rejects(naumiCreationConfig({...opts,expectedManifestSha256:'0'.repeat(64)}),/MANIFEST_PIN/);pass('external manifest pin rejects replaced self-manifest');
 await assert.rejects(naumiCreationConfig({...opts,allowFixtureBundle:false}),/EXTERNAL_MANIFEST_PIN/);
 let disposed=0,plugins=0;
 const dispose=await installNaumiCreation({inject:(dependencies,fn)=>{assert.deepEqual(dependencies,['tools','skills']);fn({plugin:()=>{plugins++;}});return {dispose:async()=>{disposed++;}};}},opts,{mcpClient:{},filesystemSkills:{}});
 await dispose();assert.equal(disposed,1);assert.equal(plugins,2);pass('account switch disposer closes the owned Harness registration Fiber');
 // Explicit dirty fixture: a clean fixed test checkout must not be assumed dirty.
 const manifestPath=path.join(bundle,'manifest.json'),dirtyManifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));dirtyManifest.dirty=true;await fs.writeFile(manifestPath,JSON.stringify(dirtyManifest));
 const manifestPin=createHash('sha256').update(await fs.readFile(manifestPath)).digest('hex');
 await assert.rejects(naumiCreationConfig({...opts,allowFixtureBundle:false,expectedManifestSha256:manifestPin}),/CLEAN/);pass('bundle integrity, no secret in config, dirty fixture not release');
 await fs.writeFile(path.join(bundle,'naumi.mjs'),'tampered');await assert.rejects(naumiCreationConfig(opts),/HASH/);pass('tampered client bundle rejected');
 let presented=0;const receipt={...saved.structuredContent,path:src};await presentNaumiDownload({receipt,fileRoot:files,present:async a=>{presented++;assert.equal(a.files[0].path,src);}});assert.equal(presented,1);
 await assert.rejects(presentNaumiDownload({receipt:{...receipt,sha256:'0'.repeat(64)},fileRoot:files,present:async()=>presented++}),/DIGEST/);assert.equal(presented,1);pass('only verified final file reaches host native-present callback');
 await fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify({checks,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),realMcp:true,httpFixture:true,realSupplier:false,productionWrites:0},null,2));
 console.log(`AGENT_DESKTOP_CLIENT=PASS CHECKS=${checks} REAL_MCP=1 HTTP=FIXTURE PRODUCTION_WRITES=0`);
}finally{await client?.close();await new Promise(r=>server.close(r));await fs.rm(tokenFile,{force:true});}
