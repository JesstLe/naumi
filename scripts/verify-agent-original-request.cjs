const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'.'),baseline=process.argv.includes('--baseline');
(async()=>{let checks=0;for(const tool of ['replicate','retouch','suite','aplus']){
 const file=path.join(root,'src/app/api',tool,'route.ts'),source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
 const fn=ast.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==='parseInput');assert.ok(fn);
 const code=ts.transpileModule(fn.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const parse=vm.runInNewContext(code+'\nparseInput',{Buffer,File,JSON,Set,Array,String,requestImageQuality:()=> 'medium',OPTIONS:{gloss:'gloss',clarity:'clarity'},APLUS_MODULES:{hero:'hero'},APLUS_FORMATS:['aplus-web'],validCanvasRatio:()=>true});
 for(const length of [100,1200,8000]){const form=new FormData();const original='保留用户原始要求：'+'文'.repeat(length)+'最终保留卖点';form.append('text',original);form.append('image',new File([new Uint8Array([1])],'fixture.png',{type:'image/png'}));form.append('format','aplus-web');
 const parsed=await parse(new Request('http://fixture.invalid/api/'+tool,{method:'POST',body:form}));assert.equal(parsed.extra,original.slice(0,baseline?['replicate','retouch'].includes(tool)?400:600:6000));checks++;}
}console.log(`AGENT_ORIGINAL_REQUEST=${baseline?'BASELINE_REPRODUCED':'PASS'} CHECKS=${checks} REAL_MULTIPART_PARSERS=4 TEXT_LIMIT=${baseline?'400_OR_600':'6000'} SUPPLIER_CALLS=0`);})().catch(e=>{console.error(e);process.exitCode=1});
