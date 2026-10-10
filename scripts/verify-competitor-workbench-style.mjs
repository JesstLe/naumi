import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=path.resolve(process.argv.find(x=>x.startsWith('--root='))?.slice(7)||'.');
const source=fs.readFileSync(path.join(root,'src/components/competitors/competitor-client.tsx'),'utf8');
const css=fs.readFileSync(path.join(root,'src/components/competitors/competitors.css'),'utf8');
if(process.argv.includes('--baseline')){
 assert.ok(css.includes('grid-template-columns:230px minmax(280px,1fr) 320px'));
 assert.ok(css.includes('.cmp-workspace button,.cmp-workspace select'));
 assert.ok(!source.includes('data-tool-workspace="competitors"'));
 console.log('BASELINE=PASS LAYOUT=LEGACY CONTROLS=BROAD_OVERRIDE');
}else{
 for(const token of ['--c-card','--c-border','--c-border2','--c-subtle2','--c-text','--acc','--cmp-accent-tint','--shadow-card','--grad-acc'])assert.ok(css.includes(`var(${token})`),token);
 assert.ok(source.includes('data-tool-workspace="competitors"'));
 assert.ok(source.includes('aria-label="面包屑"'));
 assert.ok(source.includes('aria-pressed={drawing}'));
 assert.ok(source.includes('cmp-properties-scroll nv-panel-scroll'));
 assert.ok(!css.includes('.cmp-workspace button,'));
 assert.ok(!css.includes('#2768d4'));
 assert.ok(css.includes('border-radius:16px'));
 assert.ok(css.includes('grid-template-columns:280px minmax(0,1fr) 320px'));
 assert.ok(css.includes('.cmp-workspace .cmp-region { position:absolute;'));
 assert.ok(css.includes('prefers-reduced-motion'));
 const baseline=execFileSync('git',['show','1ee48c9f3363749e78f0b8a3246cdd45edc7a162:src/components/competitors/competitor-client.tsx'],{encoding:'utf8'});
 const business=s=>s.slice(s.indexOf('export function CompetitorClient()'),s.indexOf('\n  return <div')).replace(/\r\n/g,'\n');
 assert.equal(business(source),business(baseline),'Business handlers must be unchanged');
 for(const file of ['src/components/competitors/region-editor.tsx','src/lib/competitor-types.ts']){
  const original=execFileSync('git',['show',`1ee48c9f3363749e78f0b8a3246cdd45edc7a162:${file}`]);
  const current=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');assert.equal(createHash('sha256').update(current).digest('hex'),createHash('sha256').update(original.toString('utf8').replace(/\r\n/g,'\n')).digest('hex'));
 }
 console.log('MODIFIED=PASS CARDS=3 SHARED_TOKENS=YES POPOVERS=UNOVERRIDDEN BUSINESS=UNCHANGED GEOMETRY=UNCHANGED');
}
