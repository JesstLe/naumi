import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const[mode,dir]=process.argv.slice(2),root=path.resolve(dir||'design/folio-preview');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),hash=crypto.createHash('sha256').update(html).digest('hex');
if(mode==='baseline'||mode==='rollback'){
 assert.equal(hash,'58b1c811a7cd5777f2defd35e41d7141c7e092dfcef1e0e75bc0c459b3c4ec00');
 assert.ok(html.includes('0 件作品'));
 const entries=fs.readdirSync(path.join(root,'assets'));
 assert.deepEqual(entries.filter(f=>fs.statSync(path.join(root,'assets',f)).isFile()),['logo.svg']);
 for(const f of entries.filter(f=>fs.statSync(path.join(root,'assets',f)).isDirectory()))assert.equal(fs.readdirSync(path.join(root,'assets',f)).length,0);
 console.log(`${mode.toUpperCase()}=PASS; preview_sha256=${hash}; previous_empty_preview=restored`);
}else if(mode==='modified'){
 const result=spawnSync('node',['scripts/verify-folio-preview.mjs','modified'],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);process.stdout.write(result.stdout);
}else throw new Error('baseline|modified|rollback');
