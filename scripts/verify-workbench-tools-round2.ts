import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {validToolImages} from '../src/lib/tool-ui';

const root=path.resolve(process.argv.find(a=>a.startsWith('--root='))?.slice(7)||'.');
const read=(file:string)=>readFileSync(path.join(root,file),'utf8');
const checks=[
 ['titles reject malformed result',read('src/components/titles/title-gen-client.tsx').includes('Array.isArray(data.titles)')],
 ['packaging rejects missing job',read('src/components/packaging3d/packaging3d-client.tsx').includes('typeof jobId !== "string"')],
 ['fuse validates done images',read('src/components/fuse/fuse-client.tsx').includes('validToolImages(s.images)')],
 ['variations validates done images',read('src/components/variations/variations-client.tsx').includes('validToolImages(s.images)')],
 ['generate guards stale source',read('src/components/generate/generate-client.tsx').includes('sourceEpoch.current !== epoch')],
 ['video avoids stale polling closure',read('src/components/video/video-studio-client.tsx').includes('terminal = true;')],
 ['dialog focus trap',read('src/components/ui/text-model-select.tsx').includes('document.activeElement === last')],
 ...['fuse/fuse','variations/variations','inpaint/inpaint','ipcheck/ipcheck','tryon/tryon','printfile/printfile'].map(tool=>[tool+' latest preview cleanup',read('src/components/'+tool+'-client.tsx').includes('useObjectUrlCleanup(')] as const),
] as const;
if(process.argv.includes('--baseline')){
 assert.equal(checks.filter(c=>!c[1]).length,13);
 console.log('BASELINE_ROUND2_CONTRACT=PASS CONFIRMED_GAPS=13');
}else{
 for(const [name,pass]of checks)assert.ok(pass,name);
 let cases=0;
 const good={id:'gen-round2',url:'/media/result.png'};
 for(const [input,valid] of [[undefined,false],[null,false],[{},false],[[],false],['x',false],[[null],false],[[{}],false],[[{id:'',url:'/media/a'}],false],[[{id:'a',url:'javascript:alert(1)'}],false],[[{id:'a',url:2}],false],[[good],true],[[good,{id:'b',url:'https://example.test/a.png'}],true],[[good,{id:'b',url:''}],false]] as const){assert.equal(validToolImages(input),valid);cases++;}
 console.log(`MODIFIED_ROUND2_CONTRACT=PASS FIXED_GAPS=${checks.length} UNIT_CASES=${cases}`);
}
