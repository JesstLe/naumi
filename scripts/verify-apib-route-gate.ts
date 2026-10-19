import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { exactImageRequestSize } from '../src/lib/imagegen/request-size';
import { inheritedImageRatio } from '../src/lib/imagegen/aspect';
import { EXECUTABLE_RATIOS, EXCLUDED_RATIOS } from './lib/apib-activation.mjs';

// Local source/AST regression only. Do not import the route: its initialization
// owns database/job services. Execute the unchanged sizing function and prelude,
// using the actual helper, without constructing an SDK or submitting a job.
const contract=JSON.parse(readFileSync('docs/providers/apib-activation-20261019.json','utf8'));
for(const [path,expected] of Object.entries(contract.routeConstraint.sourceSha256)){
  const text=readFileSync(path,'utf8').replaceAll('\r\n','\n');
  assert.equal(createHash('sha256').update(text).digest('hex'),expected,`Runtime source drift: ${path}`);
}
const route=readFileSync('src/app/api/generate-image/route.ts','utf8');
const ast=ts.createSourceFile('route.ts',route,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const fn=(name:string)=>{const found=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(found&&ts.isFunctionDeclaration(found));return found as ts.FunctionDeclaration;};
const functionText=fn('sizeFor').getText(ast);
const openai=fn('openaiImages').body!;
const declaration=(name:string)=>{const found=openai.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)===name));assert.ok(found);return found;};
const sizing=declaration('sizingModel'),size=declaration('size');
const sdkCalls:ts.CallExpression[]=[];
const walk=(node:ts.Node)=>{if(ts.isCallExpression(node)&&/^client\.images\./.test(node.expression.getText(ast)))sdkCalls.push(node);ts.forEachChild(node,walk);};walk(openai);
assert.ok(sdkCalls.length>0);assert.ok(sdkCalls.every(n=>n.pos>size.end),'Sizing must precede every SDK image call');
const code=ts.transpileModule(`${functionText}\n${sizing.getText(ast)}\n${size.getText(ast)}\nreturn size;`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const execute=new Function('exactImageRequestSize','currentModelExecution','model','p','effectiveRatio',code);
const legacy=ts.transpileModule(functionText+'\nreturn sizeFor;', {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const sizeFor=new Function('exactImageRequestSize',legacy)(exactImageRequestSize);

const stamp='p.ratioContractVersion = currentImagegenStep() ? currentImagegenStep()!.ratioContractVersion : 1;';
assert.ok(route.includes(stamp));
const stampCode=ts.transpileModule(stamp+'\nreturn p.ratioContractVersion;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const stampVersion=new Function('p','currentImagegenStep',stampCode);
assert.equal(stampVersion({ratioContractVersion:0},()=>undefined),1,'HTTP input cannot opt out');
assert.equal(stampVersion({},()=>({ratioContractVersion:1})),1,'New internal plans retain exact contract');
assert.equal(stampVersion({},()=>({})),undefined,'Historical compatibility exists; not a new-plan bypass');
assert.match(readFileSync('src/lib/imagegen/plan.ts','utf8'),/return \{ratioContractVersion:1,request/);
assert.match(readFileSync('src/lib/imagegen/generation-core.ts','utf8'),/withImagegenStep\(request,intent,\(\)=>POST\(internal\),plan\.ratioContractVersion\)/);
assert.match(readFileSync('src/lib/model-config/execution.ts','utf8'),/protocol:"supplier-channels",wireModel:frozen\.publicModelId/);

let passes=0,rejects=0,legacyOnly=0;
for(const wireModel of ['gpt-image-2','gpt-image-2.5-flare','gpt-image-2.5-sunburst']){
  for(const ratio of EXECUTABLE_RATIOS){
    assert.equal(execute(exactImageRequestSize,()=>({connection:{wireModel}}),'gpt-image-2',{ratioContractVersion:1},ratio),exactImageRequestSize(ratio,wireModel));passes++;
  }
  for(const ratio of EXCLUDED_RATIOS){
    // Explicit ratios are not rewritten by reference inheritance or custom size.
    assert.equal(inheritedImageRatio(ratio,{width:1024,height:1024}),ratio);
    assert.throws(()=>execute(exactImageRequestSize,()=>({connection:{wireModel}}),'gpt-image-2',{ratioContractVersion:1,targetWidth:1536,targetHeight:512},ratio),/当前图片模型尚未配置该精确比例/);rejects++;
    assert.doesNotThrow(()=>sizeFor(ratio,wireModel,false));legacyOnly++;
  }
}
assert.equal(passes,36);assert.equal(rejects,9);assert.equal(legacyOnly,9);
console.log('APIB_ROUTE_GATE=PASS; SOURCE=5d7631a0; HANDLER_PRELUDE_PASSES=36; PRE_SDK_REJECTS=9; LEGACY_ONLY=9; NEW_REQUEST_BYPASS=NONE_FOUND; HTTP_EXECUTIONS=0; PROVIDER_CALLS=0');
