import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),path=new URL('design/enterprise-demo/preview.html',root),code=await readFile(new URL('design/enterprise-demo/people-roster.js',root),'utf8');
const begin='/* PEOPLE_ROSTER_PARSER_BEGIN */',end='/* PEOPLE_ROSTER_PARSER_END */',html=await readFile(path,'utf8');
const start=html.indexOf(begin),finish=html.indexOf(end);if(start<0||finish<=start||html.indexOf(begin,start+1)!==-1)throw Error('ROSTER_EMBED_MARKER_INVALID');
let next=html.slice(0,start)+begin+'\n'+code+'\n'+html.slice(finish);
const ui=await readFile(new URL('design/enterprise-demo/people-roster-ui.js',root),'utf8'),uiStart=next.indexOf('/* PEOPLE_ROSTER_UI_BEGIN */'),uiEnd=next.indexOf('/* PEOPLE_ROSTER_UI_END */');if(uiStart<0||uiEnd<=uiStart)throw Error('ROSTER_UI_MARKER_INVALID');next=next.slice(0,uiStart)+'/* PEOPLE_ROSTER_UI_BEGIN */\n'+ui+'\n'+next.slice(uiEnd);
if(process.argv.includes('--check')){if(next!==html)throw Error('ROSTER_EMBED_STALE');console.log('ROSTER_EMBED_PASS: original_single_file_product=1');}else{await writeFile(fileURLToPath(path),next,'utf8');console.log('ROSTER_EMBED_UPDATED');}
