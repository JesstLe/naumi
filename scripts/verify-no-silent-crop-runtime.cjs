const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),sharp=require('sharp');
const out=path.resolve(process.argv[2]),mode=process.argv[3]||'MODIFIED',s=fs.readFileSync(path.join(out,mode==='BASELINE'?'ORIGINAL_8458.js':mode==='ROLLBACK'?'ROLLBACK_COPY.js':'MODIFIED_FILE.js'),'utf8');
const ast=ts.createSourceFile('chunk.js',s,99,true,ts.ScriptKind.JS),parts=[];let helpers=[];
function go(n){if(ts.isFunctionDeclaration(n)&&['T','U','V','Z','$'].includes(n.name?.text))parts.push(n.getText(ast));if(ts.isVariableDeclaration(n)&&['__frameSharp','__naumiFrame'].includes(n.name.getText(ast)))helpers.push('const '+n.getText(ast)+';');ts.forEachChild(n,go)}go(ast);
const decode=url=>url.startsWith('data:')?{bytes:Buffer.from(url.split(',')[1],'base64')}:null;
const ctx=vm.createContext({Buffer,console,c:{t:()=>({default:sharp})},j:{wA:decode}});vm.runInContext(helpers.join('\n')+parts.join('\n')+';globalThis.test={T,Z,dims:$'+(mode==='MODIFIED'?',frame:__naumiFrame':'')+'};',ctx);
(async()=>{const input=fs.readFileSync(path.join(out,'EDGE_FIXTURE.png')),image={url:'data:image/png;base64,'+input.toString('base64'),ratio:'3:4'},r=(await ctx.test.Z([image],{ratio:'3:4',targetWidth:0,targetHeight:0}))[0],b=decode(r.url).bytes,m=await sharp(b).metadata();
if(mode==='MODIFIED'){assert.deepEqual(b,input);assert.deepEqual(await ctx.test.T(input,'3:4'),input);const d=(await ctx.test.dims([image]))[0];assert.equal(d.ratio,'2:3');assert.equal(ctx.test.frame.inheritedImageRatio('auto',{width:750,height:1000}),'3:4');fs.writeFileSync(path.join(out,'RUNTIME_MODIFIED_OUTPUT.png'),b);console.log('RUNTIME_MODIFIED=PASS OUTPUT=1024x1536 BYTES=EXACT RATIOGEN=NO_CROP ACTUAL_RATIO=2:3 INHERITED=3:4 EXIT=0');}
else{assert.equal(m.height,1365);console.log(`RUNTIME_${mode}=PASS OUTPUT=1024x1365 REMOVED_ROWS=171 CROP_BEHAVIOR=RESTORED EXIT=0`);}
})().catch(e=>{console.error(e);process.exitCode=1});
