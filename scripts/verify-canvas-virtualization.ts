import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shouldVirtualizeCanvas } from '../src/lib/canvas/virtualization';

for (const count of [0, 1, 60, 61, 213, 300]) assert.equal(shouldVirtualizeCanvas(count, 191), false);
for (const count of [301, 1000, 10000]) assert.equal(shouldVirtualizeCanvas(count, 191), true);
assert.equal(shouldVirtualizeCanvas(213, 1000), false);
assert.equal(shouldVirtualizeCanvas(213, 1001), true);
const client = readFileSync('src/components/canvas/canvas-client.tsx', 'utf8');
assert.match(client, /onlyRenderVisibleElements=\{shouldVirtualizeCanvas\(rfNodes.length, rfEdges.length\)\}/);
const image = readFileSync('src/components/canvas/canvas-image.tsx', 'utf8');
assert.match(image, /const canLoad=visible&&!!source&&localWidth>0/);
assert.match(image, /src=\{canLoad\?url:undefined\}/);
const observer = readFileSync('src/lib/canvas/image-observers.ts', 'utf8');
assert.match(observer, /root = element.closest\('\.react-flow'\)/);
assert.match(observer, /entry.isIntersecting/);
console.log('BOUNDED_CANVAS_MEMBERSHIP=PASS NODES_LE300_EDGES_LE1000_STABLE LARGE_SCENES_NATIVE_VIRTUALIZATION IMAGE_DOWNLOAD_ROOT_VISIBILITY_RETAINED');
