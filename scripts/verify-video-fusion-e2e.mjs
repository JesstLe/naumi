import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const required=[...Array.from({length:24},(_,i)=>`V${String(i+1).padStart(2,'0')}`),...Array.from({length:8},(_,i)=>`P${String(i+1).padStart(2,'0')}`),'S01','S02'];
function workspaceFile(relative){
  assert.equal(typeof relative,'string');assert.ok(!path.isAbsolute(relative),'Evidence must be workspace-relative');
  const resolved=path.resolve(root,relative),offset=path.relative(root,resolved);assert.ok(offset&&!offset.startsWith('..')&&!path.isAbsolute(offset),'Evidence outside workspace');return resolved;
}
function valueAt(object,dotted){return dotted.split('.').reduce((value,key)=>value?.[key],object);}
async function main(){
  const coverage=JSON.parse(await readFile(workspaceFile('scripts/video-fusion/coverage.json'),'utf8'));
  assert.equal(coverage.schemaVersion,1);assert.equal(coverage.capabilities.length,34);assert.deepEqual([...coverage.capabilities.map(row=>row.id)].sort(),[...required].sort());
  const spec=await readFile(workspaceFile('docs/superpowers/specs/2026-10-13-canvas-video-fusion-design.md'),'utf8');
  for(const id of required)assert.ok(spec.includes(`| ${id} |`),`Requirement absent from approved design: ${id}`);
  const checked=new Map(),references=[];
  for(const [key,entry] of Object.entries(coverage.evidenceRegistry)){
    for(const relative of [entry.artifact,entry.verifier])assert.ok((await stat(workspaceFile(relative))).isFile(),`Missing ${key}: ${relative}`);
    const raw=await readFile(workspaceFile(entry.artifact),'utf8');
    checked.set(key,entry.artifact.endsWith('.json')?JSON.parse(raw):raw);references.push({key,kind:entry.kind,artifact:entry.artifact});
  }
  const issues=[];
  for(const row of coverage.capabilities){
    for(const relative of row.implementation)assert.ok((await stat(workspaceFile(relative))).isFile(),`Missing implementation ${row.id}: ${relative}`);
    for(const key of row.evidenceKeys)assert.ok(checked.has(key),`Unknown evidence ${row.id}: ${key}`);
    if(row.state!=='application-e2e-passed'){issues.push({id:row.id,state:row.state,remaining:row.remaining});continue;}
    // A declared state alone is insufficient. Final rows must enumerate tested criteria.
    assert.ok(Array.isArray(row.criteria)&&row.criteria.length,`${row.id}: no concrete acceptance criteria`);
    assert.equal((row.remaining||[]).length,0,`${row.id}: unresolved conditions`);
    assert.ok(row.evidenceKeys.some(key=>coverage.evidenceRegistry[key].kind.startsWith('actual-')),`${row.id}: protocol/unit-only evidence cannot prove application E2E`);
    for(const criterion of row.criteria){
      assert.ok(criterion.requirement&&criterion.evidenceKey&&Array.isArray(criterion.assertions)&&criterion.assertions.length,`${row.id}: incomplete criterion`);
      assert.ok(row.evidenceKeys.includes(criterion.evidenceKey),`${row.id}: criterion evidence is not registered`);
      const result=checked.get(criterion.evidenceKey);
      for(const assertion of criterion.assertions)assert.deepEqual(valueAt(result,assertion.path),assertion.value,`${row.id}: ${criterion.requirement} (${assertion.path})`);
    }
  }
  const report={schemaVersion:1,applicationScopeComplete:issues.length===0,requiredCapabilities:34,reviewedCapabilities:34-issues.length,issues,references,supplierMode:coverage.supplierMode,realVideoQualityValidated:coverage.realVideoQualityValidated,deliveryGates:coverage.deliveryGates};
  const output=workspaceFile('output/canvas-video-fusion-20261013/checkpoint-d/coverage-audit.json');await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2));
  process.stdout.write(`VIDEO_FUSION_COVERAGE_INVENTORY=PASS ids=34 registered_evidence=${references.length} reviewed=${report.reviewedCapabilities}/34\n`);
  if(!process.argv.includes('--inventory')){
    assert.equal(issues.length,0,`Full application coverage still unproven: ${issues.map(row=>row.id).join(', ')}`);
    if(process.argv.includes('--delivery-audit'))for(const [gate,state] of Object.entries(coverage.deliveryGates))assert.equal(state,'passed',`Delivery gate unproven: ${gate}`);
    process.stdout.write('VIDEO_FUSION_APPLICATION_E2E=PASS\n');
  }
}
main().catch(error=>{process.stderr.write(`${error.stack||error}\n`);process.exitCode=1;});
