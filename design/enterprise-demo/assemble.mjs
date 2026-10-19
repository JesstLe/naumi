import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const root=new URL('./',import.meta.url);
/** One build includes the complete existing product, not just the old base demo. */
export async function assembleProduct(){
 const spec=JSON.parse(await readFile(new URL('bundle-spec.json',root),'utf8'));
 const read=f=>readFile(new URL(f,root),'utf8');
 const css=(await Promise.all(spec.css.map(read))).join('\n').replaceAll('\r\n','\n');
 const core=(await Promise.all(spec.core.map(read))).join('\n').replaceAll('\r\n','\n');
 const embedded=(await Promise.all(spec.embedded.map(async([marker,file])=>`/* ${marker}_BEGIN */\n${await read(file)}\n/* ${marker}_END */`))).join('\n');
 const workers=(await Promise.all((spec.workers||[]).map(async worker=>{
  const vendors=await Promise.all(worker.vendors.map(async vendor=>{const bytes=await readFile(new URL(vendor.file,root));if(createHash('sha256').update(bytes).digest('hex')!==vendor.sha256)throw Error('VENDOR_HASH_MISMATCH: '+vendor.file);return bytes.toString('utf8');}));
  const source=[...vendors,await read(worker.entry)].join('\n');
  return '/* EXCEL_PREVIEW_WORKER_BEGIN */\nconst '+worker.name+'='+JSON.stringify(source).replaceAll('<','\\u003c')+';\n/* EXCEL_PREVIEW_WORKER_END */';
 }))).join('\n');
 const tail=(await Promise.all(spec.tail.map(read))).join('\n').replaceAll('\r\n','\n');
 return {css,js:core+'\n'+embedded+'\n'+workers+'\n'+tail+'\nshell();\n',spec};
}
