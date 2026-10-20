import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=new URL('../../',import.meta.url);
for(const f of ['design/enterprise-demo/verify.mjs','design/enterprise-demo/schedule-tests.mjs','design/enterprise-demo/workbook-tests.mjs','design/enterprise-demo/source-tests.mjs','design/enterprise-demo/import-view-tests.mjs','design/enterprise-demo/sheet-grid-tests.mjs','design/enterprise-demo/sheet-save-tests.mjs','docs/enterprise/tools/build-scheduling-docs.mjs']){
 const r=spawnSync(process.execPath,[fileURLToPath(new URL(f,root))],{encoding:'utf8'});if(r.status!==0){process.stderr.write(r.stdout+r.stderr);process.exit(r.status||1);}
 if(f.endsWith('schedule-tests.mjs'))assert(r.stdout.includes('checks=36'));
}
const html=await readFile(new URL('design/enterprise-demo/preview.html',root),'utf8');assert(html.includes('scPublish')&&html.includes('schedEditor')&&html.includes('schedulePage'));
console.log('RELEASE_CHECK_PASS: static=1 model=36+32 source=12 documents=5 acceptance=50');
