import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bindCanvasHoverPlane } from '../src/lib/canvas/hover-layer-plane';

const listeners = new Map<string, (event: any) => void>();
let writes = 0, removals = 0, geometryReads = 0, initialQueries = 0;
const stored: Record<string,string> = {};
const root: any = {
  dataset: new Proxy(stored, { set(target,key,value) { writes++; target[key as string]=value; return true; }, deleteProperty(target,key) { if (key in target) removals++; delete target[key as string]; return true; } }),
  addEventListener(name: string, fn: any, capture: boolean) { assert.equal(capture, true); listeners.set(name, fn); },
  removeEventListener(name: string, fn: any, capture: boolean) { assert.equal(capture, true); assert.equal(listeners.get(name),fn); listeners.delete(name); },
  contains: (item: any) => item.root === root,
  querySelector(selector: string) { initialQueries++; assert.equal(selector,'.react-flow__edge:hover'); return null; },
  getBoundingClientRect() { geometryReads++; throw new Error('hover must not measure'); },
};
const edge: any = { root, closest: (selector: string) => selector === '.react-flow' ? root : edge };
const other: any = { root, closest: (selector: string) => selector === '.react-flow' ? root : other };
const path = (owner: any) => ({ closest: () => owner });
const nestedRoot = {}, nested: any = { root, closest: (selector: string) => selector === '.react-flow' ? nestedRoot : nested };
const leave = (target: any) => listeners.get('mouseout')!({relatedTarget:target});
const enter = (target: any) => listeners.get('mouseover')!({target});
const binding = bindCanvasHoverPlane(root);
assert.equal(initialQueries,1); assert.equal(stored.canvasEdgeHover,undefined);
const start = listeners.get('mouseover')!;
for (let i=0;i<1000;i++) { enter(path(edge)); leave(path(edge)); }
assert.equal(writes,1); assert.equal(removals,0); assert.equal(stored.canvasEdgeHover,'true');
leave(path(other)); enter(path(other)); assert.equal(writes,1,'crossing another edge stays on native plane');
leave(null); assert.equal(removals,1); assert.equal(stored.canvasEdgeHover,undefined);
enter({closest:()=>null}); assert.equal(writes,1);
enter(path(nested)); assert.equal(writes,2,'nested descendants retain original CSS guard');
enter(path({...edge,root:{}})); assert.equal(writes,2,'another canvas cannot affect this root');
enter(path(edge)); assert.equal(writes,3);
binding.refresh(); assert.equal(stored.canvasEdgeHover,undefined,'removed hovered edge resets on scene inspection');
enter(path(edge)); assert.equal(writes,4);
const queuedLeave=listeners.get('mouseout')!;
binding.dispose(); assert.equal(listeners.size,0); assert.equal(removals,4);
start({target:path(edge)}); queuedLeave({relatedTarget:path(edge)}); binding.refresh(); assert.equal(writes,4,'late events cannot revive disposed guard');
assert.equal(geometryReads,0);
root.querySelector=()=>edge;
const secondBinding=bindCanvasHoverPlane(root); assert.equal(stored.canvasEdgeHover,'true','stationary hovered edge survives guard remount');secondBinding.dispose();
const css=readFileSync('src/app/globals.css','utf8');
assert.match(css,/\.canvas-render-layers \.react-flow__nodes \{ will-change: auto; \}/);
assert.match(css,/composite"\]:not\(\[data-canvas-edge-hover\]\) \.react-flow__edges/);
assert.doesNotMatch(css,/canvas-render-layers[^\n]*:has/);
assert.match(css,/react-flow__edge:hover path\.cw-base/,'per-edge original highlight stays');
console.log('HOVER_PLANE=PASS MOVE1000_ROOT_ATTRIBUTE1 ENTER_LEAVE_SYNCHRONOUS NESTED_GUARD_FOREIGN_IGNORED GEOMETRY_READS0 REMOVED_EDGE_RECONCILED REMOUNT_STATIONARY_HOVER UNMOUNT_CLEAN ORIGINAL_EDGE_STYLING_NO_CSS_HAS');
