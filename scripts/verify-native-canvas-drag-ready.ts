/** Actual ReactFlow, drag hook/controller and native mouse input. Node DOM,
 * scope and commit/history I/O are explicit fixture ports, not PG/App acceptance. */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium, type Locator } from '@playwright/test';
import { dragCanvasNode } from './verification/canvas-node-drag';
async function main() {
    const arg = (key: string, fallback: string) => { const at = process.argv.indexOf(key); return at < 0 ? fallback : process.argv[at + 1]; };
    const root = path.resolve('.'), source = path.resolve(arg('--source-root', '.')), out = path.resolve(arg('--out', process.env.NATIVE_DRAG_EVIDENCE || 'output/native-drag-ready')), baseline = arg('--mode', 'modified') === 'baseline';
    mkdirSync(out, { recursive: true });
    let legacy!: (page: any, title: any, assert: any, afterRead: () => Promise<void>) => Promise<void>;
    if (baseline) {
        const text = readFileSync(path.join(source, 'scripts/verify-timeline-native-interactions.ts'), 'utf8'), start = text.indexOf('const box=await title.boundingBox()', text.indexOf('TIMELINE_UI_PHASE=GRAPH_LIFECYCLE')), end = text.indexOf('await expect.poll', start);
        assert.ok(start > 0 && end > start);
        const body = text.slice(start, end);
        assert.ok(body.includes('await page.mouse.up();'));
        legacy = new Function('page', 'title', 'assert', 'afterRead', 'return (async()=>{' + body.replace('assert.ok(box);', 'assert.ok(box);await afterRead();') + '})()') as typeof legacy;
        writeFileSync(path.join(out, 'ORIGINAL_GESTURE.txt'), body);
    }
    const entry = `import React,{useLayoutEffect,useState}from'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import{ReactFlow,useNodesState}from'@xyflow/react';import'@xyflow/react/dist/style.css';import{useCanvasDrag}from'./src/components/canvas/use-canvas-drag';import{compileCanvasMove}from'./src/lib/canvas/drag-controller';
let serial=0;const mount=createRoot(document.getElementById('root')),scope={account:'fixture',workspace:'personal',project:'tree:fixture',key:'fixture',documentCurrent:()=>true,viewCurrent:()=>true,assertView(){}};
const nodeTypes={fixture:()=> <div style={{width:280,height:160,background:'#fff',border:'1px solid #ccd5e0'}}><div data-testid="drag-title" style={{height:40,padding:12,font:'14px sans-serif'}}>多轨</div></div>};
function App({ready:initial,serial}){const[ready,setReady]=useState(initial),[nodes,setNodes,onNodesChange]=useNodesState([{id:'ready-node',type:'fixture',position:{x:80,y:90},data:{},style:{width:280,height:160}}]);const[state]=useState(()=>({serial,commits:[],starts:0,stops:0,ready:initial,flow:null,saved:{x:80,y:90}}));state.ready=ready;state.nodes=nodes;
const drag=useCanvasDrag({scope,selected:[],nodes,artworks:[],locked:()=>false,setNodes,hold:()=>()=>{},local(){},warning(message){throw Error(message)},async commit(moves){const action=compileCanvasMove(moves,()=>state.saved);if(action){state.commits.push(JSON.parse(JSON.stringify(action.moves)));state.saved={...action.moves[0].to};}}});
useLayoutEffect(()=>{window.ui={...state,get state(){return state},release(){flushSync(()=>setReady(true));}};});
return <ReactFlow nodes={nodes} nodeTypes={nodeTypes} onNodesChange={onNodesChange} nodesDraggable={ready} nodesConnectable={false} panOnDrag={false} zoomOnScroll={false} defaultViewport={{x:0,y:0,zoom:1}} onInit={flow=>{state.flow=flow}} onNodeDragStart={(e,n,ns)=>{state.starts++;drag.start(n,ns)}} onNodeDrag={(e,n)=>drag.move(n)} onNodeDragStop={(e,n,ns)=>{state.stops++;void drag.finish(n,ns)}}/>;}
window.reset=ready=>{flushSync(()=>mount.render(<App key={++serial} serial={serial} ready={ready}/>));return serial};window.reset(true);`;
    const result = await build({ stdin: { contents: entry, resolveDir: root, loader: 'tsx' }, outfile: path.join(out, 'fixture.js'), bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', alias: { '@': path.join(root, 'src') }, define: { 'process.env.NODE_ENV': '"development"' } });
    const js = result.outputFiles.find(f => f.path.endsWith('.js'))!.contents, css = result.outputFiles.find(f => f.path.endsWith('.css'))!.contents;
    writeFileSync(path.join(out, 'fixture.tsx'), entry);
    let browser: any;
    const errors: string[] = [], external: string[] = [], cases: any[] = [];
    let checks = 0;
    const eq = (a: any, b: any) => { assert.deepEqual(a, b); checks++; };
    const server = createServer((req, res) => { res.setHeader('content-type', req.url === '/fixture.js' ? 'text/javascript' : req.url === '/fixture.css' ? 'text/css' : 'text/html'); res.end(req.url === '/fixture.js' ? js : req.url === '/fixture.css' ? css : '<!doctype html><html><meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"><body style="margin:0;background:#fff"><div id="root" style="width:1000px;height:700px"></div><script src="/fixture.js"></script></body></html>'); });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
        page.on('pageerror', (e: any) => errors.push(e.message));
        await page.route('**/*', (route: any) => { if (new URL(route.request().url()).hostname === '127.0.0.1')
            return route.continue(); external.push(route.request().url()); return route.abort(); });
        await page.goto('http://127.0.0.1:' + (server.address() as any).port);
        await page.waitForFunction(() => !!(window as any).ui?.state.flow);
        const reset = async (ready: boolean) => { await page.evaluate((ready: boolean) => (window as any).reset(ready), ready); await page.waitForFunction(() => !!(window as any).ui.state.flow); await page.getByTestId('drag-title').waitFor(); };
        const state = () => page.evaluate(() => { const s = (window as any).ui.state; return { commits: s.commits, starts: s.starts, stops: s.stops, ready: s.ready, position: s.flow.getNode('ready-node').position }; });
        const normal = async () => { await reset(true); await page.locator('.react-flow__node.draggable').waitFor(); const title = page.getByTestId('drag-title'); if (baseline)
            await legacy(page, title, assert, async () => { });
        else
            await dragCanvasNode(page, title, { x: 75, y: 45 }, path.join(out, 'normal-gesture.json')); await page.waitForFunction(() => (window as any).ui.state.commits.length === 1); const s = await state(); eq(s.commits.length, 1); eq(s.starts, 1); eq(s.stops, 1); eq(s.commits[0][0].from, { x: 80, y: 90 }); eq(s.commits[0][0].to, s.position); assert.ok(s.position.x > 80 && s.position.y > 90); checks++; cases.push({ id: 'normal', ...s }); };
        await normal();
        await reset(false);
        if (baseline) {
            await legacy(page, page.getByTestId('drag-title'), assert, async () => { });
            eq((await state()).commits.length, 0);
            await page.evaluate(() => (window as any).ui.release());
        }
        else {
            const drag = dragCanvasNode(page, page.getByTestId('drag-title'), { x: 75, y: 45 }, path.join(out, 'late-settings-gesture.json'));
            await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
            eq((await state()).commits.length, 0);
            await page.evaluate(() => (window as any).ui.release());
            await drag;
            await page.waitForFunction(() => (window as any).ui.state.commits.length === 1);
        }
        let s = await state();
        eq(s.commits.length, baseline ? 0 : 1);
        cases.push({ id: 'settings-not-ready', ...s });
        await reset(true);
        await page.locator('.react-flow__node.draggable').waitFor();
        if (baseline)
            await legacy(page, page.getByTestId('drag-title'), assert, () => page.evaluate(async () => { await (window as any).ui.state.flow.setViewport({ x: 380, y: 0, zoom: 1 }, { duration: 0 }); }));
        else {
            await page.evaluate(() => { void (window as any).ui.state.flow.setViewport({ x: 380, y: 0, zoom: 1 }, { duration: 180 }); });
            await dragCanvasNode(page, page.getByTestId('drag-title'), { x: 75, y: 45 }, path.join(out, 'moving-viewport-gesture.json'));
            await page.waitForFunction(() => (window as any).ui.state.commits.length === 1);
        }
        s = await state();
        eq(s.commits.length, baseline ? 0 : 1);
        cases.push({ id: 'geometry-changes-after-visible', ...s });
        await reset(true);
        await page.locator('.react-flow__node.draggable').waitFor();
        const handle = page.getByTestId('drag-title');
        if (baseline) {
            await legacy(page, handle, assert, async () => { await page.evaluate(() => { const el = document.createElement('div'); el.id = 'overlay'; Object.assign(el.style, { position: 'fixed', inset: '0', zIndex: '9999' }); document.body.append(el); }); });
            eq((await state()).commits.length, 0);
        }
        else {
            const wrapped = new Proxy(handle, { get(target, key) { if (key === 'click')
                    return async (opts: any) => { await target.click(opts); await page.evaluate(() => { const el = document.createElement('div'); el.id = 'overlay'; Object.assign(el.style, { position: 'fixed', inset: '0', zIndex: '9999' }); document.body.append(el); }); }; const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; } }) as Locator;
            await assert.rejects(dragCanvasNode(page, wrapped, { x: 75, y: 45 }, path.join(out, 'overlay-gesture.json')), /intended node/);
            checks++;
            eq((await state()).commits.length, 0);
            eq((await state()).starts, 0);
        }
        cases.push({ id: 'overlay-appears-before-mousedown', ...await state() });
        await page.evaluate(() => document.getElementById('overlay')?.remove());
        eq(errors, []);
        eq(external, []);
        const literal = `NATIVE_CANVAS_DRAG_READY=${baseline ? 'BASELINE_REPRODUCED' : 'PASS'} CASES=${cases.length} CHECKS=${checks} ACTUAL_REACT_FLOW=1 ACTUAL_DRAG_OWNER=1 MOUSE_INPUT=1 RETRIES=0 PG=0 SUPPLIER=0`;
        writeFileSync(path.join(out, 'RESULT.json'), JSON.stringify({ status: baseline ? 'BASELINE_REPRODUCED' : 'PASS', baseline, checks, cases, errors, external, literal, scope: 'Actual ReactFlow + useCanvasDrag/controller;node DOM,scope and commit/history are fixture ports. Original baseline gesture body captured verbatim with controlled boundary fault.' }, null, 2));
        console.log(literal);
    }
    catch (error) {
        writeFileSync(path.join(out, 'FAILURE.json'), JSON.stringify({ error: String(error), errors, external, cases }, null, 2));
        throw error;
    }
    finally {
        await browser?.close();
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
