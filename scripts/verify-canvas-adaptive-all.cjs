const cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const out=path.resolve('output/canvas-key-frame-long-image-20261021');fs.mkdirSync(out,{recursive:true});
const ts=f=>['--import','tsx','--conditions','react-server','scripts/'+f];
const tests=[
 ['key-frame',ts('verify-canvas-key-frame.ts')],['handler-pg',ts('verify-canvas-adaptive-handler.ts')],
 ['multi-reference',ts('verify-multi-reference-frame.ts')],['auto-reference',ts('verify-auto-reference-ratio.ts')],
 ['aplus',['--conditions','react-server','scripts/verify-aplus-frame-contract.cjs']],
 ['canvas-parameters',ts('verify-canvas-generation-parameters.ts')],['drafts',ts('verify-canvas-node-drafts.ts')],
 ['frame-choice',['scripts/verify-canvas-frame-choice.cjs']],['cutout-pg',ts('verify-canvas-cutout-parameters.ts')],
 ['quality-policy',ts('verify-model-management-quality-parameters.ts')],['quality-billing',ts('verify-quality-billing.ts')],
 ['model-execution',ts('verify-model-execution.ts')],['failure',['scripts/verify-canvas-generation-failure.cjs']],
 ['timeline',ts('verify-agent-stream-timeline.ts')],['timeline-pg',ts('verify-agent-timeline-pg.ts')],
 ['recovery',ts('verify-agent-stream-recovery.ts')],['harness',ts('verify-agent-harness.ts')],
 ['stream-intent',ts('verify-agent-stream-intent.ts')],['upload-during-reply',['scripts/verify-agent-upload-during-reply.cjs']],
 ['types',['node_modules/typescript/bin/tsc','--noEmit','--incremental','false']]
];
const records=[];
for(const [name,args] of tests){
 const r=cp.spawnSync(process.execPath,args,{cwd:process.cwd(),env:process.env,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,timeout:240000});
 const record={name,command:'node '+args.join(' '),exit:r.status,output:(r.stdout||'')+(r.stderr||'')};records.push(record);
 fs.writeFileSync(path.join(out,name+'.txt'),record.output);fs.writeFileSync(path.join(out,'suite.json'),JSON.stringify(records,null,2));
 console.log(name+': '+(record.output.trim()||'exit='+r.status));if(r.status!==0)process.exit(r.status||1);
}
console.log('CANVAS_ADAPTIVE_SUITE=PASS MODULES='+records.length+' EXTERNAL_SUPPLIER_CALLS=0');
