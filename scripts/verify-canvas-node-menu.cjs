const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const ts = require('typescript');
const esbuild = require('esbuild');
const postcss = require('postcss');
const tailwind = require('tailwindcss');
const loadConfig = require('tailwindcss/loadConfig');
const { chromium } = require('@playwright/test');

// Render the real source components and the actual blank-menu JSX in isolation.
// No application server, account, database, generation or provider calls are used.
const mode = process.argv[2] || 'MODIFIED';
assert.ok(['BASELINE', 'MODIFIED', 'ROLLBACK'].includes(mode));
const root = path.resolve(process.argv[3] || '.');
const out = path.resolve(process.argv[4] || 'output/canvas-node-menu');
const current = process.cwd();
const modified = mode === 'MODIFIED';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const client = read('src/components/canvas/canvas-client.tsx');
const surface = read('src/components/canvas/context-menu-surface.tsx');
const blank = client.match(/\/\* 空白右键菜单[^]*?\*\/\s*(<>[^]*?<\/>)/)?.[1];
assert.ok(blank, 'extract actual blank-canvas menu JSX');
assert.equal(blank.includes('canvas.textGenerate'), !modified);
assert.equal(blank.includes('<ContextMenuSubmenu'), modified);
const typeMenu = modified ? '' : client.match(/\{nodeTypeMenu && <div[^]*?<\/div>\}/)?.[0];
if (!modified) assert.ok(typeMenu);
const toolbar = client.match(/<CanvasActionMenu label=\{t\("canvas.addNode"\)\}[^]*?\n\s*\/>/)?.[0];
assert.ok(toolbar);

const ast = ts.createSourceFile('canvas.tsx', client, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let createNode;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'createCanvasNode') createNode = node.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(createNode);
let calls = [], readOnly = false, videoAllowed = true;
const scope = vm.createContext({
  get readOnly() { return readOnly; }, setNodeTypeMenu() {}, centerScreen: () => ({ x: 5, y: 6 }),
  addTextNodeAtScreen: (...args) => calls.push(['text', ...args]),
  addPendAtScreen: (...args) => calls.push(['image', ...args]),
  canFeature: () => videoAllowed, openVideoNodeFromSelection: (...args) => calls.push(['video', ...args]),
});
vm.runInContext(ts.transpileModule(createNode, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, scope);
for (const kind of ['text', 'image', 'video']) scope.createCanvasNode(kind, { x: 71, y: 83 });
assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['text', 71, 83], ['image', 71, 83, null, false], ['video', true, { x: 71, y: 83 }]]);
calls = []; readOnly = true;
for (const kind of ['text', 'image', 'video']) scope.createCanvasNode(kind);
assert.equal(calls.length, 0);
readOnly = false; videoAllowed = false; scope.createCanvasNode('video'); assert.equal(calls.length, 0);

