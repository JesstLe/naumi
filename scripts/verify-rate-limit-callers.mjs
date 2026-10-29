import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const base = process.argv[2] || '956b7238fa375e992e0ac594c47cdba5c9d95f50';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32*1024*1024, windowsHide: true });
const paths = git('ls-files','src').trim().split('\n').filter(p=>/\.tsx?$/.test(p));
const parse = (p,s) => ts.createSourceFile(p,s,ts.ScriptTarget.Latest,true);
const calls = (a,names) => { const found=[]; const visit=n=>{if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&names.includes(n.expression.text))found.push(n);ts.forEachChild(n,visit);};visit(a);return found; };
const inventory=[];let awaited=0,httpChecks=0,rawChecks=0;
const rawFiles = new Set(['src/app/api/admin/team-access/route.ts','src/app/api/enterprise/workflow/source/route.ts','src/lib/fleet/release-auth.ts','src/lib/fleet/server.ts']);
const graph = new Map(), moduleData = new Map();
function nameOf(n,a) { return n.name?.getText(a) || (ts.isVariableDeclaration(n.parent)?n.parent.name.getText(a):'<callback@'+(a.getLineAndCharacterOfPosition(n.getStart()).line+1)+'>'); }
for(const p of paths){
  const current=fs.readFileSync(p,'utf8'),a=parse(p,current),functions=new Map(),imports=new Map();
  const data={p,a,functions,imports,refs:[]};moduleData.set(path.resolve(p),data);
  for(const s of a.statements)if(ts.isImportDeclaration(s)&&s.importClause?.namedBindings&&ts.isNamedImports(s.importClause.namedBindings)){
    const target=ts.resolveModuleName(s.moduleSpecifier.text,path.resolve(p),{moduleResolution:ts.ModuleResolutionKind.Bundler,baseUrl:process.cwd(),paths:{'@/*':['src/*']}},ts.sys).resolvedModule?.resolvedFileName;
    if(target)for(const e of s.importClause.namedBindings.elements)if(!e.isTypeOnly)imports.set(e.name.text,{target:path.resolve(target),name:(e.propertyName||e.name).text});
  }
  const walk=(n,parentId)=>{
    let id=parentId;
    if(ts.isFunctionLike(n)&&n.body){id=p+'#'+nameOf(n,a);functions.set(nameOf(n,a),id);graph.set(id,graph.get(id)||new Set());if(parentId)graph.get(parentId).add(id);}
    if(id&&ts.isIdentifier(n)&&n!==n.parent.name)data.refs.push([id,n.text]);
    ts.forEachChild(n,c=>walk(c,id));
  };walk(a,null);
  if(!/\brateLimit\b|\bcheckRateLimit\b/.test(current)||/src\/lib\/rate-limit(?:-http|-store)?\.ts$/.test(p))continue;
  let original;try{original=git('show',base+':'+p);}catch{continue;}
  const oldA=parse(p,original),oldCalls=calls(oldA,['rateLimit']);if(!oldCalls.length)continue;
  const newCalls=calls(a,['rateLimit','checkRateLimit']);assert.equal(newCalls.length,oldCalls.length,p);
  for(let i=0;i<oldCalls.length;i++){
    const before=oldCalls[i],after=newCalls[i];
    assert.deepEqual(after.arguments.map(x=>x.getText(a)),before.arguments.map(x=>x.getText(oldA)),p+' key/limit/window changed');
    assert.ok(ts.isAwaitExpression(after.parent),p+' missing await');awaited++;
    let fn=after.parent;while(fn&&!ts.isFunctionLike(fn))fn=fn.parent;
    assert.ok(fn?.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword),p+' non-async caller');
    if(after.expression.text==='checkRateLimit'){
      httpChecks++; const decl=after.parent.parent;assert.ok(ts.isVariableDeclaration(decl),p);
      const statement=decl.parent.parent,siblings=statement.parent.statements,index=siblings.indexOf(statement),guard=siblings[index+1],limitGuard=siblings[index+2];
      assert.ok(ts.isIfStatement(guard)&&guard.expression.getText(a)===decl.name.getText(a)+' instanceof Response',p+' unavailable response not tested');
      assert.ok(ts.isReturnStatement(guard.thenStatement)&&guard.thenStatement.expression.getText(a)===decl.name.getText(a),p+' unavailable response not returned');
      assert.ok(ts.isIfStatement(limitGuard)&&limitGuard.expression.getText(a)==='!'+decl.name.getText(a),p+' quota response missing');
      let oldIf=before.parent;while(oldIf&&!ts.isIfStatement(oldIf))oldIf=oldIf.parent;
      assert.equal(limitGuard.thenStatement.getText(a),oldIf.thenStatement.getText(oldA),p+' original exhaustion semantics changed');
      if(ts.isBinaryExpression(oldIf.expression))assert.equal(statement.parent.parent.expression.getText(a),oldIf.expression.left.getText(oldA),p+' short circuit changed');
    }else{rawChecks++;assert.ok(rawFiles.has(p),p+' raw exception path not audited');}
    inventory.push({path:p,line:a.getLineAndCharacterOfPosition(after.getStart()).line+1,caller:nameOf(fn,a),arguments:before.arguments.map(x=>x.getText(oldA)),mapping:after.expression.text==='checkRateLimit'?'immediate 503 Response; original false branch':'await; teamFailure/fleetFailure typed 503',id:p+'#'+nameOf(fn,a)});
  }
}
assert.equal(awaited,82);assert.equal(httpChecks,78);assert.equal(rawChecks,4);
// Include raw exception helpers' actual common error mapper, not a generic 500.
for(const p of ['src/lib/teams/access.ts','src/lib/fleet/server.ts'])assert.match(fs.readFileSync(p,'utf8'),/const unavailable = rateLimitFailureResponse\(error\);\s*if \(unavailable\) return unavailable;/);
// Resolve direct, imported and callback references, including route wrappers.
for(const data of moduleData.values())for(const [id,name]of data.refs){const imported=data.imports.get(name);const target=imported?moduleData.get(imported.target)?.functions.get(imported.name):data.functions.get(name);if(target&&target!==id)graph.get(id).add(target);}
const reverse=new Map();for(const [from,targets]of graph)for(const target of targets){if(!reverse.has(target))reverse.set(target,new Set());reverse.get(target).add(from);}
for(const item of inventory){const seen=new Set([item.id]),queue=[item.id];for(let i=0;i<queue.length;i++)for(const parent of reverse.get(queue[i])||[])if(!seen.has(parent)){seen.add(parent);queue.push(parent);}item.reachableCallers=[...seen].sort();delete item.id;}
// Ensure no other src import of the primitive was missed or left unawaited,
// even if a future caller aliases the exported name.
for(const data of moduleData.values())for(const [alias,imp]of data.imports){if(!/[/\\]rate-limit(?:-http)?\.ts$/.test(imp.target)||!['rateLimit','checkRateLimit'].includes(imp.name))continue;
  for(const call of calls(data.a,[alias]))assert.ok(ts.isAwaitExpression(call.parent),data.p+' unawaited imported limiter');
}
const protectedFiles=['src/lib/auth-login-limit.ts','src/app/api/auth/login/route.ts','src/lib/db/connection.ts','package.json','package-lock.json'];
const hash=s=>createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex');
for(const p of protectedFiles)assert.equal(hash(fs.readFileSync(p,'utf8')),hash(git('show',base+':'+p)),p+' protected source changed');
fs.mkdirSync('output/a15',{recursive:true});fs.writeFileSync('output/a15/CALLER_INVENTORY.json',JSON.stringify({base,actualCalls:awaited,files:new Set(inventory.map(i=>i.path)).size,inventory,protectedFiles},null,2));
console.log(`CALLERS PASS actual_calls=${awaited} files=${new Set(inventory.map(i=>i.path)).size} awaited=82 immediate_503=78 typed_error_503=4 key_limit_window_unchanged=82 original_excess_branch_unchanged=78`);
console.log('CALLERS GRAPH direct_imported_callback_edges=RECORDED auth_login_pg_guard=UNCHANGED pool_factory=UNCHANGED dependencies=UNCHANGED');
