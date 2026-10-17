import assert from 'node:assert/strict';
import {buildIdentityReview,exportIdentityReview} from './enterprise-identity-handoff.mjs';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const sourceHash='a'.repeat(64),rows=[
 {excelRow:2,title:'task A',raw:{'设计师':'同名','需求方':'同名'}},
 {excelRow:3,title:'task B',raw:{'设计师':' 同名 ','需求方':'甲/乙'}},
 {excelRow:4,title:'task C',raw:{'设计师':'同名','需求方':'=HYPERLINK("https://fixture.invalid")'}},
 {excelRow:5,title:'task D',raw:{'设计师':'甲\n乙','需求方':'   '}},
 {excelRow:6,title:'task E',raw:{'设计师':null}},
],input={sourceHash,rows,sheet:'fixture'},before=JSON.stringify(input),r=buildIdentityReview(input);
assert.equal(JSON.stringify(input),before);assert.equal(r.summary.occurrences,7);assert.equal(r.summary.distinctSourceTexts,5);assert.equal(r.summary.confirmedPeople,null);assert.equal(new Set(r.occurrences.map(x=>x.referenceKey)).size,7);assert.equal(r.groups.find(x=>x.sourceName==='同名').designerOccurrences,2);assert(r.groups.some(x=>x.sourceName===' 同名 '));assert(r.groups.some(x=>x.sourceName==='甲/乙'));assert(r.groups.some(x=>x.sourceName==='甲\n乙'));assert(r.occurrences.some(x=>x.sourceName.startsWith('=')));assert.deepEqual(buildIdentityReview({...input,rows:[...rows].reverse()}).groups,r.groups);assert.deepEqual(buildIdentityReview({...input,rows:[...rows].reverse()}).occurrences,r.occurrences);
assert.notEqual(buildIdentityReview({...input,sourceHash:'b'.repeat(64)}).groups[0].groupKey,r.groups[0].groupKey);
assert.throws(()=>buildIdentityReview({...input,rows:[rows[0],rows[0]]}),/INVALID_SOURCE_ROW/);assert.throws(()=>buildIdentityReview({...input,rows:[{excelRow:2,raw:{'设计师':123}}]}),/NON_TEXT_PERSON_FIELD/);assert.throws(()=>buildIdentityReview({...input,sourceHash:'invalid'}),/INVALID_SOURCE_PAYLOAD/);assert.equal(buildIdentityReview({sourceHash,rows:[]}).summary.occurrences,0);
const dir=await mkdtemp(join(tmpdir(),'enterprise-handoff-test-'));try{const path=join(dir,'input.json');await writeFile(path,before);const out=await exportIdentityReview(path,dir);assert.equal(await readFile(path,'utf8'),before);const saved=JSON.parse(await readFile(out,'utf8'));assert.deepEqual(saved.occurrences,r.occurrences);assert(/^[a-f0-9]{64}$/.test(saved.inputSha256));}finally{await rm(dir,{recursive:true,force:true});}
console.log('IDENTITY_HANDOFF_TEST_PASS: exact_text=1 duplicate_names_not_people=1 no_split=1 stable_refs=1 reorder_stable=1 invalid_rejected=1 readonly_source=1 reopen=1 no_accounts=1');
