import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import sharp from "sharp";
import {TOOL_DEMOS, SUITE_DEMO_SETS} from "../src/lib/tool-demo-catalog";
const root=path.resolve(process.argv.find(x=>x.startsWith('--root='))?.slice(7)||'.');
const read=(p:string)=>fs.readFileSync(path.join(root,p),'utf8');
async function main(){
 if(process.argv.includes('--baseline')){
  assert.ok(read('src/components/tools/tool-demo.tsx').includes('/demos/upscale-before.webp'));
  assert.ok(read('src/components/suite/suite-client.tsx').includes('/demos/suite-demo/thermos-src.png'));
  console.log('BASELINE=PASS DEMOS=LEGACY SUITE=LEGACY');return;
 }
 assert.equal(Object.keys(TOOL_DEMOS).length,23);assert.equal(SUITE_DEMO_SETS.length,2);
 const files=Object.values(TOOL_DEMOS).flatMap(d=>[d.before,d.after,d.combo,...(d.gallery||[])].filter(Boolean)) as string[];
 files.push(...SUITE_DEMO_SETS.flatMap(s=>[s.src,...s.shots.map(x=>x.img)]));
 assert.equal(files.length,57);assert.equal(new Set(files).size,57);
 const manifest=JSON.parse(read('public/demos/workbench-v2/manifest.json'));assert.equal(manifest.assets.length,57);
 const hashes=new Set<string>();let total=0;
 for(const url of files){
  assert.ok(url.startsWith('/demos/workbench-v2/'));const file=path.join(root,'public',url),b=fs.readFileSync(file),m=await sharp(b).metadata();
  assert.equal(m.format,'webp');assert.equal(m.width,640);assert.ok([640,720,1080].includes(m.height!));assert.ok(b.length<350000);
  const hash=createHash('sha256').update(b).digest('hex');assert.ok(!hashes.has(hash));hashes.add(hash);total+=b.length;
  const record=manifest.assets.find((r:{path:string})=>r.path===url);assert.ok(record);assert.equal(record.sha256,hash);assert.equal(record.bytes,b.length);
  assert.ok(record.source.jobId.startsWith('job-'));assert.ok(record.source.promptHash.length===64);assert.equal(record.source.method,'naumi-native-generation');
 }
 assert.ok(total<6*1024*1024);
 const alpha=await sharp(path.join(root,'public/demos/workbench-v2/cutout-after.webp')).stats();assert.equal(alpha.isOpaque,false);assert.equal(alpha.channels.length,4);assert.equal(alpha.channels[3].min,0);
 const component=read('src/components/tools/tool-demo.tsx');assert.ok(component.includes('grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]'));assert.ok(!component.includes('w-[clamp'));assert.ok(component.includes('beforeLabelEn'));assert.ok(component.includes('backgroundSize: "16px 16px"'));
 const suite=read('src/components/suite/suite-client.tsx');assert.ok(!suite.includes('/demos/suite-demo/'));assert.ok(suite.includes('prefers-reduced-motion'));assert.ok(suite.includes('aria-pressed'));
 const evidence=process.env.WORKBENCH_DEMO_EVIDENCE;if(evidence){for(const r of JSON.parse(fs.readFileSync(path.join(evidence,'aplus-hashes.json'),'utf8')))assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,r.path))).digest('hex'),r.sha256);}
 console.log(`MODIFIED=PASS CONFIGURATIONS=23 ASSETS=57 SUITE_SETS=2 SOURCE=NATIVE CUTOUT=ALPHA SHA256=VERIFIED APLUS=UNCHANGED BYTES=${total}`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
