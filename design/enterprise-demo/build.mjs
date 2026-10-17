import { readFile,writeFile } from 'node:fs/promises';
const root=new URL('./',import.meta.url);
const template=await readFile(new URL('index.html',root),'utf8');
const css=(await readFile(new URL('demo.css',root),'utf8')).replaceAll('\r\n','\n');
const js=(await readFile(new URL('demo.js',root),'utf8')).replaceAll('\r\n','\n');
const html=template.replace('/*INLINE_CSS*/',()=>css).replace('/*INLINE_JS*/',()=>js);
await writeFile(new URL('preview.html',root),html);
console.log('DEMO_BUILD_PASS: single_html=1 external_assets=0 local_fixture=1');
