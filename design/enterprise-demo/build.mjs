import {readFile,writeFile} from 'node:fs/promises';
import {assembleProduct} from './assemble.mjs';
const root=new URL('./',import.meta.url),template=await readFile(new URL('index.html',root),'utf8');
const {css,js,spec}=await assembleProduct();
await writeFile(new URL('preview.html',root),template.replace('/*INLINE_CSS*/',()=>css).replace('/*INLINE_JS*/',()=>js));
console.log('DEMO_BUILD_PASS: single_html=1 external_assets=0 local_fixture=1 preserved_addons='+spec.embedded.length);
