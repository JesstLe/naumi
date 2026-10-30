// Read-only tracked-source architecture inventory. Does not load application modules.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=process.cwd(),out=path.resolve(process.argv[2]||'output/architecture-review-20261024');
const ts=require(process.env.TYPESCRIPT_PATH||'typescript');
const git=(...a)=>cp.execFileSync('git',a,{cwd:root,encoding:'utf8',maxBuffer:40*1024*1024});
const tracked=[...new Set(git('ls-files','-z').split('\0').filter(Boolean))],set=new Set(tracked);
const code=tracked.filter(f=>/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(f)&&!f.endsWith('.d.ts'));
const posix=s=>s.replace(/\\/g,'/');
function group(f){
 if(f.startsWith('src/lib/')){const a=f.slice(8).split('/');return a.length>1?'lib/'+a[0]:'lib/_root';}
 if(f.startsWith('src/components/'))return 'ui/'+f.slice(15).split('/')[0].replace(/\.(tsx?|jsx?)$/,'');
 if(f.startsWith('src/app/api/'))return 'api/'+f.slice(12).split('/')[0];
 if(f.startsWith('src/app/'))return 'app/'+f.slice(8).split('/')[0];
 if(f.startsWith('services/'))return f.split('/').slice(0,2).join('/');
 return f.split('/')[0];
}
function resolve(from,spec){
 let raw;
 if(spec.startsWith('@/'))raw='src/'+spec.slice(2);
 else if(spec.startsWith('.'))raw=path.posix.normalize(path.posix.join(path.posix.dirname(from),spec));
 else return undefined;
 const options=[raw];
 if(/\.(m?js|cjs)$/.test(raw))options.push(raw.replace(/\.(m?js|cjs)$/,'.ts'),raw.replace(/\.js$/,'.tsx'));
 for(const ext of ['.ts','.tsx','.js','.jsx','.mjs','.cjs','.json','.css','.d.ts'])options.push(raw+ext);
 for(const ext of ['.ts','.tsx','.js','.mjs','.cjs'])options.push(raw+'/index'+ext);
 return options.find(p=>set.has(p));
}
const files=[],edges=[],unresolved=[],dynamic=[],literals=[];
for(const f of code){
 const text=fs.readFileSync(path.join(root,f),'utf8'),sf=ts.createSourceFile(f,text,ts.ScriptTarget.Latest,true);
 const meta={file:f,group:group(f),lines:text.length?text.split(/\r?\n/).length-(text.endsWith('\n')?1:0):0,bytes:Buffer.byteLength(text),sha256:crypto.createHash('sha256').update(text).digest('hex'),useClient:sf.statements.some(s=>ts.isExpressionStatement(s)&&ts.isStringLiteral(s.expression)&&s.expression.text==='use client'),functions:0,exports:0,stateHooks:0,effectHooks:0,contextReads:0};
 const add=(node,spec,kind,typeOnly=false)=>{const line=sf.getLineAndCharacterOfPosition(node.getStart(sf)).line+1,to=resolve(f,spec);if(to)edges.push({from:f,to,spec,kind,typeOnly,line});else if(spec.startsWith('.')||spec.startsWith('@/'))unresolved.push({from:f,spec,kind,line});};
 function visit(n){
  if(ts.isImportDeclaration(n)&&ts.isStringLiteral(n.moduleSpecifier)){
   const c=n.importClause;const typeOnly=!!c?.isTypeOnly||!!(c&&!c.name&&c.namedBindings&&ts.isNamedImports(c.namedBindings)&&c.namedBindings.elements.length&&c.namedBindings.elements.every(e=>e.isTypeOnly));
   add(n,n.moduleSpecifier.text,'import',typeOnly);
  }
  if(ts.isExportDeclaration(n)&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier))add(n,n.moduleSpecifier.text,'export',!!n.isTypeOnly);
  if(ts.isCallExpression(n)){
   const e=n.expression,name=ts.isIdentifier(e)?e.text:ts.isPropertyAccessExpression(e)?e.name.text:'';
   if(e.kind===ts.SyntaxKind.ImportKeyword||name==='require'){
    const a=n.arguments[0];if(a&&ts.isStringLiteralLike(a))add(n,a.text,e.kind===ts.SyntaxKind.ImportKeyword?'dynamic-import':'require');else dynamic.push({from:f,line:sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1,expression:n.getText(sf).slice(0,140)});
   }
   if(name==='useState'||name==='useReducer')meta.stateHooks++;
   if(name==='useEffect'||name==='useLayoutEffect')meta.effectHooks++;
   if(name==='useContext'||/^current[A-Z]/.test(name))meta.contextReads++;
  }
  if(ts.isFunctionDeclaration(n)||ts.isMethodDeclaration(n)||ts.isArrowFunction(n)||ts.isFunctionExpression(n))meta.functions++;
  if(n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))meta.exports++;
  ts.forEachChild(n,visit);
 }
 visit(sf);files.push(meta);
}
const srcFiles=files.filter(f=>f.file.startsWith('src/')),srcSet=new Set(srcFiles.map(f=>f.file));
const srcEdges=edges.filter(e=>srcSet.has(e.from)&&srcSet.has(e.to));
const runtimeEdges=srcEdges.filter(e=>!e.typeOnly),staticEdges=runtimeEdges.filter(e=>e.kind!=='dynamic-import');
function graph(es){const g=new Map([...srcSet].map(f=>[f,new Set()]));for(const e of es)g.get(e.from).add(e.to);return g;}
function scc(g){let next=0,stack=[],on=new Set(),idx=new Map(),low=new Map(),out=[];function scan(v){idx.set(v,next);low.set(v,next++);stack.push(v);on.add(v);for(const w of g.get(v)||[]){if(!idx.has(w)){scan(w);low.set(v,Math.min(low.get(v),low.get(w)));}else if(on.has(w))low.set(v,Math.min(low.get(v),idx.get(w)));}if(low.get(v)===idx.get(v)){let a=[],w;do{w=stack.pop();on.delete(w);a.push(w);}while(w!==v);if(a.length>1||(g.get(v)||new Set()).has(v))out.push(a.sort());}}for(const v of g.keys())if(!idx.has(v))scan(v);return out.sort((a,b)=>b.length-a.length);}
const rg=graph(runtimeEdges),sg=graph(staticEdges),incoming=new Map([...srcSet].map(f=>[f,new Set()]));
for(const e of runtimeEdges)incoming.get(e.to).add(e.from);
function reverseReach(v){const found=new Set(),todo=[v];while(todo.length){for(const a of incoming.get(todo.pop())||[])if(!found.has(a)){found.add(a);todo.push(a);}}found.delete(v);return found.size;}
const metrics=srcFiles.map(f=>({...f,fanIn:incoming.get(f.file).size,fanOut:rg.get(f.file).size,reverseReach:reverseReach(f.file)}));
const groupMap=new Map();for(const e of runtimeEdges){const a=group(e.from),b=group(e.to);if(a===b)continue;const k=a+' -> '+b;if(!groupMap.has(k))groupMap.set(k,{from:a,to:b,edges:0,consumers:new Set()});const x=groupMap.get(k);x.edges++;x.consumers.add(e.from);}
const moduleEdges=[...groupMap.values()].map(x=>({...x,consumers:x.consumers.size})).sort((a,b)=>b.edges-a.edges);
const counts={};for(const f of tracked){const a=f.split('/')[0];counts[a]=(counts[a]||0)+1;}
const packageJson=JSON.parse(fs.readFileSync('package.json','utf8'));
const summary={commit:git('rev-parse','HEAD').trim(),root,method:'Tracked files only; TS AST import/export/dynamic import/literal require. Runtime graph excludes syntax-explicit type-only imports; mixed imports retained, not compiler-elision proof. Lines include comments/blanks. SCC is static dependency risk, not evidence of runtime deadlock. SQL/string HTTP/runtime plugin edges analyzed separately.',trackedFiles:tracked.length,topLevel:counts,parsedCodeFiles:files.length,sourceCodeFiles:srcFiles.length,sourceLines:srcFiles.reduce((s,f)=>s+f.lines,0),apiRoutes:srcFiles.filter(f=>f.file.startsWith('src/app/api/')&&/\/route\.[jt]sx?$/.test(f.file)).length,sourceImportSites:srcEdges.length,sourceRuntimeImportSites:runtimeEdges.length,uniqueRuntimeEdges:[...rg.values()].reduce((s,x)=>s+x.size,0),explicitTypeOnlySites:srcEdges.filter(e=>e.typeOnly).length,staticScc:scc(sg),runtimeScc:scc(rg),topLines:[...metrics].sort((a,b)=>b.lines-a.lines).slice(0,30),topFanIn:[...metrics].sort((a,b)=>b.fanIn-a.fanIn).slice(0,25),topFanOut:[...metrics].sort((a,b)=>b.fanOut-a.fanOut).slice(0,25),libToApp:runtimeEdges.filter(e=>e.from.startsWith('src/lib/')&&e.to.startsWith('src/app/')),libToUI:runtimeEdges.filter(e=>e.from.startsWith('src/lib/')&&e.to.startsWith('src/components/')),libToScripts:edges.filter(e=>e.from.startsWith('src/lib/')&&e.to.startsWith('scripts/')),moduleEdges:moduleEdges.slice(0,70),unresolvedLocal:unresolved,computedImports:dynamic,packageScripts:Object.keys(packageJson.scripts).length,verifyScripts:Object.keys(packageJson.scripts).filter(k=>k.startsWith('verify:')).length,dependencies:Object.keys(packageJson.dependencies).length,devDependencies:Object.keys(packageJson.devDependencies).length};
// Separate syntactic imports from imports that survive TypeScript erasure.
// This still is not bundle tree-shaking or runtime reachability evidence.
const emitted=[];
for(const f of srcFiles){
 const input=fs.readFileSync(path.join(root,f.file),'utf8');
 const js=ts.transpileModule(input,{fileName:f.file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.Preserve,isolatedModules:true}}).outputText;
 const sf=ts.createSourceFile(f.file+'.emitted.js',js,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 function add(spec,kind){const to=resolve(f.file,spec);if(srcSet.has(to))emitted.push({from:f.file,to,spec,kind});}
 function visit(n){
  if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier))add(n.moduleSpecifier.text,'static');
  if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(n.expression)&&n.expression.text==='require')&&n.arguments[0]&&ts.isStringLiteralLike(n.arguments[0]))add(n.arguments[0].text,n.expression.kind===ts.SyntaxKind.ImportKeyword?'dynamic':'static');
  ts.forEachChild(n,visit);
 }visit(sf);
}
summary.emittedStaticScc=scc(graph(emitted.filter(e=>e.kind==='static')));summary.emittedAllScc=scc(graph(emitted));
const efan=new Map([...srcSet].map(f=>[f,new Set()]));for(const e of emitted)efan.get(e.to).add(e.from);
summary.emittedTopFanIn=[...efan].map(([file,users])=>({file,fanIn:users.size})).sort((a,b)=>b.fanIn-a.fanIn).slice(0,20);
summary.emittedImportSites=emitted.length;
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'SUMMARY.json'),JSON.stringify(summary,null,2));fs.writeFileSync(path.join(out,'FILES.json'),JSON.stringify(files,null,2));fs.writeFileSync(path.join(out,'DEPENDENCIES.json'),JSON.stringify(edges,null,2));fs.writeFileSync(path.join(out,'MODULE_EDGES.json'),JSON.stringify(moduleEdges,null,2));
fs.writeFileSync(path.join(out,'EMITTED_DEPENDENCIES.json'),JSON.stringify(emitted,null,2));
console.log(JSON.stringify({commit:summary.commit,trackedFiles:summary.trackedFiles,sourceFiles:summary.sourceCodeFiles,sourceLines:summary.sourceLines,apiRoutes:summary.apiRoutes,importSites:summary.sourceImportSites,runtimeEdges:summary.uniqueRuntimeEdges,staticCycles:summary.staticScc.map(x=>x.length),allImportCycles:summary.runtimeScc.map(x=>x.length),libToApp:summary.libToApp.length,libToUI:summary.libToUI.length,localUnresolved:summary.unresolvedLocal.length,verifyCommands:summary.verifyScripts},null,2));
console.log('TOP_LINES');for(const f of summary.topLines.slice(0,16))console.log(f.lines,f.fanIn,f.fanOut,f.file);
console.log('TOP_FANIN');for(const f of summary.topFanIn.slice(0,16))console.log(f.fanIn,f.reverseReach,f.file);
console.log('LAYER_INVERSION');for(const e of [...summary.libToApp,...summary.libToUI,...summary.libToScripts])console.log(e.from+':'+e.line,'->',e.to,e.kind);
console.log('EMITTED_STATIC_CYCLES',summary.emittedStaticScc.map(a=>a.length));console.log('EMITTED_ALL_CYCLES',summary.emittedAllScc.map(a=>a.length));
