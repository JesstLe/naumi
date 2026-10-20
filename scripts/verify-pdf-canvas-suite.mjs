/** One module-level suite. Every exit code and literal output is retained. */
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='output/pdf-issues-repair-20261020';mkdirSync(out,{recursive:true});
const commands=[
 ['--import','tsx','scripts/verify-pdf-canvas-repair.ts'],
 ['scripts/verify-pdf-canvas-source.cjs'],
 ['--conditions=react-server','--import','tsx','scripts/verify-pdf-canvas-pg.ts'],
 ['--import','tsx','scripts/verify-canvas-node-drafts.ts'],
 ['--import','tsx','scripts/verify-canvas-media-loading.ts'],
 ['scripts/verify-canvas-detail-failure.cjs'],
 ['scripts/verify-canvas-recovery-selection.cjs'],
 ['scripts/audit-canvas-postrelease.cjs'],
 ['--conditions=react-server','--import','tsx','scripts/verify-imagegen-contract.ts'],
 ['--conditions=react-server','--import','tsx','scripts/verify-imagegen-intent.ts'],
 ['--conditions=react-server','--import','tsx','scripts/verify-cutout-execution.ts'],
 ['--conditions=react-server','scripts/verify-aplus-frame-contract.cjs'],
 ['scripts/verify-canvas-upload-visibility.cjs'],
 ['scripts/verify-canvas-generation-failure.cjs'],
 ['--conditions=react-server','--import','tsx','scripts/verify-canvas-generation-parameters.ts'],
 ['scripts/verify-canvas-generation-concurrency.mjs'],
 ['scripts/verify-canvas-generation-locks.mjs'],
 ['scripts/verify-canvas-edit-task-lifecycle.cjs'],
 ['node_modules/typescript/bin/tsc','--noEmit','--pretty','false'],
];
const rows=[];
for(const args of commands){
 const r=spawnSync(process.execPath,args,{env:process.env,encoding:'utf8',maxBuffer:16*1024*1024,timeout:240000});
 const row={command:['node',...args].join(' '),input:'isolated fixtures; no user tasks; no external suppliers',output:r.stdout||'',stderr:r.stderr||'',exitStatus:r.status,error:r.error?.message};
 rows.push(row);console.log(row.command+' => '+r.status);process.stdout.write(row.output);process.stderr.write(row.stderr);
}
writeFileSync(out+'/suite-results.json',JSON.stringify(rows,null,2)+'\n');
const failures=rows.filter(r=>r.exitStatus!==0);
console.log(`PDF_SUITE=${failures.length?'FAIL':'PASS'} COMMANDS=${rows.length} FAILURES=${failures.length} SUPPLIER_CALLS=0`);
process.exitCode=failures.length?1:0;
