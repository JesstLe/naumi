import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fork } from 'node:child_process';
import { build } from 'esbuild';

const root = path.resolve(process.argv[2] || '.');
const out = path.resolve('output/a15');
fs.mkdirSync(out, { recursive: true });
const worker = path.join(out, 'baseline-worker.cjs');
await build({ stdin: { contents: `import {rateLimit} from ${JSON.stringify(path.join(root, 'src/lib/rate-limit.ts'))};
process.on('message', async ({id, calls}) => { const values=[]; for(const [now,key,limit,window] of calls){ Date.now=()=>now; values.push(await rateLimit(key,limit,window)); } process.send({id,values}); });`, resolveDir: root, loader: 'ts' },
  outfile: worker, bundle: true, platform: 'node', format: 'cjs', plugins: [{ name: 'server-only', setup(b) { b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'empty', namespace: 'empty' })); b.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '' })); } }] });
const whitelist = new Set(['PATH','SYSTEMROOT','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','PATHEXT']);
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => whitelist.has(k.toUpperCase())));
const children = [0, 1].map(() => fork(worker, [], { env, windowsHide: true, stdio: ['ignore','pipe','pipe','ipc'] }));
let id = 0;
function call(child, calls) { return new Promise((resolve, reject) => { const request = ++id; const listener = m => { if (m.id === request) { child.off('message', listener); resolve(m.values); } }; child.on('message', listener); child.once('error', reject); child.send({ id: request, calls }); }); }
try {
  const counts = await Promise.all(children.map(child => call(child, Array.from({length:5}, () => [100000, 'same-key', 5, 600000]))));
  const admitted = counts.flat().filter(Boolean).length;
  assert.equal(admitted, 10);
  console.log(`BASELINE TWO_PROCESSES admitted=${admitted} original_limit=5 defect=REPRODUCED`);
  const windows = await call(children[0], [[100000,'long',1,600000],[161001,'short',1,60000],[161001,'long',1,600000]]);
  assert.deepEqual(windows, [true,true,true]);
  console.log(`BASELINE FIXED_CLOCK input=100000:long/1/600000,161001:short/1/60000,161001:long/1/600000 output=${JSON.stringify(windows)} defect=REPRODUCED`);
} finally {
  await Promise.all(children.map(child => new Promise(resolve => { child.once('exit', resolve); child.kill(); })));
}