const imp = relative => JSON.stringify(path.join(root, relative).replaceAll('\\', '/'));
const entry = `
  import React, { useState } from 'react';
  import { createRoot } from 'react-dom/client';
  import { Plus, Type, ImagePlus, Video } from 'lucide-react';
  import { ContextMenuSurface, ContextMenuItem as Item ${modified ? ', ContextMenuSubmenu' : ''} } from ${imp('src/components/canvas/context-menu-surface.tsx')};
  import { CanvasActionMenu } from ${JSON.stringify(path.join(current, 'src/components/canvas/canvas-action-menu.tsx').replaceAll('\\', '/'))};
  ${modified ? `import { canvasNodeMenuItems } from ${imp('src/components/canvas/node-menu-items.ts')};` : ''}
  const labels = {'canvas.textGenerate':'文字生成','canvas.addNode':'添加节点','canvas.uploadImage':'上传图片','canvas.fromHistory':'从生成历史选择','canvas.undo':'撤销','canvas.redo':'重做','canvas.paste':'粘贴','canvas.toolbar.addText':'文本','canvas.toolbar.addImageNode':'图片'};
  const t = key => labels[key] || key;
  const L = (zh, en) => zh;
  function App() {
    const [ctxMenu, setCtxMenu] = useState(null);
    const [nodeTypeMenu, setNodeTypeMenu] = useState(null);
    const [addMenuOpen, setAddMenuOpen] = useState(false);
    const [readOnly, setReadOnly] = useState(false);
    const [videoAllowed, setVideoAllowed] = useState(true);
    const [videoNodeCreateDisabled, setVideoBusy] = useState(false);
    const lightCanvas = true, isMac = false, undoStack = [1], redoStack = [], hasClip = true;
    const videoNodeCreateLabel = '视频';
    const canFeature = () => videoAllowed;
    const shortcut = key => 'Ctrl' + key;
    const centerScreen = () => ({x: 400, y: 300});
    const setMoreToolsOpen = () => {};
    const record = (...args) => window.__calls.push(args);
    const addTextNodeAtScreen = (...args) => record('text', ...args);
    const addPendAtScreen = (...args) => record('image', ...args);
    const openVideoNodeFromSelection = (...args) => record('video', ...args);
    const triggerUpload = (...args) => record('upload', ...args);
    const openHistoryPicker = (...args) => record('history', ...args);
    const doUndo = () => record('undo'), doRedo = () => record('redo'), pasteNode = () => record('paste');
    const clipboard = {paste: () => record('paste')};
    const Sep = () => <div role="separator" className="canvas-ui-divider my-1 h-px" />;
    ${createNode}
    window.__configure = ({readonly = false, video = true, busy = false} = {}) => {setReadOnly(readonly);setVideoAllowed(video);setVideoBusy(busy);setCtxMenu(null);setNodeTypeMenu(null);setAddMenuOpen(false);};
    window.__open = (cx = 220, cy = 120) => {window.__calls = [];setCtxMenu({x: 71, y: 83, cx, cy});};
    return <main className="canvas-ui-light" style={{height:'100vh', backgroundColor:'#f5f7fa',backgroundImage:'radial-gradient(#d7dee7 0.8px, transparent 0.8px)',backgroundSize:'22px 22px'}} onContextMenu={e => {e.preventDefault();window.__open(e.clientX,e.clientY);}}>
      <div style={{position:'absolute',left:32,top:24}}>{${toolbar}}</div>
      {ctxMenu && <ContextMenuSurface x={ctxMenu.cx} y={ctxMenu.cy} light={true} onClose={() => setCtxMenu(null)}>${blank}</ContextMenuSurface>}
      ${typeMenu}
    </main>;
  }
  window.__calls = [];
  createRoot(document.getElementById('root')).render(<App />);
`;

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const bundle = await esbuild.build({
    stdin: { contents: entry, resolveDir: current, sourcefile: 'menu-fixture.tsx', loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    alias: { react: path.join(current, 'node_modules/react'), 'react-dom': path.join(current, 'node_modules/react-dom') },
    nodePaths: [path.join(current, 'node_modules')],
    tsconfigRaw: { compilerOptions: { baseUrl: current, paths: { '@/*': ['./src/*'] } } },
    plugins: [{ name: 'fixture-feature-policy', setup(build) {
      build.onResolve({ filter: /^@\/lib\/feature-access\/client$/ }, () => ({ path: 'feature-policy', namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const useFeatureAccess = () => ({can: () => true});', loader: 'js' }));
    } }],
  });
  const config = loadConfig(path.join(current, 'tailwind.config.ts'));
  const css = await postcss([tailwind({ ...config, content: [{ raw: entry + surface + fs.readFileSync(path.join(current, 'src/components/canvas/canvas-action-menu.tsx'), 'utf8'), extension: 'tsx' }] })])
    .process(fs.readFileSync(path.join(current, 'src/app/globals.css'), 'utf8'), { from: path.join(current, 'src/app/globals.css') });
  const htmlPath = path.join(out, mode.toLowerCase() + '.html');
  fs.writeFileSync(htmlPath, '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css.css + '</style><body style="margin:0;font-family:Arial,\'Microsoft YaHei\',sans-serif"><div id="root"></div><script>' + bundle.outputFiles[0].text.replaceAll('</script', '<\\/script') + '</script></body></html>');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1100, height: 720 }, deviceScaleFactor: 1 });
  const errors = [], external = [];
  page.on('pageerror', error => { errors.push(error.message); console.error('PAGE_ERROR=' + error.message); });
  await page.route('**/*', route => {
    if (/^https?:/.test(route.request().url())) { external.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  const parent = page.getByTestId('canvas-context-menu');
  const submenu = page.getByTestId('canvas-node-type-menu');
  const trigger = () => parent.getByRole('menuitem', { name: '添加节点', exact: true });
  const configure = async options => { await page.evaluate(options => window.__configure(options), options); await parent.waitFor({ state: 'hidden' }); };
  const open = async (cx = 220, cy = 120) => { await page.evaluate(([cx, cy]) => window.__open(cx, cy), [cx, cy]); await parent.waitFor(); };
  const recorded = () => page.evaluate(() => window.__calls);
  const labels = menu => menu.getByRole('menuitem').evaluateAll(buttons => buttons.map(button => button.querySelector('span')?.textContent.trim()));
  const expectedLabels = ['角色', '场景', '3D 导演台', '文本', '图片', '视频', '音频', '多轨编辑器'];
  try {
    await page.goto(pathToFileURL(htmlPath).href);
    await page.waitForFunction(() => typeof window.__open === 'function');
    await open();
    if (!modified) {
      assert.equal((await labels(parent))[0], '文字生成');
      assert.equal(await trigger().locator('svg').count(), 0);
      await page.screenshot({ path: path.join(out, mode.toLowerCase() + '.png') });
      await trigger().click();
      await submenu.getByRole('menu').waitFor();
      assert.equal(await submenu.getByRole('menuitem').count(), 3);
      await submenu.getByRole('menuitem', { name: '文本', exact: true }).click();
      assert.deepEqual(await recorded(), [['text', 71, 83]]);
    } else {
      assert.deepEqual(await labels(parent), ['添加节点', '上传图片', '从生成历史选择', '撤销', '重做', '粘贴']);
      assert.equal(await trigger().locator('svg.lucide-chevron-right').count(), 1);
      await trigger().hover(); await submenu.waitFor();
      assert.equal(await parent.isVisible(), true);
      assert.deepEqual(await labels(submenu), expectedLabels);
      assert.equal(await submenu.locator('button:disabled').count(), 5);
      assert.equal(await submenu.locator('svg').count(), 8);
      assert.deepEqual(await recorded(), []);
      const a = await trigger().boundingBox(), b = await submenu.boundingBox();
      await page.mouse.move(a.x + a.width - 2, a.y + a.height / 2);
      await page.mouse.move(b.x + 20, b.y + 20, { steps: 8 });
      assert.equal(await submenu.isVisible(), true);
      await page.screenshot({ path: path.join(out, 'modified-desktop.png') });
      for (const id of ['character', 'scene', 'stage-3d', 'audio', 'multitrack']) {
        await submenu.locator('[data-action="' + id + '"]').evaluate(button => button.click());
      }
      assert.deepEqual(await recorded(), []);
      assert.equal(await submenu.isVisible(), true);
      await submenu.getByRole('menuitem', { name: '文本', exact: true }).click();
      assert.deepEqual(await recorded(), [['text', 71, 83]]);
      await parent.waitFor({ state: 'hidden' });
      for (const [label, expected] of [['图片', ['image', 71, 83, null, false]], ['视频', ['video', true, { x: 71, y: 83, cx: 220, cy: 120 }]]]) {
        await open(); await trigger().click(); await submenu.getByRole('menuitem', { name: label, exact: true }).click();
        assert.deepEqual(await recorded(), [expected]);
      }
      await open(); await trigger().focus(); await page.keyboard.press('ArrowRight');
      await submenu.waitFor(); assert.equal(await page.evaluate(() => document.activeElement.textContent), '文本');
      await page.keyboard.press('ArrowUp'); assert.equal(await page.evaluate(() => document.activeElement.textContent), '视频');
      await page.keyboard.press('Home'); assert.equal(await page.evaluate(() => document.activeElement.textContent), '文本');
      await page.keyboard.press('End'); assert.equal(await page.evaluate(() => document.activeElement.textContent), '视频');
      await page.keyboard.press('ArrowLeft'); await submenu.waitFor({ state: 'hidden' });
      assert.equal(await trigger().evaluate(button => button === document.activeElement), true);
      await page.keyboard.press('Enter'); await submenu.waitFor();
      await page.keyboard.press('Escape'); await submenu.waitFor({ state: 'hidden' }); assert.equal(await parent.isVisible(), true);
      await page.keyboard.press('Escape'); await parent.waitFor({ state: 'hidden' });
      await open(); await trigger().hover(); await submenu.waitFor();
      await parent.getByRole('menuitem', { name: '上传图片', exact: true }).hover();
      await submenu.waitFor({ state: 'hidden' }); assert.equal(await parent.isVisible(), true);
      await configure({ readonly: true }); await open(); assert.equal(await trigger().isDisabled(), true);
      await trigger().hover({ force: true }); assert.equal(await submenu.count(), 0);
      for (const options of [{ video: false }, { busy: true }]) {
        await configure(options); await open(); await trigger().click();
        assert.equal(await submenu.getByRole('menuitem', { name: '视频', exact: true }).isDisabled(), true);
        assert.equal(await submenu.locator('button:not(:disabled)').count(), 2);
      }
      await configure({});
      await page.getByTestId('canvas-add-node-button').click();
      const toolbarMenu = page.getByTestId('canvas-create-menu');
      assert.deepEqual(await labels(toolbarMenu), expectedLabels);
      assert.equal(await toolbarMenu.locator('button:disabled').count(), 5);
      await toolbarMenu.getByRole('menuitem', { name: '图片', exact: true }).click();
      assert.deepEqual((await recorded()).at(-1), ['image', 400, 300, null, false]);
      for (const [label, action] of [['上传图片', ['upload', 71, 83]], ['从生成历史选择', ['history', 71, 83]], ['撤销', ['undo']], ['粘贴', ['paste']]]) {
        await open(); await parent.getByRole('menuitem', { name: new RegExp('^' + label) }).click(); assert.deepEqual(await recorded(), [action]);
      }
      for (const [width, height] of [[1100, 720], [390, 844], [320, 240]]) {
        await page.setViewportSize({ width, height });
        await open(width - 5, height - 5); await trigger().click(); await submenu.waitFor();
        const box = await submenu.boundingBox();
        assert.ok(box.x >= 7 && box.y >= 7 && box.x + box.width <= width - 7 && box.y + box.height <= height - 7, JSON.stringify(box));
        if (width === 1100) { const parentBox = await parent.boundingBox(); assert.ok(box.x + box.width < parentBox.x); }
        await submenu.getByRole('menuitem', { name: '多轨编辑器', exact: true }).scrollIntoViewIfNeeded();
        if (width === 390) await page.screenshot({ path: path.join(out, 'modified-mobile.png') });
        await page.keyboard.press('Tab'); await parent.waitFor({ state: 'hidden' });
      }
      await page.setViewportSize({ width: 1100, height: 720 });
      await open(); await trigger().click();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForFunction(() => {
        const menu = document.querySelector('[data-testid="canvas-node-type-menu"]').getBoundingClientRect();
        return menu.x >= 8 && menu.right <= window.innerWidth - 8;
      });
      await page.getByTestId('canvas-context-menu-backdrop').click({ position: { x: 5, y: 5 } });
      await parent.waitFor({ state: 'hidden' }); await submenu.waitFor({ state: 'hidden' });
    }
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    console.log(modified
      ? 'MODIFIED=PASS TOP_TEXT=REMOVED ARROW=YES TYPES=8 ENABLED=3 DISABLED=5 POSITION=EXACT KEYBOARD=PASS VIEWPORTS=3 READONLY=PASS VIDEO_GUARD=PASS TOOLBAR=PASS PAGE_ERRORS=0 EXTERNAL_REQUESTS=0'
      : `${mode}=PASS TOP_TEXT=PRESENT ARROW=NO TYPES=3 POSITION=EXACT PAGE_ERRORS=0 EXTERNAL_REQUESTS=0`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
