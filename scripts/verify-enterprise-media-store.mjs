/** Deterministic baseline/modified/rollback probe; no real database, source or listeners. */
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const sharp=createRequire(new URL('../services/enterprise-workflow/package.json',import.meta.url))('sharp');
const {LocalSourceSnapshot}=await import(pathToFileURL(process.argv[2]).href),expected=process.argv[3];
assert(['supported','unsupported'].includes(expected));
const dir=await mkdtemp(join(tmpdir(),'media-store-probe-')),file=join(dir,'source.json'),mediaRoot=join(dir,'media');
const {mkdir}=await import('node:fs/promises');await mkdir(mediaRoot);
const instance='fixture-source',enterprise='12345678-1234-4234-8234-123456789abc',email='member@fixture.invalid';
const bytes=await sharp({create:{width:32,height:32,channels:3,background:'#81a3cc'}}).webp().toBuffer(),sha256=createHash('sha256').update(bytes).digest('hex');await writeFile(join(mediaRoot,sha256),bytes);
const row={ref:{instanceId:instance,enterpriseId:enterprise,kind:'artwork',id:'a'},account:{sourceKey:JSON.stringify([instance,email]),email,name:'Fixture'},createdAt:'2026-10-23T01:00:00.000Z',title:'Fixture',prompt:null,status:null,operation:null,sourceLabel:null,provenance:null,taskRefs:{imageJobId:null,canvasTaskId:null,videoTaskId:null,billingOperationId:null},credits:{quoted:null,charged:null,reserved:null,delta:null,refunded:null,settled:null,evidence:'unrecorded'},ledgerKind:null,ownership:'legacy-unconfirmed',attribution:{visibility:'current-enterprise-scope',businessOwnership:'unconfirmed',workflowTaskId:null},media:{available:false,href:null}};
const data={version:1,type:'enterprise-source-snapshot-v1',instanceId:instance,enterpriseId:enterprise,enterpriseName:'Fixture Enterprise',origin:'https://fixture.invalid',observedAt:'2026-10-23T02:00:00.000Z',from:'2026-10-01',to:'2026-10-23',members:[{email,name:'Fixture'}],rows:{artworks:[row],generations:[],ledger:[]},limits:{artworks:{total:1,truncated:false},generations:{total:0,truncated:false},ledger:{total:0,truncated:false}},sourceReadOnly:true,sourceWrites:0,mediaRoot,media:[{id:'a',email,mime:'image/webp',sha256,file:sha256}]};
const save=()=>writeFile(file,JSON.stringify({sha256:createHash('sha256').update(JSON.stringify(data)).digest('hex'),data}));await save();
let queries=0;const pool={query:async(sql,args)=>{queries++;assert(sql.startsWith('SELECT person_id'));assert.deepEqual(args,[enterprise,instance,enterprise]);return {rows:[{person_id:enterprise,real_name:'Fixture',nickname:'Alias',source_subject:email}]};}};
const store=new LocalSourceSnapshot(pool,enterprise,file,{instance,enterpriseId:enterprise,enterpriseName:data.enterpriseName,origin:data.origin});
let supported=false;
try{const value=await store.read({op:'media',enterpriseId:enterprise,email,id:'a'});assert(value.bytes.equals(bytes));supported=true;}catch(e){if(expected==='supported')throw e;assert.equal(e.name,'ZodError');}
assert.equal(supported,expected==='supported');
data.media=[{id:'a',email,mime:'image/webp',sha256,base64:bytes.toString('base64')}];await save();
assert((await store.read({op:'media',enterpriseId:enterprise,email,id:'a'})).bytes.equals(bytes));
console.log(`MEDIA_FILE_PROBE: disk=${supported?'supported':'unsupported'} base64=ok writes=0`);
