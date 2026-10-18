import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),path=new URL('design/enterprise-demo/preview.html',root),html=await readFile(path,'utf8'),code=await readFile(new URL('design/enterprise-demo/reviews-ui.js',root),'utf8'),begin='/* REVIEWS_UI_BEGIN */',end='/* REVIEWS_UI_END */',a=html.indexOf(begin),b=html.indexOf(end);
if(a<0||b<=a||html.indexOf(begin,a+1)!==-1)throw Error('REVIEWS_EMBED_MARKER_INVALID');const next=html.slice(0,a)+begin+'\n'+code+'\n'+html.slice(b);
if(process.argv.includes('--check')){if(next!==html)throw Error('REVIEWS_EMBED_STALE');console.log('REVIEWS_EMBED_PASS: original_single_file_product=1');}else{await writeFile(path,next,'utf8');console.log('REVIEWS_EMBED_UPDATED');}
