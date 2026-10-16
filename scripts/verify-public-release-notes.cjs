const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm'),esbuild=require('esbuild'),Module=require('node:module'),{spawnSync}=require('node:child_process');
const originalCatalog=fs.readFileSync('src/content/public-release-notes.json','utf8');
const mode=process.argv[2]||'MODIFIED',out=path.resolve(process.argv[3]||'output/public-update-history-20261016');
fs.mkdirSync(out,{recursive:true});
const root=mode==='BASELINE'?path.join(out,'baseline'):mode==='ROLLBACK'?path.join(out,'rollback-copy'):process.cwd();
if(mode!=='MODIFIED'){
 const source=fs.readFileSync(path.join(root,'src/components/site-version.tsx'),'utf8');assert.match(source,/loadedCommit/);assert.doesNotMatch(source,/<ReleaseNotes/);
 console.log(`${mode}=PASS VERSION_ONLY=TRUE PUBLIC_HISTORY=ABSENT EXIT=0`);process.exit(0);
}
const compiled=esbuild.transformSync(fs.readFileSync('src/lib/public-release-notes.ts','utf8'),{loader:'ts',format:'cjs'}).code,context={module:{exports:{}},exports:{}};vm.runInNewContext(compiled,context);
const {validatePublicReleaseNotes:validate,publicNotesForVersion:filter}=context.module.exports;
const copy=(zh,en)=>({zh,en});const entry={version:'1791990000',title:copy('使用体验更新','Experience update'),improvements:[copy('优化图片查看体验。','Improved image viewing.')],fixes:[]};
assert.equal(validate([entry]).length,1);
for(const value of ['使用gpt进行优化','后台页面调整','管理员改造','供应商配置','模型切换','OpenAI服务','47.105.59.142','https://private.test','staff@example.test','TOKEN abc','E:/Workspace/private','<script>','a'.repeat(40)]){
 assert.throws(()=>validate([{...entry,title:copy(value,'Update')}]),value);
}
assert.throws(()=>validate([{...entry,privateNote:'internal'}]));assert.throws(()=>validate([entry,entry]));assert.throws(()=>validate([{...entry,fixes:[],improvements:[]}]))
const notes=validate([{...entry,version:'1791900000'},entry,{...entry,version:'1792100000'}]);
assert.equal(filter(notes,'1791990000','1792100000').length,2);assert.equal(filter(notes,'1792100000','1791990000').length,2);assert.equal(filter(notes,'0','1792100000').length,0);
const source=fs.readFileSync('src/components/site-version.tsx','utf8');assert.doesNotMatch(source,/loadedCommit|commit\.slice/);assert.match(source,/opener.current\?\.focus/);assert.match(source,/notesEndpoint=versionEndpoint.replace/);
assert.match(fs.readFileSync('package.json','utf8'),/prebuild.*maintain-public-release-notes.cjs check/);
const catalog=path.join(out,'maintenance-fixture.json'),input=path.join(out,'reviewed-fixture.json');fs.writeFileSync(catalog,'[]');fs.writeFileSync(input,JSON.stringify(entry));
const cli=(...args)=>spawnSync(process.execPath,['scripts/maintain-public-release-notes.cjs',...args,'--catalog',catalog],{encoding:'utf8'});
assert.equal(cli('append','--input',input).status,1);assert.equal(cli('append','--input',input,'--reviewed').status,0);assert.equal(cli('append','--input',input,'--reviewed').status,1);assert.equal(cli('check','--version',entry.version).status,0);assert.equal(cli('check','--version','1792100000').status,1);
fs.writeFileSync(input,JSON.stringify({...entry,title:copy('密钥内部信息','Update')}));const rejected=cli('append','--input',input,'--reviewed');assert.equal(rejected.status,1);assert.ok(!rejected.stderr.includes('密钥'));assert.equal(JSON.parse(fs.readFileSync(catalog)).length,1);
(async()=>{
 const build=await esbuild.build({entryPoints:['src/app/api/release-notes/route.ts'],bundle:true,platform:'node',format:'cjs',write:false,external:['next/server'],plugins:[{name:'isolated-public-history',setup(b){b.onResolve({filter:/^@\/(content\/public-release-notes.json|lib\/version)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path.includes('content/')?'export default global.__publicNotesFixture.notes':'export const buildVersion=()=>global.__publicNotesFixture.version'}));}}]});
 global.__publicNotesFixture={notes,version:'1791990000'};
 const m=new Module(path.join(process.cwd(),'verify-public-notes-route.cjs'));m.filename=path.join(process.cwd(),'verify-public-notes-route.cjs');m.paths=module.paths;m._compile(build.outputFiles[0].text,m.filename);
 global.__publicNotesFixture={notes,version:'1791990000'};const get=version=>m.exports.GET(new Request('http://fixture.test/api/release-notes?version='+version));
 const r=await get('1792100000');assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);const data=await r.json();assert.equal(data.entries.length,2);assert.deepEqual(Object.keys(data).sort(),['entries','version']);
 assert.equal((await get('bad')).status,400);assert.equal((await (await get('0')).json()).entries.length,0);
 notes.push({...entry,secret:'PRIVATE_SENTINEL'});const fail=await get('1791990000');assert.equal(fail.status,503);assert.ok(!(await fail.text()).includes('PRIVATE_SENTINEL'));
 delete global.__publicNotesFixture;
 assert.equal(fs.readFileSync('src/content/public-release-notes.json','utf8'),originalCatalog);
 console.log('MODIFIED=PASS PUBLIC_HISTORY=TRUE PRIVACY_GUARD=PASS STRICT_FIELDS=PASS VERSION_CEILING=PASS REVIEWED_APPEND=PASS IMMUTABLE=PASS API=PASS NO_INTERNAL_IMPORT=PASS SOURCE_CATALOG_UNCHANGED=PASS EXIT=0');
})().catch(e=>{console.error(e);process.exitCode=1});
