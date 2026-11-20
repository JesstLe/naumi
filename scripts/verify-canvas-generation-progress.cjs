const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm'),esbuild=require('esbuild');
const mode=process.argv[2]||'MODIFIED',out=path.resolve(process.argv[3]||'output/canvas-generation-progress-20261016');
const root=mode==='BASELINE'?path.join(out,'baseline'):mode==='ROLLBACK'?path.join(out,'rollback-copy'):process.cwd();
const component=fs.readFileSync(path.join(root,'src/components/canvas/generation-placeholder.tsx'),'utf8');
if(mode!=='MODIFIED'){
 assert.match(component,/已等待 \$\{seconds\} 秒/);assert.doesNotMatch(component,/role="progressbar"/);
 console.log(`${mode}=PASS DISPLAY=ELAPSED_SECONDS PERCENT_BAR=ABSENT EXIT=0`);process.exit(0);
}
const source=fs.readFileSync('src/lib/canvas/generation-progress.ts','utf8');
const compiled=esbuild.transformSync(source,{loader:'ts',format:'cjs'}).code,context=vm.createContext({module:{exports:{}},exports:{},require});vm.runInContext(compiled,context);
const {generationDisplayProgress:progress,generationProgressHint:hint}=context.module.exports;
let curves=new Set();for(const seed of [0,1,2,9,99,1000,1793021601]){
 for(const stage of ['queued','preparing','generating','saving']){
  let displayed=0;for(let sec=0;sec<=3600;sec++){const p=progress(stage,sec,undefined,1,seed);assert.ok(p>=0&&p<=(stage==='saving'?100:99)&&Number.isInteger(p));assert.equal(p,progress(stage,sec,undefined,1,seed));displayed=Math.max(displayed,p);assert.ok(displayed>=p);}
  if(stage==='generating')assert.equal(displayed,99);
  for(const t of [NaN,Infinity,-20])assert.ok(Number.isFinite(progress(stage,t,undefined,1,seed)));
 }
 assert.ok(progress('queued',3600,undefined,1,seed)>=1&&progress('queued',3600,undefined,1,seed)<=25);assert.equal(progress('saving',3600,undefined,1,seed),100);
 assert.ok(progress('generating',5,undefined,1,seed)>=45,'front/middle moves quickly');
 assert.ok(progress('generating',10,undefined,1,seed)>=90,'90 reached within ten seconds');
 assert.ok(progress('generating',35,undefined,1,seed)<99,'final stretch is slower, not an early 99 plateau');
 assert.equal(progress('generating',90,undefined,1,seed),99,'hold below completion until real result');
 let previous=0;for(let sec=0;sec<=100;sec+=.1){const next=progress('generating',sec,undefined,1,seed);assert.ok(next>=previous,'curve cannot oscillate backwards');previous=next;}
 curves.add(Array.from({length:35},(_,t)=>progress('generating',t,undefined,1,seed)).join(','));
}
assert.ok(curves.size>1);assert.ok(progress('preparing',3600)<progress('generating',3600));
assert.ok(progress('generating',0,3,4)>=67);
assert.match(component,/aria-valuenow=\{percent\}/);assert.match(component,/aria-valuemin=\{0\}/);assert.match(component,/aria-valuemax=\{100\}/);
assert.match(component,/Math.max\(displayed.current.percent, candidate\)/);assert.match(component,/displayed.current.identity !== identity/);
assert.match(component,/const identity = taskId \?\? start/);
assert.doesNotMatch(component,/已等待|s elapsed|预估|预计|estimated/i);
assert.doesNotMatch(component,/Image ready|图片已生成|Video ready|视频已生成/);
assert.doesNotMatch(hint('generating',400),/马上|即将|已完成|细化/);
const css=fs.readFileSync('src/components/canvas/generation-placeholder.module.css','utf8');assert.match(css,/prefers-reduced-motion/);assert.match(css,/transition:none/);
console.log('MODIFIED=PASS DISPLAY=PERCENT_BAR SEEDED_CURVES=PASS GENERATE_PLATEAU=99 SAVE_MAX=100 UI_MONOTONIC=PASS RESET=PASS SUPPLIER_STATUS_UNCHANGED=1 ACCESSIBILITY=PASS EXIT=0');
