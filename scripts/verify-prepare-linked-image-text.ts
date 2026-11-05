import assert from "node:assert/strict";
import { prepareLinkedImageText, type PrepareLinkedImageTextInput } from "../src/lib/canvas/prepare-linked-image-text";
import { resolveLinkedImageText, type LinkedImageTextResult, type LinkedImageTextNode } from "../src/lib/canvas/linked-image-text";

function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

function result(body = "body", ids = ["text-a"]): LinkedImageTextResult {
  return { sources: ids.map(id => ({ id, title: id, content: body })), prompt: body, error: null };
}

function input(extra: Partial<PrepareLinkedImageTextInput> = {}): PrepareLinkedImageTextInput {
  return {
    read: () => result(),
    flush: async () => undefined,
    wait: async () => undefined,
    isUnsaved: () => false,
    isCurrent: () => true,
    ...extra,
  };
}

let cases = 0;
async function test(name: string, run: () => Promise<void>) {
  await run();
  cases++;
  console.log(`PASS ${name}`);
}

async function main() {
  await test("stale scope is rejected before reading or saving", async () => {
    await assert.rejects(prepareLinkedImageText(input({
      isCurrent: () => false,
      read: () => { assert.fail("must not read stale scope"); },
      flush: async () => { assert.fail("must not flush stale scope"); },
    })), /画布已切换/);
  });

  await test("initial source error is rejected before any save barrier", async () => {
    await assert.rejects(prepareLinkedImageText(input({
      read: () => ({ sources: [], prompt: "", error: "关联的文字节点仍在生成，请完成后再试" }),
      flush: async () => { assert.fail("must not flush invalid input"); },
      wait: async () => { assert.fail("must not wait invalid input"); },
    })), /仍在生成/);
  });

  await test("flush and wait are awaited serially before the latest read", async () => {
    const flushGate = gate();
    const waitGate = gate();
    const events: string[] = [];
    let reads = 0;
    let settled = false;
    const pending = prepareLinkedImageText(input({
      read: () => { events.push(`read:${++reads}`); return result(reads === 1 ? "before" : "after"); },
      flush: async () => { events.push("flush"); await flushGate.promise; },
      wait: async () => { events.push("wait"); await waitGate.promise; },
    }));
    void pending.then(() => { settled = true; });
    assert.deepEqual(events, ["read:1", "flush"]);
    assert.equal(settled, false);
    flushGate.release();
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(events, ["read:1", "flush", "wait"]);
    assert.equal(settled, false);
    waitGate.release();
    assert.equal((await pending).prompt, "after");
    assert.deepEqual(events, ["read:1", "flush", "wait", "read:2"]);
  });

  await test("only initial linked IDs are flushed and waited with deduplication", async () => {
    const calls: Array<{ operation: string; ids: readonly string[] }> = [];
    await prepareLinkedImageText(input({
      read: () => result("body", ["text-b", "text-a", "text-b"]),
      flush: async ids => { calls.push({ operation: "flush", ids: [...ids] }); },
      wait: async ids => { calls.push({ operation: "wait", ids: [...ids] }); },
    }));
    assert.deepEqual(calls, [
      { operation: "flush", ids: ["text-b", "text-a"] },
      { operation: "wait", ids: ["text-b", "text-a"] },
    ]);
  });

  await test("null save result with unsaved state rejects instead of submitting", async () => {
    let checks = 0;
    await assert.rejects(prepareLinkedImageText(input({
      flush: async () => null,
      wait: async () => null,
      isUnsaved: id => { assert.equal(id, "text-a"); checks++; return true; },
    })), /尚未保存/);
    assert.equal(checks, 1);
  });

  await test("barrier return values do not replace the authoritative saved-state check", async () => {
    const latest = result("saved body");
    const prepared = await prepareLinkedImageText(input({ read: () => latest, flush: async () => null, wait: async () => null }));
    assert.equal(prepared, latest);
  });

  await test("flush and queue failures produce a readable save error", async () => {
    let waited = false;
    await assert.rejects(prepareLinkedImageText(input({
      flush: async () => { throw new Error("fixture flush failed"); },
      wait: async () => { waited = true; },
    })), /关联的文字保存失败/);
    assert.equal(waited, false);
    await assert.rejects(prepareLinkedImageText(input({
      wait: async () => { throw new Error("fixture queue failed"); },
    })), /关联的文字保存失败/);
  });

  await test("scope changes while saving are rejected before the latest read", async () => {
    for (const phase of ["flush", "wait"]) {
      let current = true;
      let reads = 0;
      await assert.rejects(prepareLinkedImageText(input({
        isCurrent: () => current,
        read: () => { reads++; return result(); },
        flush: async () => { if (phase === "flush") current = false; },
        wait: async () => { if (phase === "wait") current = false; },
      })), /画布已切换/);
      assert.equal(reads, 1);
    }
  });

  await test("deleted and generating sources are rejected after the save queue", async () => {
    for (const transition of ["deleted", "generating"]) {
      let nodes: LinkedImageTextNode[] = [{ id: "text-a", projectKey: "project", content: "body", status: "completed" }];
      await assert.rejects(prepareLinkedImageText(input({
        read: () => resolveLinkedImageText({ nodes, projectKey: "project", targetId: "pending", explicitTextIds: ["text-a"], draft: "" }),
        wait: async () => {
          nodes = transition === "deleted" ? [] : [{ ...nodes[0], status: "generating" }];
        },
      })), transition === "deleted" ? /已失效/ : /仍在生成/);
    }
  });

  await test("a later edit queued during save blocks the now-stale ACK", async () => {
    let body = "first edit";
    let pendingEdit = false;
    let dirty = true;
    await assert.rejects(prepareLinkedImageText(input({
      read: () => result(body),
      flush: async () => {
        body = "second edit";
        pendingEdit = true;
      },
      wait: async () => { dirty = false; },
      isUnsaved: () => dirty || pendingEdit,
    })), /尚未保存/);
  });

  await test("a newly linked unsaved source is checked but not silently flushed", async () => {
    let ids = ["text-a"];
    const flushed: string[][] = [];
    await assert.rejects(prepareLinkedImageText(input({
      read: () => result("body", ids),
      flush: async sourceIds => { flushed.push([...sourceIds]); ids = ["text-a", "text-new"]; },
      isUnsaved: id => id === "text-new",
    })), /尚未保存/);
    assert.deepEqual(flushed, [["text-a"]]);
  });

  await test("a newly linked saved source contributes its latest complete body", async () => {
    let latest = result("A", ["text-a"]);
    const checked: string[] = [];
    const prepared = await prepareLinkedImageText(input({
      read: () => latest,
      wait: async () => { latest = { sources: [...latest.sources, { id: "text-b", title: "B", content: "B" }], prompt: "A\n\nB", error: null }; },
      isUnsaved: id => { checked.push(id); return false; },
    }));
    assert.equal(prepared.prompt, "A\n\nB");
    assert.deepEqual(checked, ["text-a", "text-b"]);
  });

  await test("disconnected sources are removed and no longer block the latest input", async () => {
    let connected = true;
    const prepared = await prepareLinkedImageText(input({
      read: () => connected ? result("old body") : { sources: [], prompt: "remaining draft", error: null },
      wait: async () => { connected = false; },
      isUnsaved: () => { assert.fail("disconnected sources must not be checked"); },
    }));
    assert.deepEqual(prepared, { sources: [], prompt: "remaining draft", error: null });
  });

  await test("latest source reads and unsaved checks have no intervening await", async () => {
    let reads = 0;
    let lateEdit = false;
    const events: string[] = [];
    const prepared = await prepareLinkedImageText(input({
      read: () => {
        if (++reads === 2) {
          events.push("latest read");
          queueMicrotask(() => { lateEdit = true; events.push("later microtask"); });
        }
        return result("stable snapshot");
      },
      isUnsaved: () => { events.push("saved-state check"); return lateEdit; },
    }));
    assert.equal(prepared.prompt, "stable snapshot");
    assert.deepEqual(events, ["latest read", "saved-state check", "later microtask"]);
  });

  await test("preparation leaves caller results and source arrays unchanged", async () => {
    const latest = result("body");
    Object.freeze(latest.sources[0]);
    Object.freeze(latest.sources);
    Object.freeze(latest);
    const before = JSON.stringify(latest);
    assert.equal(await prepareLinkedImageText(input({ read: () => latest })), latest);
    assert.equal(JSON.stringify(latest), before);
  });

  console.log(`PREPARE_LINKED_IMAGE_TEXT=PASS CASES=${cases} MUTATION=NONE`);
}

main().catch(error => {
  console.error(`PREPARE_LINKED_IMAGE_TEXT=FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
