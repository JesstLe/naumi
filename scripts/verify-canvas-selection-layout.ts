/** Run once with the parent's module verification: npx tsx scripts/verify-canvas-selection-layout.ts */
import assert from "node:assert/strict";
import {
  arrangeCanvasSelection,
  type SelectionLayoutAction,
  type SelectionLayoutMove,
  type SelectionLayoutNode,
} from "../src/lib/canvas/selection-layout";

const ACTIONS: readonly SelectionLayoutAction[] = [
  "left", "centerX", "right", "top", "centerY", "bottom", "distributeX", "distributeY",
];
const ALIGNMENTS = ACTIONS.slice(0, 6);
const rect = (id: string, x = 0, y = 0, width = 20, height = 10): SelectionLayoutNode =>
  ({ id, x, y, width, height });
let cases = 0;
function test(name: string, check: () => void) {
  check();
  cases++;
  console.log(`PASS ${name}`);
}
function near(actual: number, expected: number, message?: string) {
  assert.ok(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(actual), Math.abs(expected)),
    `${message ?? "coordinate"}: ${actual} != ${expected}`);
}
function apply(nodes: readonly SelectionLayoutNode[], moves: readonly SelectionLayoutMove[]) {
  const positions = new Map(moves.map(move => [move.id, move.to]));
  return nodes.map(node => ({ ...node, ...positions.get(node.id) }));
}
function checked(nodes: readonly SelectionLayoutNode[], action: SelectionLayoutAction) {
  const before = nodes.map(node => ({ ...node }));
  const moves = arrangeCanvasSelection(nodes, action);
  assert.deepEqual(nodes, before, `${action}: input mutated`);
  assert.equal(new Set(moves.map(move => move.id)).size, moves.length);
  let previousIndex = -1;
  for (const move of moves) {
    const index = nodes.findIndex(node => node.id === move.id);
    assert.ok(index > previousIndex, `${action}: move order differs from input`);
    previousIndex = index;
    const node: SelectionLayoutNode = nodes[index];
    assert.deepEqual(move.from, { x: node.x, y: node.y });
    assert.notDeepEqual(move.to, move.from, `${action}: no-op record`);
    for (const coordinate of [move.to.x, move.to.y, move.to.x + node.width, move.to.y + node.height]) {
      assert.ok(Number.isFinite(coordinate), `${action}: nonfinite result`);
    }
    if (["left", "centerX", "right", "distributeX"].includes(action)) assert.equal(move.to.y, node.y);
    else assert.equal(move.to.x, node.x);
  }
  return moves;
}

test("empty, singleton, and distribution minimum", () => {
  for (const action of ACTIONS) {
    assert.deepEqual(checked([], action), []);
    assert.deepEqual(checked([rect("one", -5, 10)], action), []);
  }
  for (const action of ["distributeX", "distributeY"] as const) {
    assert.deepEqual(checked([rect("one"), rect("two", 100, 200)], action), []);
  }
});

const alignmentNodes = [rect("a", 10, 30, 30, 10), rect("b", 70, -10, 10, 50), rect("c", -20, 80, 20, 20)];
const expectedAlignment: Record<string, readonly number[]> = {
  left: [-20, -20, -20], centerX: [15, 25, 20], right: [50, 70, 60],
  top: [-10, -10, -10], centerY: [40, 20, 35], bottom: [90, 50, 80],
};
for (const action of ALIGNMENTS) test(`exact ${action} with mixed dimensions and bounds`, () => {
  const moves = checked(alignmentNodes, action);
  const after = apply(alignmentNodes, moves);
  const axis = ["left", "centerX", "right"].includes(action) ? "x" : "y";
  assert.deepEqual(after.map(node => node[axis]), expectedAlignment[action]);
  assert.equal(moves.length, alignmentNodes.filter((node, index) => node[axis] !== expectedAlignment[action][index]).length);
  assert.deepEqual(checked(after, action), [], `${action}: second application must be a no-op`);
});

test("two nodes enable every alignment", () => {
  for (const action of ALIGNMENTS) {
    assert.ok(checked([rect("a"), rect("b", 100, 80)], action).length > 0, action);
  }
});

