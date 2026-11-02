import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = process.cwd(), base = '416615e0dfd41e42870378cd2792367aacb60df5';
const out = path.join(root, 'output/enterprise-collaboration-integration-20261102/repair-artifacts');
const files = ['src/lib/canvas-sharing/http.ts', 'src/lib/canvas-sharing/schema.ts', 'src/lib/canvas-sharing/service.ts',
  'src/lib/collaboration/events.ts', 'src/lib/collaboration/schema.ts', 'src/lib/enterprise/collaboration-events.ts',
  'scripts/verify-enterprise-collaboration-integration.ts', 'scripts/verify-enterprise-collaboration-integration.mjs',
  'scripts/verify-enterprise-collaboration-integration.artifacts.mjs', 'docs/changes/2026-11-02-enterprise-collaboration.md'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const run = (exe, args) => { const r = spawnSync(exe, args, { cwd: root, windowsHide: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.error) throw r.error; return { command: [exe, ...args], stdin: '', stdout: r.stdout || '', stderr: r.stderr || '', exit: r.status }; };
fs.mkdirSync(out, { recursive: true }); const id = randomUUID();
const modified = path.join(out, 'modified'), original = path.join(out, 'original');
const write = (folder, name, bytes) => { const file = path.join(folder, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); };
const entries = [];
for (const name of files) {
  const bytes = fs.readFileSync(path.join(root, name)); write(modified, name, bytes);
  const captured = path.join(root, 'output/enterprise-collaboration-integration-20261102/repair-baseline', name);
  const exists = spawnSync('git', ['cat-file', '-e', `${base}:${name}`], { windowsHide: true }).status === 0;
  const before = exists ? fs.existsSync(captured) ? fs.readFileSync(captured) : spawnSync('git', ['show', `${base}:${name}`], { maxBuffer: 16 * 1024 * 1024, windowsHide: true }).stdout : null;
  if (before) write(original, name, before);
  entries.push({ path: name, before: before ? hash(before) : null, after: hash(bytes) });
}
const manifest = { source: root, base, marker: 'collaboration-integration-copy-only-v1', entries };
fs.writeFileSync(path.join(out, 'MANIFEST.json'), JSON.stringify(manifest, null, 2));
const archive = path.join(out, 'MODIFIED_FILE.tar'), diff = path.join(out, 'DIFF_FILE.patch');
assert.equal(run('tar', ['-cf', archive, '-C', modified, '.']).exit, 0);
let patch = '';
for (const e of entries) {
  const result = e.before ? run('git', ['diff', '--binary', base, '--', e.path]) : run('git', ['diff', '--no-index', '--binary', '--', process.platform === 'win32' ? 'NUL' : '/dev/null', e.path]);
  assert.ok([0, 1].includes(result.exit)); patch += result.stdout;
}
fs.writeFileSync(diff, patch);
const rollbackJs = `const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const home=__dirname,m=JSON.parse(fs.readFileSync(path.join(home,'MANIFEST.json'),'utf8'));
const stop=()=>{console.log('ROLLBACK=REJECT HASHGUARD_FULL_PREFLIGHT WRITES=0');process.exit(73)};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
let root;try{root=fs.realpathSync(process.argv[2]);}catch{stop()}
const permitted=fs.realpathSync(path.join(home,'copies'))+path.sep;
if(!root.toLowerCase().startsWith(permitted.toLowerCase())||root.toLowerCase()===path.resolve(m.source).toLowerCase())stop();
try{if(fs.readFileSync(path.join(root,'.collaboration-copy'),'utf8')!==m.marker)stop();}catch{stop()}
const targets=[];
for(const e of m.entries){const p=path.resolve(root,e.path);if(!p.startsWith(root+path.sep))stop();
 try{for(let q=p;q!==root;q=path.dirname(q)){if(fs.lstatSync(q).isSymbolicLink())stop();}
 if(hash(fs.readFileSync(p))!==e.after)stop();
 const b=e.before?fs.readFileSync(path.join(home,'original',e.path)):null;
 if(b&&hash(b)!==e.before)stop();targets.push({p,b});}catch{stop()}}
for(const t of targets){if(t.b)fs.writeFileSync(t.p,t.b);else fs.unlinkSync(t.p)}
console.log('ROLLBACK=PASS RESTORED='+targets.filter(t=>t.b).length+' REMOVED='+targets.filter(t=>!t.b).length+' WRITES='+targets.length);
`;
fs.writeFileSync(path.join(out, 'rollback.cjs'), rollbackJs);
const rollback = path.join(out, 'ROLLBACK.sh');
fs.writeFileSync(rollback, '#!/usr/bin/env bash\nset -euo pipefail\n[ "$#" -eq 1 ] || { echo "ROLLBACK=REJECT WRITES=0"; exit 73; }\nhere="$(cd -- "$(dirname -- "$0")" && pwd)"\nnode "$here/rollback.cjs" "$1"\n'); fs.chmodSync(rollback, 0o755);
const bash = process.platform === 'win32' ? 'D:/DEV/Git/bin/bash.exe' : 'bash';
assert.equal(run(bash, ['-c', 'test -x "$1"', '_', rollback]).exit, 0);
const copies = path.join(out, 'copies'); fs.mkdirSync(copies, { recursive: true });
const makeCopy = name => { const dir = path.join(copies, `${name}-${id}`); fs.cpSync(modified, dir, { recursive: true }); fs.writeFileSync(path.join(dir, '.collaboration-copy'), manifest.marker); return dir; };
const restored = makeCopy('rollback'), rollbackResult = run(bash, [rollback, restored]); assert.equal(rollbackResult.exit, 0);
for (const e of entries) { const p = path.join(restored, e.path); if (e.before) assert.equal(hash(fs.readFileSync(p)), e.before); else assert.equal(fs.existsSync(p), false); }
const behavior = run(process.execPath, ['scripts/verify-enterprise-collaboration-integration.mjs', 'ROLLBACK', restored]); assert.equal(behavior.exit, 1);
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'output/enterprise-collaboration-integration-20261102/BASELINE_FINAL/RESULT.json')));
const after = JSON.parse(fs.readFileSync(path.join(root, 'output/enterprise-collaboration-integration-20261102/ROLLBACK/RESULT.json')));
const failures = text => [...text.matchAll(/^FAIL ([^:]+):/gm)].map(m => m[1]).sort();
assert.deepEqual(failures(after.stderr), failures(baseline.stderr));
const guard = makeCopy('later-edit'); fs.appendFileSync(path.join(guard, entries.at(-1).path), '\nLater edit fixture\n');
const guardBefore = entries.map(e => hash(fs.readFileSync(path.join(guard, e.path))));
const guarded = run(bash, [rollback, guard]); assert.equal(guarded.exit, 73);
assert.deepEqual(entries.map(e => hash(fs.readFileSync(path.join(guard, e.path)))), guardBefore);
const unpack = path.join(out, `reopened-${id}`); fs.mkdirSync(unpack); assert.equal(run('tar', ['-xf', archive, '-C', unpack]).exit, 0);
for (const e of entries) { assert.equal(hash(fs.readFileSync(path.join(unpack, e.path))), e.after); assert.equal(hash(fs.readFileSync(path.join(root, e.path))), e.after); }
const modifiedResult = JSON.parse(fs.readFileSync(path.join(root, 'output/enterprise-collaboration-integration-20261102/MODIFIED_SINGLE_CLIENT/RESULT.json')));
const report = ['TARGET=canvas-sharing/message event and reverse-proxy integration', `BASE=${base}`,
  'CHANGED_FIELDS=enterprise transaction event outbox; share create/change publishes shares topic; existing proxy-aware origin rule reused',
  `MODIFIED_FILE=${archive}`, `DIFF_FILE=${diff}`, `VERIFICATION=${path.join(out, 'VERIFICATION.txt')}`, `ROLLBACK=${rollback}`,
  'INPUT=synthetic local accounts + signed native cookies + real PostgreSQL + real shared and messaging HTTP routes; external suppliers=0',
  'BASELINE=' + JSON.stringify(baseline, null, 2), 'MODIFIED_SINGLE_CLIENT=' + JSON.stringify(modifiedResult, null, 2),
  'ROLLBACK_APPLY=' + JSON.stringify(rollbackResult, null, 2), 'ROLLBACK_BEHAVIOR=' + JSON.stringify(after, null, 2),
  'LATER_EDIT_GUARD=' + JSON.stringify(guarded, null, 2),
  'RESTORED_BEHAVIOR=baseline same three assertion failures (two root causes), seven passed; original hashes restored; source remains modified',
  'MANIFEST=' + JSON.stringify(manifest, null, 2), 'REOPENED=archive members hashes matched; patch, rollback script, verification read back',
].join('\n\n');
fs.writeFileSync(path.join(out, 'VERIFICATION.txt'), report);
for (const file of [archive, diff, rollback, path.join(out, 'VERIFICATION.txt')]) assert.ok(fs.readFileSync(file).length);
console.log(rollbackResult.stdout.trim()); console.log(guarded.stdout.trim());
console.log(`INTEGRATION_ARTIFACTS=PASS FILES=${entries.length} SOURCE=MODIFIED COPY=BASELINE REOPENED=4`);
