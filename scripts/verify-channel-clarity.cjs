const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript'),vm=require('node:vm'),cp=require('node:child_process');
const file=process.argv[2]||'src/components/admin/model-management/model-management.tsx',mode=process.argv[3]||'modified';
const source=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
const {readManagement}=require('./verification/model-management-source.cjs'),{modular,owners,changedSessionFunctions}=readManagement(file);
if(mode==='baseline'){
 assert(source.includes('disabled={mode==="priority"}'));
 assert(source.includes('{channels.map(c=>'));
 console.log('BASELINE=REPRODUCED ALL_CHANNELS=INLINE WEIGHT=VISIBLE_DISABLED RUNTIME=INLINE');
}else{
 assert((modular?owners:source).includes('<ChannelPolicyEditor row={row}'));
 const editor=fs.readFileSync('src/components/admin/model-management/channel-policy-editor.tsx','utf8');
 assert(editor.includes('mode !== "priority" && <label>'));
 assert(editor.includes('<details className={styles.inactive}>'));
 assert(editor.includes('<details className={styles.runtime}>'));
 const original=cp.execFileSync('git',['show',(modular?'70c50b2243a1789e0666a5f6d0786eccdc708203':'e99e1d2b827ba41448178d75cfa874776bda3f37')+':src/components/admin/model-management/model-management.tsx'],{encoding:'utf8'}).replace(/\r\n/g,'\n');
 const ast=s=>ts.createSourceFile('x.tsx',s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const functionMap=s=>{const m=new Map();const visit=n=>{if(ts.isFunctionDeclaration(n)&&n.name)m.set(n.name.text,n.getText().replace(/\s+/g,' '));ts.forEachChild(n,visit)};visit(ast(s));return m;};
 const old=modular?require('./verification/model-management-source.cjs').functionMap(original):functionMap(original),now=modular?require('./verification/model-management-source.cjs').functionMap(owners):functionMap(source);
 for(const [name,body]of old)if(!(modular?['ModelManagement','run']:['ChannelsDialog']).includes(name)&&!changedSessionFunctions.has(name))assert.equal(now.get(name),body,'unchanged '+name);
 const setup=s=>s.slice(s.indexOf(' const [mode,setMode]'),s.indexOf(' return <Dialog title="供应通道与分流"'));
 assert.equal(setup(modular?owners:source),setup(original),'channel state, candidate compatibility filter and validation preserved');
 const load=p=>{const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:m,exports:m.exports});return m.exports};
 const {orderedChannels,orderedRoutes}=load('src/components/admin/model-management/channel-display.ts');
 const channels=[{upstreamId:'a',priority:2,weight:3,enabled:true},{upstreamId:'b',priority:1,weight:9,enabled:true},{upstreamId:'c',priority:1,weight:1,enabled:true},{upstreamId:'d',priority:3,weight:1,enabled:false}],before=JSON.stringify(channels);
 assert.equal(orderedChannels(channels).map(c=>c.upstreamId).join(','),'b,c,a,d');assert.equal(JSON.stringify(channels),before);
 const row={routes:channels.map(c=>({upstreamId:c.upstreamId,enabled:c.enabled})),supplierRouting:{mode:'priority',channels}};
 assert.equal(orderedRoutes(row,true).map(r=>r.upstreamId).join(','),'b,c,a');assert.equal(orderedRoutes(row,false).length,1);
 const scheduler=ts.createSourceFile('s.ts',fs.readFileSync('src/lib/model-config/channel-scheduler.ts','utf8'),ts.ScriptTarget.Latest,true);
 const compare=scheduler.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='compareChannels');const m={exports:{}};
 vm.runInNewContext(ts.transpileModule(compare.getText(),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:m.exports,module:m});
 const runtimeOrder=channels.filter(c=>c.enabled).map((c,index)=>({...c,index,served:0n})).sort((a,b)=>m.exports.compareChannels(a,b,'priority')).map(c=>c.upstreamId).join(',');
 assert.equal(runtimeOrder,orderedRoutes(row,true).map(r=>r.upstreamId).join(','));
 console.log('MODIFIED=PASS ORDER=MATCHES_PRIORITY_SCHEDULER TIES=ORIGINAL_ORDER MUTATION=NONE CANDIDATE_FILTER=UNCHANGED PAYLOAD=UNCHANGED OTHER_DIALOGS=UNCHANGED');
}
console.log('SUPPLIER_CALLS=0 EXIT=0');
