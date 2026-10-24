import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { selectionRunTargets, runSelectionBatch } from "../src/lib/canvas/selection-run";

async function main() {
  const source = readFileSync(process.env.CANVAS_SELECTION_SOURCE || "src/components/canvas/canvas-client.tsx", "utf8");
  const sf = ts.createSourceFile("canvas.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const find = (name: string) => {
    let result: ts.FunctionDeclaration | undefined;
    const visit = (n: ts.Node) => { if (ts.isFunctionDeclaration(n) && n.name?.text === name) result = n; ts.forEachChild(n, visit); }; visit(sf);
    assert.ok(result, name); return result!.getText(sf);
  };
  if (process.env.CANVAS_SELECTION_LEGACY === "1") {
    const calls: any[] = [];
    const fn = ts.transpileModule(find("batchRunImages"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const run = vm.runInNewContext(`(${fn.trim()})`, { readOnly: false, batchRunBusy: false, setBatchRunBusy() {}, setCtxMenu() {}, editPrompt: "UNRELATED_DOCK_PROMPT", genRatio: "16:9", genStyle: "global", genCount: 4, genResolution: "4K", runGen: async (...args: any[]) => { calls.push(args); return [{}]; }, flashTip() {}, FAITHFUL_REGEN_PROMPT: "fallback", Date });
    await run([{ id: "a", image: "a.png", prompt: "node-a", ratio: "1:1", resolution: "1K" }, { id: "b", image: "b.png", prompt: "node-b", ratio: "3:4", resolution: "2K" }]);
    assert.equal(calls.length, 2); assert.ok(calls.every(c => c[1] === "UNRELATED_DOCK_PROMPT" && c[2].resolution === "4K"));
    console.log("LEGACY=PASS REPRODUCED=SHARED_PROMPT_AND_RESOLUTION_OVERRIDE STABLE_NODE_LOCK=ABSENT"); return;
  }
  const nodes = [
    { id: "a", kind: "image" as const, x: 5, y: 20, runnable: true },
    { id: "b", kind: "image" as const, x: 8, y: 0, runnable: true },
    { id: "locked", kind: "image" as const, x: 0, y: 0, runnable: true, locked: true },
    { id: "busy", kind: "pending" as const, x: 0, y: 0, runnable: true, busy: true },
    { id: "text", kind: "text" as const, x: 2, y: 0, runnable: true },
    { id: "invalid", kind: "pending" as const, x: 0, y: 0, runnable: false },
  ];
  assert.deepEqual(selectionRunTargets(["a", "a", "locked", "busy", "text", "invalid", "missing", "b"], nodes).map(n => n.id), ["text", "b", "a"]);
  let current = true, inFlight = 0, peak = 0; const started: string[] = [], progress: number[] = [];
  const result = await runSelectionBatch([...nodes.slice(0, 2), nodes[0], { ...nodes[0], id: "fail" }, { ...nodes[0], id: "late-locked" }], {
    isCurrent: () => current, canRun: n => n.id !== "late-locked",
    run: async n => { started.push(n.id); inFlight++; peak = Math.max(peak, inFlight); await new Promise(r => setTimeout(r, 5)); inFlight--; if (n.id === "fail") throw Error("fixture failure"); return true; },
    onProgress: done => progress.push(done),
  });
  assert.deepEqual(result, { succeeded: 2, failed: 1, skipped: 1 }); assert.equal(peak, 2); assert.equal(started.filter(id => id === "a").length, 1); assert.equal(progress.at(-1), 4);
  const stopped: string[] = [];
  const cancel = await runSelectionBatch(nodes, { isCurrent: () => current, canRun: () => true, run: async n => { stopped.push(n.id); current = false; return true; } });
  assert.equal(stopped.length, 1); assert.equal(cancel.skipped, nodes.length - 1);
  const batch = find("batchRunSelection"), targets = find("currentSelectionRunTargets");
  const controller=readFileSync("src/lib/canvas/selection-run-controller.ts","utf8");
  assert.match(controller,/previous\.snapshot\.busy/);assert.match(controller,/scope\.viewCurrent/);
  let run="";(function walk(n:ts.Node){if(ts.isVariableDeclaration(n)&&n.name.getText(sf)==="selectionRun")run=n.initializer!.getText(sf);ts.forEachChild(n,walk);})(sf);
  assert.match(run, /operationKey: `node:\$\{art\.id\}`/); assert.doesNotMatch(run, /Date\.now\(\)|sharedPrompt|editPrompt/);
  assert.match(run, /inheritableImagePrompt\(art\.prompt\)/); assert.match(run, /ratio: art\.ratio/); assert.match(run, /resolution: art\.resolution/);
  assert.match(targets, /isNodeLocked/); assert.match(targets, /art\.status === "completed"/); assert.match(targets, /canFeature\("generate"\)/);
  assert.match(source, /primaryAction=\{batchRunButton\(t\("canvas\.batchRunImages"\)\)\}/);
  assert.match(source, /primaryAction=\{batchRunButton\(t\("canvas\.batchRunText"\)\)\}/);
  const toolbar = readFileSync("src/components/canvas/batch-selection-toolbar.tsx", "utf8");
  assert.ok(toolbar.indexOf("data-batch-primary") < toolbar.indexOf("data-batch-scroll"));
  console.log("MODIFIED=PASS SELECTED_ONLY=1 NODE_PARAMETERS=PRESERVED LOCKED_BUSY=SKIPPED DEDUP=PASS CONCURRENCY=2 FAILURE_CONTINUES=PASS CONTEXT_CHANGE_STOPS_QUEUE=PASS PRIMARY_ACTION=PINNED PROVIDER_CALLS=0");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
