/** Execute the actual verifier's timestamp producer and enqueue expressions
 * extracted with TypeScript AST, under an isolated VM clock. This is a fixture
 * data-flow check, not a simulated claim of real PG/HTTP or slow CI execution. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),OUT=path.join(ROOT,'output/fleet-business-enqueue-clock-20261105');
const baseline=process.argv.find(a=>a.startsWith('--baseline='))?.slice(11),copyArg=process.argv.find(a=>a.startsWith('--source-root='))?.slice(14);
const copy=copyArg?path.resolve(copyArg):undefined,baselineMode=Boolean(baseline||process.argv.includes('--expect-baseline'));
assert.ok(process.argv.slice(2).every(a=>a.startsWith('--baseline=')||a.startsWith('--source-root=')||a==='--expect-baseline'));
assert.ok(!(baseline&&copy));if(baseline)assert.match(baseline,/^[a-zA-Z0-9_./-]+$/);assert.ok(!copy||copy!==ROOT);assert.ok(!process.argv.includes('--expect-baseline')||copy);
const files=['scripts/verify-fleet-business-control-priority.ts','scripts/verify-fleet-business-queue-compat.ts'];
const sha=b=>createHash('sha256').update(b).digest('hex'),sourceSHA256={},sourceOrigins={},sources=[];
for(const file of files){const origin=copy?path.join(copy,file):path.join(ROOT,file);const text=baseline?execFileSync('git',['show',baseline+':'+file],{cwd:ROOT,encoding:'utf8'}):await readFile(origin,'utf8');sourceSHA256[file]=sha(text);sourceOrigins[file]=baseline?'git:'+baseline:origin;sources.push(ts.createSourceFile(origin,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS));}
const checks=[],normal=[],explicit=[];const check=(passed,name)=>checks.push({name,passed:Boolean(passed)});
function find(root,predicate){const values=[];function visit(node){if(predicate(node))values.push(node);ts.forEachChild(node,visit);}visit(root);return values;}
const [source,caller]=sources,fn=find(source,n=>ts.isFunctionDeclaration(n)&&n.name?.text==='verifyFleetBusinessControlPriority')[0];assert.ok(fn);
const producers=find(fn,n=>ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&['read','readAt'].includes(n.name.text));assert.equal(producers.length,1);
const producer=producers[0],name=producer.name.text;assert.ok(producer.initializer);
const calls=find(fn,n=>ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.expression.getText(source)==='service'&&n.expression.name.text==='enqueueCommand');
const references=node=>ts.isIdentifier(node)&&node.text===name;
const factoryCall=node=>ts.isCallExpression(node)&&references(node.expression);
for(const call of calls){const argument=call.arguments[3];if(!argument)continue;
 if(references(argument)||factoryCall(argument)&&argument.arguments.length===0)normal.push(argument);
 else if(factoryCall(argument)&&argument.arguments.length===1)explicit.push({argument,asOf:argument.arguments[0]});
 else if(ts.isObjectLiteralExpression(argument)&&argument.properties.some(p=>ts.isSpreadAssignment(p)&&references(p.expression))){const at=argument.properties.find(p=>ts.isPropertyAssignment(p)&&p.name.getText(source)==='asOf');if(at)explicit.push({argument,asOf:at.initializer});}
}
check(normal.length===5,'all five normal enqueue call sites are inspected');check(explicit.length===6,'all six explicit expiry/fresh/invalid inputs are inspected');
const T0=Date.UTC(2026,10,5,0,0,0),ADVANCE=105000;let clock=T0;
class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
const context=vm.createContext({Date:ClockDate,f:{asOf:new Date(T0).toISOString()}});
const compile=text=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
vm.runInContext(compile('const '+name+' = '+producer.initializer.getText(source)+';'),context,{timeout:1000});
const evaluate=expression=>vm.runInContext(compile('('+expression+')'),context,{timeout:1000});
const observations=[];
for(const argument of normal){const expression=argument.getText(source),line=source.getLineAndCharacterOfPosition(argument.getStart(source)).line+1;
 clock=T0;const first=evaluate(expression),firstAsOf=first.asOf;clock=T0+ADVANCE;const later=evaluate(expression);
 check(firstAsOf===new Date(T0).toISOString(),'normal line '+line+' starts with the current instant');
 check(later.asOf===new Date(clock).toISOString(),'normal line '+line+' refreshes asOf after 105 seconds');
 check(first!==later,'normal line '+line+' creates an independent command object');
 check(first.asOf===firstAsOf,'normal line '+line+' does not mutate its previously returned command');
 observations.push({line,expression,firstAsOf,laterAsOf:later.asOf,laterAgeMs:clock-Date.parse(later.asOf),independent:first!==later});
}
clock=T0+ADVANCE;const offsets={'-120000':0,'-60000':0,'0':0,invalid:0},expiry=[];
for(const item of explicit){const text=item.asOf.getText(source),compact=text.replace(/\s/g,''),value=evaluate(item.argument.getText(source));let expected;
 if(compact==='newDate(Date.now()-120000).toISOString()'){expected=-120000;offsets['-120000']++;}
 else if(compact==='newDate(Date.now()-60000).toISOString()'){expected=-60000;offsets['-60000']++;}
 else if(compact==='newDate().toISOString()'){expected=0;offsets['0']++;}
 else if(ts.isStringLiteral(item.asOf)){offsets.invalid++;check(value.asOf===item.asOf.text,'explicit invalid timestamp stays an invalid input');expiry.push({expression:text,invalidPreserved:true});continue;}
 else{check(false,'unrecognized explicit timestamp expression: '+text);continue;}
 check(value.asOf===new Date(clock+expected).toISOString(),'explicit '+expected+'ms timestamp is preserved');expiry.push({expression:text,offsetMs:expected,asOf:value.asOf});
}
check(JSON.stringify(offsets)===JSON.stringify({'-120000':1,'-60000':1,'0':3,invalid:1}),'stale120s, stale60s, three explicit fresh and invalid cases remain distinct');
const fixture=find(source,n=>ts.isTypeAliasDeclaration(n)&&n.name.text==='Fixture')[0];assert.ok(fixture&&ts.isTypeLiteralNode(fixture.type));
check(!fixture.type.members.some(m=>m.name?.getText(source)==='asOf'),'Fixture has no shared run-wide asOf input');
const uses=find(fn,n=>ts.isPropertyAccessExpression(n)&&n.expression.getText(source)==='f'&&n.name.text==='asOf');check(uses.length===0,'verifier no longer reads f.asOf');
const invocation=find(caller,n=>ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='verifyFleetBusinessControlPriority');assert.equal(invocation.length,1);const options=invocation[0].arguments[0];assert.ok(ts.isObjectLiteralExpression(options));
check(!options.properties.some(p=>p.name?.getText(caller)==='asOf'),'queue compatibility caller no longer constructs a shared asOf');
const failures=checks.filter(c=>!c.passed),result=failures.length?(baselineMode?'REPRODUCED':'FAIL'):'PASS',exit=failures.length?1:0;
const literal=`FLEET_BUSINESS_ENQUEUE_CLOCK=${result} assertions=${checks.length} failures=${failures.length} NORMAL_SITES=${normal.length} EXPLICIT_SITES=${explicit.length} ADVANCE_MS=${ADVANCE} REAL_SOURCE_AST_VM=1 PG=0 HTTP=0 NETWORK=0`;
const record={result,exitStatus:exit,layer:'actual verifier AST timestamp expressions in isolated VM clock; not full PG/HTTP',sourceMode:copy?'actual-restored-copy':baseline?'git-baseline':'working-tree',sourceSHA256,sourceOrigins,scriptSHA256:sha(await readFile(fileURLToPath(import.meta.url))),checks,observations,expiry,offsetCounts:offsets,literalOutput:literal};
await mkdir(OUT,{recursive:true});const output=path.join(OUT,copy?'ROLLBACK_RESULT.json':baseline?'BASELINE_RESULT.json':'MODIFIED_RESULT.json');await writeFile(output,JSON.stringify(record,null,2)+'\n');assert.equal(JSON.parse(await readFile(output,'utf8')).literalOutput,literal);console.log(literal);if(failures.length)console.log('FAILED='+failures.map(c=>c.name).join('; '));process.exitCode=exit;
