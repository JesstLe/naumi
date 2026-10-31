'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const args=process.argv.slice(2),arg=(n,d)=>args.includes(n)?args[args.indexOf(n)+1]:d,root=path.resolve(arg('--source-root','.')),out=path.resolve(arg('--out',process.env.NATIVE_PARENT_EVIDENCE||'output/native-parent-database'));
const source=fs.readFileSync(path.join(root,'scripts/video-fusion/native-parent-database.ts'),'utf8');
let calls=[],failure;const pool={actualPort:true},port=async url=>{calls.push(url);if(failure)throw failure;return pool};const moduleObject={exports:{}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:9,module:1,esModuleInterop:true}}).outputText,{module:moduleObject,exports:moduleObject.exports,require:n=>n==='./fixture'?{fixtureDatabase:port}:require(n),process,URL});
const {nativeParentDatabaseUrl,connectNativeParentDatabase}=moduleObject.exports,valid={NAUMI_VERIFY_ISOLATED_DB:'1',VIDEO_FIXTURE_BUILT_APP_ROOT:'/fixed-app',VIDEO_FIXTURE_BUILT_SOURCE_COMMIT:'a'.repeat(40),VIDEO_FIXTURE_BUILT_VERSION:'1793450170',NATIVE_FIXTURE_DATABASE_URL:'postgresql://fixture:synthetic@127.0.0.1:5432/naumi_video_fixture_fixed_abcdef'};
let checks=0,cases=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++},test=(name,fn)=>{fn();cases++;console.log('PASS '+name)};
test('legacy-self-owned-mode-keeps-no-parent-port',()=>eq(nativeParentDatabaseUrl({},'win32'),undefined));
test('exact-fixed-linux-parent-url-is-retained',()=>eq(nativeParentDatabaseUrl(valid,'linux'),valid.NATIVE_FIXTURE_DATABASE_URL));
for(const platform of ['win32','darwin'])test('reject-parent-on-'+platform,()=>{assert.throws(()=>nativeParentDatabaseUrl(valid,platform));checks++});
for(const [field,value]of [['NAUMI_VERIFY_ISOLATED_DB','0'],['VIDEO_FIXTURE_BUILT_APP_ROOT','/app'],['VIDEO_FIXTURE_BUILT_SOURCE_COMMIT','bad'],['VIDEO_FIXTURE_BUILT_VERSION','0']])test('reject-'+field,()=>{assert.throws(()=>nativeParentDatabaseUrl({...valid,[field]:value},'linux'));checks++});
for(const url of ['','postgresql://fixture:x@example.test:5432/naumi_video_fixture_fixed_ab','postgresql://fixture:x@localhost:5432/naumi_video_fixture_fixed_ab','postgresql://fixture:x@127.0.0.1:5432/production','postgresql://fixture:x@127.0.0.1:5432/naumi_video_fixture_fixed_ab?options=unsafe','postgresql://fixture:x@127.0.0.1:5432/naumi_video_fixture_fixed_ab#x','http://127.0.0.1/naumi_video_fixture_fixed_ab'])test('reject-invalid-parent-'+cases,()=>{assert.throws(()=>nativeParentDatabaseUrl({...valid,NATIVE_FIXTURE_DATABASE_URL:url},'linux'));checks++});
// Exercise the actual connect function in a Linux-shaped explicit fixture VM.
const isolatedProcess={platform:'linux',env:valid},m={exports:{}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:9,module:1,esModuleInterop:true}}).outputText,{module:m,exports:m.exports,require:n=>n==='./fixture'?{fixtureDatabase:port}:require(n),process:isolatedProcess,URL});
(async()=>{
 calls=[];const got=await m.exports.connectNativeParentDatabase();eq(got.url,valid.NATIVE_FIXTURE_DATABASE_URL);eq(got.pool,pool);eq(calls,[valid.NATIVE_FIXTURE_DATABASE_URL]);cases++;
 const original=new Error('actual existing SQL ownership guard');failure=original;await assert.rejects(m.exports.connectNativeParentDatabase(),e=>e===original);checks++;cases++;
 isolatedProcess.env={};calls=[];eq(await m.exports.connectNativeParentDatabase(),undefined);eq(calls,[]);cases++;
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',cases,checks,actualHelper:true,fixtureDatabasePort:'explicit negative-control port;real PG in native full application acceptance',productionWrites:0,supplierPosts:0},null,2)+'\n');console.log(`NATIVE_PARENT_DATABASE=PASS CASES=${cases} CHECKS=${checks} ACTUAL_HELPER=1 OWNERSHIP_PORT=EXACT PRODUCTION_WRITES=0 SUPPLIER_POSTS=0`);
})().catch(e=>{console.error(e);process.exitCode=1});
