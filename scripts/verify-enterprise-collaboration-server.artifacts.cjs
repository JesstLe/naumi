/* Reproducible task-only evidence packaging; rollback executes ONLY on marked copies. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const JSZip = require('jszip');
const root = process.cwd();
const out = path.join(root, 'output/enterprise-collaboration-server');
const baseline = '09437aaa6f8babfc0e52b28ad049ca72122492a0';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function run(command, args) {
  const r = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, cwd: root });
  return { command: [command, ...args].join(' '), input: args, output: (r.stdout || '') + (r.stderr || ''), exit: r.status };
}
function git(...args) { const r = run('git', args); if (r.exit !== 0) throw Error(r.output); return r.output.trim(); }
async function main() {
  fs.mkdirSync(out, { recursive: true });
  const files = git('diff', '--cached', '--name-only', '--diff-filter=A').split(/\r?\n/).filter(Boolean);
  const all = git('diff', '--cached', '--name-only').split(/\r?\n/).filter(Boolean);
  if (!files.length || files.length !== all.length) throw Error('Expected this task to contain only added paths');
  const allowed = p => /^src\/lib\/collaboration\/(?!contracts\.ts$)[^/]+\.ts$/.test(p)
    || p === 'src/lib/enterprise/collaboration-access.ts' || /^src\/app\/api\/collaboration\/(?!shares\/).*\/route\.ts$/.test(p)
    || /^scripts\/verify-enterprise-collaboration-server\.[^/]+$/.test(p) || p === 'docs/changes/2026-11-02-enterprise-collaboration-server.md';
  if (!files.every(allowed)) throw Error('Task path ownership mismatch');
  const marker = 'collaboration-server-copy-only-v1';
  const protectedPaths = ['src/lib/collaboration/contracts.ts', 'docs/changes/2026-11-02-enterprise-collaboration.md'];
  const protectedHashes = {};
  for (const name of protectedPaths) {
    const original = spawnSync('git', ['show', `${baseline}:${name}`], { cwd: root }).stdout;
    const current = fs.readFileSync(path.join(root, name));
    if (!current.equals(original)) throw Error(`Parent contract changed: ${name}`);
    protectedHashes[name] = sha(original);
  }
  const manifest = { baseline, source: root.replaceAll('\\','/'), marker, protectedHashes,
    files: files.map(name => ({ path: name, baseline: null, modified: sha(fs.readFileSync(path.join(root,name))) })) };
  const manifestFile = path.join(out, 'MANIFEST.json'); fs.writeFileSync(manifestFile, JSON.stringify(manifest,null,2)+'\n');
  const zip = new JSZip(); for(const name of files)zip.file(name,fs.readFileSync(path.join(root,name)));
  const archive = path.join(out,'MODIFIED_FILE.zip'); fs.writeFileSync(archive,await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
  const diff = spawnSync('git',['diff','--cached','--binary','--no-ext-diff'],{cwd:root});if(diff.status!==0)throw Error('diff failed');
  const patch = path.join(out,'DIFF_FILE.patch');fs.writeFileSync(patch,diff.stdout);
  const rollback = path.join(out,'ROLLBACK.sh');
  const shell = `#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -ne 1 ]; then echo 'ROLLBACK_REFUSED requires marked independent copy WRITES=0'; exit 73; fi
python - "$1" <<'PY'
import sys,json,hashlib,pathlib,os
m=json.loads(r'''${JSON.stringify(manifest)}''')
def refuse(reason):
 print('ROLLBACK_REFUSED '+reason+' WRITES=0');sys.exit(73)
root=pathlib.Path(sys.argv[1]).resolve()
if root==pathlib.Path(m['source']).resolve() or (root/'.git').exists():refuse('SOURCE_OR_GIT_CHECKOUT')
marker=root/'.collaboration-copy-only'
if not marker.is_file() or marker.read_text(encoding='utf8')!=m['marker']:refuse('COPY_MARKER')
targets=[]
for entry in m['files']:
 target=root/entry['path']
 if not target.resolve().is_relative_to(root):refuse('PATH_ESCAPE')
 for part in [target,*target.parents]:
  if part==root:break
  if part.is_symlink():refuse('SYMLINK')
 if not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest()!=entry['modified']:refuse('HASH_MISMATCH '+entry['path'])
 targets.append(target)
for name,expected in m['protectedHashes'].items():
 target=root/name
 if not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest()!=expected:refuse('PARENT_CONTRACT '+name)
# ALL targets and protected files pass before the first write.
for target in targets:target.unlink()
assert all(not target.exists() for target in targets)
print('ROLLBACK=PASS RESTORED=0 REMOVED='+str(len(targets))+' WRITES='+str(len(targets)))
PY
`;
  fs.writeFileSync(rollback,shell,{mode:0o755});
  const gitExe=git('--exec-path').replaceAll('\\','/');
  const bash=process.platform==='win32'?path.resolve(gitExe,'../../../bin/bash.exe'):'bash';
  if(process.platform==='win32'&&!fs.existsSync(bash))throw Error(`Git Bash not found: ${bash}`);
  const chmod=run(bash,['-c','chmod +x "$1" && test -x "$1"','bash',rollback.replaceAll('\\','/')]);if(chmod.exit!==0)throw Error(chmod.output);
  function makeCopy(name) {
    const directory=path.join(out,name);if(fs.existsSync(directory))throw Error(`Copy already exists: ${name}`);fs.mkdirSync(directory,{recursive:true});
    for(const file of [...files,...protectedPaths]){const destination=path.join(directory,file);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(path.join(root,file),destination);}
    fs.writeFileSync(path.join(directory,'.collaboration-copy-only'),marker);return directory;
  }
  const tag=crypto.randomUUID().slice(0,8),copy=makeCopy(`rollback-copy-${tag}`),guard=makeCopy(`guard-copy-${tag}`);
  fs.appendFileSync(path.join(guard,files.at(-1)),'\n// later independent edit\n');
  const guardBefore=files.map(f=>sha(fs.readFileSync(path.join(guard,f))));
  const guardResult=run(bash,[rollback.replaceAll('\\','/'),guard.replaceAll('\\','/')]);
  if(guardResult.exit!==73||guardBefore.some((h,i)=>sha(fs.readFileSync(path.join(guard,files[i])))!==h))throw Error('All-target preflight guard failed');
  const rollbackResult=run(bash,[rollback.replaceAll('\\','/'),copy.replaceAll('\\','/')]);if(rollbackResult.exit!==0)throw Error(rollbackResult.output);
  const restored=run(process.execPath,['scripts/verify-enterprise-collaboration-server.cjs',copy]);if(restored.exit!==2)throw Error('Rollback did not restore missing baseline');
  const sourceGuard=run(bash,[rollback.replaceAll('\\','/'),root.replaceAll('\\','/')]);if(sourceGuard.exit!==73)throw Error('Source rollback not rejected');
  for(const f of manifest.files)if(sha(fs.readFileSync(path.join(root,f.path)))!==f.modified)throw Error('Source changed during rollback');
  const reopened=await JSZip.loadAsync(fs.readFileSync(archive));if(await reopened.files[files[0]].async('uint8array').then(sha)!==manifest.files[0].modified)throw Error('Archive reopen mismatch');
  for(const f of manifest.files)if(sha(await reopened.file(f.path).async('nodebuffer'))!==f.modified)throw Error('Archive member mismatch');
  if(!fs.readFileSync(patch,'utf8').includes('diff --git'))throw Error('Patch reopen failed');
  if(!fs.readFileSync(rollback,'utf8').startsWith('#!/usr/bin/env bash'))throw Error('Rollback reopen failed');
  const modified=fs.readFileSync(path.join(out,'MODIFIED.txt'),'utf8'),modifiedExit=fs.readFileSync(path.join(out,'MODIFIED.exit'),'utf8').trim();
  const typecheck=fs.readFileSync(path.join(out,'TYPECHECK.txt'),'utf8'),typeExit=fs.readFileSync(path.join(out,'TYPECHECK.exit'),'utf8').trim();
  const baselineResult=run(process.execPath,['scripts/verify-enterprise-collaboration-server.cjs',path.join(out,'baseline')]);if(baselineResult.exit!==2)throw Error('Baseline mismatch');
  const records={baseline:baselineResult,modified:{command:'node scripts/verify-enterprise-collaboration-server.cjs',input:'isolated fixture, actual routes, external sharing port fixture',output:modified,exit:Number(modifiedExit)},guard:guardResult,rollback:rollbackResult,restored,sourceGuard};
  const verification=path.join(out,'VERIFICATION.txt');
  const text=`TARGET=enterprise collaboration server\nBASE_COMMIT=${baseline}\nBRANCH=${git('branch','--show-current')}\nCHANGED_FIELDS=enterprise collaboration scope; message client_id/fingerprint; member joined_seq/left_seq/read_seq; upload status/immutable parts; per-tenant event head\nEVIDENCE_TIER=LOCAL_PG_ACTUAL_ROUTES_HTTP; signed S3/R2 loopback protocol; external sharing port fixture; suppliers=0\n\nARTIFACTS\nMODIFIED_FILE=${archive}\nDIFF_FILE=${patch}\nVERIFICATION=${verification}\nROLLBACK=${rollback}\n\n${Object.entries(records).map(([name,r])=>name.toUpperCase()+'\nCOMMAND='+r.command+'\nINPUT='+JSON.stringify(r.input)+'\nLITERAL_OUTPUT_BEGIN\n'+r.output+'LITERAL_OUTPUT_END\nEXIT='+r.exit+'\n').join('\n')}\nTYPECHECK_COMMAND=node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false\nTYPECHECK_INPUT=entire isolated worktree, React19 dependencies, no sharing-module substitute\n${typecheck}TYPECHECK_EXIT=${typeExit}\nPENDING=actual canvas-sharing integration + full typecheck/build + browser cross-module acceptance + live storage/load/deployment\nGUARD_ALL_TARGETS_UNCHANGED=PASS\nSOURCE_REMAINS_MODIFIED=PASS\nPARENT_CONTRACT_HASHES=${JSON.stringify(protectedHashes)}\nROLLBACK_RESTORED_BEHAVIOR=MISSING_FEATURE routes=0 implementation=0 exit=2\nREOPEN=MODIFIED_FILE all ${files.length} ZIP members hash checked; DIFF_FILE text reopened; ROLLBACK executable and executed; VERIFICATION reopened\n${[archive,patch,rollback,manifestFile].map(p=>'SHA256 '+sha(fs.readFileSync(p))+' '+p).join('\n')}\n`;
  fs.writeFileSync(verification,text);if(!fs.readFileSync(verification,'utf8').includes('SOURCE_REMAINS_MODIFIED=PASS'))throw Error('Verification reopen failed');
  fs.writeFileSync(path.join(out,'artifact-results.json'),JSON.stringify({files:files.length,copy,guard,records,artifacts:{archive,patch,verification,rollback}},null,2)+'\n');
  console.log(guardResult.output.trim());console.log('GUARD_ALL_TARGETS_UNCHANGED=PASS');console.log(rollbackResult.output.trim());console.log(restored.output.trim());
  console.log(`ARTIFACTS_REOPENED=4 FILES=${files.length} SOURCE_REMAINS_MODIFIED=PASS`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
