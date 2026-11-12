import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';

// Module-level verification of the original-image descriptor repair:
// (A) resolveMediaRepresentation must attempt the legacy import for variant-less
// originals exactly like it already does for thumbnails/previews;
// (B) the real importLegacyMedia must register remote_ready truthfully, so a
// remote-sourced legacy original is presign/proxy-resolvable instead of being
// poisoned with a local-mirror claim that no longer holds.
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const req=createRequire(path.join(repo,'package.json'));
const checks=[];
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');

// ---------- Bundle A: representation.ts with recorded stubs ----------
const callsA={imports:[],variants:[]};
let assetsA=new Map();
const bundleA=await build({stdin:{contents:`
import {resolveMediaRepresentation} from '@/lib/media/representation';
globalThis.__apiA={resolveMediaRepresentation};
`,resolveDir:repo,loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',absWorkingDir:repo,plugins:[{name:'stub-a',setup(b){
  b.onResolve({filter:/^@\/lib\/media\/representation$/},()=>({path:path.join(repo,'src/lib/media/representation.ts')}));
  b.onResolve({filter:/^server-only$/},()=>({path:'so',namespace:'stubA'}));
  b.onResolve({filter:/media-assets-reader$/},()=>({path:'reader',namespace:'stubA'}));
  b.onResolve({filter:/media-assets$/},()=>({path:'assets',namespace:'stubA'}));
  b.onLoad({filter:/.*/,namespace:'stubA'},a=>{
   if(a.path==='reader')return{contents:`
  export async function getMediaAsset(key){return globalThis.assetsA.get(key)||null;}
  export async function getMediaAssets(keys){const out=[];for(const k of keys){const a=globalThis.assetsA.get(k);if(a)out.push(a);}return out;}
  export async function getMediaAssetTx(){return null;}
  `,loader:'js'};
   if(a.path==='assets')return{contents:`
  export async function ensureMediaVariants(key){globalThis.callsA.variants.push(key);return globalThis.assetsA.get(key)||null;}
  export async function importLegacyMedia(key,owner){if(globalThis.__failImport)throw new Error('fixture import failure');globalThis.callsA.imports.push([key,owner]);return {key:'imported:'+key,content_type:'image/png',thumbnail_key:'t-'+key,preview_key:'p-'+key};}
  `,loader:'js'};
   return{contents:'export default {};',loader:'js'};
  });
}}]});
const bundleAPath=path.join(repo,'node_modules',`.verify-repair-A-${process.pid}.cjs`);
await fs.writeFile(bundleAPath,bundleA.outputFiles[0].contents);
await import(pathToFileURL(bundleAPath));
const apiA=globalThis.__apiA;
{
  const reset=()=>{callsA.imports.length=0;callsA.variants.length=0;assetsA=new Map();globalThis.assetsA=assetsA;};
  globalThis.callsA=callsA;
  // s1 Variant-less original with no catalog entry attempts the legacy import.
  reset();
  const r1=await apiA.resolveMediaRepresentation('legacy/orig.png',null,{owner:'user@test',legacyOptional:true});
  assert.deepEqual(callsA.imports,[['legacy/orig.png','user@test']]);
  assert.equal(r1.key,'legacy/orig.png');
  assert.equal(r1.asset.key,'imported:legacy/orig.png');
  checks.push('ORIGINAL_BRANCH_ATTEMPTS_LEGACY_IMPORT');
  // s2 Original with an existing catalog entry never re-imports.
  reset();assetsA.set('known/orig.png',{key:'known/orig.png',content_type:'image/png'});
  const r2=await apiA.resolveMediaRepresentation('known/orig.png',null,{owner:'user@test',legacyOptional:true});
  assert.deepEqual(callsA.imports,[]);
  assert.equal(r2.asset.key,'known/orig.png');
  checks.push('ORIGINAL_WITH_ROW_SKIPS_IMPORT');
  // s3 Strict mode (GET byte route) still surfaces import failures.
  reset();globalThis.__failImport=true;
  await assert.rejects(()=>apiA.resolveMediaRepresentation('missing/orig.png',null,{owner:'user@test',legacyOptional:false}));
  globalThis.__failImport=false;
  checks.push('STRICT_GET_SEMANTICS_PRESERVED');
  // s4 Optional mode swallows import failures into a null descriptor.
  reset();globalThis.__failImport=true;
  const r4=await apiA.resolveMediaRepresentation('missing/orig.png',null,{owner:'user@test',legacyOptional:true});
  globalThis.__failImport=false;
  assert.equal(r4.asset,null);assert.equal(r4.key,'missing/orig.png');
  checks.push('OPTIONAL_IMPORT_FAILURE_STAYS_NULL');
  // s5 Thumbnail resolution keeps its existing shape.
  reset();
  assetsA.set('known/orig.png',{key:'known/orig.png',content_type:'image/png',thumbnail_key:'known/t.png',preview_key:'known/p.png'});
  assetsA.set('known/t.png',{key:'known/t.png',content_type:'image/webp'});
  const r5=await apiA.resolveMediaRepresentation('known/orig.png','thumbnail',{owner:'user@test',legacyOptional:true,variants:assetsA});
  assert.deepEqual(callsA.imports,[]);
  assert.equal(r5.key,'known/t.png');
  checks.push('VARIANT_RESOLUTION_UNCHANGED');
}

