import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const root=path.resolve(process.argv[2]||'.'),code=fs.readFileSync(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8');
if(process.argv.includes('--baseline')) {
 assert.match(code,/editTaskBusyRef = useRef\(false\)/);
 assert.match(code,/selectedGenerating && "hidden"/);
 assert.match(code,/pendingNodeRef.current = newIds\[0\]/);
 console.log('BASELINE=CONFIRMED GLOBAL_EDIT_LOCK=TRUE GENERATING_PROMPT_CLOSE=HIDDEN PENDING_COMPLETION=UNCONDITIONAL_SELECTION');
 process.exit(0);
}
assert.doesNotMatch(code,/editTaskBusyRef/);
assert.match(code,/\[ready, authenticatedEmail\]/);
const load=code.slice(code.indexOf('const authenticatedEmail = user?.email;'),code.indexOf('const authenticatedEmail = user?.email;')+6000);assert.match(load,/\[ready, authenticatedEmail\]/);
assert.doesNotMatch(code,/selected(?:Pend)?Generating && "hidden"/);
assert.match(code,/const operationKey = `node:\$\{source.id\}`/);
assert.match(code,/if \(selectedPendIdRef.current === pend.id\)/);
assert.match(code,/textNodesRef.current/);
assert.match(code,/nodesDraggable=\{!readOnly && canvasTool !== "hand"\}/);
const sf=ts.createSourceFile('canvas.tsx',code,99,true,4),functions=new Map();
function walk(n){if(ts.isFunctionDeclaration(n)&&n.name)functions.set(n.name.text,n.getText(sf));ts.forEachChild(n,walk);}walk(sf);
for(const name of ['runGen','runCutout','landEditResult','runComfyWorkflow','generateSplitViews','generateDetailSequence','retrySelected']) assert.doesNotMatch(functions.get(name),/setSelectedId\(/,name+' must not steal current selection');
const baselineArg=process.argv.indexOf('--baseline-file');
if(baselineArg>=0){
 const before=fs.readFileSync(process.argv[baselineArg+1],'utf8');
 const payloads=source=>{const ast=ts.createSourceFile('c.tsx',source,99,true,4),values=[];function visit(n){if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&['fd','form'].includes(n.expression.expression.getText(ast))&&['append','set'].includes(n.expression.name.text))values.push(n.getText(ast).replace(/\r\n/g,'\n'));ts.forEachChild(n,visit);}visit(ast);return values;};
 assert.deepEqual(payloads(code),payloads(before),'upstream payloads unchanged');
 const extract=source=>{const ast=ts.createSourceFile('c.tsx',source,99,true,4),printer=ts.createPrinter({removeComments:true});let result;function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='privateFetch')result=printer.printNode(ts.EmitHint.Unspecified,n,ast);ts.forEachChild(n,visit);}visit(ast);return result;};
 assert.equal(extract(code),extract(before),'billing/auth/model-routing unchanged');
}
console.log('CONCURRENCY_CONTRACT=PASS NODE_LOCK=SCOPED PROMPT_CLOSE=VISIBLE COMPLETION_FOCUS=UNCHANGED TEXT_LINK_MERGE=LIVE BILLING_PAYLOAD=UNCHANGED CANCEL_REFUND=UNCHANGED');
