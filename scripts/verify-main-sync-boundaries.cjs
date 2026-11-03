/** Read-only actual-source contract. Reuse the established TypeScript/emit graph
 * analyser; absence of cycles is a boundary guard, not runtime acceptance. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

const root=process.cwd();
const out=path.resolve(process.env.MAIN_SYNC_BOUNDARY_EVIDENCE||'output/main-sync-boundaries');
fs.mkdirSync(out,{recursive:true});
const args=['scripts/architecture/analyze.cjs',path.join(out,'architecture')];
const analysed=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true});
fs.writeFileSync(path.join(out,'ANALYSER_COMMAND.json'),JSON.stringify({command:[process.execPath,...args],cwd:root,exit:analysed.status,stdout:analysed.stdout,stderr:analysed.stderr},null,2)+'\n');
assert.equal(analysed.status,0,analysed.stderr||analysed.stdout);
const graph=JSON.parse(fs.readFileSync(path.join(out,'architecture/SUMMARY.json'),'utf8'));
const classes=['staticScc','runtimeScc','emittedStaticScc','emittedAllScc'];
for(const name of classes)assert.deepEqual(graph[name],[],`${name}: actual source dependencies must remain acyclic`);

const text=file=>fs.readFileSync(path.join(root,file),'utf8');
const context=text('src/components/collaboration/collaboration-context.ts');
assert.match(context,/createContext/);
assert.match(context,/entrySnapshot/);
assert.doesNotMatch(context,/from\s+["'][^"']*(?:collaboration-provider|collaboration-window)["']/);
for(const file of ['chat-thread','collaboration-window','members-panel','message-composer','message-content','share-panel']){
 const source=text(`src/components/collaboration/${file}.tsx`);
 assert.match(source,/from\s+["']\.\/collaboration-context["']/);
 assert.doesNotMatch(source,/from\s+["']\.\/collaboration-provider["']/);
}
const provider=text('src/components/collaboration/collaboration-provider.tsx');
assert.equal((provider.match(/new CollaborationClient\(/g)||[]).length,1,'the composition owns exactly one client');
assert.match(provider,/<CollaborationContext\.Provider/);

const result={status:'PASS',source:graph.commit,classes:Object.fromEntries(classes.map(name=>[name,graph[name].length])),
 parsedSourceFiles:graph.sourceCodeFiles,clientOwner:'CollaborationProvider',consumerPort:'collaboration-context',
 runtime:false,production:false,method:'actual TypeScript imports plus emitted static/dynamic graph; narrow UI binding assertions'};
fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n');
console.log('MAIN_SYNC_BOUNDARIES=PASS STATIC_SCC=0 RUNTIME_SCC=0 EMITTED_STATIC_SCC=0 EMITTED_ALL_SCC=0 COLLABORATION_CLIENTS=1 RUNTIME_ACCEPTANCE=SEPARATE');