// ---------- Bundle B: real importLegacyMedia + registerMediaAsset ----------
const mediaDir=await fs.mkdtemp(path.join(os.tmpdir(),'naumi-repair-'));
await fs.mkdir(path.join(mediaDir,'legacy'),{recursive:true});
await fs.writeFile(path.join(mediaDir,'legacy','local.png'),png);
const callsB={metadata:[],reads:[]};
const assetsB=new Map();
const bundleB=await build({stdin:{contents:`
import {importLegacyMedia} from '@/lib/media-assets';
globalThis.__apiB={importLegacyMedia};
`,resolveDir:repo,loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',absWorkingDir:repo,plugins:[{name:'stub-b',setup(b){
  b.onResolve({filter:/^@\/lib\/media-assets$/},()=>({path:path.join(repo,'src/lib/media-assets.ts')}));
  b.onResolve({filter:/^(server-only|@\/platform\/db\/pool|@\/lib\/persistence\/schema|@\/lib\/media-assets-schema|@\/lib\/bi\/context|@\/platform\/db\/transaction|\.(\/object-storage\/managed-read|\/object-storage\/runtime|\/media-assets-reader|\/media-assets\/writer|\/media-assets\/variants|\/media-assets\/mirror-recovery))$/},a=>({path:'b:'+a.path,namespace:'stubB'}));
  b.onLoad({filter:/.*/,namespace:'stubB'},a=>{
   const p=a.path.slice(2);
   if(p==='server-only')return{contents:'export default {};',loader:'js'};
   if(p==='@/platform/db/pool')return{contents:'export const dbEnabled=true;export const getPool=()=>({query:async()=>({rows:[],rowCount:0})});',loader:'js'};
   if(p==='@/platform/db/transaction')return{contents:'export const withTransaction=async(_tx,fn)=>fn(null);',loader:'js'};
   if(p==='@/lib/persistence/schema')return{contents:'export const ensureSchema=async()=>{};',loader:'js'};
   if(p==='@/lib/media-assets-schema')return{contents:'export const ensureMediaSchema=async()=>{};',loader:'js'};
   if(p==='@/lib/bi/context')return{contents:'export const currentBiContext=()=>null;',loader:'js'};
   if(p.includes('object-storage/managed-read'))return{contents:`
   export async function readManagedObject(url){globalThis.callsB.reads.push(url);return {bytes:Buffer.from('remote-or-local-bytes'),contentType:'image/png',size:21};}
   `,loader:'js'};
   if(p.includes('object-storage/runtime'))return{contents:`export const storageDriver='remote';export const MEDIA_DIR=${JSON.stringify(mediaDir)};`,loader:'js'};
   if(p.includes('media-assets-reader'))return{contents:`
   export async function getMediaAsset(key){return globalThis.assetsB.get(key)||null;}
   export async function getMediaAssets(keys){const out=[];for(const k of keys){const a=globalThis.assetsB.get(k);if(a)out.push(a);}return out;}
   export async function getMediaAssetTx(){return null;}
   `,loader:'js'};
   if(p.includes('media-assets/writer'))return{contents:`
   export async function registerMediaMetadata(pool,input){globalThis.callsB.metadata.push(input);globalThis.assetsB.set(input.key,{...input,public:false});}
   export async function assertOwnedMediaVersion(){}
   export const registerOriginalWithPreviewsTx=async()=>{};
   export const updateMediaDimensionsTx=async()=>{};
   export const registerPrivateMediaTx=async()=>{};
   `,loader:'js'};
   if(p.includes('media-assets/variants'))return{contents:'export async function ensureMediaVariants(){return null;}',loader:'js'};
   return{contents:'export async function recoverMediaMirrors(){return [];}',loader:'js'};
  });
}}]});
const bundleBPath=path.join(repo,'node_modules',`.verify-repair-B-${process.pid}.cjs`);
await fs.writeFile(bundleBPath,bundleB.outputFiles[0].contents);
await import(pathToFileURL(bundleBPath));
const apiB=globalThis.__apiB;
{
  globalThis.assetsB=assetsB;globalThis.callsB=callsB;
  // s5 Local-mirror source registers as local-first (remote_ready=false).
  callsB.reads.length=0;callsB.metadata.length=0;
  const local=await apiB.importLegacyMedia('legacy/local.png','user@test');
  assert.deepEqual(callsB.reads,['/media/legacy/local.png']);
  assert.equal(callsB.metadata.length,1);
  assert.equal(callsB.metadata[0].remoteReady,false,'a verified local mirror stays local-first');
  assert.equal(local.remoteReady,false);
  checks.push('LOCAL_MIRROR_REGISTERS_LOCAL_FIRST');
  // s6 Remote-sourced bytes (no local file) register remote-resolvable — the
  // previous hard-coded false poisoned later managed reads of the same key.
  callsB.metadata.length=0;
  const remote=await apiB.importLegacyMedia('legacy/remote-only.png','user@test');
  assert.equal(callsB.metadata.length,1);
  assert.equal(callsB.metadata[0].remoteReady,true,'remote-sourced legacy originals must register remote_ready');
  assert.equal(remote.remoteReady,true);
  assert.equal(callsB.metadata[0].contentType,'image/png');
  assert.ok(/^[0-9a-f]{64}$/.test(callsB.metadata[0].sha256||''),'sha256 recorded');
  checks.push('REMOTE_SOURCED_REGISTERS_REMOTE_READY');
  // s7 An existing row short-circuits: no read, no re-registration.
  callsB.reads.length=0;callsB.metadata.length=0;
  assetsB.set('known/row.png',{key:'known/row.png',content_type:'image/png',remoteReady:true});
  const existing=await apiB.importLegacyMedia('known/row.png','user@test');
  assert.deepEqual(callsB.reads,[]);assert.deepEqual(callsB.metadata,[]);
  assert.equal(existing.key,'known/row.png');
  checks.push('EXISTING_ROW_SHORT_CIRCUITS');
}
await fs.rm(bundleAPath,{force:true});
await fs.rm(bundleBPath,{force:true});
await fs.rm(mediaDir,{recursive:true,force:true});
console.log(`SERVER=PASS CHECKS=${checks.length} PROVIDER_CALLS=0 SERVER_MUTATION=false`);
for(const c of checks)console.log('CHECK '+c);
