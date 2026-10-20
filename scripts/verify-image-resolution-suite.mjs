import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='output/image-resolution-fallback-20261020';mkdirSync(out,{recursive:true});
const commands=[
 ['--conditions=react-server','--import','tsx','scripts/verify-image-resolution-fallback.ts'],
 ['--conditions=react-server','--import','tsx','scripts/verify-image-resolution-fallback-pg.ts'],
 ['--conditions=react-server','--import','tsx','scripts/verify-resolution-parameters.ts'],
 ['--conditions=react-server','--import','tsx','scripts/verify-model-execution.ts'],
 ['--conditions=react-server','--import','tsx','scripts/verify-imagegen-execution.ts'],
 ['--conditions=react-server','--import','tsx','scripts/verify-imagegen-contract.ts'],
 ['--conditions=react-server','--import','tsx','scripts/verify-imagegen-intent.ts'],
 ['--conditions=react-server','--import','tsx','scripts/verify-cutout-execution.ts'],
 ['--conditions=react-server','--import','tsx','scripts/verify-apib-seedream.ts'],
 ['--conditions=react-server','--import','tsx','scripts/verify-apimart-default-preset.ts'],
 ['--conditions=react-server','--import','tsx','scripts/verify-apimart-async-contract.ts'],
 ['--conditions=react-server','--import','tsx','scripts/verify-apimart-async-images.ts'],
 ['--conditions=react-server','--import','tsx','scripts/verify-imagegen-client-recovery.ts'],
 ['--conditions=react-server','--import','tsx','scripts/verify-billing-intents.ts'],
 ['--conditions=react-server','--import','tsx','scripts/verify-billing-rules.ts'],
 ['--conditions=react-server','--import','tsx','scripts/verify-canvas-generation-parameters.ts'],
 ['--conditions=react-server','--import','tsx','scripts/verify-image-delivery-preflight.ts'],
 ['node_modules/typescript/bin/tsc','--noEmit','--pretty','false'],
];
const results=[];
for(const args of commands){const r=spawnSync(process.execPath,args,{env:process.env,encoding:'utf8',maxBuffer:16*1024*1024,timeout:360000});const row={command:['node',...args].join(' '),input:'isolated fixtures; no external supplier; latest user price policy original selection remains unchanged',output:r.stdout||'',stderr:r.stderr||'',exitStatus:r.status,error:r.error?.message};results.push(row);console.log(row.command+' => '+r.status);process.stdout.write(row.output);process.stderr.write(row.stderr);writeFileSync(out+'/suite-results.json',JSON.stringify(results,null,2)+'\n');}
console.log(`RESOLUTION_SUITE=${results.every(r=>r.exitStatus===0)?'PASS':'FAIL'} COMMANDS=${results.length} FAILURES=${results.filter(r=>r.exitStatus!==0).length} EXTERNAL_CALLS=0`);process.exitCode=results.some(r=>r.exitStatus!==0)?1:0;