test("horizontal boundary gaps, fixed endpoints, and input-order results", () => {
  const a = rect("a", 0, 7, 20, 10), b = rect("b", 30, 20, 50, 20);
  const c = rect("c", 120, -40, 10, 40), d = rect("d", 200, 60, 40, 30);
  const nodes = [c, a, d, b], moves = checked(nodes, "distributeX");
  assert.deepEqual(moves, [
    { id: "c", from: { x: 120, y: -40 }, to: { x: 150, y: -40 } },
    { id: "b", from: { x: 30, y: 20 }, to: { x: 60, y: 20 } },
  ]);
  assert.deepEqual(checked(apply(nodes, moves), "distributeX"), []);
});

test("vertical boundary gaps preserve widths, x, and negative endpoint", () => {
  const nodes = [rect("a", -7, -100, 12, 20), rect("b", 15, -50, 50, 50),
    rect("c", 20, 20, 8, 10), rect("d", 80, 100, 15, 40)];
  const moves = checked(nodes, "distributeY"), after = apply(nodes, moves);
  assert.deepEqual(after.map(node => node.y), [-100, -40, 50, 100]);
  assert.deepEqual(after.map(node => [node.x, node.width, node.height]), nodes.map(node => [node.x, node.width, node.height]));
  assert.deepEqual(checked(after, "distributeY"), []);
});

test("three-node distribution uses edge gaps, not center spacing", () => {
  const nodes = [rect("a", 0, 0, 10), rect("b", 20, 0, 30), rect("c", 100, 0, 20)];
  assert.deepEqual(checked(nodes, "distributeX"), [
    { id: "b", from: { x: 20, y: 0 }, to: { x: 40, y: 0 } },
  ]);
});

test("overlaps keep negative gaps instead of clamping or expanding endpoints", () => {
  const nodes = [rect("a", 0, 0, 60), rect("b", 10, 0, 80), rect("c", 100, 0, 60)];
  const after = apply(nodes, checked(nodes, "distributeX"));
  assert.deepEqual(after.map(node => node.x), [0, 40, 100]);
  assert.equal(after[1].x - after[0].x - after[0].width, -20);
  assert.equal(after[2].x - after[1].x - after[1].width, -20);
  assert.deepEqual(checked(after, "distributeX"), []);
});

test("zero gaps and an interior far edge do not replace the sorted endpoint anchors", () => {
  const touching = [rect("a", 0, 0, 10), rect("b", 25, 0, 20), rect("c", 30, 0, 10)];
  assert.deepEqual(checked(touching, "distributeX").map(move => [move.id, move.to.x]), [["b", 10]]);
  const nested = [rect("a", 0, 0, 10), rect("b", 20, 0, 100), rect("c", 50, 0, 10)];
  const after = apply(nested, checked(nested, "distributeX"));
  assert.deepEqual(after.map(node => node.x), [0, -20, 50]);
  assert.equal(after[1].x + after[1].width, 80, "interior may extend beyond the last endpoint");
});

test("strong negative gaps follow boundary-gap semantics even when leading-edge order changes", () => {
  const nodes = [rect("a", 0, 0, 1), rect("b", 1, 0, 5), rect("c", 2, 0, 1)];
  const first = checked(nodes, "distributeX"), after = apply(nodes, first);
  assert.deepEqual(first, [{ id: "b", from: { x: 1, y: 0 }, to: { x: -1, y: 0 } }]);
  // A new invocation sorts the new geometry; universal idempotence would require
  // clamping gaps or retaining hidden historical order, neither part of this API.
  assert.deepEqual(checked(after, "distributeX"), [
    { id: "a", from: { x: 0, y: 0 }, to: { x: 2.5, y: 0 } },
  ]);
});

test("equal leading edges use input order, including tied endpoint", () => {
  const nodes = [rect("b", 0, 2, 10), rect("a", 0, 3, 20), rect("d", 100, 4, 10), rect("c", 50, 5, 10)];
  const moves = checked(nodes, "distributeX");
  assert.deepEqual(moves.map(move => [move.id, move.to.x]), [["a", 30], ["c", 70]]);
  const tiedLast = [rect("first", 0, 0, 10), rect("middle", 100, 0, 10), rect("last", 100, 0, 20)];
  assert.deepEqual(checked(tiedLast, "distributeX").map(move => [move.id, move.to.x]), [["middle", 50]]);
});

