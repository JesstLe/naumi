// Actual pure policy and nearestImageRatios source; synthetic config, no I/O.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2),get=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const mode=get('--mode','modified'),input=get('--input',path.join(root,'scripts/fixtures/x6-parameters-v152.json'));
const load=(file,imports=require)=>{const m={exports:{}};const js=esbuild.transformSync(fs.readFileSync(file,'utf8'),{loader:'ts',format:'cjs',target:'node20'}).code;vm.runInThisContext('(function(require,module,exports){'+js+'\n})')(imports,m,m.exports);return m.exports;};
const policy=load(path.join(root,'scripts/repair-x6-flash-ratios-policy.ts'));
const nearest=load(path.join(root,'src/lib/model-config/frame-fallback.ts'),id=>id.startsWith('.')?{}:require(id)).nearestImageRatios;
const original=JSON.parse(fs.readFileSync(input,'utf8')),pick=c=>c.upstreamModels.find(u=>u.id==='apib:gemini-3.1-flash-image-preview'),list=c=>pick(c).parameterMap.apimartImages.ratios;
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
if(mode==='baseline'||mode==='rollback'){
 check('original wrong enum selects 1:2',()=>assert.equal(nearest('9:21',list(original))[0],'1:2'));
 check('original has both undocumented entries',()=>assert(list(original).includes('1:2')&&list(original).includes('2:1')));
 console.log(`X6_FLASH_RATIOS=${mode.toUpperCase()} REPRODUCED CHECKS=${checks} EFFECTIVE=1:2 NETWORK=0 SUPPLIER_CALLS=0`);
}else{
 assert.equal(mode,'modified');const before=JSON.stringify(original),fixed=policy.repairX6FlashRatios(original);
 check('source not mutated',()=>assert.equal(JSON.stringify(original),before));
 check('real nearest explicit 9:21',()=>assert.equal(nearest('9:21',list(fixed))[0],'9:16'));
 check('real nearest reference 941:1672',()=>assert.equal(nearest('941:1672',list(fixed))[0],'9:16'));
 check('explicit supported landscape preserved',()=>assert.equal(nearest('16:9',list(fixed))[0],'16:9'));
 check('only two ratios removed',()=>assert.deepEqual(list(fixed),list(original).filter(r=>!['1:2','2:1'].includes(r))));
 check('all other fields preserved',()=>{const c=structuredClone(fixed);pick(c).parameterMap.apimartImages.ratios=[...list(original)];assert.deepEqual(c,original)});
 check('idempotent no override',()=>assert.deepEqual(policy.repairX6FlashRatios(fixed),fixed));
 for(const field of ['upstream','provider'])check('disabled '+field+' retained',()=>{const c=structuredClone(original);if(field==='upstream')pick(c).enabled=false;else c.providers.find(p=>p.id==='apib-image').enabled=false;assert.deepEqual(policy.repairX6FlashRatios(c),c)});
 check('later admin list retained',()=>{const c=structuredClone(original);list(c).pop();assert.deepEqual(policy.repairX6FlashRatios(c),c)});
 check('admin reordered list retained',()=>{const c=structuredClone(original);list(c).reverse();assert.deepEqual(policy.repairX6FlashRatios(c),c)});
 for(const field of ['model','providerId','protocol'])check('identity guard '+field,()=>{const c=structuredClone(original);if(field==='protocol')c.providers.find(p=>p.id==='apib-image').protocol='openai-images';else pick(c)[field]='later-change';const before=JSON.stringify(c);assert.throws(()=>policy.repairX6FlashRatios(c),/IDENTITY/);assert.equal(JSON.stringify(c),before)});
 check('copy rollback exact',()=>assert.deepEqual(policy.rollbackX6FlashRatios(fixed,original),original));
 check('copy rollback preserves unrelated later edit',()=>{const c=structuredClone(fixed);pick(c).label='later label';assert.equal(pick(policy.rollbackX6FlashRatios(c,original)).label,'later label')});
 check('copy rollback later ratio guard zero mutation',()=>{const c=structuredClone(fixed);list(c).pop();const before=JSON.stringify(c);assert.throws(()=>policy.rollbackX6FlashRatios(c,original),/LATER_EDIT/);assert.equal(JSON.stringify(c),before)});
 check('copy rollback route guard zero mutation',()=>{const c=structuredClone(fixed);pick(c).model='later';const before=JSON.stringify(c);assert.throws(()=>policy.rollbackX6FlashRatios(c,original),/IDENTITY/);assert.equal(JSON.stringify(c),before)});
 console.log(`X6_FLASH_RATIOS=MODIFIED PASS CHECKS=${checks} EFFECTIVE=9:16 NETWORK=0 SUPPLIER_CALLS=0`);
}
