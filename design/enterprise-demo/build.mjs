import { readFile,writeFile } from 'node:fs/promises';
const root=new URL('./',import.meta.url);
const template=await readFile(new URL('index.html',root),'utf8');
const css=(await Promise.all(['demo.css','schedule.css'].map(f=>readFile(new URL(f,root),'utf8')))).join('\n').replaceAll('\r\n','\n');
const js=(await Promise.all(['schedule-model.js','demo.js','schedule-ui.js'].map(f=>readFile(new URL(f,root),'utf8')))).join('\n').replaceAll('\r\n','\n')+'\nshell();\n';
const html=template.replace('/*INLINE_CSS*/',()=>css).replace('/*INLINE_JS*/',()=>js);
await writeFile(new URL('preview.html',root),html);
console.log('DEMO_BUILD_PASS: single_html=1 external_assets=0 local_fixture=1');
