/** Exercise the actual syntaxShape declaration without importing its CLI or application code.
 * Git-baseline and mandatory-copy modes load that same function from the selected source.
 * Parsed fixtures and a finite VM only; no application, database, HTTP or network work. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file='scripts/verify-fleet-business-docstrings.mjs';
const options=Object.fromEntries(process.argv.slice(2).map(arg=>{
  assert.match(arg,/^--(?:baseline|source-root|output-dir)=.+$/);const index=arg.indexOf('=');return [arg.slice(2,index),arg.slice(index+1)];
}));
if(options.baseline)assert.match(options.baseline,/^[a-f0-9]{40}$/);
assert.ok(!(options.baseline&&options['source-root']));
const sourceRoot=options['source-root']?path.resolve(options['source-root']):null;
assert.ok(!sourceRoot||sourceRoot!==ROOT);
const sourcePath=path.join(sourceRoot??ROOT,file);
const text=options.baseline?execFileSync('git',['show',options.baseline+':'+file],{cwd:ROOT,encoding:'utf8'}):await readFile(sourcePath,'utf8');
const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
assert.equal(source.parseDiagnostics.length,0);
const declarations=source.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='syntaxShape');
assert.equal(declarations.length,1,'load exactly the actual syntaxShape function');
const functionText=declarations[0].getText(source);
const syntaxShape=new vm.Script('('+functionText+')',{filename:file}).runInNewContext({ts});
const hash=value=>createHash('sha256').update(value).digest('hex');
const checks=[],cases=[];

/** Parse a finite TS/JS/JSX fixture and reject invalid syntax before comparing it. */
function parse(text,kind=ts.ScriptKind.TS){
  const tree=ts.createSourceFile(kind===ts.ScriptKind.TSX?'case.tsx':kind===ts.ScriptKind.JS?'case.js':'case.ts',text,ts.ScriptTarget.Latest,true,kind);
  assert.equal(tree.parseDiagnostics.length,0,text);return tree;
}

/** Compare hashes produced by the loaded function, preserving the full fixture result. */
function compare(name,left,right,equal,kind=ts.ScriptKind.TS){
  const a=parse(left,kind),b=parse(right,kind),before=hash(JSON.stringify(syntaxShape(a,a))),after=hash(JSON.stringify(syntaxShape(b,b)));
  checks.push({name,passed:(before===after)===equal});cases.push({name,left,right,expectedEqual:equal,actualEqual:before===after,before,after});
}

const keywords=['var','let','const','using','await using'];
for(let left=0;left<keywords.length;left++)for(let right=left+1;right<keywords.length;right++){
  compare('declaration '+keywords[left]+' vs '+keywords[right],`async function scope(){${keywords[left]} value=resource;consume(value);}`,`async function scope(){${keywords[right]} value=resource;consume(value);}`,false);
}
for(const[left,right]of [['var','let'],['var','const'],['let','const']]){
  compare('for-of '+left+' vs '+right,`for(${left} value of values){consume(value);}`,`for(${right} value of values){consume(value);}`,false);
}
compare('ordinary comments remain equivalent','const value=1;function read(){return value;}','/** Document value. */ const value=1;\n/** Read the value. */ function read(){/* unchanged */ return value;}',true);
compare('regex comments remain equivalent',String.raw`const pattern=/['"]/g;function test(value){return pattern.test(value);}`,String.raw`const pattern=/['"]/g;/** Test quoted input. */ function test(value){return pattern.test(value);}`,true,ts.ScriptKind.JS);
compare('JSX comments remain equivalent','const view=<div title="value">text</div>;','/** Render the value. */ const view=<div title="value">text</div>;',true,ts.ScriptKind.TSX);
compare('type-only import comments remain equivalent','import type {Value} from "./value";','/** Import the type. */ import type {Value} from "./value";',true);
compare('type-only import flag remains significant','import {Value} from "./value";','import type {Value} from "./value";',false);
compare('type-only export flag remains significant','export {Value} from "./value";','export type {Value} from "./value";',false);
compare('literal text remains significant','const value=1;','const value=2;',false);
compare('operator kind remains significant','const value=left+right;','const value=left-right;',false);
const plain=parse('let value=resource;'),contextual=parse('let value=resource;');
const list=contextual.statements[0].declarationList,flagsBefore=list.flags;
list.flags|=ts.NodeFlags.AwaitContext|ts.NodeFlags.JSDoc;
assert.notEqual(list.flags,flagsBefore);
const contextEqual=JSON.stringify(syntaxShape(plain,plain))===JSON.stringify(syntaxShape(contextual,contextual));
checks.push({name:'non-declaration parser flags remain ignored',passed:contextEqual});
cases.push({name:'non-declaration parser flags remain ignored',flagsBefore,flagsAfter:list.flags,expectedEqual:true,actualEqual:contextEqual});

const failures=checks.filter(check=>!check.passed),result=failures.length?(options.baseline?'REPRODUCED':'FAIL'):'PASS';
const literal=`FLEET_BUSINESS_DOCSTRING_SHAPE=${result} assertions=${checks.length} failures=${failures.length} ACTUAL_FUNCTION=1 FINITE_VM=1 NETWORK=0`;
const record={result,exitStatus:failures.length?1:0,sourceMode:options.baseline?'git-baseline':sourceRoot?'mandatory-copy':'working-tree',sourceOrigin:options.baseline?'git:'+options.baseline+':'+file:sourcePath,sourceSHA256:hash(text),functionSHA256:hash(functionText),scriptSHA256:hash(await readFile(fileURLToPath(import.meta.url))),typescriptVersion:ts.version,checks,cases,literalOutput:literal};
const OUT=path.resolve(options['output-dir']??path.join(ROOT,'output/fleet-business-docstring-shape'));
await mkdir(OUT,{recursive:true});const output=path.join(OUT,options.baseline?'BASELINE_RESULT.json':sourceRoot?'ROLLBACK_RESULT.json':'MODIFIED_RESULT.json');
await writeFile(output,JSON.stringify(record,null,2)+'\n');assert.equal(JSON.parse(await readFile(output,'utf8')).literalOutput,literal);
console.log(literal);if(failures.length)console.log('FAILED='+failures.map(check=>check.name).join('; '));process.exitCode=record.exitStatus;
