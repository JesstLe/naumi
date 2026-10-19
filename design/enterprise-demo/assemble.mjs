import {readFile} from 'node:fs/promises';
const root=new URL('./',import.meta.url);
/** One build includes the complete existing product, not just the old base demo. */
export async function assembleProduct(){
 const spec=JSON.parse(await readFile(new URL('bundle-spec.json',root),'utf8'));
 const read=f=>readFile(new URL(f,root),'utf8');
 const css=(await Promise.all(spec.css.map(read))).join('\n').replaceAll('\r\n','\n');
 const core=(await Promise.all(spec.core.map(read))).join('\n').replaceAll('\r\n','\n');
 const embedded=(await Promise.all(spec.embedded.map(async([marker,file])=>`/* ${marker}_BEGIN */\n${await read(file)}\n/* ${marker}_END */`))).join('\n');
 const tail=(await Promise.all(spec.tail.map(read))).join('\n').replaceAll('\r\n','\n');
 return {css,js:core+'\n'+embedded+'\n'+tail+'\nshell();\n',spec};
}
