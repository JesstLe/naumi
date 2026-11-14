import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {NextResponse} from 'next/server';
import {ModelConfigError} from '../src/lib/model-config/types';
import {TeamError} from '../src/lib/teams/errors';
import {VideoContractError} from '../src/lib/video/contract';

// A pure unit test of the actual private response mapper, extracted by AST.
// No authorization, repository, route action or other I/O is replaced/executed.
async function main(){
 const root=path.resolve(process.env.VIDEO_NODE_ERROR_SOURCE_ROOT||process.cwd());let cases=0;
 for(const file of ['src/app/api/canvas/video-nodes/route.ts','src/app/api/canvas/video-nodes/[id]/route.ts']){
  const source=ts.createSourceFile(file,readFileSync(path.join(root,file),'utf8'),ts.ScriptTarget.Latest,true);
  const mapper=source.statements.find((node):node is ts.FunctionDeclaration=>ts.isFunctionDeclaration(node)&&node.name?.text==='failure');assert(mapper);
  const code=ts.transpileModule(mapper.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const failure=new Function('NextResponse','ModelConfigError','TeamError','VideoContractError',code+';return failure;')(NextResponse,ModelConfigError,TeamError,VideoContractError) as (error:unknown)=>Response;
  const contract=failure(new VideoContractError('REFERENCE_UNAVAILABLE','素材身份与地址不一致',['references'])),body=await contract.json();
  console.log('VIDEO_NODE_ERROR_PROBE='+JSON.stringify({file,status:contract.status,code:body.code??null,fields:body.fields??null}));
  if(process.argv.includes('--probe'))continue;
  assert.equal(contract.status,422);assert.equal(body.code,'REFERENCE_UNAVAILABLE');assert.deepEqual(body.fields,['references']);cases++;
  const conflict=failure(new ModelConfigError('VIDEO_NODE_REVISION_CONFLICT','revision',409));assert.equal(conflict.status,409);assert.equal((await conflict.json()).code,'VIDEO_NODE_REVISION_CONFLICT');cases++;
  const denied=failure(new TeamError('denied',403));assert.equal(denied.status,403);cases++;
  const unexpected=failure(new Error('internal detail'));assert.equal(unexpected.status,503);assert.equal(JSON.stringify(await unexpected.json()).includes('internal detail'),false);cases++;
 }
 console.log('VIDEO_NODE_CONTRACT_ERRORS='+ (process.argv.includes('--probe')?'PROBE':'PASS')+' CASES='+cases+' IO=0');
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
