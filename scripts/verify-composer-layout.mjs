import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
let checks=0;function ok(value,message){assert(value,message);checks++}
function source(path){const text=fs.readFileSync(path,'utf8');const ast=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);ok(ast.parseDiagnostics.length===0,path+' parses');return {text,ast}}
const home=source('src/components/home/workbench-client.tsx'),canvas=source('src/components/canvas/canvas-assistant-panel.tsx'),book=source('src/components/image-skills/skill-book.tsx');
function composer(ast,testid){let result;function visit(n){if(ts.isJsxElement(n)&&n.openingElement.attributes.properties.some(a=>ts.isJsxAttribute(a)&&a.name.text==='data-testid'&&a.initializer&&ts.isStringLiteral(a.initializer)&&a.initializer.text===testid))result=n;ts.forEachChild(n,visit)}visit(ast);assert(result,'Composer exists '+testid);return result}
for(const [ast,id] of [[home.ast,'dashboard-composer'],[home.ast,'chat-composer'],[canvas.ast,'canvas-assistant-composer']]){
 const node=composer(ast,id);const text=node.getText();const textarea=node.children.find(n=>ts.isJsxSelfClosingElement(n)&&n.tagName.getText()==='textarea');ok(!!textarea,id+' direct full-row textarea');
 ok(text.indexOf('SkillBook')>text.indexOf('<textarea'),id+' skills below input');ok(textarea.getText().includes('w-full'),id+' full width');ok(!textarea.getText().includes('flex-1'),id+' not squeezed by controls');
}
ok(book.text.includes('aria-label="Skills"'),'Skill icon has accessible label');ok(book.text.includes('title={selected'),'Skill icon tooltip retained');ok(book.text.includes('取消技能选择'),'Selected skill can be cleared');
const css=fs.readFileSync('src/components/image-skills/skill-book.module.css','utf8');ok(css.includes('.compact{width:32px'),'Compact skill button32px');ok(css.includes('.compact>span{display:none}'),'Compact label leaves text area');
console.log('COMPOSER_SOURCE=PASS; CHECKS='+checks+'; DASHBOARD_CHAT_CANVAS=FULL_ROW; SKILLS=BELOW_TEXT');
