import assert from 'node:assert/strict';
import {submitCanvasImagegen} from '../src/lib/imagegen/canvas-client';
import {startImagegen,ImagegenHttpError} from '../src/lib/imagegen/client';
import {imagegenRequestSchema} from '../src/lib/imagegen/schema';
class MemoryStorage implements Storage {values=new Map<string,string>();get length(){return this.values.size}key(i:number){return [...this.values.keys()][i]??null}getItem(k:string){return this.values.get(k)??null}setItem(k:string,v:string){this.values.set(k,v)}removeItem(k:string){this.values.delete(k)}clear(){this.values.clear()}}
async function main(){const original=globalThis.fetch,storage=new MemoryStorage();Object.assign(globalThis,{sessionStorage:storage,window:{localStorage:new MemoryStorage(),confirm:()=>true}});storage.setItem('naumi:imagegen-node:fixture%40local.test:P:node-A',JSON.stringify({id:crypto.randomUUID(),nodeId:'node-A'}));let posts=0,gets=0,plans=0;const ids:string[]=[];
try{globalThis.fetch=async(input,init)=>{const url=String(input);if(url.endsWith('/plan')){plans++;return Response.json({request:JSON.parse(String(init?.body)),steps:[{operation:'generate'}],intent:{background:null},totalCredits:6,billingVersion:8,modelVersion:125,warnings:[],confirmationRequired:false})}if(init?.method==='POST'){posts++;ids.push(JSON.parse(String(init.body)).operationId);throw Error('fixture network failure')}gets++;throw Error('unexpected automatic query')};
 const f=new FormData();f.set('prompt','fixture');f.set('ratio','1:1');f.set('imagegenNodeId','node-A');
 await assert.rejects(submitCanvasImagegen(f,'source',undefined,{owner:'fixture@local.test',project:'P'}));
 await assert.rejects(submitCanvasImagegen(f,'source',undefined,{owner:'fixture@local.test',project:'P'}));
 assert.equal(posts,2);assert.equal(plans,2);assert.equal(gets,0);assert.notEqual(ids[0],ids[1]);assert.equal(storage.length,1,'old receipt ignored, no new receipt writes');
 globalThis.fetch=async()=>Response.json({error:'explicit rejection',accepted:false},{status:400});
 await assert.rejects(startImagegen(imagegenRequestSchema.parse({version:1,operationId:crypto.randomUUID(),entry:'canvas',mode:'generate',prompt:'x'})),(e:any)=>e instanceof ImagegenHttpError&&e.accepted===false);
 console.log('CLIENT_RETRY=PASS OLD_RECEIPT_IGNORED=1 AUTOMATIC_GETS=0 EXPLICIT_POSTS=2 DIFFERENT_IDS=1 RECEIPT_WRITES=0 SUPPLIER_CALLS=0');
}finally{globalThis.fetch=original}}
main().catch(e=>{console.error(e);process.exitCode=1});
