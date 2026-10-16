const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path'),ts=require('typescript'),sharp=require('sharp');
const dir=path.resolve(process.argv[2]),source=fs.readFileSync(path.join(dir,'MODIFIED_FILE.js'),'utf8'),ast=ts.createSourceFile('chunk.js',source,99,true,ts.ScriptKind.JS),parts=[];
function visit(n){if(ts.isFunctionDeclaration(n)&&['X','T','U','V','Z','$'].includes(n.name?.text))parts.push(n.getText(ast));if(ts.isVariableDeclaration(n)&&['__frameSharp','__naumiFrame'].includes(n.name.getText(ast)))parts.push('const '+n.getText(ast)+';');ts.forEachChild(n,visit);}visit(ast);
let prompt='';const input=fs.readFileSync(path.join(dir,'EDGE_FIXTURE.png'));
const ctx=vm.createContext({Buffer,console,c:{t:()=>({default:sharp})},j:{wA:url=>({bytes:Buffer.from(url.split(',')[1],'base64')})},I:{ay:async()=>''},R:()=>"fixture",S:()=>"fixture-ratio",ae:async f=>f(),an:['fixture'],N:{Ue:async(_m,_i,f)=>f(),I0:class Pending extends Error{},DH:()=>false},M:{generateNewApiImage:async p=>{prompt=p.prompt;return {buffer:input,contentType:'image/png'}}}});
vm.runInContext(parts.join('\n')+';globalThis.test={flow:X,shape:Z,frame:__naumiFrame};',ctx);
(async()=>{
 const p={ratio:'9:16',images:[{buf:input,type:'image/png'}],count:1,prompt:'fixture',compiledPrompt:'frozen fixture prompt',transparent:false,targetWidth:0,targetHeight:0};
 const result=await ctx.test.flow(p,'fixture',{});assert.equal(result.length,1);assert.match(prompt,/9:16/);assert.match(prompt,/安全边距/);assert.match(prompt,/frozen fixture prompt/);
 assert.equal(result[0].url.split(',')[1],input.toString('base64'));
 for(const ratio of ['auto','1:1','2:3','3:2','3:4','4:3','9:16','16:9']){
  const output=(await ctx.test.shape([{url:result[0].url}],{...p,ratio}))[0];assert.equal(output.url,result[0].url);
 }
 console.log('RUNTIME_MATRIX=PASS RATIOS=8 CHAT_PROMPT=SAFE_FRAME COMPILED_PROMPT=PRESERVED PIXELS=EXACT SUPPLIER_CALLS=0 EXIT=0');
})().catch(e=>{console.error(e);process.exitCode=1});
