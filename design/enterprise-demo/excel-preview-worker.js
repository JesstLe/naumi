/* Read-only, bounded worker. Original bytes never leave the same-origin browser. */
'use strict';
let book,archive=null,sheetPaths=[],styleMap=[],styleIndexes=new Map(),drawingCache=new Map(),missingCaches=new Map();
const MAX_FILE=64*1024*1024,MAX_XML=32*1024*1024,MAX_ROWS=10000,ROWS=200,COLS=48;
const attr=(text,key)=>{const re=new RegExp('(?:^|\\s)'+key.replace(':','\\:')+'=["\\\']([^"\\\']*)["\\\']');return re.exec(text)?.[1]||'';};
const decode=text=>text.replace(/&(?:amp|lt|gt|quot|apos);/g,x=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[x]));
const blocks=(xml,name)=>[...xml.matchAll(new RegExp('<(?:[\\w]+:)?'+name+'\\b[^>]*>[\\s\\S]*?<\\/(?:[\\w]+:)?'+name+'>','g'))].map(x=>x[0]);
const number=(xml,name,fallback=0)=>Number(new RegExp('<(?:[\\w]+:)?'+name+'[^>]*>([\\d.]+)<').exec(xml)?.[1]??fallback);
function path(base,target){const parts=(target.startsWith('/')?target.slice(1):base.slice(0,base.lastIndexOf('/')+1)+target).split('/'),out=[];for(const p of parts){if(p==='..'){if(!out.length)throw Error('INVALID_WORKBOOK');out.pop();}else if(p&&p!=='.')out.push(p);}return out.join('/');}
const relPath=p=>p.slice(0,p.lastIndexOf('/')+1)+'_rels/'+p.slice(p.lastIndexOf('/')+1)+'.rels';
async function xml(name){const f=archive?.file(name);if(!f)return '';if(f._data.uncompressedSize>MAX_XML)throw Error('WORKBOOK_EXPANSION_LIMIT');return f.async('string');}
function relationships(text,base){const map=new Map();for(const x of text.matchAll(/<Relationship\b[^>]*\/?\s*>/g)){if(attr(x[0],'TargetMode')==='External')continue;const target=decode(attr(x[0],'Target'));if(target&&!/^[a-z][a-z\d+.-]*:/i.test(target))map.set(attr(x[0],'Id'),path(base,target));}return map;}
const color=text=>{const v=attr(text,'rgb');if(/^[\da-f]{8}$/i.test(v))return '#'+v.slice(2);if(/^[\da-f]{6}$/i.test(v))return '#'+v;return '';};
async function styles(){const text=await xml('xl/styles.xml'),fonts=blocks(blocks(text,'fonts')[0]||'','font'),fills=blocks(blocks(text,'fills')[0]||'','fill'),xfs=blocks(text,'cellXfs')[0]||'';styleMap=[...xfs.matchAll(/<xf\b[^>]*(?:\/>|>[\s\S]*?<\/xf>)/g)].map(x=>{const f=fonts[Number(attr(x[0],'fontId'))]||'',fill=fills[Number(attr(x[0],'fillId'))]||'',align=/<alignment\b[^>]*\/?\s*>/.exec(x[0])?.[0]||'';return {bold:/<b(?:\s|\/|>)/.test(f),italic:/<i(?:\s|\/|>)/.test(f),color:color(/<color\b[^>]*>/.exec(f)?.[0]||''),background:color(/<fgColor\b[^>]*>/.exec(fill)?.[0]||''),align:['left','center','right'].includes(attr(align,'horizontal'))?attr(align,'horizontal'):'',wrap:attr(align,'wrapText')==='1'};});}
async function open(bytes){
 if(bytes.byteLength>MAX_FILE)throw Error('FILE_TOO_LARGE');const raw=new Uint8Array(bytes);let input=raw;archive=null;styleIndexes=new Map();drawingCache=new Map();missingCaches=new Map();if(!(raw[0]===0x50&&raw[1]===0x4b)&&!(raw[0]===0xd0&&raw[1]===0xcf)&&!new TextDecoder().decode(raw.slice(0,512)).includes('urn:schemas-microsoft-com:office:spreadsheet'))throw Error('INVALID_WORKBOOK');
 if(raw[0]===0x50&&raw[1]===0x4b){archive=await JSZip.loadAsync(bytes);const files=Object.values(archive.files);if(files.length>10000)throw Error('WORKBOOK_EXPANSION_LIMIT');let expanded=0;const slim=new JSZip();
  for(const f of files){if(f.dir||!/^\[Content_Types\]\.xml$|^_rels\/|^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|styles\.xml|metadata\.xml|sharedStrings\.xml|theme\/|worksheets\/[^/]+\.xml$)/.test(f.name))continue;
   if(f._data.uncompressedSize>MAX_XML||(expanded+=f._data.uncompressedSize)>96*1024*1024)throw Error('WORKBOOK_EXPANSION_LIMIT');slim.file(f.name,await f.async('uint8array'));}
  if(!archive.file('xl/workbook.xml'))throw Error('INVALID_WORKBOOK');input=await slim.generateAsync({type:'uint8array',compression:'STORE'});await styles();
  const rels=relationships(await xml('xl/_rels/workbook.xml.rels'),'xl/workbook.xml');sheetPaths=[...(await xml('xl/workbook.xml')).matchAll(/<sheet\b[^>]*\/?\s*>/g)].map(x=>rels.get(attr(x[0],'r:id'))||'');
 }
 book=XLSX.read(input,{type:'array',cellStyles:true,cellNF:true,cellText:true,cellFormula:true,sheetRows:MAX_ROWS+1,bookVBA:false,bookFiles:false});
 const sheets=book.SheetNames.map((name,index)=>{const ws=book.Sheets[name],r=XLSX.utils.decode_range(ws['!fullref']||ws['!ref']||'A1');return {name,index,rows:Math.min(r.e.r+1,MAX_ROWS),originalRows:r.e.r+1,cols:r.e.c+1,hidden:!!book.Workbook?.Sheets?.[index]?.Hidden};}).filter(x=>!x.hidden);
 if(!sheets.length)throw Error('NO_VISIBLE_SHEET');return {sheets,legacy:!archive,readOnly:true};
}
async function cellStyles(index){if(styleIndexes.has(index))return styleIndexes.get(index);const text=await xml(sheetPaths[index]||''),missing=new Set(),map=new Map();for(const x of text.matchAll(/<c\b[^>]*>[\s\S]*?<\/c>/g)){if(/<f(?:\s|>)/.test(x[0])&&!/<v(?:\s|>)/.test(x[0]))missing.add(attr(x[0],'r'));}missingCaches.set(index,missing);for(const x of text.matchAll(/<c\b[^>]*>/g)){const a=attr(x[0],'r'),s=attr(x[0],'s');if(a&&s)map.set(a,Number(s));}styleIndexes.set(index,map);return map;}
async function drawings(index){if(drawingCache.has(index))return drawingCache.get(index);const sheet=sheetPaths[index];if(!sheet)return [];const ws=await xml(sheet),rels=relationships(await xml(relPath(sheet)),sheet),out=[];
 for(const m of ws.matchAll(/<(?:\w+:)?drawing\b[^>]*>/g)){const drawing=rels.get(attr(m[0],'r:id'));if(!drawing)continue;const targets=relationships(await xml(relPath(drawing)),drawing),content=await xml(drawing);
  for(const kind of ['twoCellAnchor','oneCellAnchor'])for(const block of blocks(content,kind)){if(out.length>=2000)break;const from=blocks(block,'from')[0]||'',to=blocks(block,'to')[0]||'',blip=/<(?:\w+:)?blip\b[^>]*>/.exec(block)?.[0]||'',file=targets.get(attr(blip,'r:embed')),ext=/<(?:\w+:)?ext\b[^>]*>/.exec(block)?.[0]||'';
   if(!file?.startsWith('xl/media/')||! /\.(png|jpe?g|gif|webp)$/i.test(file))continue;out.push({file,row:number(from,'row'),col:number(from,'col'),rowOffset:number(from,'rowOff')/9525,colOffset:number(from,'colOff')/9525,endRow:to?number(to,'row'):null,endCol:to?number(to,'col'):null,endColOffset:number(to,'colOff')/9525,endRowOffset:number(to,'rowOff')/9525,width:Number(attr(ext,'cx'))/9525||240,height:Number(attr(ext,'cy'))/9525||160});
  }
 }
 drawingCache.set(index,out);return out;
}
async function windowData(message){
 const index=Number(message.sheet),name=book?.SheetNames[index],ws=book?.Sheets[name];if(!ws)throw Error('INVALID_SHEET');const range=XLSX.utils.decode_range(ws['!fullref']||ws['!ref']||'A1'),totalRows=Math.min(MAX_ROWS,range.e.r+1),totalCols=Math.min(16384,range.e.c+1),row=Math.max(0,Math.min(Number(message.row)||0,totalRows-1)),col=Math.max(0,Math.min(Number(message.col)||0,totalCols-1)),endRow=Math.min(row+ROWS,totalRows),endCol=Math.min(col+COLS,totalCols),styleIndex=await cellStyles(index),merges=(ws['!merges']||[]).filter(m=>m.s.r<endRow&&m.e.r>=row&&m.s.c<endCol&&m.e.c>=col).slice(0,10000);
 const data=[],rowHeights=[],colWidths=[];
 for(let r=row;r<endRow;r++){rowHeights.push(Math.max(24,Math.min(1200,Number(ws['!rows']?.[r]?.hpx)||Number(ws['!rows']?.[r]?.hpt)*96/72||28)));const line=[];for(let c=col;c<endCol;c++){const ref=XLSX.utils.encode_cell({r,c}),v=ws[ref];line.push({ref,text:v?(v.f&&(v.v===undefined||missingCaches.get(index)?.has(ref))?'公式未缓存':String(v.w??(v.v===undefined?'':XLSX.utils.format_cell(v)))).slice(0,20000):'',formula:v?.f?String(v.f).slice(0,20000):'',style:styleMap[styleIndex.get(ref)]||{},type:v?.t||''});}data.push(line);}
 for(let c=col;c<endCol;c++)colWidths.push(Math.max(48,Math.min(640,Number(ws['!cols']?.[c]?.wpx)||Number(ws['!cols']?.[c]?.wch)*7+5||120)));
 // Return intersecting merge anchors even when their original cell is outside this window.
 for(const m of merges){const r=Math.max(m.s.r,row),c=Math.max(m.s.c,col),anchor=ws[XLSX.utils.encode_cell(m.s)];if(anchor&&(r!==m.s.r||c!==m.s.c))data[r-row][c-col]={...data[r-row][c-col],text:String(anchor.w??anchor.v??''),formula:anchor.f||''};}
 const images=[];let imageBytes=0,imageOmitted=0;for(const image of await drawings(index)){if(image.row>=endRow||(image.endRow??image.row)<row||image.col>=endCol||(image.endCol??image.col)<col)continue;const f=archive.file(image.file);if(!f||f._data.uncompressedSize>24*1024*1024||images.length>=128||(imageBytes+f._data.uncompressedSize)>48*1024*1024){imageOmitted++;continue;}const bytes=await f.async('uint8array');imageBytes+=bytes.byteLength;images.push({...image,bytes,mime:/\.png$/i.test(image.file)?'image/png':/\.gif$/i.test(image.file)?'image/gif':/\.webp$/i.test(image.file)?'image/webp':'image/jpeg'});}
 return {name,index,row,col,endRow,endCol,totalRows,totalCols,originalRows:range.e.r+1,data,rowHeights,colWidths,merges,images,imageOmitted,legacy:!archive};
}
self.onmessage=async event=>{const m=event.data;try{const data=m.type==='open'?await open(m.bytes):await windowData(m);const transfer=data.images?.map(i=>i.bytes.buffer)||[];self.postMessage({id:m.id,ok:true,data},transfer);}catch(e){const text=String(e.message||e);self.postMessage({id:m.id,ok:false,error:/password|encrypted/i.test(text)?'ENCRYPTED_WORKBOOK':['FILE_TOO_LARGE','WORKBOOK_EXPANSION_LIMIT','NO_VISIBLE_SHEET','INVALID_WORKBOOK','INVALID_SHEET'].includes(text)?text:'INVALID_WORKBOOK'});}};
/* G62: sparse editable copy. Originals and all non-XML package objects remain intact. */
let editPatches=new Map(),originalCells=new Map();
const editKey=p=>p.sheet+'!'+p.cell;
function setPatches(patches){
 if(!Array.isArray(patches)||patches.length>5000)throw Error('EDIT_LIMIT');const next=new Map();
 for(const p of patches){const index=book.SheetNames.indexOf(p.sheet);if(index<0||book.Workbook?.Sheets?.[index]?.Hidden||!['text','number','formula','blank'].includes(p.type)||typeof p.value!=='string'||p.value.length>20000||/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(p.value)||!/^([A-Z]{1,3})([1-9]\d{0,4})$/.test(p.cell))throw Error('EDIT_INVALID');const at=XLSX.utils.decode_cell(p.cell);if(at.r>=MAX_ROWS||at.c>=16384||p.type==='number'&&(!p.value.trim()||!Number.isFinite(Number(p.value)))||p.type==='blank'&&p.value!==''||p.type==='formula'&&!p.value)throw Error('EDIT_INVALID');
  const merge=(book.Sheets[p.sheet]['!merges']||[]).find(m=>at.r>=m.s.r&&at.r<=m.e.r&&at.c>=m.s.c&&at.c<=m.e.c);if(merge&&(merge.s.r!==at.r||merge.s.c!==at.c))throw Error('MERGED_CELL_COVERED');if(next.has(editKey(p)))throw Error('EDIT_INVALID');next.set(editKey(p),p);
 }
 for(const [key,cell]of originalCells){const at=key.lastIndexOf('!'),ws=book.Sheets[key.slice(0,at)],ref=key.slice(at+1);if(cell)ws[ref]=structuredClone(cell);else delete ws[ref];}
 for(const [key,p]of next){const ws=book.Sheets[p.sheet];if(!originalCells.has(key))originalCells.set(key,ws[p.cell]?structuredClone(ws[p.cell]):null);const original=originalCells.get(key),cell={...(original||{})};delete cell.f;delete cell.w;delete cell.v;delete cell.h;delete cell.r;
  if(p.type==='blank'){cell.t='z';}else if(p.type==='formula'){cell.t='n';cell.f=p.value.replace(/^=/,'');}else{cell.t=p.type==='number'?'n':'s';cell.v=p.type==='number'?Number(p.value):p.value;}
  ws[p.cell]=cell;
 }
 editPatches=next;return {count:next.size};
}
const xmlEscape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function editXmlCell(p,old=''){let tag=/<c\b[^>]*>/.exec(old)?.[0]||`<c r="${p.cell}">`;tag=tag.replace(/\s+t=["'][^"']*["']/g,'').replace(/\/?>$/,'>');if(p.type==='blank')return tag+'</c>';if(p.type==='text')return tag.replace(/>$/,' t="inlineStr">')+`<is><t xml:space="preserve">${xmlEscape(p.value)}</t></is></c>`;if(p.type==='number')return tag+`<v>${Number(p.value)}</v></c>`;return tag+`<f>${xmlEscape(p.value.replace(/^=/,''))}</f></c>`;}
function patchSheetXml(text,patches,ws){const byRow=new Map();for(const p of patches){const row=XLSX.utils.decode_cell(p.cell).r+1;if(!byRow.has(row))byRow.set(row,new Map());byRow.get(row).set(p.cell,p);}const cellRE=/<c\b[^>]*(?:\/>|>[\s\S]*?<\/c>)/g;
 // Expand affected shared formulas from parsed originals before replacing a shared master.
 const affectedShared=new Set();for(const block of text.matchAll(cellRE)){const ref=attr(block[0],'r'),f=/<f\b[^>]*>/.exec(block[0])?.[0]||'';if(patches.some(p=>p.cell===ref)&&attr(f,'t')==='shared')affectedShared.add(attr(f,'si'));}
 if(affectedShared.size)text=text.replace(cellRE,block=>{const ref=attr(block,'r'),f=/<f\b[^>]*(?:\/>|>[^<]*<\/f>)/.exec(block)?.[0]||'';if(attr(f,'t')!=='shared'||!affectedShared.has(attr(f,'si')))return block;const formula=originalCells.get(book.SheetNames.find(n=>book.Sheets[n]===ws)+'!'+ref)?.f||ws[ref]?.f;if(!formula)throw Error('SHARED_FORMULA_EXPORT');return block.replace(f,`<f>${xmlEscape(formula)}</f>`);});
 text=text.replace(/<row\b[^>]*(?:\/>|>[\s\S]*?<\/row>)/g,block=>{const n=Number(attr(block,'r')),edits=byRow.get(n);if(!edits)return block;byRow.delete(n);const originalStart=/<row\b[^>]*>/.exec(block)[0],start=originalStart.replace(/\/>$/,'>'),cells=[...block.matchAll(cellRE)].map(x=>x[0]),map=new Map(cells.map(c=>[attr(c,'r'),c]));for(const [ref,p]of edits)map.set(ref,editXmlCell(p,map.get(ref)));const rest=/\/>$/.test(originalStart)?'':block.slice(originalStart.length).replace(cellRE,'').replace(/<\/row>$/,'');return start+[...map].sort((a,b)=>XLSX.utils.decode_cell(a[0]).c-XLSX.utils.decode_cell(b[0]).c).map(x=>x[1]).join('')+rest+'</row>';});
 if(byRow.size){const newRows=[...byRow].sort((a,b)=>a[0]-b[0]).map(([r,ps])=>`<row r="${r}">${[...ps.values()].sort((a,b)=>XLSX.utils.decode_cell(a.cell).c-XLSX.utils.decode_cell(b.cell).c).map(p=>editXmlCell(p)).join('')}</row>`).join('');text=text.replace(/<\/sheetData>/,newRows+'</sheetData>');if(!text.includes(newRows))throw Error('EDIT_EXPORT_FAILED');text=text.replace(/(<sheetData[^>]*>)([\s\S]*?)(<\/sheetData>)/,(all,start,body,end)=>start+[...body.matchAll(/<row\b[^>]*(?:\/>|>[\s\S]*?<\/row>)/g)].map(x=>x[0]).sort((a,b)=>Number(attr(a,'r'))-Number(attr(b,'r'))).join('')+end);}
 if(editPatches.size)text=text.replace(cellRE,c=>/<f(?:\s|>)/.test(c)?c.replace(/<v(?:\s[^>]*)?>[\s\S]*?<\/v>/g,''):c);return text;
}
async function exportEdited(){if(!archive)throw Error('LEGACY_EXPORT_UNAVAILABLE');const output=new JSZip(),changed=new Map();for(const p of editPatches.values()){const i=book.SheetNames.indexOf(p.sheet),file=sheetPaths[i];if(!changed.has(file))changed.set(file,[]);changed.get(file).push(p);}for(const f of Object.values(archive.files)){if(f.dir||f.name==='xl/calcChain.xml')continue;
  if(/^xl\/worksheets\/[^/]+\.xml$/.test(f.name)){const i=sheetPaths.indexOf(f.name),text=await xml(f.name);output.file(f.name,patchSheetXml(text,changed.get(f.name)||[],book.Sheets[book.SheetNames[i]]||{}));}
  else if(f.name==='xl/workbook.xml'){let text=await xml(f.name);text=text.replace(/<calcPr\b[^>]*\/?\s*>/g,'');output.file(f.name,text.replace(/<\/workbook>/,'<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>'));}
  else if(f.name==='xl/_rels/workbook.xml.rels')output.file(f.name,(await xml(f.name)).replace(/<Relationship\b[^>]*Type=["'][^"']*\/calcChain["'][^>]*\/?\s*>/g,''));
  else if(f.name==='[Content_Types].xml')output.file(f.name,(await xml(f.name)).replace(/<Override\b[^>]*PartName=["']\/xl\/calcChain.xml["'][^>]*\/?\s*>/g,''));
  else output.file(f.name,await f.async('uint8array'));
 }
 const bytes=await output.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:3}});if(bytes.byteLength>MAX_FILE)throw Error('FILE_TOO_LARGE');return {bytes};
}
const readWindowOriginal=windowData;windowData=async function(m){const d=await readWindowOriginal(m);for(const line of d.data)for(const cell of line){const v=book.Sheets[d.name][cell.ref];cell.raw=v?.f?'='+v.f:String(v?.v??'');if(editPatches.size&&v?.f)cell.text='待Excel重算';}d.hasEdits=editPatches.size>0;return d;};
self.onmessage=async event=>{const m=event.data;try{const data=m.type==='open'?await open(m.bytes):m.type==='patches'?setPatches(m.patches):m.type==='export'?await exportEdited():await windowData(m);const transfer=data.images?.map(i=>i.bytes.buffer)||(data.bytes?[data.bytes.buffer]:[]);self.postMessage({id:m.id,ok:true,data},transfer);}catch(e){const text=String(e.message||e);self.postMessage({id:m.id,ok:false,error:/password|encrypted/i.test(text)?'ENCRYPTED_WORKBOOK':text});}};
