/** Structural checks only; runtime behavior has separate PG/process verifiers. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const require=createRequire(import.meta.url),ts=require('typescript');
const index=process.argv.indexOf('--source-root');
export const root=path.resolve(index<0?fileURLToPath(new URL('..',import.meta.url)):process.argv[index+1]);
export const source=file=>readFileSync(path.join(root,file),'utf8');
export function declaration(file,name){
 const tree=ts.createSourceFile(file,source(file),ts.ScriptTarget.Latest,true);
 const node=tree.statements.find(n=>n.name?.text===name);
 assert.ok(node,`${file}: ${name} declaration`);return node.getText(tree);
}
export function actualPublicView(){
 const body=declaration('src/lib/video/queries.ts','publicVideoTaskView');
 const js=ts.transpileModule(body,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 // Evaluate only the actual pure projection, without importing live dependencies.
 const exports={};new Function('exports',js)(exports);return exports.publicVideoTaskView;
}
