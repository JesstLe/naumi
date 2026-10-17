import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const digest=x=>createHash('sha256').update(x).digest('hex');
const fields=['设计师','需求方'];
/** Names are exact source text groups, not people. This function never resolves identities. */
export function buildIdentityReview(payload){
 if(!payload||!Array.isArray(payload.rows)||!/^[a-f0-9]{64}$/.test(payload.sourceHash))throw Error('INVALID_SOURCE_PAYLOAD');
 const rowIds=new Set(),occurrences=[],groups=new Map();
 for(const row of payload.rows){
  if(!Number.isSafeInteger(row.excelRow)||row.excelRow<2||rowIds.has(row.excelRow)||!row.raw||typeof row.raw!=='object')throw Error('INVALID_SOURCE_ROW');
  rowIds.add(row.excelRow);
  for(const field of fields){
   const raw=row.raw[field];if(raw===undefined||raw===null||raw==='')continue;
   if(typeof raw!=='string')throw Error('NON_TEXT_PERSON_FIELD');if(!raw.trim())continue;
   const groupKey=digest(JSON.stringify([payload.sourceHash,raw]));
   const referenceKey=JSON.stringify([payload.sourceHash,row.excelRow,field]);
   const entry={referenceKey,sourceHash:payload.sourceHash,row:row.excelRow,field,sourceName:raw,title:typeof row.title==='string'?row.title:'',parentLabel:typeof row.parentLabel==='string'?row.parentLabel:'',groupKey};
   occurrences.push(entry);
   if(!groups.has(groupKey))groups.set(groupKey,{groupKey,sourceName:raw,designerOccurrences:0,requesterOccurrences:0,firstRow:row.excelRow});
   const group=groups.get(groupKey);group[field==='设计师'?'designerOccurrences':'requesterOccurrences']++;group.firstRow=Math.min(group.firstRow,row.excelRow);
  }
 }
 occurrences.sort((a,b)=>a.row-b.row||fields.indexOf(a.field)-fields.indexOf(b.field));
 const ordered=[...groups.values()].sort((a,b)=>(b.designerOccurrences+b.requesterOccurrences)-(a.designerOccurrences+a.requesterOccurrences)||a.groupKey.localeCompare(b.groupKey));
 return {format:'enterprise-identity-review-v1',sourceHash:payload.sourceHash,sheet:typeof payload.sheet==='string'?payload.sheet:'',summary:{sourceRows:payload.rows.length,occurrences:occurrences.length,distinctSourceTexts:ordered.length,designerOccurrences:occurrences.filter(x=>x.field==='设计师').length,requesterOccurrences:occurrences.filter(x=>x.field==='需求方').length,confirmedPeople:null,identityBindingsCreated:0},groups:ordered,occurrences,semantics:{groupKey:'exact-source-text-only-not-person-id',referenceKey:'sourceHash+excelRow+field',splitNames:false,automaticBinding:false,sourceWrites:false}};
}
export async function exportIdentityReview(input,out){
 const bytes=await readFile(input),review=buildIdentityReview(JSON.parse(bytes.toString('utf8')));
 await mkdir(out,{recursive:true});const target=join(out,'IDENTITY_REVIEW.private.json');
 await writeFile(target,JSON.stringify({...review,inputSha256:digest(bytes)},null,2),'utf8');
 const reopened=JSON.parse(await readFile(target,'utf8'));if(JSON.stringify(reopened.occurrences)!==JSON.stringify(review.occurrences))throw Error('REOPEN_MISMATCH');
 console.log(`IDENTITY_HANDOFF_PASS: source_rows=${review.summary.sourceRows} source_texts=${review.summary.distinctSourceTexts} occurrences=${review.summary.occurrences} inferred_people=0 identity_writes=0 source_writes=0`);
 return target;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2);if(args.length!==4||args[0]!=='--input'||args[2]!=='--output-directory')throw Error('USAGE: --input IMPORT_PAYLOAD.json --output-directory PRIVATE_OUTPUT_DIRECTORY');
 await exportIdentityReview(resolve(args[1]),resolve(args[3]));
}
