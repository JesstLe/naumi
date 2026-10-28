import assert from "node:assert/strict";
import {createHash, randomUUID} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {chromium, expect as playwrightExpect, type Page} from "@playwright/test";
import {characterInputIdentity} from "../src/lib/character/project";
import type {createVideoFixture} from "./video-fusion/harness";

const expect = playwrightExpect.configure({timeout: 60000});

/** Extends the same isolated app run. No additional server, real provider or account. */
export async function verifyCharacterInteractions(h: Awaited<ReturnType<typeof createVideoFixture>>, out: string, existingVideoId: string) {
  const errors: string[] = [], network: unknown[] = [];
  let page: Page | undefined;
  const browser = await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
  try {
    console.log("CHARACTER_PHASE=UI_PREWARM");
    const warm: unknown[] = [];
    for (const url of ["/api/account", "/api/projects", "/api/canvas/text-nodes", "/api/canvas/character-nodes?includeDeleted=1", "/api/canvas/director-nodes?includeDeleted=1", "/api/canvas/node-settings", "/api/video/assets?limit=30", "/api/config", "/api/canvas/video-nodes", "/api/video/tasks", "/api/canvas/image-tasks", "/api/video/media-jobs", "/api/canvas/workflow-import", "/api/models?feature=canvas.image", "/api/video/catalog", "/api/feature-access", "/api/enterprise", "/api/auth/session", "/api/version"]) {
      const response = await h.request<any>("a", "GET", url); warm.push({url, status: response.status});
      assert.equal(response.status, 200, JSON.stringify({url, body: response.body}));
    }
    await writeFile(path.join(out, "ui-prewarm.json"), JSON.stringify(warm, null, 2));
    const context = await browser.newContext({viewport: {width: 1440, height: 960}});
    await context.addCookies([{name: "nv_user", value: h.cookies.a.slice(8), url: h.baseUrl, httpOnly: true, sameSite: "Lax"}, {name: "naumi_locale", value: "zh", url: h.baseUrl}]);
    page = await context.newPage(); page.setDefaultTimeout(90000);
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => {if(request.method()!=="GET"&&!request.url().includes("_next"))network.push({request:new URL(request.url()).pathname,body:request.postData()?.slice(0,1500)});});
    page.on("response", response => network.push({path: new URL(response.url()).pathname, status: response.status()}));
    const live = async () => (await h.request<any>("a", "GET", "/api/canvas/character-nodes")).body.nodes as any[];
    const get = async (id: string) => (await h.request<any>("a", "GET", `/api/canvas/character-nodes/${id}`)).body.node;
    const video = async (id: string) => (await h.request<any>("a", "GET", `/api/canvas/video-nodes/${id}`)).body.node;
    const freeBefore = await h.creditState("a"), createsBefore = h.supplierCalls().filter(call => call.phase === "create").length;
    const navigation=await page.goto(`${h.baseUrl}/canvas?node=${existingVideoId}`, {waitUntil: "domcontentloaded", timeout: 180000});
    assert.equal(navigation?.status(),200,"Actual Canvas must compile and return HTTP200 before waiting for controls");
    await page.locator(`.react-flow__node[data-id="${existingVideoId}"]`).waitFor();
    await page.getByTestId("canvas-project-chrome").getByRole("button", {name: "Naumi", exact: true}).click();
    await page.locator("aside").getByRole("button", {name: "创建新项目", exact: true}).click();
    await page.getByTestId("canvas-add-node-button").click();
    await page.getByTestId("canvas-create-menu").getByRole("menuitem", {name: "角色", exact: true}).click();
    const editor = page.getByTestId("character-editor"); await editor.waitFor();
    await editor.getByLabel("角色名称", {exact: true}).fill("林舟 · 交互");
    await editor.getByLabel("角色设定", {exact: true}).fill("短发，左眉有疤，跨镜头保持身份");
    const imageBytes = await h.request<ArrayBuffer>("a", "GET", h.refs.lastImage.url); assert.equal(imageBytes.status, 200);
    await editor.getByLabel("上传角色参考图", {exact: true}).setInputFiles({name: "角色参考.png", mimeType: "image/png", buffer: Buffer.from(imageBytes.body)});
    await expect(editor.getByRole("button", {name: "移除角色参考图 1", exact: true})).toBeVisible();
    await editor.getByRole("button", {name: "添加外观", exact: true}).click();
    await editor.getByLabel("外观名称", {exact: true}).fill("外套");
    await editor.getByLabel("外观设定", {exact: true}).fill("深蓝外套，保持左眉疤痕");
    await editor.getByRole("button", {name: "保存角色", exact: true}).click();
    await expect(editor.getByRole("button", {name: "保存角色", exact: true})).toBeDisabled();
    await expect.poll(async () => (await live()).some(item => item.title === "林舟 · 交互")).toBe(true);
    await expect(editor.getByRole("button", {name: "完成", exact: true})).toBeEnabled();
    let node = (await live()).find(item => item.title === "林舟 · 交互"); assert.ok(node);
    const id = node.id as string, projectKey = node.projectKey as string;
    const look = node.character.appearances.find((item: any) => item.name === "外套"); assert.ok(look);
    const referenceId = node.character.appearances[0].referenceArtworkIds[0] as string; assert.ok(referenceId);
    await page.screenshot({path: path.join(out, "actual-editor-desktop.png")});
    await page.setViewportSize({width: 390, height: 844});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390));
    await editor.getByLabel("外观设定", {exact: true}).scrollIntoViewIfNeeded();
    await page.screenshot({path: path.join(out, "actual-editor-mobile.png")});
    await editor.getByRole("button", {name: "保存并关闭角色", exact: true}).click(); await editor.waitFor({state: "hidden"});
    await page.setViewportSize({width: 1440, height: 960});
    await page.goto(`${h.baseUrl}/canvas?node=${id}`, {waitUntil: "domcontentloaded"});
    const card = page.locator(`.react-flow__node[data-id="${id}"]`), title = card.getByText("林舟 · 交互", {exact: true});
    await card.getByTestId("character-canvas-node").waitFor();
    await card.getByRole("button", {name: "编辑角色", exact: true}).first().click();
    await expect(editor.getByLabel("角色设定", {exact: true})).toHaveValue("短发，左眉有疤，跨镜头保持身份");
    await editor.getByRole("button", {name: "外套", exact: true}).click();
    await expect(editor.getByLabel("外观设定", {exact: true})).toHaveValue("深蓝外套，保持左眉疤痕");
    await editor.getByRole("button", {name: "生成参考图", exact: true}).click(); await editor.waitFor({state: "hidden"});
    // This opens the existing image composer. It is not an automatic paid call.
    await expect(page.getByTestId("pending-node-dock")).toContainText("生成");
    const pendingText = await page.getByTestId("pending-node-dock").locator("textarea").evaluateAll(items => items.map(item => (item as HTMLTextAreaElement).value));
    assert.ok(pendingText.some(text => text.includes("深蓝外套") && text.includes("左眉有疤")), JSON.stringify(pendingText));
    assert.deepEqual(await h.creditState("a"), freeBefore); assert.equal(h.supplierCalls().filter(call => call.phase === "create").length, createsBefore);
    await page.reload({waitUntil: "domcontentloaded"}); await title.waitFor();
    console.log("CHARACTER_PHASE=UI_LIFECYCLE");
    node = await get(id); const drag = await title.boundingBox(); assert.ok(drag);
    await page.mouse.move(drag.x + Math.min(65, drag.width / 2), drag.y + drag.height / 2); await page.mouse.down();
    await page.mouse.move(drag.x + Math.min(65, drag.width / 2) + 80, drag.y + drag.height / 2 + 55, {steps: 12}); await page.mouse.up();
    await expect.poll(async () => (await get(id)).x, {timeout: 60000}).not.toBe(node.x); const moved = await get(id);
    await expect(card.getByTestId("character-canvas-node")).toHaveAttribute("data-revision", String(moved.revision));
    await page.locator('button[data-tool="undo"]').click(); await expect.poll(async () => (await get(id)).x).toBe(node.x);
    await page.locator('button[data-tool="redo"]').click(); await expect.poll(async () => (await get(id)).x).toBe(moved.x);
    await title.click({button: "right"}); await page.getByRole("menuitem", {name: "锁定节点", exact: true}).click();
    await title.click({button: "right"}); await expect(page.getByRole("menuitem", {name: /^创建副本/})).toBeDisabled();
    await page.getByRole("menuitem", {name: "解锁节点", exact: true}).click();
    await title.click({button: "right"}); await page.getByRole("menuitem", {name: /^创建副本/}).click();
    await expect.poll(async () => (await live()).filter(item => item.title === "林舟 · 交互").length).toBe(2);
    const duplicate = (await live()).find(item => item.title === "林舟 · 交互" && item.id !== id); assert.ok(duplicate);
    const duplicateTitle = page.locator(`.react-flow__node[data-id="${duplicate.id}"]`).getByText("林舟 · 交互", {exact: true});
    await duplicateTitle.click({button: "right"}); await page.getByRole("menuitem", {name: /^删除/}).click();
    await page.getByRole("button", {name: "确定删除", exact: true}).click(); await expect.poll(async () => (await live()).some(item => item.id === duplicate.id),{timeout:30000}).toBe(false);
    await page.locator('button[data-tool="undo"]').click(); await expect.poll(async () => (await live()).some(item => item.id === duplicate.id)).toBe(true);
    await page.locator('button[data-tool="redo"]').click(); await expect.poll(async () => (await live()).some(item => item.id === duplicate.id)).toBe(false);
    assert.deepEqual(await h.creditState("a"), freeBefore);

    console.log("CHARACTER_PHASE=UI_REFERENCE_GENERATION");
    const config = {modelId: "video-a", providerId: "managed-video", mode: "reference", prompt: "", durationSeconds: 4, resolution: "720p", aspectRatio: "16:9", generateAudio: false};
    const videoId = "vnode-ui-role-" + randomUUID(); node = await get(id);
    const made = await h.request<any>("a", "POST", "/api/canvas/video-nodes", {id: videoId, projectKey, title: "角色镜头", expectedRevision: 0, operationId: randomUUID(), x: node.x + 520, y: node.y, config, inputs: []}); assert.equal(made.status, 201, JSON.stringify(made.body));
    await page.goto(`${h.baseUrl}/canvas?node=${videoId}`, {waitUntil: "domcontentloaded"});
    await page.getByRole("button", {name: "适应视图", exact: true}).click();
    const videoCard = page.locator(`.react-flow__node[data-id="${videoId}"]`);
    await videoCard.getByTestId("canvas-video-node").waitFor();
    // Native handles, not page.evaluate dispatch or direct invocation of onConnect.
    const source = card.locator('.react-flow__handle.source[data-handleid="out"]');
    const target = videoCard.locator('.react-flow__handle.target[data-handleid="in"]');
    await expect(source).toBeVisible(); await expect(target).toBeVisible();
    await source.dragTo(target);
    await expect.poll(async () => (await video(videoId)).inputs.length).toBe(1);
    assert.equal((await video(videoId)).inputs[0].nodeId, characterInputIdentity(id, "base"));
    await videoCard.getByRole("button", {name: "视频节点设置", exact: true}).click();
    const dock = page.getByTestId("video-node-dock"); await dock.waitFor();
    await dock.getByLabel("引用1外观", {exact: true}).selectOption(characterInputIdentity(id, look.id));
    await dock.getByTestId("video-composer-prompt").fill("跟随 @林舟");
    await dock.getByRole("listbox", {name: "选择引用素材", exact: true}).getByRole("option", {name: "林舟 · 交互 · 外套", exact: true}).click();
    await expect(dock.getByTestId("video-composer-prompt")).toHaveValue("跟随 @【林舟 · 交互 · 外套】");
    await dock.getByRole("button", {name: "保存设置", exact: true}).click();
    await expect.poll(async () => (await video(videoId)).config.prompt).toBe("跟随 {{ref 1}}");
    assert.equal((await video(videoId)).inputs[0].nodeId, characterInputIdentity(id, look.id));
    await page.screenshot({path: path.join(out, "actual-canvas-graph.png")});
    const tasksBefore = await h.dbCount("app_video_tasks");
    await expect(dock.getByRole("button", {name: "生成视频", exact: true})).toBeEnabled();
    await dock.getByRole("button", {name: "生成视频", exact: true}).click();
    await expect.poll(async () => (await video(videoId)).lastTaskId, {timeout: 120000}).toBeTruthy();
    const uiTaskId = (await video(videoId)).lastTaskId; assert.equal(await h.dbCount("app_video_tasks"), tasksBefore + 1);
    const finish = async (taskId: string) => {
      for (const deadline = Date.now() + 180000; Date.now() < deadline;) {
        await h.forceVideoPollDue(taskId); await h.tick();
        const response = await h.request<any>("a", "GET", `/api/video/tasks?id=${taskId}`), task = response.body.task;
        if (task.status === "completed") return task;
        assert.ok(!["failed", "cancelled", "needs_attention"].includes(task.status), JSON.stringify(task));
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      throw new Error("Character fixture task completion timed out");
    };
    const uiTask = await finish(uiTaskId), uiFrozen = await h.taskPersistence("a", uiTaskId);
    assert.ok(uiFrozen.parameters.request.prompt.includes("深蓝外套"));
    assert.equal(uiFrozen.parameters.request.orderedInputs[0].nodeId, `inline:character:${id}#${look.id}@${node.revision}`);
    const media = await h.request<ArrayBuffer>("a", "GET", uiTask.videoUrl); assert.equal(media.status, 200);
    const resultVideo = uiTask.resultAssets.find((asset: any) => asset.kind === "video");
    assert.equal(createHash("sha256").update(Buffer.from(media.body)).digest("hex"), resultVideo.sha256);

    console.log("CHARACTER_PHASE=MIXED_TRANSACTION");
    const copyInput = {operationId: randomUUID(), ids: [id, referenceId, videoId], projectKey};
    const copied = await h.request<any>("a", "POST", "/api/canvas/nodes/copy", copyInput); assert.equal(copied.status, 200, JSON.stringify(copied.body));
    assert.deepEqual((await h.request<any>("a", "POST", "/api/canvas/nodes/copy", copyInput)).body, copied.body);
    const copy = copied.body.characterNodes[0], copiedVideo = copied.body.nodes[0];
    assert.equal(copy.character.appearances[0].referenceArtworkIds[0], copied.body.idMap[referenceId]);
    assert.equal(copiedVideo.inputs[0].nodeId, characterInputIdentity(copy.id, look.id));
    assert.equal(copiedVideo.lastTaskId, null);
    const before = await get(copy.id);
    const failed = await h.request("a", "POST", "/api/canvas/history", {operationId: randomUUID(), operations: [{type: "character-patch", id: copy.id, expectedRevision: before.revision, fields: {x: 9876}}, {type: "visibility", id: "missing-image", visible: true}]});
    assert.equal(failed.status, 409); assert.equal((await get(copy.id)).x, before.x);
    const deletion = {operationId: randomUUID(), characterIds: [copy.id], videoIds: [copiedVideo.id], artworkIds: copied.body.artworkIds};
    assert.equal((await h.request("a", "POST", "/api/canvas/nodes/delete", deletion)).status, 200);
    assert.equal((await h.request("a", "POST", "/api/canvas/nodes/delete", deletion)).status, 200);
    // Character is deliberately restored before its images. Validate final state,
    // not operation order, while retaining an all-or-nothing history transaction.
    const brokenRestore = await h.request("a", "POST", "/api/canvas/history", {operationId: randomUUID(), operations: [{type: "video-visibility", id: copiedVideo.id, visible: true}, {type: "character-visibility", id: copy.id, visible: true}]});
    assert.equal(brokenRestore.status, 409); assert.equal((await h.request("a", "GET", `/api/canvas/video-nodes/${copiedVideo.id}`)).status, 404);
    const restoration = {operationId: randomUUID(), operations: [{type: "character-visibility", id: copy.id, visible: true}, {type: "video-visibility", id: copiedVideo.id, visible: true}, ...copied.body.artworkIds.map((id: string) => ({type: "visibility", id, visible: true}))]};
    const restored = await h.request("a", "POST", "/api/canvas/history", restoration); assert.equal(restored.status, 200, JSON.stringify(restored.body));
    assert.equal((await h.request("a", "GET", `/api/canvas/character-nodes/${copy.id}`)).status, 200);
    assert.equal((await h.request("b", "POST", "/api/canvas/nodes/copy", {...copyInput, operationId: randomUUID()})).status, 404);

    console.log("CHARACTER_PHASE=WORKFLOW_FREEZE");
    const role = {id: "role", nodeId: characterInputIdentity(id, look.id), kind: "text", role: "context", value: "CLIENT_FORGED"};
    async function makeShot(title: string, previous?: string) {
      const result = await h.request<any>("a", "POST", "/api/canvas/video-nodes", {id: "vnode-role-chain-" + randomUUID(), projectKey, title, expectedRevision: 0, operationId: randomUUID(), config: {...config, prompt: "保持 {{ref 1}} 的外套和身份"}, inputs: [role, ...(previous ? [{id: "previous", nodeId: previous, kind: "video", role: "source_video", value: "/media/pending"}] : [])]});
      assert.equal(result.status, 201, JSON.stringify(result.body)); return result.body.node;
    }
    const a = await makeShot("角色连续镜头A"), b = await makeShot("角色连续镜头B", a.id);
    const intent = {id: randomUUID(), projectKey, nodes: [a,b].map(item => ({id: item.id, revision: item.revision}))};
    const accepted = await h.request<any>("a", "POST", "/api/canvas/video-workflows", intent); assert.equal(accepted.status, 202, JSON.stringify(accepted.body));
    const run = async () => (await h.request<any>("a", "GET", `/api/video/workflows/${intent.id}`)).body.run;
    const frozenRun = await run(), frozenPlan = JSON.stringify(frozenRun.plan);
    assert.ok(frozenPlan.includes("深蓝外套")); assert.ok(!frozenPlan.includes("CLIENT_FORGED"));
    assert.ok(frozenPlan.includes(`inline:character:${id}#${look.id}@`));
    assert.deepEqual(await h.workflowFreezeState("a", intent.id), {encrypted: true, inputDigestSaved: true});
    assert.equal(frozenRun.nodes.filter((item: any) => item.taskId).length, 1);
    node = await get(id);
    const modified = await h.request<any>("a", "PATCH", `/api/canvas/character-nodes/${id}`, {operationId: randomUUID(), expectedRevision: node.revision, character: {...node.character, description: "LATER_ROLE_DEFINITION"}}); assert.equal(modified.status, 200, JSON.stringify(modified.body));
    assert.equal((await h.request("a", "PATCH", `/api/canvas/character-nodes/${id}`, {operationId: randomUUID(), expectedRevision: modified.body.node.revision, deleted: true})).status, 200);
    await finish(frozenRun.nodes.find((item: any) => item.id === a.id).taskId);
    const resumed = await h.request<any>("a", "POST", `/api/video/workflows/${intent.id}`, {action: "resume"}); assert.equal(resumed.status, 200, JSON.stringify(resumed.body));
    const bTaskId = (await run()).nodes.find((item: any) => item.id === b.id).taskId; assert.ok(bTaskId);
    await finish(bTaskId); const bFrozen = await h.taskPersistence("a", bTaskId);
    assert.ok(bFrozen.parameters.request.prompt.includes("深蓝外套")); assert.ok(!JSON.stringify(bFrozen.parameters.request).includes("LATER_ROLE_DEFINITION"));
    assert.equal(JSON.stringify((await run()).plan), frozenPlan);
    const calls = h.supplierCalls().filter(call => call.phase === "create").length;
    assert.equal((await h.request("a", "POST", "/api/canvas/video-workflows", intent)).status, 202);
    assert.equal(h.supplierCalls().filter(call => call.phase === "create").length, calls);
    assert.deepEqual(errors, []);
    const evidence = {realBrowserCanvas: true, menuCreateUploadSaveRefresh: true, looksAndDefault: true, imageGenerationDraftOnly: true, dragLockDuplicateDeleteUndoRedo: true, nativeHandleConnection: true, namedMentionAndLookSwitch: true, uiVideoGeneration: true, mixedCopyAliasAndImagesRemapped: true, mixedDeletionRestoreBeforeImageAtomic: true, failedHistoryRollsBackAll: true, workflowRolesFrozen: true, laterEditDeleteLeavesQueuedStageUnchanged: true, replayNoNewCalls: true, taskIds: [uiTaskId, ...((await run()).nodes.map((item: any) => item.taskId))], simulatedCreatesAdded: calls - createsBefore, paidCalls: 0, pageErrors: errors};
    await writeFile(path.join(out, "interaction-result.json"), JSON.stringify(evidence, null, 2));
    return evidence;
  } catch (error) {
    await writeFile(path.join(out, "browser-diagnostics.json"), JSON.stringify({errors, network}, null, 2));
    if (page) {await page.screenshot({path: path.join(out, "failure.png")}).catch(() => {}); await writeFile(path.join(out, "failure.txt"), await page.locator("body").innerText().catch(() => ""));}
    throw error;
  } finally {await browser.close();}
}
