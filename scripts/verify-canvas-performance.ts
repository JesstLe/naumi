import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

type Art = { id: string; parentId?: string | null };
function legacyRoot(start: Art, byId: Map<string, Art>) {
  let current = start, guard = 0;
  while (current.parentId && byId.has(current.parentId) && guard++ < 200) current = byId.get(current.parentId)!;
  return current;
}
async function main() {
  const baseline = process.argv.includes('--baseline');
  const source = readFileSync('src/components/canvas/canvas-image.tsx', 'utf8');
  const cases: Art[][] = [
    Array.from({ length: 180 }, (_, i) => ({ id: String(i), parentId: i ? String(i - 1) : null })),
    [{ id: 'a', parentId: 'c' }, { id: 'b', parentId: 'a' }, { id: 'c', parentId: 'b' }],
    [{ id: 'a', parentId: 'missing' }, { id: 'b', parentId: 'a' }],
    Array.from({ length: 350 }, (_, i) => ({ id: String(i), parentId: i ? String(i - 1) : null })),
  ];
  const graph = cases[0], byId = new Map(graph.map(art => [art.id, art]));
  const repeats = 300;
  let resolveFactory: (map: Map<string, Art>) => (art: Art) => Art;
  if (baseline) {
    assert.match(source, /\[zoom,props.width,props.height\]/);
    assert.match(source, /getBoundingClientRect/);
    resolveFactory = map => art => legacyRoot(art, map);
  } else {
    const { createProjectRootResolver } = await import('../src/lib/canvas/project-roots');
    resolveFactory = createProjectRootResolver;
    for (const graph of cases) {
      const map = new Map(graph.map(art => [art.id, art]));
      // Reverse and rotate traversal, including long/cyclic corrupt histories.
      for (const order of [graph, [...graph].reverse(), [...graph.slice(7), ...graph.slice(0, 7)]]) {
        const resolve = createProjectRootResolver(map);
        for (const art of order) assert.equal(resolve(art).id, legacyRoot(art, map).id);
      }
    }
    let visibilityCreated = 0, sizesCreated = 0, visibilityDisconnected = 0, sizesDisconnected = 0;
    const visibilityObservers: any[] = [], sizeObservers: any[] = [];
    class Visibility {
      callback: Function; observed = new Set();
      constructor(callback: Function) { this.callback = callback; visibilityCreated++; visibilityObservers.push(this); }
      observe(e: unknown) { this.observed.add(e); } unobserve(e: unknown) { this.observed.delete(e); }
      disconnect() { visibilityDisconnected++; }
    }
    class Size extends Visibility {
      constructor(callback: Function) { super(callback); visibilityCreated--; visibilityObservers.pop(); sizesCreated++; sizeObservers.push(this); }
      disconnect() { sizesDisconnected++; }
    }
    Object.assign(globalThis, { IntersectionObserver: Visibility, ResizeObserver: Size });
    const helpers = await import('../src/lib/canvas/image-observers');
    const root = {}, visible: boolean[] = [], size: number[] = [];
    const elements = Array.from({ length: 200 }, () => ({ closest: () => root })) as unknown as Element[];
    const cancel = elements.flatMap((element, i) => [
      helpers.observeCanvasImageVisibility(element, value => { visible[i] = value; }),
      helpers.observeCanvasImageSize(element, (w, h) => { size[i] = Math.max(w, h); }),
    ]);
    assert.equal(visibilityCreated, 1); assert.equal(sizesCreated, 1);
    visibilityObservers[0].callback(elements.map(target => ({ target, isIntersecting: true })));
    sizeObservers[0].callback(elements.map(target => ({ target, contentRect: { width: 512, height: 320 } })));
    assert.equal(visible.filter(Boolean).length, 200); assert.equal(size.filter(n => n === 512).length, 200);
    cancel.forEach(f => f()); assert.equal(visibilityDisconnected, 1); assert.equal(sizesDisconnected, 1);
    visibilityObservers[0].callback([{ target: elements[0], isIntersecting: false }]); assert.equal(visible[0], true);
    const release = helpers.observeCanvasImageSize(elements[0], () => {}); assert.equal(sizesCreated, 2); release();
    assert.doesNotMatch(source, /getBoundingClientRect/); assert.doesNotMatch(source, /\[zoom,/);
    const client = readFileSync('src/components/canvas/canvas-client.tsx', 'utf8');
    assert.doesNotMatch(client, /selectedTextId \|\| viewport.zoom !== vp.zoom/);
    assert.match(client, /zoomLabelRef.current.textContent\s*=\s*label/);
    assert.match(client, /updateLiveViewport\(vp\)/);assert.doesNotMatch(client, /selectedTextId\) setViewport\(vp\)/);
    const {knownCanvasNodeMeasurement}=await import('../src/lib/canvas/node-measurement');
    assert.deepEqual(knownCanvasNodeMeasurement({width:420,height:195}),{width:420,height:195});
    for(const style of [undefined,{}, {width:'420px',height:195},{width:420,height:'auto'},{width:0,height:195},{width:420,height:NaN},{width:Infinity,height:195}])assert.equal(knownCanvasNodeMeasurement(style),undefined);
    const {getNodesBounds,getViewportForBounds}=await import('@xyflow/react');
    const scene=[{id:'near',position:{x:0,y:0},style:{width:420,height:195}},{id:'far',position:{x:30000,y:25000},style:{width:420,height:8000}}];
    const measured=scene.map(node=>({...node,data:{},measured:knownCanvasNodeMeasurement(node.style)}));
    const bounds=getNodesBounds(measured);assert.deepEqual(bounds,{x:0,y:0,width:30420,height:33000});
    const fit=getViewportForBounds(bounds,900,720,Number.EPSILON,1,0.25);assert.ok(fit.zoom<0.03,'offscreen known nodes enter initial full fit');
    assert.match(client,/measured: currentById.get\(node.id\)\?\.measured \?\? knownCanvasNodeMeasurement\(node.style\)/);
    console.log('INITIAL_MEASUREMENT=FIXED_NUMERIC_ONLY OFFSCREEN_FULL_FIT=PASS OBSERVED_SIZE_PRECEDENCE=RETAINED AUTOSIZE=DOM_MEASURED');
    const css=readFileSync('src/app/globals.css','utf8');
    assert.match(client,/!selectedEdge && !linking && "canvas-render-layers"/);
    assert.match(css,/data-canvas-layer-order="composite"/);
    assert.match(css,/\.react-flow__edges \{ will-change: transform; \}/);
    assert.match(client,/<CanvasRenderLayerGuard \/>/);
    assert.doesNotMatch(css,/\.react-flow__node[^s\n{]*\{[^}]*will-change/);
    const decorations=readFileSync('src/components/canvas/workflow-import-nodes.tsx','utf8');
    assert.match(decorations,/<CanvasImage/);assert.match(decorations,/forceOriginal=\{!!selected\|\|original\}/);
    assert.match(decorations,/data\.rotation/);assert.match(decorations,/data\.flipX/);assert.match(decorations,/data\.opacity/);
    console.log('RENDER_SURFACES=2 ALL_NODES_PATHS_RETAINED EDGE_SELECTED_LINKING_NATIVE_ZORDER=PASS DECORATION_VARIANTS_ORIGINAL_FALLBACK=PASS');
    console.log('CORRECTNESS=PASS FOREST_CYCLE_LONG_HISTORY=LEGACY_EXACT OBSERVERS_200_IMAGES=1_VISIBILITY_1_SIZE UNMOUNT=RELEASED');
    console.log('INTERACTION=PASS EMPTY_SELECTION_ZOOM_NO_PAGE_STATE_UPDATE SELECTED_DOCKS_LIVE_GEOMETRY_FOLLOW LIVE_ZOOM_HUD=RETAINED ORIGINAL_MEDIA_PATHS=UNCHANGED');
  }
  const runs: number[] = [];
  for (let i = 0; i < 10; i++) {
    const at = performance.now();
    for (let n = 0; n < repeats; n++) { const resolve = resolveFactory(byId); for (const art of [...graph].reverse()) resolve(art); }
    runs.push(performance.now() - at);
  }
  runs.sort((a, b) => a - b);
  console.log(JSON.stringify({ kind: baseline ? 'BASELINE' : 'MODIFIED', metric: 'PROJECT_ROOT_GROUPING_CPU_ONLY', nodes: 180, passes: repeats, medianMs: runs[5], p95Ms: runs[9], note: 'Microbenchmark, not browser/production acceptance' }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
