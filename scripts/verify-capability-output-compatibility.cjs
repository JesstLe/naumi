/** Real PNG baseline/modified comparison. No database or supplier dispatch. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {build} = require('esbuild');
const sharp = require('sharp');
const baseline = path.resolve(process.env.BASELINE_SOURCE || '');
const modified = process.cwd();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function load(root) {
  const code = (await build({
    stdin: {contents: `export {finishStoredImage} from ${JSON.stringify(path.join(root,'src/lib/imagegen/finish-stored-image.ts'))}`, resolveDir: root},
    bundle: true, platform: 'node', format: 'cjs', write: false, external: ['sharp'],
    plugins: [{name:'server-marker',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'marker',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export {};'}));}}],
  })).outputFiles[0].text;
  const m = {exports:{}};
  vm.runInThisContext(require('node:module').wrap(code))(m.exports,require,m,__filename,__dirname);
  return m.exports.finishStoredImage;
}
(async()=>{
  assert(process.env.BASELINE_SOURCE, 'BASELINE_SOURCE is required');
  const protectedFiles = ['src/lib/imagegen/finish-stored-image.ts','src/lib/imagegen/cutout-provider.ts','src/lib/model-config/requests.ts','src/lib/download.ts','src/lib/imagegen/postprocess.ts'];
  for(const f of protectedFiles) assert.equal(hash(fs.readFileSync(path.join(modified,f))),hash(fs.readFileSync(path.join(baseline,f))),`protected source unchanged: ${f}`);
  const before = await load(baseline), after = await load(modified);
  const input = await sharp({create:{width:32,height:24,channels:4,background:{r:17,g:93,b:211,alpha:0.5}}}).png().toBuffer();
  const cases = [
    ['already-final',{final:true,preset:false,resolution:'4K'}],
    ['legacy-resize',{final:false,preset:false,resolution:'2K'}],
    ['mapped-actual-output',{final:false,preset:false,imageParameterPlanVersion:1,resolution:'4K'}],
    ['preset-actual-output',{final:false,preset:true,resolution:'4K'}],
    ['explicit-frame',{final:false,preset:false,imageParameterPlanVersion:1,targetWidth:64,targetHeight:64,transparent:true}],
    ['configured-resize',{final:false,preset:false,post:{enabled:true,kind:'resize',processor:'sharp-lanczos3',width:64,height:48,failure:'pending'}}],
  ];
  const results=[];
  for(const [name,options] of cases){
    const a=await before(input,options),b=await after(input,options);
    assert.deepEqual(b,a,`${name}: identical encoded bytes`);
    const meta=await sharp(b).metadata();
    const alpha=await sharp(b).ensureAlpha().extractChannel(3).stats();
    if(['already-final','mapped-actual-output','preset-actual-output'].includes(name))assert.deepEqual(b,input,`${name}: original bytes retained`);
    if(name==='legacy-resize')assert.deepEqual([meta.width,meta.height],[2048,1536]);
    assert(alpha.channels[0].min<255,`${name}: alpha remains meaningful`);
    results.push({name,width:meta.width,height:meta.height,sha256:hash(b),identical:true});
  }
  assert.equal(hash(input),hash(await sharp({create:{width:32,height:24,channels:4,background:{r:17,g:93,b:211,alpha:0.5}}}).png().toBuffer()));
  const out=path.resolve(process.env.EVIDENCE_OUT||'output/capability-output-compatibility');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({baseline,modified,protectedFiles,results},null,2));
  console.log(`CAPABILITY_OUTPUT_COMPATIBILITY=PASS CASES=${cases.length} PROTECTED_FILES=${protectedFiles.length} BYTES=IDENTICAL DIMENSIONS=IDENTICAL ALPHA=RETAINED NETWORK=0`);
})().catch(e=>{console.error(e);process.exitCode=1;});
