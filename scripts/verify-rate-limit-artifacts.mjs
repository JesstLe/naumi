// Package and verify this fixed A15 slice. Rollback is copy-only, all-target and
// all-payload hash-guarded before the first write. No DB/media restoration.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';

const root=process.cwd(),out=path.resolve('output/a15'),base='956b7238fa375e992e0ac594c47cdba5c9d95f50';
const keep=new Set(['PATH','SYSTEMROOT','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','PATHEXT']);
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>keep.has(k.toUpperCase())));
const exec=(cmd,args,options={})=>execFileSync(cmd,args,{windowsHide:true,env,maxBuffer:32*1024*1024,...options});
const hash=b=>createHash('sha256').update(b).digest('hex');
const inv=JSON.parse(fs.readFileSync(path.join(out,'CALLER_INVENTORY.json'),'utf8'));
const files=[...new Set([...inv.inventory.map(i=>i.path),
  'src/lib/rate-limit.ts','src/lib/rate-limit-http.ts','src/lib/rate-limit-store.ts',
  'scripts/rate-limit-test-worker.ts','scripts/verify-rate-limit-baseline.mjs','scripts/verify-distributed-rate-limit.mjs',
  'scripts/verify-rate-limit-callers.mjs','scripts/verify-rate-limit-entry-gates.mjs','scripts/verify-rate-limit-artifacts.mjs',
  'docs/changes/2026-10-29-capacity-distributed-rate-limit.md',
])].sort();
const entries=files.map(file=>{
  const modified=fs.readFileSync(file);let original=null;
  const exists=spawnSync('git',['cat-file','-e',base+':'+file],{env,windowsHide:true,stdio:'ignore'}).status===0;
  if(exists)original=exec('git',['show',base+':'+file]);
  return {file,modified,original,modifiedHash:hash(modified),originalHash:original&&hash(original)};
});
// All input source hashes checked before writing package/copies.
for(const entry of entries)assert.equal(hash(fs.readFileSync(entry.file)),entry.modifiedHash,'PACKAGE_INPUT_DRIFT');
const token=randomUUID();
const manifest={base,sourceRoot:root,token,files:entries.map(({file,modifiedHash,originalHash})=>({file,modifiedHash,originalHash}))};
for(const entry of entries){
  for(const [kind,bytes]of [['modified',entry.modified],['original',entry.original]])if(bytes){const target=path.join(out,kind,entry.file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);}
}
fs.writeFileSync(path.join(out,'rollback-manifest.json'),JSON.stringify(manifest,null,2));
fs.copyFileSync('src/lib/rate-limit.ts',path.join(out,'MODIFIED_FILE.ts'));
// Explicit paths only; this index operation does not stage their contents.
exec('git',['add','--intent-to-add','--',...files]);
fs.writeFileSync(path.join(out,'DIFF_FILE.patch'),exec('git',['diff','--binary',base,'--',...files]));
const rollback=`import fs from 'node:fs';import path from 'node:path';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url)),m=JSON.parse(fs.readFileSync(path.join(here,'rollback-manifest.json'),'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
let writes=0;
try{
 const root=fs.realpathSync(path.resolve(process.argv[2]||''));
 if(root.toLowerCase()===path.resolve(m.sourceRoot).toLowerCase())throw Error('COPY_ONLY');
 if(fs.readFileSync(path.join(root,'.a15-rollback-copy'),'utf8')!==m.token)throw Error('COPY_MARKER');
 const plans=m.files.map(e=>{
  if(path.isAbsolute(e.file)||e.file.split(/[\\\\/]/).some(p=>!p||p==='..'||p==='.'))throw Error('PATH');
  const target=path.resolve(root,e.file);if(!target.startsWith(root+path.sep))throw Error('PATH');
  for(let p=target;p!==root;p=path.dirname(p))if(fs.lstatSync(p).isSymbolicLink())throw Error('SYMLINK');
  if(hash(fs.readFileSync(target))!==e.modifiedHash)throw Error('TARGET_HASH:'+e.file);
  const original=e.originalHash===null?null:fs.readFileSync(path.join(here,'original',e.file));
  if(original&&hash(original)!==e.originalHash)throw Error('ORIGINAL_HASH:'+e.file);
  return{target,original};
 });
 // No write occurs until every target AND every original payload passes.
 for(const p of plans){if(p.original)fs.writeFileSync(p.target,p.original);else fs.unlinkSync(p.target);writes++;}
 console.log('ROLLBACK PASS files='+plans.length+' all_file_preflight=PASS restored=BASELINE');
}catch(e){console.error('ROLLBACK_REFUSED '+e.message+' writes='+writes);process.exitCode=3;}
`;
fs.writeFileSync(path.join(out,'rollback.mjs'),rollback);
fs.writeFileSync(path.join(out,'ROLLBACK.sh'),'#!/usr/bin/env bash\nset -euo pipefail\nnode "$(dirname "$0")/rollback.mjs" "$@"\n',{mode:0o755});
fs.chmodSync(path.join(out,'ROLLBACK.sh'),0o755);
let bash='bash';
if(process.platform==='win32'){
  const git=exec('where.exe',['git'],{encoding:'utf8'}).trim().split(/\r?\n/)[0];
  bash=path.resolve(path.dirname(git),'../bin/bash.exe');assert.ok(fs.existsSync(bash));
}
const toShell=p=>p.replace(/\\/g,'/');
assert.equal(spawnSync(bash,['-c','test -x "$1"','bash',toShell(path.join(out,'ROLLBACK.sh'))],{env,windowsHide:true}).status,0);
let n=1;while(fs.existsSync(path.join(out,'rollback-proof-'+n)))n++;
const copy=path.join(out,'rollback-proof-'+n),drift=path.join(out,'rollback-drift-'+n);
for(const target of [copy,drift]){
  fs.mkdirSync(target);fs.writeFileSync(path.join(target,'.a15-rollback-copy'),token);
  for(const e of entries){const file=path.join(target,e.file);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,e.modified);}
}
// Tamper the LAST target: an implementation checking/writing sequentially
// would already have damaged earlier files. This one must write nothing.
fs.appendFileSync(path.join(drift,entries.at(-1).file),'\n// later edit\n');
const driftHashes=entries.map(e=>hash(fs.readFileSync(path.join(drift,e.file))));
const refused=spawnSync(bash,[toShell(path.join(out,'ROLLBACK.sh')),toShell(drift)],{env,windowsHide:true,encoding:'utf8'});
assert.equal(refused.status,3);assert.match(refused.stderr,/TARGET_HASH:.* writes=0/);
assert.deepEqual(entries.map(e=>hash(fs.readFileSync(path.join(drift,e.file)))),driftHashes);
console.log('ROLLBACK_HASH_GUARD last_target_changed=REFUSED exit=3 partial_writes=0 later_edit=PRESERVED');
// Payload corruption is also checked before any target is restored.
const originalEntry=entries.find(e=>e.original),payload=path.join(out,'original',originalEntry.file);
fs.appendFileSync(payload,'\n// damaged rollback payload\n');
const badPayload=spawnSync(bash,[toShell(path.join(out,'ROLLBACK.sh')),toShell(copy)],{env,windowsHide:true,encoding:'utf8'});
fs.writeFileSync(payload,originalEntry.original);
assert.equal(badPayload.status,3);assert.match(badPayload.stderr,/ORIGINAL_HASH:.* writes=0/);
for(const e of entries)assert.equal(hash(fs.readFileSync(path.join(copy,e.file))),e.modifiedHash);
console.log('ROLLBACK_HASH_GUARD original_payload_changed=REFUSED exit=3 partial_writes=0');
console.log('ROLLBACK_COMMAND='+JSON.stringify([toShell(bash),toShell(path.join(out,'ROLLBACK.sh')),toShell(copy)]));
const restored=spawnSync(bash,[toShell(path.join(out,'ROLLBACK.sh')),toShell(copy)],{env,windowsHide:true,encoding:'utf8'});
assert.equal(restored.status,0,restored.stderr);process.stdout.write(restored.stdout);
for(const e of entries){if(e.original)assert.equal(hash(fs.readFileSync(path.join(copy,e.file))),e.originalHash);else assert.equal(fs.existsSync(path.join(copy,e.file)),false);}
console.log('ROLLBACK_BASELINE_COMMAND=node scripts/verify-rate-limit-baseline.mjs '+toShell(copy));
const baseline=spawnSync(process.execPath,['scripts/verify-rate-limit-baseline.mjs',copy],{env,windowsHide:true,encoding:'utf8'});
assert.equal(baseline.status,0,baseline.stderr);process.stdout.write(baseline.stdout);
// Reopen every named deliverable and every packaged byte; live source stays fixed.
for(const e of entries){assert.equal(hash(fs.readFileSync(e.file)),e.modifiedHash);assert.equal(hash(fs.readFileSync(path.join(out,'modified',e.file))),e.modifiedHash);if(e.original)assert.equal(hash(fs.readFileSync(path.join(out,'original',e.file))),e.originalHash);}
assert.equal(hash(fs.readFileSync(path.join(out,'MODIFIED_FILE.ts'))),hash(fs.readFileSync('src/lib/rate-limit.ts')));
assert.match(fs.readFileSync(path.join(out,'DIFF_FILE.patch'),'utf8'),/rate-limit-store\.ts/);
assert.match(fs.readFileSync(path.join(out,'ROLLBACK.sh'),'utf8'),/^#!\/usr\/bin\/env bash/);
fs.writeFileSync(path.join(out,'ARTIFACT_MANIFEST.json'),JSON.stringify({base,files:entries.length,copy,drift,sourceUnchanged:true,modifiedFileHash:hash(fs.readFileSync(path.join(out,'MODIFIED_FILE.ts'))),baselineFileHash:entries.find(e=>e.file==='src/lib/rate-limit.ts').originalHash},null,2));
console.log('ARTIFACTS PASS files='+entries.length+' copyrollback=BASELINE source=MODIFIED reopened=MODIFIED_FILE,DIFF_FILE,ROLLBACK.sh');
