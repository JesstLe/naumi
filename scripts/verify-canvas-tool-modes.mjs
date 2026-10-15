// Native mouse regression using the installed React Flow and the actual CanvasClient props/CSS.
// Follows the isolated Chrome workflow in canvas-keyboard-overlay-smoke.mjs; no user profile/DB/model calls.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";

const root = path.resolve(process.argv[2] || ".");
const baseline = process.argv.includes("--baseline");
const out = path.resolve(process.env.CANVAS_TOOL_OUT || "output/canvas-tool-modes");
await mkdir(out, { recursive: true });
const client = await readFile(path.join(root, "src/components/canvas/canvas-client.tsx"), "utf8");
const css = await readFile(path.join(root, "src/app/globals.css"), "utf8");
const props = {};
for (const key of ["panOnDrag", "selectionOnDrag", "selectionKeyCode", "nodesDraggable", "nodesConnectable", "elementsSelectable"]) {
  const match = client.match(new RegExp(`\\b${key}=\\{([^\\n]+)\\}`));
  if (match) props[key] = match[1];
}
assert.equal(Object.keys(props).length >= 5, true, "CanvasClient interaction props must be read from source");
assert.match(client, /panActivationKeyCode="Space"/);
assert.match(client, /multiSelectionKeyCode=\{\["Control", "Meta", "Shift"\]\}/);
const interactionCss = (css.match(/[^{}]+\{[^{}]*\}/g) || []).filter(rule => /\.canvas-(hand-tool|box-select)/.test(rule)).join("\n");
const source = `import React,{useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {ReactFlow,Background,useNodesState,SelectionMode,Handle,Position} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
function Card({data}){return <div className="card"><Handle type="target" position={Position.Left}/><div className="art" style={{background:data.color}}/><strong>{data.label}</strong><span>{data.locked?'已锁定':'可选择与移动'}</span><Handle type="source" position={Position.Right}/></div>}
const nodeTypes={card:Card};
const initial=[{id:'a',type:'card',position:{x:180,y:140},draggable:true,data:{label:'图片节点 A',color:'#dde9fa'}},{id:'b',type:'card',position:{x:490,y:160},draggable:true,data:{label:'图片节点 B',color:'#e1f0e9'}},{id:'locked',type:'card',position:{x:800,y:150},draggable:false,data:{label:'锁定节点',locked:true,color:'#eee7f5'}}];
function App(){const[canvasTool,setTool]=useState('move'),[readOnly,setReadOnly]=useState(false),[nodes,setNodes,onNodesChange]=useNodesState(initial),[viewport,setViewport]=useState({x:0,y:0,zoom:1});const boxSelectMode=canvasTool==='marquee';
useEffect(()=>{window.fixture={nodes,viewport,canvasTool,readOnly};},[nodes,viewport,canvasTool,readOnly]);
useEffect(()=>{const key=e=>{if(e.target instanceof Element&&e.target.closest('input,textarea,[contenteditable=true]'))return;if(e.ctrlKey||e.metaKey||e.altKey)return;const next={v:'move',m:'marquee',h:'hand',Escape:'move'}[e.key];if(next){e.preventDefault();setTool(next)}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[]);
return <><header><strong>画布工具 · 本地交互验收</strong><span>真实 React Flow / 源码配置 · 非线上页面</span><label><input id="readonly" type="checkbox" checked={readOnly} onChange={e=>setReadOnly(e.target.checked)}/>只读</label></header><main><ReactFlow nodes={nodes} onNodesChange={onNodesChange} nodeTypes={nodeTypes} edges={[]} className={(canvasTool==='hand'?'canvas-hand-tool':'')+(boxSelectMode?' canvas-box-select':'')} defaultViewport={{x:0,y:0,zoom:1}} onInit={i=>{window.fixtureApi=i}} onMove={(_,v)=>setViewport(v)} ${Object.entries(props).map(([key,expression])=>`${key}={${expression}}`).join(' ')} selectionMode={SelectionMode.Partial} multiSelectionKeyCode={['Control','Meta','Shift']} panActivationKeyCode="Space" panOnScroll zoomOnScroll={false} zoomActivationKeyCode={['Control','Meta']} deleteKeyCode={null} proOptions={{hideAttribution:true}}><Background gap={24} color="#d9e1eb"/></ReactFlow><nav>{[['move','↖','选择与移动节点','V'],['marquee','▧','框选节点','M'],['hand','✋','拖动画布','H']].map(([mode,icon,label,key])=><button key={mode} data-tool={mode} aria-pressed={canvasTool===mode} onClick={()=>setTool(mode)}><b>{icon}</b>{label}<kbd>{key}</kbd></button>)}</nav></main><footer>当前：{canvasTool==='hand'?'手形 · 仅平移画布':canvasTool==='marquee'?'框选 · 拖空白选择节点':'选择 · 拖空白框选 / 拖节点移动'}<span>空格临时平移 · 中键平移 · 滚轮平移</span></footer></>};createRoot(document.getElementById('root')).render(<App/>);`;
await build({ stdin: { contents: source, resolveDir: process.cwd(), loader: "jsx" }, bundle: true, outfile: path.join(out, "fixture.js"), format: "iife", define: { "process.env.NODE_ENV": '"production"' }, jsx: "automatic" });
await writeFile(path.join(out, "fixture.html"), `<!doctype html><meta charset="utf-8"><title>画布工具交互验收</title><link rel="stylesheet" href="/fixture.css"><style>body{margin:0;font-family:Arial,'Microsoft YaHei',sans-serif;color:#25374d;background:#f8fafc}header{height:64px;display:flex;align-items:center;gap:20px;padding:0 26px;background:white;border-bottom:1px solid #e2e8f0}header span{font-size:12px;color:#6b7d92}header label{margin-left:auto;font-size:13px}main{height:640px;position:relative}.card{width:160px;min-height:150px;background:white;border:1px solid #dce4ef;border-radius:12px;padding:10px;box-shadow:0 3px 10px #20384b0a}.art{height:92px;border-radius:7px;margin-bottom:12px}.card strong{font-size:14px;display:block}.card span{font-size:12px;color:#7c8c9f;display:block;margin-top:5px}.react-flow__node.selected .card{outline:2px solid #2f7df6}.react-flow__node{border-radius:12px}nav{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);z-index:10;display:flex;gap:6px;padding:7px;border:1px solid #dce4ef;border-radius:13px;background:white;box-shadow:0 6px 24px #25374d12}button{height:38px;border:0;background:white;border-radius:8px;padding:0 12px;color:#566a81;cursor:pointer;white-space:nowrap}button[aria-pressed=true]{background:#eaf2ff;color:#2068d4}button b{font-size:18px;margin-right:7px}kbd{font-size:10px;color:#8091a7;margin-left:9px}footer{display:flex;justify-content:space-between;padding:18px 26px;font-size:13px;background:white;border-top:1px solid #e2e8f0}footer span{color:#718399}${interactionCss}</style><div id="root"></div><script src="/fixture.js"></script>`);
const server = createServer(async (req, res) => { try { const name = req.url === "/" ? "fixture.html" : path.basename(req.url.split("?")[0]); res.setHeader("content-type", name.endsWith("js") ? "application/javascript" : name.endsWith("css") ? "text/css" : "text/html"); res.end(await readFile(path.join(out, name))); } catch { res.statusCode = 404; res.end(); } });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
await writeFile(path.join(out, "fixture-url.txt"), base);
if (process.argv.includes("--serve")) { console.log(`FIXTURE_URL=${base}`); await new Promise(() => {}); }
let browser;
const checks = [], errors = [];
try {
  browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu"] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 790 } });
  page.on("pageerror", error => errors.push(error.message));
  const reset = async () => { await page.goto(base); await page.locator('.react-flow__node[data-id="a"]').waitFor(); await expect.poll(() => page.evaluate(() => window.fixture?.nodes.length)).toBe(3); };
  // Read React Flow's live transform; the first wheel event only fires onMoveStart.
  const state = () => page.evaluate(() => ({...window.fixture,viewport:window.fixtureApi.getViewport()}));
  const drag = async (from, to, button = "left") => { await page.mouse.move(...from); await page.mouse.down({ button }); await page.mouse.move(...to, { steps: 18 }); await page.mouse.up({ button }); await page.waitForTimeout(80); };
  const pass = name => { checks.push(name); console.log(`PASS ${name}`); };
  const sameViewport = (a,b) => Math.abs(a.x-b.x)<1 && Math.abs(a.y-b.y)<1 && a.zoom===b.zoom;
  const node = async id => page.locator(`.react-flow__node[data-id="${id}"]`).boundingBox();
  await reset();
  const before = await state();
  await drag([100,160],[740,440]);
  const after = await state();
  if (baseline) {
    assert(!sameViewport(before.viewport, after.viewport));
    assert.equal(after.nodes.filter(n=>n.selected).length, 0);
    pass("baseline select tool incorrectly pans on blank left drag");
    await page.screenshot({ path: path.join(out, "baseline.png") });
    console.log("BASELINE=PASS REPRODUCED=SELECT_LEFT_DRAG_PANS EXIT=0");
  } else {
    assert(sameViewport(before.viewport, after.viewport));
    assert.deepEqual(after.nodes.filter(n=>n.selected).map(n=>n.id).sort(), ['a','b']);
    pass("V blank left drag selects image nodes without moving viewport");
    await page.screenshot({ path: path.join(out, "select-box.png") });
    await reset(); let rect=await node('a'), s=await state();
    await drag([rect.x+50,rect.y+35],[rect.x+110,rect.y+75]);
    let e=await state();assert(e.nodes[0].position.x>s.nodes[0].position.x+50);assert(sameViewport(s.viewport,e.viewport));
    pass("V node drag moves node, not canvas");
    await reset();await page.locator('[data-tool="hand"]').click();s=await state();await drag([100,160],[240,230]);e=await state();assert(!sameViewport(s.viewport,e.viewport));assert.deepEqual(e.nodes.map(n=>n.position),s.nodes.map(n=>n.position));
    pass("H blank drag only pans");
    await reset();await page.locator('[data-tool="hand"]').click();rect=await node('a');s=await state();await drag([rect.x+50,rect.y+35],[rect.x+130,rect.y+85]);e=await state();assert(!sameViewport(s.viewport,e.viewport));assert.deepEqual(e.nodes.map(n=>n.position),s.nodes.map(n=>n.position));assert.equal(e.nodes.some(n=>n.selected),false);
    pass("H drag over an explicitly draggable node pans without moving/selecting it");
    await page.screenshot({ path: path.join(out, "hand-pan.png") });
    await reset();await drag([100,160],[740,440]);assert.equal((await state()).nodes.filter(n=>n.selected).length,2);await page.locator('[data-tool="hand"]').click();s=await state();rect=await node('a');await drag([rect.x+50,rect.y+35],[rect.x+130,rect.y+85]);e=await state();assert(!sameViewport(s.viewport,e.viewport));assert.deepEqual(e.nodes.map(n=>n.position),s.nodes.map(n=>n.position));pass("H also pans over an existing multi-node selection without moving the group");
    await page.locator('[data-tool="move"]').click();rect=await node('a');s=await state();await drag([rect.x+50,rect.y+35],[rect.x+110,rect.y+75]);e=await state();assert(e.nodes[0].position.x>s.nodes[0].position.x+50);assert(sameViewport(s.viewport,e.viewport));pass("returning H to V restores selected-node dragging");
    await reset();await page.locator('[data-tool="marquee"]').click();s=await state();await drag([100,160],[740,440]);e=await state();assert(sameViewport(s.viewport,e.viewport));assert.equal(e.nodes.filter(n=>n.selected).length,2);pass("M explicit box selection is preserved");
    await reset();s=await state();await page.keyboard.down('Space');await drag([100,160],[240,230]);await page.keyboard.up('Space');e=await state();assert(!sameViewport(s.viewport,e.viewport));assert.equal(e.canvasTool,'move');await drag([760,420],[780,440]);assert(sameViewport(e.viewport,(await state()).viewport));pass("Space temporarily pans and release restores V selection");
    await reset();await page.locator('[data-tool="marquee"]').click();s=await state();await page.keyboard.down('Space');await drag([100,160],[240,230]);await page.keyboard.up('Space');e=await state();assert(!sameViewport(s.viewport,e.viewport));assert.equal(e.canvasTool,'marquee');pass("Space temporary pan also works in M");
    for(const mode of ['move','marquee','hand']){await reset();await page.locator('[data-tool="'+mode+'"]').click();s=await state();await drag([100,160],[200,220],'middle');assert(!sameViewport(s.viewport,(await state()).viewport));}pass("middle-button pan works in V/M/H");
    await reset();await page.keyboard.down('Shift');await drag([100,160],[740,440]);await page.keyboard.up('Shift');assert.equal((await state()).nodes.filter(n=>n.selected).length,2);pass("Shift selection compatibility remains");
    await reset();await page.locator('[data-tool="hand"]').click();await page.keyboard.down('Shift');s=await state();await drag([100,160],[240,230]);await page.keyboard.up('Shift');e=await state();assert(!sameViewport(s.viewport,e.viewport));assert.equal(e.nodes.some(n=>n.selected),false);pass("Shift cannot change H into a selection tool");
    await reset();rect=await node('locked');s=await state();await drag([rect.x+40,rect.y+30],[rect.x+100,rect.y+80]);assert.deepEqual((await state()).nodes[2].position,s.nodes[2].position);pass("locked node never moves");
    // Production node draggability includes the existing per-node read-only/lock guard.
    assert.match(client,/draggable:nodeSettingsReady && !readOnly && !settings.locked/);
    assert.match(client,/if \(canvasTool === "hand"\) return;/);
    pass("production per-node read-only/lock and hand-click guards retained");
    await reset();await page.keyboard.press('h');assert.equal((await state()).canvasTool,'hand');await page.keyboard.press('Escape');assert.equal((await state()).canvasTool,'move');await page.keyboard.press('m');assert.equal((await state()).canvasTool,'marquee');await page.keyboard.press('v');assert.equal((await state()).canvasTool,'move');pass("V/M/H and Escape mode switching");
    await reset();s=await state();await page.mouse.move(100,160);await page.mouse.wheel(0,80);await expect.poll(async()=>sameViewport(s.viewport,(await state()).viewport)).toBe(false);pass("wheel pan preserved");
    await reset();s=await state();await page.mouse.move(600,360);await page.keyboard.down('Control');await page.mouse.wheel(0,-100);await page.keyboard.up('Control');await expect.poll(async()=>(await state()).viewport.zoom).not.toBe(s.viewport.zoom);pass("Control+wheel zoom preserved");
    assert.deepEqual(errors,[]);console.log(`MODIFIED=PASS CHECKS=${checks.length} PAGE_ERRORS=0 EXIT=0`);
  }
  await writeFile(path.join(out, "results.json"), JSON.stringify({ baseline, checks, errors, props, base },null,2));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
