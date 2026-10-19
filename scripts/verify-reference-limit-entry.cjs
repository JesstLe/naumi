const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const mode=(process.argv[2]||'MODIFIED').toUpperCase(),root=path.resolve(process.argv[3]||'.'),limit=mode==='MODIFIED'?16:6;
function ast(n){const file=path.join(root,n);return ts.createSourceFile(file,fs.readFileSync(file,'utf8'),99,true)}
function numeric(n,key){const tree=ast(n);for(const item of tree.statements)if(ts.isVariableStatement(item))for(const d of item.declarationList.declarations)if(d.name.getText(tree)===key)return Number(d.initializer.getText(tree));throw Error('missing '+key)}
(async()=>{
 for(const [file,key]of [['src/app/api/generate-image/route.ts','MAX_IMAGES'],['src/components/canvas/canvas-client.tsx','MAX_TOTAL_IMAGES'],['src/components/generate/generate-client.tsx','MAX_IMAGES'],['src/components/fuse/fuse-client.tsx','MAX_IMAGES']])assert.equal(numeric(file,key),limit);
 const tree=ast('src/app/api/generate-image/route.ts'),fn=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='parseParams');assert(fn);
 const env={File,Request,FormData,Buffer,MAX_IMAGES:limit,currentImagegenStep:()=>null,parseCount:()=>1,parseIds:()=>[],provenanceEntry:()=> 'canvas',parseDimension:()=>0};
 vm.runInNewContext(ts.transpileModule(fn.getText(tree)+';globalThis.parseParamsFixture=parseParams;',{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,env);
 const form=new FormData();form.set('prompt','sixteen references');form.set('ratio','3:4');for(let i=0;i<16;i++)form.append('image',new File([new Uint8Array([i+1])],`reference-${i+1}.png`,{type:'image/png'}));
 const parsed=await env.parseParamsFixture(new Request('http://fixture/api/generate-image',{method:'POST',body:form}));assert.equal(parsed.images.length,limit);for(let i=0;i<limit;i++)assert.equal(parsed.images[i].buf[0],i+1);
 const legacy=fs.readFileSync(path.join(root,'src/lib/imagegen/legacy-frame-request.ts'),'utf8');assert(legacy.includes(`.slice(0, ${limit})`));
 console.log(`${mode}=PASS UI_LIMIT=${limit} REQUEST_FILES=16 PARSED_FILES=${parsed.images.length} LEGACY_SCAN_LIMIT=${limit} SUPPLIER_CALLS=0`);
})().catch(e=>{console.error(e);process.exitCode=1});
