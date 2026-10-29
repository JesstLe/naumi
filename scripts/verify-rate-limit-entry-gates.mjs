// Executes all migrated admission gates extracted from actual caller ASTs.
// Complements (does not replace) the real route + real PG matrix.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import ts from 'typescript';

const root=process.cwd(),out=path.resolve('output/a15'),require=createRequire(import.meta.url);
const inventory=JSON.parse(fs.readFileSync(path.join(out,'CALLER_INVENTORY.json'),'utf8')).inventory;
await build({stdin:{contents:`export {RateLimitUnavailableError} from './src/lib/rate-limit';export {rateLimitFailureResponse} from './src/lib/rate-limit-http';`,resolveDir:root,loader:'ts'},outfile:path.join(out,'gate-errors.cjs'),bundle:true,platform:'node',format:'cjs',packages:'external',plugins:[{name:'server-only',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'empty'}));b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:''}));}}]});
const {RateLimitUnavailableError,rateLimitFailureResponse}=require(path.join(out,'gate-errors.cjs'));
const {NextResponse}=require('next/server');
class DomainError extends Error {constructor(message,status=400){super(message);this.status=status;this.code=message;}}
const json=(body,status=200)=>NextResponse.json(body,{status});
const bindings={NextResponse,Response,json,teamJson:json,fleetJson:json,biJson:json,accessJson:json,headers:{'cache-control':'private, no-store'},WorkspaceError:DomainError,IntegrationError:DomainError,FleetError:DomainError,email:'fixture@example.test'};
let total=0;
for(const p of new Set(inventory.map(i=>i.path))){
  const source=fs.readFileSync(p,'utf8'),a=ts.createSourceFile(p,source,ts.ScriptTarget.Latest,true),nodes=[];
  const visit=n=>{if(ts.isCallExpression(n)&&['rateLimit','checkRateLimit'].includes(n.expression.getText(a)))nodes.push(n);ts.forEachChild(n,visit);};visit(a);
  for(const call of nodes){
    const http=call.expression.getText(a)==='checkRateLimit';let statement=call.parent;while(!ts.isStatement(statement))statement=statement.parent;
    let body;
    if(http){const siblings=statement.parent.statements,index=siblings.indexOf(statement);body=source.slice(statement.getStart(),siblings[index+2].end);}
    else body=statement.getText(a);
    body=body.replace(call.getText(a),call.expression.getText(a)+'("fixture", 1, 1000)');
    const make=(check,raw)=>new Function(...Object.keys(bindings),'checkRateLimit','rateLimit',`return async function(){${body}\nreturn {business:true};}`)(...Object.values(bindings),check,raw);
    for(const mode of ['admit','exhaust','unavailable']){
      let resolve,reject;const gate=new Promise((r,j)=>{resolve=r;reject=j;});let settled=false;
      const running=make(()=>gate,()=>gate)().then(value=>({value}),error=>({error}));running.then(()=>{settled=true;});
      await Promise.resolve();assert.equal(settled,false,p+' advanced before await');
      if(mode==='unavailable'){const error=new RateLimitUnavailableError();if(http)resolve(rateLimitFailureResponse(error));else reject(error);}
      else resolve(mode==='admit');
      const result=await running;
      if(mode==='admit'){assert.ok(result.value&&!(result.value instanceof Response),p+' admitted path blocked');}
      else if(mode==='exhaust'){
        if(p==='src/app/api/admin/team-access/route.ts')assert.equal(result.value,null,p+' preserve existing guard result');
        else assert.equal(result.value?.status||result.error?.status,429,p+' original exhaustion');
      }else{
        const response=http?result.value:rateLimitFailureResponse(result.error);
        assert.equal(response.status,503,p+' backend fault');assert.equal((await response.json()).code,'RATE_LIMIT_UNAVAILABLE');
      }
    }
    total++;
  }
}
assert.equal(total,82);
console.log('ENTRY_GATES PASS actual_call_sites=82 cases=246 deferred_await=82 admitted=82 exhausted_original=82 unavailable_503=82 business_after_failure=0');
console.log('ENTRY_GATES evidence=actual_AST_gate_fixture full_route_evidence=verify-distributed-rate-limit.mjs');
