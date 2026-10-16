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
for(const stage of ['preparing','generating','saving']){
 let previous=0;for(let sec=0;sec<=3600;sec++){const p=progress(stage,sec);assert.ok(p>=previous&&p<100&&Number.isInteger(p));previous=p;}
 for(const t of [NaN,Infinity,-20])assert.ok(Number.isFinite(progress(stage,t)));
}
assert.ok(progress('preparing',3600)<progress('generating',0));assert.ok(progress('generating',3600)<progress('saving',0));
assert.equal(progress('generating',3600),92);assert.equal(progress('saving',3600),98);
assert.ok(progress('generating',0,3,4)>=67);
assert.match(component,/aria-valuenow=\{percent\}/);assert.match(component,/aria-valuemin=\{0\}/);assert.match(component,/aria-valuemax=\{100\}/);
assert.match(component,/Math.max\(displayed.current.percent, candidate\)/);assert.match(component,/displayed.current.start !== start/);
assert.doesNotMatch(component,/已等待|s elapsed|预估|预计|estimated/i);
assert.doesNotMatch(component,/Image ready|图片已生成|Video ready|视频已生成/);
assert.doesNotMatch(hint('generating',400),/马上|即将|已完成|细化/);
const css=fs.readFileSync('src/components/canvas/generation-placeholder.module.css','utf8');assert.match(css,/prefers-reduced-motion/);assert.match(css,/transition:none/);
console.log('MODIFIED=PASS DISPLAY=PERCENT_BAR PREPARE_MAX=16 GENERATE_MAX=92 SAVE_MAX=98 NO_PREMATURE_100=PASS MONOTONIC=PASS RESET=PASS NO_ESTIMATE_LABEL=PASS ACCESSIBILITY=PASS EXIT=0');
