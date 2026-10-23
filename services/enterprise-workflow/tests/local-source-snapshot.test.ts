import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,readdir,symlink,unlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import pg from 'pg';
import sharp from 'sharp';
import {ImportStore} from '../src/import-store';
import {createImportServer} from '../src/import-server';

const url=process.env.WORKFLOW_SOURCE_SNAPSHOT_TEST_URL;
test('local snapshot uses original product session, exact people and read-only source scopes',{skip:!url},async t=>{
 assert.equal(new URL(url!).hostname,'127.0.0.1');assert.match(new URL(url!).pathname,/^\/source_snapshot_g71_[a-f0-9]+$/);
 const pool=new pg.Pool({connectionString:url}),enterpriseId=randomUUID(),sourceEnterprise=randomUUID(),instance='source-fixture',email='employee@fixture.invalid',personId=randomUUID();
 const dir=await mkdtemp(join(tmpdir(),'enterprise-snapshot-')),file=join(dir,'source.json'),config=join(dir,'config.json'),token=randomBytes(32).toString('hex');
 let checks=0;const ok=(v:unknown)=>{assert(v);checks++;};
 let api:ReturnType<typeof createImportServer>|undefined,proxy:ReturnType<typeof spawn>|undefined;
 try{
  for(const f of (await readdir(new URL('../migrations/',import.meta.url))).filter(f=>/^\d{3}-.*\.sql$/.test(f)).sort())await pool.query(await readFile(new URL('../migrations/'+f,import.meta.url),'utf8'));
  await pool.query('INSERT INTO enterprise_workflow.person_profiles(enterprise_id,person_id,real_name,nickname,source_instance,source_enterprise,source_subject)VALUES($1,$2,$3,$4,$5,$6,$7)',[enterpriseId,personId,'合成真名','合成花名',instance,sourceEnterprise,email]);
  const row=(kind:string,id:string)=>({ref:{instanceId:instance,enterpriseId:sourceEnterprise,kind,id},account:{sourceKey:JSON.stringify([instance,email]),email,name:'合成花名'},createdAt:'2026-10-23T01:00:00.000Z',title:'synthetic record',prompt:'synthetic prompt',status:'done',operation:'生成',sourceLabel:'只读来源',provenance:null,taskRefs:{imageJobId:null,canvasTaskId:null,videoTaskId:null,billingOperationId:null},credits:{quoted:null,charged:null,reserved:null,delta:null,refunded:null,settled:null,evidence:'unrecorded'},ledgerKind:null,ownership:'legacy-unconfirmed',attribution:{visibility:'current-enterprise-scope',businessOwnership:'unconfirmed',workflowTaskId:null},media:{available:false,href:null}});
  const bytes=await sharp({create:{width:32,height:32,channels:3,background:'#c8d9ed'}}).webp().toBuffer();
  const data:any={version:1,type:'enterprise-source-snapshot-v1',instanceId:instance,enterpriseId:sourceEnterprise,enterpriseName:'合成企业',origin:'https://fixture.invalid',observedAt:'2026-10-23T02:00:00.000Z',from:'2026-10-01',to:'2026-10-23',members:[{email,name:'合成花名'}],rows:{artworks:[row('artwork','a')],generations:[row('image-job','g')],ledger:[{...row('ledger','l'),ledgerKind:'refund',credits:{quoted:null,charged:null,reserved:null,delta:2,refunded:null,settled:null,evidence:'ledger-entry'}}]},limits:{artworks:{total:1,truncated:false},generations:{total:1,truncated:false},ledger:{total:1,truncated:false}},sourceReadOnly:true,sourceWrites:0,media:[{id:'a',email,mime:'image/webp',sha256:createHash('sha256').update(bytes).digest('hex'),base64:bytes.toString('base64')}]};
  const save=async()=>writeFile(file,JSON.stringify({sha256:createHash('sha256').update(JSON.stringify(data)).digest('hex'),data}));await save();
  api=createImportServer(new ImportStore(pool,enterpriseId,dir),token,{sourceSnapshotFile:file,sourceSnapshotRegistry:{instance,enterpriseId:sourceEnterprise,enterpriseName:'合成企业',origin:'https://fixture.invalid'}});await new Promise<void>(r=>api!.listen(0,'127.0.0.1',r));const apiPort=(api.address() as {port:number}).port;
  await writeFile(config,JSON.stringify({port:apiPort,token}));
  const socket=createServer();await new Promise<void>(r=>socket.listen(0,'127.0.0.1',r));const port=(socket.address() as {port:number}).port;await new Promise<void>(r=>socket.close(()=>r()));
  const root=resolve('../..'),proxyFile=process.env.SNAPSHOT_PROXY_FILE||resolve(root,'scripts/serve-enterprise-product.mjs');
  proxy=spawn(process.execPath,[proxyFile,String(port),'18491',config],{cwd:root,stdio:['ignore','pipe','pipe']});let stdout='';proxy.stdout!.on('data',b=>stdout+=b);
  for(let i=0;i<100&&!stdout.includes('PRODUCT_ENTRY_READY');i++)await new Promise(r=>setTimeout(r,30));ok(stdout.includes('PRODUCT_ENTRY_READY'));
  const base='http://127.0.0.1:'+port,endpoint=base+'/api/enterprise/imports?action=source-snapshot';
  const session=await fetch(base+'/api/enterprise/imports?action=session'),cookie=session.headers.get('set-cookie')!.split(';')[0],headers={cookie};
  const call=(op:string,args:Record<string,string>={})=>fetch(endpoint+'&'+new URLSearchParams({op,...args}),{headers});
  if(process.env.SNAPSHOT_EXPECT==='baseline'){ok((await call('context')).status===400);console.log(`SOURCE_SNAPSHOT_BASELINE_PASS: checks=${checks} endpoint=INVALID_ACTION snapshot_display=0`);return;}
  ok((await fetch(endpoint+'&op=context')).status===401);
  ok((await fetch(endpoint+'&op=context',{headers:{...headers,origin:'https://foreign.invalid'}})).status===403);
  ok((await fetch(endpoint+'&op=context',{headers:{...headers,'sec-fetch-site':'cross-site'}})).status===403);
  ok((await fetch(endpoint+'&op=context',{method:'POST',headers})).status===405);
  const c=await(await call('context')).json() as any;ok(c.preview.transport==='local-snapshot'&&c.viewer.name==='本机项目管理员');
  assert.deepEqual(c.preview.media,{available:true,records:1,total:1});checks++;
  ok((await call('records',{enterpriseId:randomUUID(),kind:'artworks'})).status===404);
  ok((await call('records',{enterpriseId:sourceEnterprise,kind:'artworks',email:'other@fixture.invalid'})).status===404);
  const members=await(await call('members',{enterpriseId:sourceEnterprise})).json() as any;ok(members.members[0].person.id===personId&&members.members[0].person.realName==='合成真名');
  const page=await(await call('records',{enterpriseId:sourceEnterprise,kind:'artworks',email:''})).json() as any;ok(page.total===1&&page.rows[0].account.person.id===personId&&page.rows[0].media.available);
  ok(page.rows[0].ownership==='legacy-unconfirmed'&&page.rows[0].credits.charged===null);
  const image=await fetch(base+page.rows[0].media.href,{headers});ok(image.status===200&&image.headers.get('content-type')==='image/webp'&&Buffer.from(await image.arrayBuffer()).equals(bytes));
  const mediaArgs={enterpriseId:sourceEnterprise,email,id:'a'},inline={...data.media[0]},mediaRoot=join(dir,'media'),diskFile=join(mediaRoot,inline.sha256);
  const expectError=async(op:string,args:Record<string,string>,status:number,error?:string)=>{const response=await call(op,args);assert.equal(response.status,status);if(error)assert.equal((await response.json() as any).error,error);checks++;};
  const expectBytes=async()=>{const response=await call('media',mediaArgs);ok(response.status===200&&response.headers.get('content-type')==='image/webp'&&Buffer.from(await response.arrayBuffer()).equals(bytes));};
  await mkdir(mediaRoot);await writeFile(diskFile,bytes);data.mediaRoot=mediaRoot;data.media=[{id:'a',email,mime:'image/webp',sha256:inline.sha256,file:inline.sha256}];await save();
  await expectBytes();
  for(const [op,args] of [['context',{}],['members',{enterpriseId:sourceEnterprise}],['records',{enterpriseId:sourceEnterprise,kind:'artworks'}]] as const){
   const response=await call(op,args),json=await response.json() as any,serialized=JSON.stringify(json);ok(response.status===200&&!serialized.includes(mediaRoot)&&!serialized.includes('"mediaRoot"')&&!serialized.includes('"file"')&&!serialized.includes('"base64"'));assert.deepEqual(json.preview.media,{available:true,records:1,total:1});checks++;
  }
  const changed=Buffer.from(bytes);changed[changed.length-1]^=1;await writeFile(diskFile,changed);await expectError('media',mediaArgs,409,'SOURCE_MEDIA_DIGEST_MISMATCH');await writeFile(diskFile,bytes);
  await unlink(diskFile);await expectError('media',mediaArgs,503,'SOURCE_MEDIA_UNAVAILABLE');await writeFile(diskFile,bytes);
  await writeFile(diskFile,Buffer.alloc(1024*1024+1));await expectError('media',mediaArgs,409,'SOURCE_MEDIA_DIGEST_MISMATCH');await writeFile(diskFile,bytes);
  const invalidBytes=Buffer.from('not a webp image'),invalidHash=createHash('sha256').update(invalidBytes).digest('hex');await writeFile(join(mediaRoot,invalidHash),invalidBytes);
  data.media[0]={...data.media[0],sha256:invalidHash,file:invalidHash};await save();await expectError('media',mediaArgs,409,'SOURCE_MEDIA_INVALID_WEBP');data.media[0]={id:'a',email,mime:'image/webp',sha256:inline.sha256,file:inline.sha256};await save();
  await t.test('media rejects a symbolic-link file',async st=>{
   const outside=join(dir,'outside.webp');await writeFile(outside,bytes);await unlink(diskFile);
   try{
    try{await symlink(outside,diskFile,'file');}catch(e){if(['EPERM','EACCES','ENOTSUP'].includes((e as NodeJS.ErrnoException).code||'')){st.skip('file symlinks are not available on this host');return;}throw e;}
    await expectError('media',mediaArgs,503,'SOURCE_MEDIA_UNAVAILABLE');
   }finally{await unlink(diskFile).catch(()=>{});await writeFile(diskFile,bytes);}
  });
  await t.test('media rejects a symbolic-link root',async st=>{
   const linkedRoot=join(dir,'linked-media');
   try{await symlink(mediaRoot,linkedRoot,process.platform==='win32'?'junction':'dir');}catch(e){if(['EPERM','EACCES','ENOTSUP'].includes((e as NodeJS.ErrnoException).code||'')){st.skip('directory symlinks are not available on this host');return;}throw e;}
   try{data.mediaRoot=linkedRoot;await save();await expectError('media',mediaArgs,503,'SOURCE_MEDIA_UNAVAILABLE');}
   finally{data.mediaRoot=mediaRoot;await save();}
  });
  data.mediaRoot='relative-media';await save();await expectError('context',{},400,'INVALID_INPUT');data.mediaRoot=mediaRoot;
  delete data.mediaRoot;await save();await expectError('context',{},409,'SOURCE_MEDIA_ROOT_REQUIRED');data.mediaRoot=mediaRoot;
  const disk={...data.media[0]};
  for(const item of [{...disk,base64:inline.base64},{id:'a',email,mime:'image/webp',sha256:inline.sha256},{...disk,file:'../'+inline.sha256},{...disk,file:'f'.repeat(64)},{...disk,path:diskFile}]){
   data.media=[item];await save();await expectError('context',{},400,'INVALID_INPUT');
  }
  for(const items of [[disk,disk],[{...disk,id:'foreign'}],[{...disk,id:'g'}],[{...disk,email:'unknown@fixture.invalid'}]]){
   data.media=items;await save();await expectError('context',{},409,'SOURCE_SNAPSHOT_MEDIA_SCOPE_MISMATCH');
  }
  data.media=[disk];await save();await expectError('media',{...mediaArgs,email:'unknown@fixture.invalid'},404,'SOURCE_MEMBER_NOT_FOUND');
  const artwork=data.rows.artworks[0];data.members.push({email:'unknown@fixture.invalid',name:'未知人员'});data.rows.artworks.push({...artwork,ref:{...artwork.ref,id:'unknown'},account:{...artwork.account,email:'unknown@fixture.invalid',sourceKey:JSON.stringify([instance,'unknown@fixture.invalid'])}});data.limits.artworks.total=2;data.media.push({...disk,id:'unknown',email:'unknown@fixture.invalid'});await save();
  const unknownPage=await(await call('records',{enterpriseId:sourceEnterprise,kind:'artworks'})).json() as any;ok(unknownPage.total===1&&unknownPage.rows[0].ref.id==='a');assert.deepEqual(unknownPage.preview.media,{available:true,records:1,total:1});checks++;
  await expectError('media',{...mediaArgs,email:'unknown@fixture.invalid',id:'unknown'},404,'SOURCE_MEMBER_NOT_FOUND');
  data.members.pop();data.rows.artworks.pop();data.limits.artworks.total=1;data.media=[disk];await save();
  for(const column of ['source_instance','source_enterprise']){
   await pool.query(`UPDATE enterprise_workflow.person_profiles SET ${column}=$1 WHERE enterprise_id=$2 AND person_id=$3`,[column==='source_instance'?'other-source':randomUUID(),enterpriseId,personId]);
   await expectError('media',mediaArgs,404,'SOURCE_MEMBER_NOT_FOUND');
   await pool.query(`UPDATE enterprise_workflow.person_profiles SET ${column}=$1 WHERE enterprise_id=$2 AND person_id=$3`,[column==='source_instance'?instance:sourceEnterprise,enterpriseId,personId]);
  }
  data.rows.artworks=Array.from({length:1000},(_,i)=>row('artwork','a'+i));data.limits.artworks.total=1000;data.media=data.rows.artworks.map((r:any)=>({...disk,id:r.ref.id}));await save();
  const full=await(await call('context')).json() as any;assert.deepEqual(full.preview.media,{available:true,records:1000,total:1000});checks++;
  data.media.push({...disk,id:'overflow'});await save();await expectError('context',{},400,'INVALID_INPUT');data.rows.artworks=[artwork];data.limits.artworks.total=1;data.media=[inline];delete data.mediaRoot;await save();
  await expectBytes();
  data.media=[{...inline,base64:invalidBytes.toString('base64'),sha256:invalidHash}];await save();await expectError('media',mediaArgs,409,'SOURCE_MEDIA_INVALID_WEBP');data.media=[inline];await save();
  ok((await call('media',{enterpriseId:sourceEnterprise,email,id:'foreign'})).status===404);
  ok((await call('records',{enterpriseId:sourceEnterprise,kind:'ledger',from:'2026-09-01'})).status===400);
  const ledger=await(await call('records',{enterpriseId:sourceEnterprise,kind:'ledger'})).json() as any;ok(ledger.rows[0].credits.delta===2&&ledger.rows[0].ledgerKind==='refund');
  ok((await call('records',{enterpriseId:sourceEnterprise,kind:'artworks',page:'2'})).status===200);
  data.rows.artworks[0].prompt='tampered';await writeFile(file,JSON.stringify({sha256:'a'.repeat(64),data}));ok((await call('context')).status===409);await save();
  data.rows.artworks.push({...data.rows.artworks[0],ref:{...data.rows.artworks[0].ref,kind:'image-job'}});await save();ok((await call('context')).status===409);data.rows.artworks.pop();
  data.limits.artworks.total=0;await save();ok((await call('context')).status===409);data.limits.artworks.total=1;
  data.from='2026-08-01';await save();ok((await call('context')).status===409);data.from='2026-10-01';
  data.origin='https://other.invalid';await save();ok((await call('context')).status===409);data.origin='https://fixture.invalid';await save();
  await pool.query('UPDATE enterprise_workflow.person_profiles SET enabled=false WHERE enterprise_id=$1',[enterpriseId]);
  const revoked=await(await call('records',{enterpriseId:sourceEnterprise,kind:'artworks'})).json() as any;ok(revoked.total===0&&revoked.rows.length===0);
  assert.deepEqual(revoked.preview.media,{available:false,records:0,total:0});checks++;
  ok((await call('media',{enterpriseId:sourceEnterprise,email,id:'a'})).status===404);
  ok((await pool.query('SELECT count(*)::int n FROM enterprise_workflow.accounts')).rows[0].n===0);
  console.log(`SOURCE_SNAPSHOT_HTTP_PASS: checks=${checks} session=1 cross_origin=1 tenant_scope=1 exact_person=1 null_charge=1 refund=1 private_media=1 disk_media=1 media_limit=1000 base64_compat=1 digest=1 revocation=1 permissions_written=0`);
 }finally{proxy?.kill();if(proxy?.exitCode===null)await once(proxy,'exit');if(api){api.closeAllConnections();await new Promise<void>(r=>api!.close(()=>r()));}await pool.end();}
});
