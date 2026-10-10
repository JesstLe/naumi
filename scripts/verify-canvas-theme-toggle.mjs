import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const file=path.resolve(process.argv[2]||'src/components/canvas/canvas-client.tsx');
const client=fs.readFileSync(file,'utf8');
const more=client.slice(client.indexOf('<CanvasActionMenu label={t("canvas.toolbar.settings")}'),client.indexOf('{selectedBatchArts.length > 1'));
if(process.argv.includes('--baseline')){
  assert.ok(more.includes('id: "theme"') && !client.includes('data-testid="canvas-theme-toggle"'));
  console.log('BASELINE=PASS THEME_ENTRY=MORE_MENU EXTERNAL_BUTTON=ABSENT');process.exit(0);
}
assert.ok(!more.includes('id: "theme"') && more.includes('id: "help"'));
const views=client.slice(client.indexOf('data-testid="canvas-view-toolbar"'),client.indexOf('{zoomMenuOpen &&'));
for(const token of ['data-testid="canvas-theme-toggle"','aria-pressed={!lightCanvas}','canvas.toolbar.darkCanvas','canvas.toolbar.lightCanvas','localStorage.setItem("nv:canvas:bg"','h-8 w-8','Moon','Sun','focus-visible:ring-2'])assert.ok(views.includes(token),token);
assert.equal((client.match(/data-testid="canvas-theme-toggle"/g)||[]).length,1);
console.log('MODIFIED=PASS THEME_ENTRY=VIEW_TOOLBAR EXTERNAL_BUTTON=1 MORE_MENU_DUPLICATE=0 SIZE=32x32 STORAGE_KEY=UNCHANGED');