test("already aligned or equally spaced selections return no moves", () => {
  const same = [rect("a", -10, -20), rect("b", -10, -20), rect("c", -10, -20)];
  for (const action of ALIGNMENTS) assert.deepEqual(checked(same, action), []);
  assert.deepEqual(checked([rect("a", 0, 0, 10), rect("b", 20, 0, 20), rect("c", 50, 0, 30)], "distributeX"), []);
  assert.deepEqual(checked([rect("a", 0, -10, 10, 10), rect("b", 0, 10, 10, 20), rect("c", 0, 40, 10, 30)], "distributeY"), []);
});

test("fractional geometry preserves gaps and settles to a no-op", () => {
  for (const action of ACTIONS) {
    const nodes = [rect("a", -20.125, -14.25, 10.25, 17.3), rect("b", -3.4, 22.75, 19.125, 12.15),
      rect("c", 45.625, 55.3, 12.1, 27.3), rect("d", 100.875, 100.55, 15.5, 14.2)];
    const after = apply(nodes, checked(nodes, action));
    assert.deepEqual(checked(after, action), [], `${action}: floating-point drift`);
    if (action === "distributeX" || action === "distributeY") {
      const axis = action === "distributeX" ? "x" : "y", size = axis === "x" ? "width" : "height";
      const gap = after[1][axis] - after[0][axis] - after[0][size];
      for (let index = 2; index < after.length; index++) near(after[index][axis] - after[index - 1][axis] - after[index - 1][size], gap);
    }
  }
});

test("invalid coordinates and nonpositive sizes are excluded before minimum-count checks", () => {
  const invalid: SelectionLayoutNode[] = [];
  for (const key of ["x", "y", "width", "height"] as const) {
    for (const value of [NaN, Infinity, -Infinity, ...(key === "width" || key === "height" ? [0, -1] : [])]) {
      invalid.push({ ...rect(`invalid-${invalid.length}`), [key]: value });
    }
  }
  const valid = [rect("a", -4, -8), rect("b", 50, 80), rect("c", 150, 200)];
  for (const action of ACTIONS) {
    assert.deepEqual(checked([...invalid, ...valid], action), checked(valid, action));
    assert.deepEqual(checked(invalid, action), []);
    assert.deepEqual(checked([...invalid, valid[0]], action), []);
  }
  for (const action of ["distributeX", "distributeY"] as const) {
    assert.deepEqual(checked([...invalid, ...valid.slice(0, 2)], action), []);
  }
});

test("duplicate IDs are rejected before filtering or count checks", () => {
  for (const action of ACTIONS) {
    for (const nodes of [
      [rect("same"), rect("same", 50, 20)],
      [rect("same", NaN), rect("same")],
      [rect("same", NaN), rect("same", 10, 20, 0)],
    ]) assert.throws(() => arrangeCanvasSelection(nodes, action), /Duplicate selection layout id: "same"/);
  }
});

test("frozen inputs and detached result points stay immutable", () => {
  const nodes = Object.freeze([Object.freeze(rect("a", -10, -20)), Object.freeze(rect("b", 40, 60)), Object.freeze(rect("c", 100, 200))]);
  const snapshot = nodes.map(node => ({ ...node }));
  for (const action of ACTIONS) {
    const moves = checked(nodes, action);
    for (const move of moves) {
      assert.notStrictEqual(move.from, move.to);
      assert.notStrictEqual(move.from, nodes.find(node => node.id === move.id));
      assert.notStrictEqual(move.to, nodes.find(node => node.id === move.id));
      move.from.x = 123456;
      move.to.y = -654321;
    }
    assert.deepEqual(nodes, snapshot);
  }
});

