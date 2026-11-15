import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {ModelConfigError} from '../src/lib/model-config/types';
import {VideoContractError} from '../src/lib/video/contract';
import {safeError} from '../src/lib/api-error';

async function main(){
 const root=path.resolve(process.env.COMFY_ERROR_SOURCE_ROOT||process.cwd()),file='src/lib/comfyui/run.ts',source=ts.createSourceFile(file,readFileSync(path.join(root,file),'utf8'),ts.ScriptTarget.Latest,true);
 const owner=source.statements.find((node):node is ts.FunctionDeclaration=>ts.isFunctionDeclaration(node)&&node.name?.text==='executeComfyRun');assert(owner?.body);
 const statement=owner.body.statements.find((node):node is ts.TryStatement=>ts.isTryStatement(node));assert(statement?.catchClause);
 const body=statement.catchClause.block.getText(source),code=ts.transpileModule('async function mapped(error:unknown,creationRecord?:string){const email="fixture";'+body.slice(1,-1)+'}',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const finished:any[]=[];const mapped=new Function('ModelConfigError','VideoContractError','safeError','finishCreation','reply',code+';return mapped;')(ModelConfigError,VideoContractError,safeError,async(...args:any[])=>finished.push(args),(body:any,options:any)=>({body,status:options.status||200})) as (error:unknown,creationRecord?:string)=>Promise<any>;
 const contract=await mapped(new VideoContractError('WORKFLOW_MODE_CONFLICT','工作流意图不匹配',['intentPreference']));console.log('COMFY_VIDEO_ERROR_PROBE='+JSON.stringify(contract));
 if(process.argv.includes('--probe'))return;
 let cases=0;assert.equal(contract.status,422);assert.deepEqual(contract.body,{error:'工作流意图不匹配',code:'WORKFLOW_MODE_CONFLICT',fields:['intentPreference'],accepted:false});cases++;
 const structural=await mapped(new VideoContractError('WORKFLOW_STRUCTURE_NOT_MAPPED','缺少结构映射',['shots']));assert.equal(structural.status,422);assert.deepEqual(structural.body.fields,['shots']);assert.equal(structural.body.accepted,false);cases++;
 const conflict=await mapped(new ModelConfigError('OPERATION_CONFLICT','原操作冲突',409));assert.equal(conflict.status,409);assert.equal(conflict.body.accepted,false);cases++;
 const accepted=await mapped(new VideoContractError('PARAMETER_MAPPING_MISSING','映射缺失',['camera']),'original-creation');assert.equal(accepted.status,422);assert(!Object.hasOwn(accepted.body,'accepted'));assert(finished.some(row=>row[0]==='original-creation'&&row[2]==='needs_review'));cases++;
 const unknown=await mapped(new Error('private endpoint credential detail'));assert.equal(unknown.status,502);assert.deepEqual(unknown.body,{error:'工作流执行失败'});assert(!JSON.stringify(unknown).includes('private endpoint'));cases++;
 const impostor=await mapped({code:'WORKFLOW_MODE_CONFLICT',message:'private endpoint'});assert.equal(impostor.status,502);assert(!Object.hasOwn(impostor.body,'code'));cases++;
 console.log('COMFY_VIDEO_CONTRACT_ERRORS=PASS CASES='+cases+' ACTUAL_CATCH_AST=1 ROUTE_OR_DB_CALLS=0');
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
