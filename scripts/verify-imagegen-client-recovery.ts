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
 assert.equal(posts,1,'a lost acceptance reply must never authorize another paid POST');assert.equal(plans,1);assert.equal(gets,1,'retry checks the exact original operation');
 const pending=[...storage.values.entries()].filter(([key])=>key.startsWith('naumi:imagegen-pending:v1:'));assert.equal(pending.length,1);
 const saved=JSON.parse(pending[0][1]);assert.equal(saved.operationId,ids[0]);assert.equal(saved.request.operationId,ids[0]);assert.equal(saved.accepted,'unknown');assert.equal(storage.length,2,'legacy receipt untouched; new scoped receipt retained');
 globalThis.fetch=async()=>Response.json({error:'explicit rejection',accepted:false},{status:400});
 await assert.rejects(startImagegen(imagegenRequestSchema.parse({version:1,operationId:crypto.randomUUID(),entry:'canvas',mode:'generate',prompt:'x'})),(e:any)=>e instanceof ImagegenHttpError&&e.accepted===false);
 console.log('CLIENT_RETRY=PASS LEGACY_RECEIPT_UNTOUCHED=1 ORIGINAL_GETS=1 PAID_POSTS=1 SAME_OPERATION=1 SCOPED_RECEIPT_RETAINED=1 SUPPLIER_CALLS=0');
}finally{globalThis.fetch=original}}
main().catch(e=>{console.error(e);process.exitCode=1});