test("numeric limits never produce partial or nonfinite movement", () => {
  const valid = [rect("a", 0, 0), rect("b", 100, 100), rect("c", 250, 250)];
  for (const node of [rect("overflow-x", Number.MAX_VALUE, 0, Number.MAX_VALUE),
    rect("overflow-y", 0, Number.MAX_VALUE, 20, Number.MAX_VALUE)]) {
    for (const action of ACTIONS) assert.deepEqual(checked([...valid, node], action), [], "unrepresentable geometry must not be partially filtered");
  }
  const overflow = [rect("a", -Number.MAX_VALUE, 0, 1), rect("b", 10, 0, 1), rect("c", Number.MAX_VALUE, 0, 1)];
  assert.deepEqual(checked(overflow, "distributeX"), []);
  const large = [rect("a", 1e308, 0, 1e307), rect("b", 1.4e308, 0, 1e307)];
  const centered = apply(large, checked(large, "centerX"));
  near(centered[0].x, 1.2e308);
  near(centered[1].x, 1.2e308);
  const precise = checked([rect("a", 2 ** 52, 0, 10), rect("b", 2 ** 52 + 4, 0, 10)], "left");
  assert.equal(precise.length, 1, "representable large-coordinate moves must survive no-op suppression");
  assert.equal(precise[0].to.x, 2 ** 52);
  assert.equal(checked([rect("a"), rect("b", 1e-6)], "left").length, 1, "meaningful subpixel moves must survive");
  assert.deepEqual(checked([rect("a"), rect("b", 1e-10)], "left"), [], "roundoff-sized movement is omitted");
});

test("deterministic mixed-size geometry properties across 64 seeded selections", () => {
  let seed = 20261023;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let sample = 0; sample < 64; sample++) {
    let x = -200, y = -100;
    const ordered = Array.from({ length: 3 + Math.floor(random() * 18) }, (_, index) => {
      const width = 1 + random() * 200, height = 1 + random() * 250;
      const node = rect(`sample-${sample}-${index}`, x, y, width, height);
      x += width + random() * 150;
      y += height + random() * 150;
      return node;
    });
    const nodes = [...ordered];
    for (let index = nodes.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [nodes[index], nodes[other]] = [nodes[other], nodes[index]];
    }
    for (const action of ACTIONS) {
      const moves = checked(nodes, action), after = apply(nodes, moves);
      assert.deepEqual(checked(nodes, action), moves, `${action}: repeated input differs`);
      assert.deepEqual(checked(after, action), [], `${action}: not idempotent`);
      const axis = ["left", "centerX", "right", "distributeX"].includes(action) ? "x" : "y";
      const size = axis === "x" ? "width" : "height";
      if (action === "distributeX" || action === "distributeY") {
        const byId = new Map(after.map(node => [node.id, node]));
        const sorted = ordered.map(node => byId.get(node.id)!);
        assert.equal(sorted[0][axis], ordered[0][axis]);
        assert.equal(sorted[sorted.length - 1][axis], ordered[ordered.length - 1][axis]);
        const gap = sorted[1][axis] - sorted[0][axis] - sorted[0][size];
        for (let index = 2; index < sorted.length; index++) {
          near(sorted[index][axis] - sorted[index - 1][axis] - sorted[index - 1][size], gap, action);
        }
      } else {
        const factor = action === "centerX" || action === "centerY" ? .5 : action === "right" || action === "bottom" ? 1 : 0;
        const anchor = after[0][axis] + after[0][size] * factor;
        for (const node of after) near(node[axis] + node[size] * factor, anchor, action);
      }
    }
  }
});

test("large selection does not rely on argument-spread bounds or mutate order", () => {
  const nodes = Array.from({ length: 2000 }, (_, index) => rect(`large-${index}`, index * 30, index * 15));
  const moves = checked(nodes, "left");
  assert.equal(moves.length, nodes.length - 1);
  assert.equal(moves[0].id, "large-1");
  assert.equal(moves[moves.length - 1].id, "large-1999");
});

console.log(`SELECTION_LAYOUT=PASS CASES=${cases} ALIGNMENTS=6 DISTRIBUTIONS=2 SEEDED_SELECTIONS=64 IMMUTABLE=PASS PROVIDER_CALLS=0`);
