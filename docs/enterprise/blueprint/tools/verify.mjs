import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(resolve(root,'manifest.json'),'utf8'));
const work = JSON.parse(await readFile(resolve(root,'work-packages.json'),'utf8'));
const modules = manifest.modules, shared = manifest.shared;
assert.equal(modules.length,32); assert.equal(shared.length,13); assert.equal(manifest.workPackageCount,128);
const ids = new Set(modules.map(m=>m.id)); assert.equal(ids.size,32);
for(let n=1;n<=32;n++) assert(ids.has(`M${String(n).padStart(2,'0')}`));
const sources = new Set(Array.from({length:15},(_,i)=>`D${String(i+1).padStart(2,'0')}`));
let packageCount=0, links=0, charCount=0;
const all = [...modules,...shared,{id:'INDEX',path:'README.md'}];
for(const doc of all){
  const text=await readFile(resolve(root,doc.path),'utf8'); charCount += [...text].length;
  assert(!text.includes('\uFFFD'),`${doc.path}: encoding replacement`);
  assert(!/\bTODO\b|\bTBD\b/.test(text),`${doc.path}: empty placeholder`);
  if(doc.id.startsWith('M')){
    assert(text.startsWith(`# ${doc.id} `)); assert([...text].length>=1500,`${doc.id}: insufficient detail`);
    for(let n=1;n<=10;n++) assert(new RegExp(`^## ${n}\\. `,'m').test(text),`${doc.id}: chapter ${n} missing`);
    const data=text.split('## 3.')[1].split('## 4.')[0];
    assert(data.split('\n').filter(l=>l.startsWith('|')).length>=8,`${doc.id}: too few typed fields`);
    assert.equal(work[doc.id].length,4);
    for(let n=1;n<=4;n++) {assert(text.includes(`**${doc.id}-W0${n}**`));packageCount++;}
    for(const dependency of doc.dependencies) assert(ids.has(dependency)&&dependency!==doc.id,`${doc.id}: invalid dependency ${dependency}`);
    for(const source of doc.sourceIds) assert(sources.has(source),`${doc.id}: invalid source ${source}`);
  }
  for(const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){
    const link=match[1].split('#')[0]; if(!link||/^https?:|^mailto:/.test(link))continue;
    assert(!/^[A-Z]:/i.test(link),`${doc.path}: nonportable markdown link`);
    await access(resolve(root,dirname(doc.path),decodeURIComponent(link)));links++;
  }
  for(const match of text.matchAll(/\bM\d{2}\b/g)) assert(ids.has(match[0]),`${doc.path}: unknown reference ${match[0]}`);
}
assert.equal(packageCount,128);
const visiting=new Set(),visited=new Set();
function walk(id){assert(!visiting.has(id),`build dependency cycle at ${id}`);if(visited.has(id))return;visiting.add(id);for(const dep of modules.find(m=>m.id===id).dependencies)walk(dep);visiting.delete(id);visited.add(id);}
for(const id of ids)walk(id);
const sourceDoc=await readFile(resolve(root,'shared/01-data-sources.md'),'utf8');for(const source of sources)assert(sourceDoc.includes(`| ${source} |`),`missing source ${source}`);
const portal=await readFile(resolve(root,'portal.html'),'utf8');
const payload=portal.match(/<script id="documents" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
assert(payload);const docs=JSON.parse(payload);assert.equal(docs.length,45);
for(const doc of docs){assert(doc.html.includes('<h1>'));assert(!/<script/i.test(doc.html));assert(doc.markdown.length>100);}
assert(!/<script[^>]+src=|<link[^>]+href=["']https?:/i.test(portal),'offline reader has external code');
assert.equal(manifest.confirmed.length,4);
const decisions=await readFile(resolve(root,'shared/10-decisions-questions.md'),'utf8');for(const token of ['钉钉','聚水潭','4核8GB','按表'])assert(decisions.includes(token));
const capacity=await readFile(resolve(root,'shared/07-capacity-upgrade.md'),'utf8');for(const token of ['1216','896','升级','蓝绿','实测'])assert(capacity.includes(token));
const currentContract=await readFile(resolve(root,'../../../services/enterprise-workflow/src/contracts.ts'),'utf8');
for(const token of ["z.literal('claim')","z.literal('accept-delivery')","'design', 'artwork'"]) assert(currentContract.includes(token),'current source contract drift: '+token);
console.log(`BLUEPRINT_VERIFY_PASS: modules=32 shared=13 work_packages=128 links=${links} dependency_dag=PASS sources=15 offline_docs=45`);
console.log(`BLUEPRINT_CONTENT: markdown_files=${all.length} characters=${charCount} runtime_changes=0 external_calls=0`);
