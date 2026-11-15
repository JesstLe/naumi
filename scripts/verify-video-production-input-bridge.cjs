const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(process.env.VIDEO_INPUT_BRIDGE_ROOT||process.cwd());
function ast(file){return ts.createSourceFile(file,fs.readFileSync(path.join(root,file),'utf8'),ts.ScriptTarget.Latest,true);}
function any(source,predicate){let found=false;function visit(node){if(predicate(node))found=true;ts.forEachChild(node,visit);}visit(source);return found;}
const main=ast('scripts/verify-video-compiler-process.ts'),ui=ast('scripts/video-compiler-production-ui.ts'),bridge=ast('scripts/video-compiler-storyboard-session.ts');
const registered={flag:any(main,n=>ts.isStringLiteral(n)&&n.text==='--production-input-equivalence'),session:any(main,n=>ts.isPropertyAssignment(n)&&n.name.getText(main)==='inputEquivalence'),actualUiCall:any(ui,n=>ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='verifyVideoInputEquivalence'),bridge:any(bridge,n=>ts.isBinaryExpression(n)&&ts.isStringLiteral(n.right)&&n.right.text==='input-equivalence')};
console.log('PRODUCTION_INPUT_BRIDGE='+JSON.stringify(registered));if(process.argv.includes('--probe'))process.exit(0);
for(const [name,value]of Object.entries(registered))assert(value,name+' missing');
for(const name of ['counts','node','plan','complete','ledger','parent','foreign','finish'])assert(any(bridge,n=>ts.isCaseClause(n)&&ts.isStringLiteral(n.expression)&&n.expression.text===name),name+' missing');
assert(ui.getText().includes("path.basename(file.file)===file.file"));assert(ui.getText().includes("op:'counts'"));assert(bridge.getText().includes('input.inputEquivalence&&inputBoundary'));assert(main.getText().includes("owned?.email===actor&&String(owned.source_id).startsWith('input-eq-')"));
console.log('PRODUCTION_INPUT_BRIDGE_GRAPH=PASS CASES=16 RUNTIME_PROOF=SEPARATE NETWORK=0 DB=0');
