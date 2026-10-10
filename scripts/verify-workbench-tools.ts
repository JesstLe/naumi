import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {TOOLS} from '../src/lib/tool-meta';
import {toolImageError,toolSourceUrl} from '../src/lib/tool-ui';
import {qualityMenuPosition,nextQualityOption} from '../src/components/ui/image-quality-select-layout';
const root=path.resolve(process.argv.find(a=>a.startsWith('--root='))?.slice(7)||'.');
const read=(f:string)=>readFileSync(path.join(root,f),'utf8');
const baseline=process.argv.includes('--baseline');
assert.equal(TOOLS.length,26);assert.equal(new Set(TOOLS.map(t=>t.slug)).size,26);assert.equal(new Set(TOOLS.map(t=>t.href)).size,26);
const checks=[
 ['avatar sends black background',read('src/components/avatar/avatar-client.tsx').includes('bgColor === "黑" ? "black"')],
 ['garment detail in prompt',read('src/components/garment/garment-client.tsx').includes('fd.append("prompt", detail')],
 ['dewrinkle controls in prompt',read('src/components/dewrinkle/dewrinkle-client.tsx').includes('fd.append("prompt", `${strength')],
 ['garment3d explicit feature',read('src/components/garment3d/garment3d-client.tsx').includes('feature="tool.garment3d"')],
 ['extract explicit feature',read('src/components/extract/extract-client.tsx').includes('feature="tool.extract"')],
 ['history no mobile hiding',!read('src/components/tools/tool-workspace.tsx').includes('hidden flex-col')],
 ['dropdown keyboard',read('src/components/ui/select-menu.tsx').includes('aria-activedescendant')],
] as const;
if(baseline){assert.ok(checks.filter(c=>!c[1]).length>=5);console.log(`BASELINE_CONTRACT=PASS TOOLS=26 CONFIRMED_GAPS=${checks.filter(c=>!c[1]).length}`);}
else{
for(const [name,passed]of checks)assert.ok(passed,name);
let cases=0;const file=(name:string,type:string,size:number)=>({name,type,size});
for(const [f,max,accept,result]of [
 [file('a.png','image/png',1),12*1024**2,undefined,null],
 [file('a.JPG','',1),12*1024**2,undefined,null],
 [file('a.png','image/png',0),12*1024**2,undefined,'empty'],
 [file('a.png','image/png',12*1024**2+1),12*1024**2,undefined,'size'],
 [file('a.svg','image/svg+xml',1),12*1024**2,undefined,'type'],
 [file('a.svg','image/svg+xml',16*1024**2),16*1024**2,'image/svg+xml',null],
 [file('a.txt','text/plain',1),12*1024**2,'image/*','type'],
 [file('a.mov','video/quicktime',200*1024**2),200*1024**2,'video/quicktime',null],
 [file('a.wav','audio/wav',50*1024**2),50*1024**2,'audio/wav',null],
 [file('a.png','image/png',20*1024**2),20*1024**2,undefined,null],
] as const){assert.equal(toolImageError(f,max,accept),result);cases++;}
for(const marker of ['canvas-add','upload','undefined','javascript:alert(1)','']){assert.equal(toolSourceUrl(marker),undefined);cases++;}
for(const source of ['https://example.test/a.png','/media/a.png','blob:fixture','data:image/png;base64,AA==']){assert.equal(toolSourceUrl(source),source);cases++;}
for(const width of [320,390,1024,1440])for(const height of [240,600,900])for(const left of [0,width-42]){
 const p=qualityMenuPosition({left,top:height-42,bottom:height,width:42},width,height,26);
 assert.ok(p.left>=8&&p.left+p.width<=width-8&&p.top>=8&&p.top+p.maxHeight<=height-8);cases++;
}
assert.equal(nextQualityOption([{disabled:true},{},{disabled:true},{}],1,1),3);assert.equal(nextQualityOption([{disabled:true}],0,1),-1);cases+=2;
assert.ok(!read('src/components/suite/suite-client.tsx').includes('}, [previews]);'),'suite preview changes must not cancel poll');
assert.ok(read("src/components/tools/tool-shell.tsx").includes('category !== "ipcheck"'));
assert.ok(read("src/components/ipcheck/ipcheck-client.tsx").includes('<TextModelSelect feature="tool.ipcheck"'));
assert.ok(read('src/components/tools/tool-surface.css').includes('color-scheme: light'));
assert.ok(read('src/components/app-shell.tsx').includes('path==="/packaging3d"?16'));
console.log(`MODIFIED_CONTRACT=PASS TOOLS=26 FIXED_GAPS=${checks.length} UNIT_CASES=${cases}`);
}
