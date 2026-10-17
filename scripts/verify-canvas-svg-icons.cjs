const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict'),cp=require('node:child_process');
const mode=process.argv[2]||'modified',file=process.argv[3]||'src/components/canvas/canvas-client.tsx';
const code=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,code,99,true,4),emoji=[];
function walk(n){
 if((ts.isJsxText(n)||ts.isStringLiteral(n))&&/\p{Extended_Pictographic}/u.test(n.text))emoji.push({line:ast.getLineAndCharacterOfPosition(n.pos).line+1,text:n.text.trim()});
 ts.forEachChild(n,walk);
}walk(ast);
if(mode==='baseline'||mode==='rollback'){
 assert.equal(emoji.length,6);console.log(`${mode.toUpperCase()}=PASS UI_EMOJI=6 SVG_REPLACEMENT=PENDING EXIT=0`);process.exit(0);
}
assert.deepEqual(emoji,[]);
for(const name of ['Box','Ruler','Focus','ArrowUp','ImageIcon','Upload','Type'])assert(code.includes('<'+name+' '),'missing '+name);
const original=ts.createSourceFile('original.tsx',cp.execFileSync('git',['show','6417625ef93b8bd9e5df6ff89fc973f5c3f70e63:src/components/canvas/canvas-client.tsx'],{encoding:'utf8'}),99,true,4);
function executableFunctions(tree){const result=new Map();function visit(n){if(ts.isFunctionDeclaration(n)&&n.name&&!['RatioIcon','CanvasClient'].includes(n.name.text))result.set(n.name.text,n.getText(tree).replace(/\r\n/g,'\n'));ts.forEachChild(n,visit)}visit(tree);return result;}
const before=executableFunctions(original),after=executableFunctions(ast);let unchanged=0;
const approvedAgent=executableFunctions(ts.createSourceFile('agent.tsx',cp.execFileSync('git',['show','f4f58dae:src/components/canvas/canvas-client.tsx'],{encoding:'utf8'}),99,true,4));
for(const [name,body]of before){const expected=['restoreAssistantConversation','sendAssistantMessage'].includes(name)?approvedAgent.get(name):body;assert.equal(after.get(name),expected,'changed function '+name);unchanged++;}
function callbacks(tree){const items=[];function visit(n){if(ts.isJsxAttribute(n)&&/^on[A-Z]/.test(n.name.text))items.push(n.getText(tree).replace(/\r\n/g,'\n'));ts.forEachChild(n,visit)}visit(tree);return items;}
assert.deepEqual(callbacks(ast),callbacks(original),'event handlers must be identical');
const ratio=code.slice(code.indexOf('function RatioIcon'),code.indexOf('// 画布通用深色下拉'));assert(ratio.includes('<svg')&&ratio.includes('<rect')&&ratio.includes('aria-hidden="true"'));
console.log(`MODIFIED=PASS UI_EMOJI=0 SVG_ICONS=7 HANDLERS=UNCHANGED FUNCTIONS_UNCHANGED=${unchanged} RATIO_OPTION=SVG EXIT=0`);
