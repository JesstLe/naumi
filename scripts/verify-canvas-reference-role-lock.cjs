const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync(process.env.CANVAS_ROLE_SOURCE||'src/components/canvas/image-reference-composer.tsx','utf8');
const ast=ts.createSourceFile('composer.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let disabled;
function visit(node){if(ts.isJsxOpeningElement(node)&&node.tagName.getText(ast)==='option')disabled=node.attributes.properties.find(p=>p.name?.getText(ast)==='disabled')?.initializer?.expression;ts.forEachChild(node,visit)}visit(ast);
if(process.env.CANVAS_ROLE_LEGACY==='1'){
 assert.ok(disabled);const expression=disabled.getText(ast);assert.deepEqual(['reference','insert','style'].map(role=>vm.runInNewContext(expression,{ref:{role:'edit-target'},role})),[true,true,true]);
 console.log('BASELINE=PASS ROOT_CAUSE=OPTION_DISABLED BLOCKED_ROLES=3');
}else{
 assert.equal(disabled,undefined);assert.match(source,/value=\{ref.role\} disabled=\{readOnly\}/);
 console.log('MODIFIED=PASS ROLE_OPTIONS=UNLOCKED READ_ONLY=PRESERVED');
}
