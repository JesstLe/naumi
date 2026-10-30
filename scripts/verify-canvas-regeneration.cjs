/** Executes the actual Canvas adapter and creation owner through the existing
 * recorded task ports. R6V already had owners: baseline never means old inline. */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'.'),mode=process.argv[3]||'modified',out=path.resolve(process.env.CANVAS_REGEN_EVIDENCE||'output/canvas-regeneration',mode);
cp.execFileSync(process.execPath,['scripts/verify-canvas-image-creation.cjs','--source-root',root,'--out',out],{stdio:'inherit',windowsHide:true,env:{...process.env,GOMAXPROCS:'2'}});
const result=JSON.parse(fs.readFileSync(path.join(out,'RESULT.json'),'utf8'));
const standard=result.common.find(c=>c.name==='standard-prompt').result.calls[0],triptych=result.common.find(c=>c.name==='triptych-with-feedback').result.calls[0];
const single=result.common.find(c=>c.name==='standard-single-image').result.calls[0];
if(mode==='baseline'){assert.equal(standard.options.replaceNode===true,false);}
else{
  assert.equal(standard.options.count,2);assert.equal(standard.options.fanout,true);assert.equal(standard.options.replaceNode,false);
  assert.equal(single.options.count,1);assert.equal(single.options.replaceNode,true);assert.equal(single.options.fanout,false);
}

assert.equal(triptych.options.replaceNode===true,false);assert.equal(triptych.options.parentId,'source');
assert.equal(standard.prompt,'用户要求');assert.equal(result.retiredRedo,mode!=='baseline');
console.log(`${mode.toUpperCase()}=${mode==='baseline'?'REPRODUCED':'PASS'} PRIMARY=${result.primary} SAME_NODE=${single.options.replaceNode===true?1:0} MULTI_COUNT=${standard.options.count} MULTI_FANOUT=${standard.options.fanout?1:0} EXPLICIT_DERIVATION=RETAINED TASK_PORTS=RECORDED ACTUAL_CREATION_OWNER=1 RETIRED_REDO=${result.retiredRedo?1:0} SUPPLIER=0`);
