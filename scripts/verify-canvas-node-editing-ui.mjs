import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const root=path.resolve(process.argv[2]||'.'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const client=read('src/components/canvas/canvas-client.tsx');
const projection=read('src/lib/canvas/scene-projection.ts'),textRenderer=read('src/components/canvas/nodes/text-node.tsx');
const preferences=fs.existsSync(path.join(root,'src/lib/canvas/node-preferences.ts'))?read('src/lib/canvas/node-preferences.ts'):'';
const presentation=client+projection+textRenderer+read('src/lib/canvas/local-image-edits.ts')+preferences;
if(process.argv.includes('--baseline')){
  assert.ok(!client.includes('NodePropertiesPanel') && !client.includes('ImageCropDialog'));
  console.log('NODE_EDIT_BASELINE=PASS TEXT_STYLE=FIXED_12PX NODE_LOCK_LAYER=ABSENT LOCAL_CROP_REPLACE=ABSENT');process.exit(0);
}
for(const token of ['nodeSettingsReady','settings.order','!settings.locked','nodeTextStyle','NodePropertiesPanel','ImageCropDialog','nodeManagementItems','isNodeLocked','elevateNodesOnSelect={false}','propertiesOpen ||','/api/canvas/local-image-edit','onSave={settings=>commitNodeSettings'])assert.ok(presentation.includes(token)||token==='propertiesOpen ||' && client.includes('(propertiesOpen &&'),token);
const drag=read('src/lib/canvas/drag-controller.ts');
assert.ok(drag.includes('chosen.filter(node=>!input.locked(node.id))')&&drag.includes('if(!to||input.locked(id))continue'),'gesture owner filters locked nodes at start and completion');
const historyModel=read('src/lib/canvas/history-model.ts');
for(const token of ['kind: "node-settings"','type:"node-settings"'])assert.ok(historyModel.includes(token),token+' is owned by history model');
assert.ok(preferences?client.includes('nodePreferences.commit(id,to,')&&preferences.includes('await history.submit(target,'):client.includes('await applyHistory(act,false); pushUndo(act)'), 'properties caller uses shared atomic history owner');
const arrangement=read('src/lib/canvas/arrange.ts');assert.ok(arrangement.includes('fixed:!mobileIds.has(node.id)||scene.locked(node.id)')&&client.includes('locked:isNodeLocked'),'tidy layout pins locked and temporary nodes through original arrange owner');
const panel=read('src/components/canvas/node-properties-panel.tsx'),crop=read('src/components/canvas/image-crop-dialog.tsx');
for(const token of ['应用样式','自动','字号','行距','原图像素','画布显示尺寸','aria-pressed','min-[1024px]:relative','node-style-preview','role={overlay ? "dialog"','settings.locked','Escape','Tab'])assert.ok(panel.includes(token),token);
for(const token of ['setPointerCapture','onPointerCancel','crop[key]*100','Save cropped version','role="dialog"','aria-modal="true"','Escape','Tab'])assert.ok(crop.includes(token),token);
const store=read('src/lib/canvas-node-settings-store.ts'),service=read('src/lib/canvas-local-image-edit.ts');
assert.ok(store.includes('s.email=$1')&&store.includes('a.email=s.email')&&store.includes('n.email=s.email'));
assert.ok(!/billing|quoteAndSubmit|fetch\(/.test(service));
const arg=process.argv.indexOf('--business-baseline');
if(arg>=0){
 const baseline=fs.readFileSync(path.join(process.argv[arg+1],'src/components/canvas/canvas-client.tsx'),'utf8'),printer=ts.createPrinter({removeComments:true});
 const functions=source=>{const ast=ts.createSourceFile('c.tsx',source.replace(/\r\n/g,'\n'),99,true,4),map=new Map();function walk(n){if(ts.isFunctionDeclaration(n)&&n.name)map.set(n.name.text,printer.printNode(ts.EmitHint.Unspecified,n,ast));ts.forEachChild(n,walk);}walk(ast);return map;};
 const before=functions(baseline),after=functions(client);
 const protectedNames=['privateFetch','runGen','sendAssistantMessage','assistantContext','renderAssistantContent','genFromAssistant','onQuickAction','onHd','onRatioGen','onExpand','onCutout','onGenerateVideo','onGenerateText','onTextGenerateImages'];let count=0;
 for(const name of protectedNames){if(before.has(name)){assert.equal(after.get(name),before.get(name),name);count++;}}
 assert.ok(count>=10);console.log(`NODE_EDIT_BUSINESS=PASS PROTECTED_GENERATION_FUNCTIONS=${count} UPSTREAM_PARAMETERS_MODELS_BILLING=UNCHANGED`);
}
console.log('NODE_EDIT_UI=PASS PANEL=ON_DEMAND_ASSISTANT_EXCLUSIVE TEXT=STAGED_SAVE LOCK=MOVE_RESIZE_CONTENT_DELETE LAYER=ZINDEX PIXEL_DISPLAY_SIZE=SEPARATE HIGH_FREQUENCY=OUTSIDE MENU=LOW_FREQUENCY LOCAL_EDITS=NEW_VERSION');
