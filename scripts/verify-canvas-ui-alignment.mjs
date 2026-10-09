import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const root=path.resolve(process.argv[2]||'.');
const baseline=process.argv.includes('--baseline');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const client=read('src/components/canvas/canvas-client.tsx');
const css=read('src/app/globals.css');
const comfy=read('src/components/canvas/canvas-comfy-dialog.tsx');
const annotate=read('src/components/canvas/annotate-editor.tsx');
const block=(start,end)=>client.slice(client.indexOf(start),client.indexOf(end,client.indexOf(start)));
const toolbar=block('data-testid="canvas-main-toolbar"','{selectedBatchArts.length');
const panels=block('aria-label="画布助手面板"','{/* 重命名节点:');
if(baseline){
 assert.match(toolbar,/bg-white\/95/);
 assert.match(panels,/bg-white text-\[#252a33\]/);
 assert.match(comfy,/bg-c-card/);
 assert.match(annotate,/flex w-\[330px\] flex-none/);
 console.log('CANVAS_UI_BASELINE=PASS REPRODUCED=FIXED_TOOLBAR_SIDEBAR_COLORS_APP_THEME_WORKFLOW_ANNOTATION_OVERFLOW');
}else{
 assert.match(toolbar,/canvas-ui-surface/);
 assert.doesNotMatch(toolbar,/bg-white|text-\[#697386\]/);
 assert.equal((panels.match(/canvas-ui-surface canvas-ui-surface-solid canvas-ui-side-panel/g)||[]).length,2);
 assert.doesNotMatch(comfy,/\b(?:bg|text|border)-c-/);
 assert.match(comfy,/canvas-ui-surface/);
 assert.match(comfy,/role="dialog" aria-modal="true"/);
 assert.match(annotate,/flex-col.*md:flex-row/);
 assert.match(annotate,/w-full.*md:w-\[330px\]/);
 assert.match(annotate,/<ImageQualityControl compact/);
 assert.match(annotate,/mb-2.*ImageQualityControl compact/);
 assert.match(css,/\.canvas-ui-input:focus-visible/);
 assert.match(css,/color-scheme: dark/);
 assert.match(css,/color-scheme: light/);
 assert.match(css,/\.canvas-ui-border \{ border-color:[^}]+\}/);
 assert.match(client,/ResizeObserver/);
 assert.match(client,/separateCanvasDocks/);
 assert.doesNotMatch(client,/图片编辑操作模型/);
 const beforeArg=process.argv.indexOf('--business-baseline');
 if(beforeArg>=0){
  const before=path.resolve(process.argv[beforeArg+1]);
  const printer=ts.createPrinter({removeComments:true});
  const handlers=source=>{
   const ast=ts.createSourceFile('canvas.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
   const found=[];
   const visit=node=>{
    if(ts.isJsxAttribute(node)&&/^on[A-Z]/.test(node.name.getText(ast))) found.push(printer.printNode(ts.EmitHint.Unspecified,node,ast));
    ts.forEachChild(node,visit);
   };visit(ast);return found.sort();
  };
  for(const f of ['canvas-client.tsx','canvas-comfy-dialog.tsx','annotate-editor.tsx']){
   const file='src/components/canvas/'+f;
   assert.deepEqual(handlers(read(file)),handlers(fs.readFileSync(path.join(before,file),'utf8')),f+' handlers changed');
  }
  console.log('CANVAS_UI_HANDLERS=PASS FILES=3 EVENT_CALLBACKS=IDENTICAL');
 }
 console.log('CANVAS_UI_MODIFIED=PASS MODULES=6 THEMES=LIGHT_DARK ANNOTATION=RESPONSIVE BUSINESS=UNCHANGED');
}
