import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { canCompositeCanvasLayers as allowed } from '../src/lib/canvas/render-layer-order';

async function main() {
  const box = { left: 0, top: 0, right: 100, bottom: 100 };
  const group = { box, borderOnly: true, title: { left: 0, top: -30, right: 70, bottom: -1 } };
  const interior = { left: 25, top: 25, right: 75, bottom: 75 };
  assert.equal(allowed([group], [interior]), true);
  assert.equal(allowed([{ box }], [interior]), false, 'opaque background never moves in front of an intersecting edge');
  assert.equal(allowed([group], [{ left: -5, top: 25, right: 75, bottom: 75 }]), false, 'crossed group border');
  assert.equal(allowed([group], [{ left: 10, top: -20, right: 60, bottom: -10 }]), false, 'title background');
  assert.equal(allowed([{ box }], [{ left: 101, top: 0, right: 200, bottom: 100 }]), true);
  assert.equal(allowed([{ box }], [{ left: 100, top: 0, right: 200, bottom: 100 }]), false, 'touching paint bounds');
  assert.equal(allowed([{ box: { ...box, right: NaN } }], []), false);
  assert.equal(allowed([], [{ ...interior, bottom: Infinity }]), false);
  assert.equal(allowed([group], [interior], -1), false);

  let reads = 0;
  const queues: Array<() => void> = [], cleanups: Array<() => void> = [];
  const rect = (value: typeof box) => ({ ...value, x: value.left, y: value.top, width: value.right - value.left, height: value.bottom - value.top });
  const title = { closest: () => node, getBoundingClientRect() { reads++; return rect({ left: 0, top: -30, right: 70, bottom: -5 }); } };
  const groupElement = { closest: () => node, getBoundingClientRect() { reads++; return rect(box); }, querySelector() { return title; } };
  const node = { style: { zIndex: '-60000' }, querySelector: () => groupElement };
  let edgeRect = interior;
  const path = { closest: () => edge, classList: { contains: () => false }, getBoundingClientRect() { reads++; return rect(edgeRect); } };
  const edge = { ownerSVGElement: { style: { zIndex: '0' } }, querySelector: () => path };
  const root = { matches: () => true, contains: () => false, addEventListener() {}, removeEventListener() {}, getBoundingClientRect: () => rect({left:0,top:0,right:900,bottom:720}), dataset: {} as Record<string, string>, querySelector: (selector: string) => selector.includes(':hover') ? null : ({ style: { transform: 'translate(0px,0px) scale(1)' } }),
    querySelectorAll: (selector: string) => selector === '.react-flow__node' ? [node] : [edge] };
  let observer: { callback: (records: unknown[]) => void; disconnected: boolean };
  const context = vm.createContext({ console, queueMicrotask: (callback: () => void) => queues.push(callback),
    ResizeObserver: class { observe(){} disconnect(){} },
    MutationObserver: class { disconnected = false; constructor(readonly callback: (records: unknown[]) => void) { observer = this; } observe() {} disconnect() { this.disconnected = true; } },
    testReact: { useRef: () => ({ current: { closest: () => root } }), useLayoutEffect: (effect: () => (() => void)) => cleanups.push(effect()) } });
  const js = (await build({ stdin: { contents: 'import {CanvasRenderLayerGuard} from "./src/components/canvas/canvas-render-layer-guard";globalThis.runGuard=CanvasRenderLayerGuard;', resolveDir: process.cwd() }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'transform',
    plugins: [{ name: 'react-fixture', setup(plugin) {
      plugin.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'fixture' }));
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const useRef=globalThis.testReact.useRef,useLayoutEffect=globalThis.testReact.useLayoutEffect;export default {createElement(){return null;}};', loader: 'js' }));
    } }] })).outputFiles[0].text.replaceAll('React.createElement', '({createElement(){return null;}}).createElement');
  vm.runInContext(js, context); (context as any).runGuard();
  assert.equal(root.dataset.canvasLayerOrder, 'composite');
  const startReads = reads;
  const viewport = { matches: () => true, closest: () => null };
  for (let frame = 0; frame < 120; frame++) observer!.callback([{ type: 'attributes', target: viewport }]);
  assert.equal(queues.length, 0); assert.equal(reads, startReads, 'viewport transform performs zero layout reads');
  edgeRect = { left: -5, top: 25, right: 75, bottom: 75 };
  const changedNode = { matches: () => false, closest: () => edge };
  for (let change = 0; change < 100; change++) observer!.callback([{ type: 'attributes', target: changedNode }]);
  assert.equal(queues.length, 1); queues.shift()!(); assert.equal(root.dataset.canvasLayerOrder, 'original');
  edgeRect = interior; observer!.callback([{ type: 'attributes', target: changedNode }]); queues.shift()!(); assert.equal(root.dataset.canvasLayerOrder, 'composite');
  const cachedReads=reads;observer!.callback([{type:'childList',target:root}]);queues.shift()!();assert.equal(reads,cachedReads,'virtualization topology refresh reuses world geometry');
  edge.ownerSVGElement.style.zIndex = '1000'; observer!.callback([{ type: 'attributes', target: changedNode }]); queues.shift()!(); assert.equal(root.dataset.canvasLayerOrder, 'original');
  cleanups.forEach(callback => callback()); assert.equal(observer!.disconnected, true); assert.equal(root.dataset.canvasLayerOrder, undefined);
  const guard=readFileSync('src/components/canvas/canvas-render-layer-guard.tsx','utf8');assert.match(guard,/Arbitrary user layer order[\s\S]*?allowed = false/);
  const css = readFileSync('src/app/globals.css', 'utf8');
  assert.doesNotMatch(css, /\.react-flow__(nodes|edges)[^{]*\{\s*will-change:\s*transform/);
  assert.doesNotMatch(css, /canvas-render-layers[^\n]*:has/);
  console.log('RENDER_LAYER_ORDER=PASS OPAQUE_NEGATIVE_BORDER_TITLE_EDGE_ZINDEX_HOVER=ORIGINAL INTERIOR_GROUP_EDGES=COMPOSITE VIEWPORT120_FRAMES_LAYOUT_READS=0 GEOMETRY100_CHANGES_BATCHES=1 UNMOUNT=CLEAN');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
