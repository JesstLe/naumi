import assert from 'node:assert/strict';
import{readFile}from'node:fs/promises';import vm from'node:vm';
const source=process.argv[2]||'src/components/canvas/canvas-client.tsx',original=process.argv.includes('--baseline');
const code=await readFile(source,'utf8');const expression=code.match(/const \[lightCanvas, setLightCanvas\] = useState\((\(\) => \{[\s\S]*?\n  \})\);/);assert.ok(expression,'actual canvas initializer exists');
const cases=[['unset',null,!original],['light','light',true],['dark','dark',false],['unknown','invalid',!original],['storage-blocked','throws',!original],['server','ssr',!original],['desktop','dark',true]];
for(const [name,value,expected]of cases){const context={desktopAppearance:name==='desktop',window:value==='ssr'?undefined:{},localStorage:{getItem(key){assert.equal(key,'nv:canvas:bg');if(value==='throws')throw Error('storage denied');return value;}}};assert.equal(vm.runInNewContext('('+expression[1]+')()',context),expected,name);}
assert.ok(code.includes('next ? "light" : "dark"'),'manual theme toggle still persists both choices');
console.log((original?'BASELINE':'MODIFIED')+'=PASS DEFAULT='+(original?'DARK':'LIGHT')+' SAVED_DARK=PRESERVED SAVED_LIGHT=PRESERVED STORAGE_FAILURE='+(original?'DARK':'LIGHT')+' SSR='+(original?'DARK':'LIGHT')+' TOGGLE=UNCHANGED CASES=7');
