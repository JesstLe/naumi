import assert from "node:assert/strict";
import {readFile,access} from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
import vm from "node:vm";
import {pathToFileURL} from "node:url";
import ts from "typescript";
import type {Pool} from "pg";
import {PERSISTENCE_OWNERS,type PersistenceOwner} from "./persistence-owner-fixture";

/** Test-only access to the six old private SQL initializers. The original cache,
 * constants and function body are evaluated unchanged; DB/dependency functions
 * are actual source-root imports. No runtime business implementation is replaced. */
export function persistenceOwnerLoader(root:string,modern:boolean){
 const loaded=new Map<string,Promise<(pool?:Pool)=>Promise<unknown>>>(),projections:{file:string;name:string;sha256:string}[]=[];
 const load=(f:string)=>import(pathToFileURL(path.join(root,f)).href);
 async function resolve(owner:PersistenceOwner){
  if(owner.queryOnly){
   if(modern)return (await load(owner.to))[owner.newName] as (pool?:Pool)=>Promise<unknown>;
   const copy=(await load(owner.from)).copyCanvasNodes;return async()=>{await assert.rejects(copy("absent@fixture.test",{operationId:"11111111-1111-4111-8111-111111111111",ids:["missing-node-fixture"]}),e=>(e as {code?:string}).code==="CANVAS_NODE_UNAVAILABLE");};
  }
  if(modern)return (await load(owner.to))[owner.newName] as (pool?:Pool)=>Promise<unknown>;
  if(owner.publicName)return (await load(owner.from))[owner.publicName] as (pool?:Pool)=>Promise<unknown>;
  const text=await readFile(path.join(root,owner.from),"utf8"),sf=ts.createSourceFile(owner.from,text,ts.ScriptTarget.Latest,true),fn=sf.statements.find((n):n is ts.FunctionDeclaration=>ts.isFunctionDeclaration(n)&&n.name?.text===owner.name);assert.ok(fn);
  const declarations=sf.statements.filter(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>ts.isIdentifier(d.name)&&["ready","schema","competitorSchema","PROVIDER_CATALOG_SQL"].includes(d.name.text))).map(n=>n.getText(sf));
  const source=declarations.join("\n")+"\n"+fn.getText(sf)+`\nexport {${owner.name} as run};`;
  const evaluated={exports:{}},ports:Record<string,unknown>={module:evaluated,exports:evaluated.exports,console};
  if(/\bgetPool\b/.test(source))ports.getPool=(await load("src/platform/db/pool.ts")).getPool;
  if(/\bensureSchema\b/.test(source))ports.ensureSchema=(await load("src/lib/persistence/schema.ts")).ensureSchema;
  if(/\bensureVideoNodeSchema\b/.test(source))ports.ensureVideoNodeSchema=(await load("src/lib/canvas/video-node-repository.ts")).ensureVideoNodeSchema;
  if(/\bensureVideoWorkflowSchema\b/.test(source))ports.ensureVideoWorkflowSchema=(await load("src/lib/video/workflow.ts")).ensureVideoWorkflowSchema;
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,ports,{filename:owner.from});
  projections.push({file:owner.from,name:owner.name,sha256:createHash("sha256").update(fn.getText(sf)).digest("hex")});return (evaluated.exports as {run:(pool?:Pool)=>Promise<unknown>}).run;
 }
 return {projections,async all(pool:Pool){const owners=[...PERSISTENCE_OWNERS];if(modern&&await access(path.join(root,"src/lib/canvas/character-node-schema.ts")).then(()=>true,()=>false))owners.push({from:"src/lib/canvas/character-node-repository.ts",to:"src/lib/canvas/storage-schema.ts",name:"ensureCharacterNodeSchema",newName:"ensureCharacterNodeSchema"});if(modern&&(await readFile(path.join(root,"src/lib/canvas/storage-schema.ts"),"utf8")).includes("export async function ensureCanvasImageVersionSchema"))owners.push({from:"src/lib/canvas/image-version-store.ts",to:"src/lib/canvas/storage-schema.ts",name:"ensureCanvasImageVersionSchema",newName:"ensureCanvasImageVersionSchema"});if(modern&&await access(path.join(root,"src/lib/canvas/scene-node-schema.ts")).then(()=>true,()=>false))owners.push({from:"src/lib/canvas/scene-node-repository.ts",to:"src/lib/canvas/storage-schema.ts",name:"ensureSceneNodeSchema",newName:"ensureSceneNodeSchema"});if(modern&&await access(path.join(root,"src/lib/canvas/audio-node-schema.ts")).then(()=>true,()=>false))owners.push({from:"src/lib/canvas/audio-node-repository.ts",to:"src/lib/canvas/storage-schema.ts",name:"ensureAudioNodeSchema",newName:"ensureAudioNodeSchema"});for(const owner of owners){const key=owner.from+":"+owner.name;let pending=loaded.get(key);if(!pending){pending=resolve(owner);loaded.set(key,pending);}const fn=await pending;assert.equal(typeof fn,"function",key);await fn(owner.pool?pool:undefined);}}};
}
