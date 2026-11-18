import { assertPlainPendingPrompt } from "./verification/native-pending-prompt";
import { selectReferenceMention } from "./verification/reference-mention-locator";
import assert from "node:assert/strict";
import {dragCanvasNode} from "./verification/canvas-node-drag";
import {dragCanvasConnection} from "./verification/canvas-connection-drag";
import {spawnSync} from "node:child_process";
import {createHash, randomUUID} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {chromium, expect as playwrightExpect, type Page} from "@playwright/test";
import {newDirectorProject} from "../src/lib/director/project";
import {sceneInputIdentity} from "../src/lib/scene/project";
import type {createVideoFixture} from "./video-fusion/harness";
import {prewarmNativeWriteRoutes} from './verification/native-route-readiness';

const expect = playwrightExpect.configure({timeout: 60000});

/** Extends the same isolated app run. No additional server, real provider or account. */
export async function verifySceneInteractions(h: Awaited<ReturnType<typeof createVideoFixture>>, out: string, existingVideoId: string) {
  const errors: string[] = [], network: unknown[] = [];
  let page: Page | undefined;
  const browser = await chromium.launch({headless: true});
  try {
    console.log("SCENE_PHASE=UI_PREWARM");
    const warm: unknown[] = [];
    for (const url of ["/api/account", "/api/projects", "/api/canvas/text-nodes", "/api/canvas/scene-nodes?includeDeleted=1", "/api/canvas/director-nodes?includeDeleted=1", "/api/canvas/node-settings", "/api/video/assets?limit=30", "/api/config", "/api/canvas/video-nodes", "/api/video/tasks", "/api/canvas/image-tasks", "/api/video/media-jobs", "/api/canvas/workflow-import", "/api/models?feature=canvas.image", "/api/video/catalog", "/api/feature-access", "/api/enterprise", "/api/auth/session", "/api/version"]) {
      const response = await h.request<any>("a", "GET", url); warm.push({url, status: response.status});
      assert.equal(response.status, 200, JSON.stringify({url, body: response.body}));
    }
    await writeFile(path.join(out, "ui-prewarm.json"), JSON.stringify(warm, null, 2));
    const writeRoutes=await prewarmNativeWriteRoutes(h,['/api/video/references','/api/canvas/director-nodes/prewarm/outputs','/api/canvas/video-nodes/prewarm/generate']);
    await writeFile(path.join(out,'native-write-route-prewarm.json'),JSON.stringify(writeRoutes,null,2));
    // Original director/character readiness: read real HTML and static bytes before browser timers.
    const htmlResponse=await fetch(`${h.baseUrl}/canvas?node=${existingVideoId}`,{headers:{cookie:h.cookies.a},signal:AbortSignal.timeout(180000)});assert.equal(htmlResponse.status,200);
    const html=await htmlResponse.text(),entryAssets=[...new Set(Array.from(html.matchAll(/(?:src|href)="([^"<>]+)"/g),match=>match[1].replaceAll('&amp;','&')).filter(url=>url.startsWith('/_next/static/')&&!url.includes('.woff')))];
    const warmed=[];for(const url of entryAssets){const response=await fetch(h.baseUrl+url,{signal:AbortSignal.timeout(180000)});assert.equal(response.status,200,url);warmed.push({url,bytes:(await response.arrayBuffer()).byteLength});}
    await writeFile(path.join(out,'prewarm-assets.json'),JSON.stringify(warmed,null,2));
    const context = await browser.newContext({viewport: {width: 1440, height: 960}});
    await context.addCookies([{name: "nv_user", value: h.cookies.a.slice(8), url: h.baseUrl, httpOnly: true, sameSite: "Lax"}, {name: "naumi_locale", value: "zh", url: h.baseUrl}]);
    page = await context.newPage(); page.setDefaultTimeout(90000);
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => {if(request.method()!=="GET"&&!request.url().includes("_next"))network.push({request:new URL(request.url()).pathname,body:request.postData()?.slice(0,1500)});});
    page.on("response", response => network.push({path: new URL(response.url()).pathname, status: response.status()}));
    const live = async () => (await h.request<any>("a", "GET", "/api/canvas/scene-nodes")).body.nodes as any[];
    const get = async (id: string) => (await h.request<any>("a", "GET", `/api/canvas/scene-nodes/${id}`)).body.node;
    const video = async (id: string) => (await h.request<any>("a", "GET", `/api/canvas/video-nodes/${id}`)).body.node;
    const freeBefore = await h.creditState("a"), createsBefore = h.supplierCalls().filter(call => call.phase === "create").length;
    const navigation=await page.goto(`${h.baseUrl}/canvas?node=${existingVideoId}`, {waitUntil:"domcontentloaded",timeout:180000});
    assert.equal(navigation?.status(),200,"Actual Canvas must compile before waiting for controls");
    await page.locator(`.react-flow__node[data-id="${existingVideoId}"]`).waitFor();
    await page.getByTestId("canvas-project-chrome").getByRole("button", {name: "Naumi", exact: true}).click();
    await page.locator("aside").getByRole("button", {name: "创建新项目", exact: true}).click();
    await page.getByTestId("canvas-add-node-button").click();
    await page.getByTestId("canvas-create-menu").getByRole("menuitem", {name: "场景", exact: true}).click();
    const editor = page.getByTestId("scene-editor"); await editor.waitFor();
    await editor.getByLabel("场景名称", {exact: true}).fill("庭院 · 交互");
    await editor.getByLabel("场景设定", {exact: true}).fill("石阶连接木廊，石桌靠东，跨镜头保持布局");
    const imageBytes = await h.request<ArrayBuffer>("a", "GET", h.refs.lastImage.url); assert.equal(imageBytes.status, 200);
    await editor.getByLabel("上传场景参考图", {exact: true}).setInputFiles({name: "场景参考.png", mimeType: "image/png", buffer: Buffer.from(imageBytes.body)});
    await expect(editor.getByRole("button", {name: "移除场景参考图 1", exact: true})).toBeVisible();
    await editor.getByRole("button", {name: "添加状态", exact: true}).click();
    await editor.getByLabel("状态名称", {exact: true}).fill("夜景");
    await editor.getByLabel("状态设定", {exact: true}).fill("木廊暖灯照明，空间位置保持");
    await editor.getByLabel("场景背景方式", {exact:true}).selectOption("panorama");
    await editor.getByRole("button", {name: "保存场景", exact: true}).click();
    await expect(editor.getByRole("button", {name: "保存场景", exact: true})).toBeDisabled();
    await expect.poll(async () => (await live()).some(item => item.title === "庭院 · 交互")).toBe(true);
    await expect(editor.getByRole("button", {name: "完成", exact: true})).toBeEnabled();
    let node = (await live()).find(item => item.title === "庭院 · 交互"); assert.ok(node);
    const id = node.id as string, projectKey = node.projectKey as string;
    const state = node.scene.states.find((item: any) => item.name === "夜景"); assert.ok(state);
    const referenceId = node.scene.states[0].referenceArtworkIds[0] as string; assert.ok(referenceId);
    await page.screenshot({path: path.join(out, "actual-editor-desktop.png")});
    await page.setViewportSize({width: 390, height: 844});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390));
    await editor.getByLabel("状态设定", {exact: true}).scrollIntoViewIfNeeded();
    await page.screenshot({path: path.join(out, "actual-editor-mobile.png")});
    await editor.getByRole("button", {name: "保存并关闭场景", exact: true}).click(); await editor.waitFor({state: "hidden"});
    await page.setViewportSize({width: 1440, height: 960});
    await page.goto(`${h.baseUrl}/canvas?node=${id}`, {waitUntil: "domcontentloaded"});
    const card = page.locator(`.react-flow__node[data-id="${id}"]`), title = card.getByText("庭院 · 交互", {exact: true});
    await card.getByTestId("scene-canvas-node").waitFor();
    await card.getByRole("button", {name: "编辑场景", exact: true}).first().click();
    await expect(editor.getByLabel("场景设定", {exact: true})).toHaveValue("石阶连接木廊，石桌靠东，跨镜头保持布局");
    await editor.getByRole("button", {name: "夜景", exact: true}).click();
    await expect(editor.getByLabel("状态设定", {exact: true})).toHaveValue("木廊暖灯照明，空间位置保持");
    await editor.getByRole("button", {name: "生成参考图", exact: true}).click(); await editor.waitFor({state: "hidden"});
    // This opens the existing image composer. It is not an automatic paid call.
    await expect(page.getByTestId("pending-node-dock")).toContainText("生成");
    const pendingPrompt = await assertPlainPendingPrompt(page.getByTestId("pending-node-dock"), "庭院 · 交互\n石阶连接木廊，石桌靠东，跨镜头保持布局\n夜景：木廊暖灯照明，空间位置保持");
    const pendingText = [pendingPrompt.text];
    assert.ok(pendingText.some(text => text.includes("木廊暖灯照明") && text.includes("石桌靠东")), JSON.stringify(pendingText));
    assert.deepEqual(await h.creditState("a"), freeBefore); assert.equal(h.supplierCalls().filter(call => call.phase === "create").length, createsBefore);
    await page.reload({waitUntil: "domcontentloaded"}); await title.waitFor();
    console.log("SCENE_PHASE=UI_LIFECYCLE");
    // A raw boundingBox read does not wait for the post-reload Flow fit/resize.
    // Use the real header's actionability first, then perform exactly one drag.
    // Do not retry a gesture after a missing write or weaken the PG assertion.
    await title.hover();
    node = await get(id); await dragCanvasNode(page,title,{x:80,y:55},path.join(out,"actual-node-drag.json"));
    await expect.poll(async () => (await get(id)).x, {timeout: 60000}).not.toBe(node.x); const moved = await get(id);
    await expect(card.getByTestId("scene-canvas-node")).toHaveAttribute("data-revision", String(moved.revision));
    await page.locator('button[data-tool="undo"]').click(); await expect.poll(async () => (await get(id)).x).toBe(node.x);
    await page.locator('button[data-tool="redo"]').click(); await expect.poll(async () => (await get(id)).x).toBe(moved.x);
    await title.click({button: "right"}); await page.getByRole("menuitem", {name: "锁定节点", exact: true}).click();
    await title.click({button: "right"}); await expect(page.getByRole("menuitem", {name: /^创建副本/})).toBeDisabled();
    await page.getByRole("menuitem", {name: "解锁节点", exact: true}).click();
    await title.click({button: "right"}); await page.getByRole("menuitem", {name: /^创建副本/}).click();
    await expect.poll(async () => (await live()).filter(item => item.title === "庭院 · 交互").length).toBe(2);
    const duplicate = (await live()).find(item => item.title === "庭院 · 交互" && item.id !== id); assert.ok(duplicate);
    const duplicateTitle = page.locator(`.react-flow__node[data-id="${duplicate.id}"]`).getByText("庭院 · 交互", {exact: true});
    await duplicateTitle.click({button: "right"}); await page.getByRole("menuitem", {name: /^删除/}).click();
    await page.getByRole("button", {name: "确定删除", exact: true}).click(); await expect.poll(async () => (await live()).some(item => item.id === duplicate.id),{timeout:30000}).toBe(false);
    await page.locator('button[data-tool="undo"]').click(); await expect.poll(async () => (await live()).some(item => item.id === duplicate.id)).toBe(true);
    await page.locator('button[data-tool="redo"]').click(); await expect.poll(async () => (await live()).some(item => item.id === duplicate.id)).toBe(false);
    assert.deepEqual(await h.creditState("a"), freeBefore);

    console.log("SCENE_PHASE=UI_REFERENCE_GENERATION");
    const config = {modelId: "video-a", providerId: "managed-video", mode: "reference", prompt: "", durationSeconds: 4, resolution: "720p", aspectRatio: "16:9", generateAudio: false};
    const videoId = "vnode-ui-role-" + randomUUID(); node = await get(id);
    const made = await h.request<any>("a", "POST", "/api/canvas/video-nodes", {id: videoId, projectKey, title: "场景镜头", expectedRevision: 0, operationId: randomUUID(), x: node.x + 520, y: node.y, config, inputs: []}); assert.equal(made.status, 201, JSON.stringify(made.body));
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
    assert.equal((await video(videoId)).inputs[0].nodeId, sceneInputIdentity(id, "base"));
    await videoCard.getByRole("button", {name: "视频节点设置", exact: true}).click();
    const dock = page.getByTestId("video-node-dock"); await dock.waitFor();
    await dock.getByLabel("引用1状态", {exact: true}).selectOption(sceneInputIdentity(id, state.id));
    await dock.getByTestId("video-composer-prompt").fill("跟随 @庭院");
    const mentionSelection = await selectReferenceMention(page, dock.getByTestId("video-composer-prompt"), '庭院 · 交互 · 夜景');
    const mentionChip = dock.getByTestId("video-composer-prompt").getByRole("button", { name: '庭院 · 交互 · 夜景', exact: true }); await expect(mentionChip).toBeVisible(); await expect(mentionChip).toHaveAttribute("data-inline-token", "{{ref 1}}"); await expect(mentionChip).toHaveAttribute("data-reference-missing", "false");
    await dock.getByRole("button", {name: "保存设置", exact: true}).click();
    await expect.poll(async () => (await video(videoId)).config.prompt).toBe("跟随 {{ref 1}}");
    assert.equal((await video(videoId)).inputs[0].nodeId, sceneInputIdentity(id, state.id));
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
      throw new Error("Scene fixture task completion timed out");
    };
    const uiTask = await finish(uiTaskId), uiFrozen = await h.taskPersistence("a", uiTaskId);
    const uiPlan = await h.compiledTaskEvidence("a", uiTaskId);
    assert.equal(uiPlan.digest, uiFrozen.parameters.compiledPlanDigest);
    assert.ok(uiPlan.renderedPrompt?.includes("木廊暖灯照明"));
    assert.equal(uiPlan.inputs[0].nodeId, `inline:scene:${id}#${state.id}@${node.revision}`);
    const media = await h.request<ArrayBuffer>("a", "GET", uiTask.videoUrl); assert.equal(media.status, 200);
    const resultVideo = uiTask.resultAssets.find((asset: any) => asset.kind === "video");
    assert.equal(createHash("sha256").update(Buffer.from(media.body)).digest("hex"), resultVideo.sha256);

    console.log("SCENE_PHASE=DIRECTOR_BACKGROUND");
    const directorId="director-scene-"+randomUUID(), directorProject=newDirectorProject(); directorProject.duration=2;
    const createdDirector=await h.request<any>("a","POST","/api/canvas/director-nodes",{id:directorId,projectKey,title:"场景导演",expectedRevision:0,operationId:randomUUID(),x:node.x+520,y:node.y+420,project:directorProject});
    assert.equal(createdDirector.status,201,JSON.stringify(createdDirector.body));
    const getDirector=async(id=directorId)=>(await h.request<any>("a","GET",`/api/canvas/director-nodes/${id}`)).body.node;
    const renderCredits=await h.creditState("a");
    await page.goto(`${h.baseUrl}/canvas?node=${directorId}`,{waitUntil:"domcontentloaded"});
    const directorCard=page.locator(`.react-flow__node[data-id="${directorId}"]`);
    await directorCard.getByTestId("director-canvas-node").waitFor();
    await page.getByRole("button",{name:"适应视图",exact:true}).click();
    await dragCanvasConnection(page,card.locator('.react-flow__handle.source[data-handleid="out"]'),directorCard.locator('.react-flow__handle.target[data-handleid="in"]'),path.join(out,'scene-director-connection.json'));
    await expect.poll(async()=>(await getDirector()).project.sceneReference?.stateId).toBe("base");
    let applied=await getDirector();assert.equal(applied.project.backgroundProjection,"image");assert.deepEqual(applied.project.cameras,directorProject.cameras);assert.deepEqual(applied.project.entities,directorProject.entities);
    await directorCard.getByRole("button",{name:"打开3D导演台",exact:true}).first().click();const directorEditor=page.getByTestId("director-editor"),canvas=directorEditor.locator('canvas[data-director-renderer="webgl"]');
    await expect(canvas).toHaveAttribute("data-director-background-mode","image");await expect(directorEditor.getByRole("button",{name:"图片回画布",exact:true})).toBeEnabled();
    await directorEditor.getByRole("button",{name:"图片回画布",exact:true}).click();await expect.poll(async()=>(await getDirector()).outputs.length).toBe(1);
    await page.screenshot({path:path.join(out,"actual-director-image-background.png")});
    await directorEditor.getByLabel("导演场景状态",{exact:true}).selectOption(sceneInputIdentity(id,state.id));await directorEditor.getByRole("button",{name:"保存工程",exact:true}).click();
    await expect.poll(async()=>(await getDirector()).project.sceneReference?.stateId).toBe(state.id);await expect(canvas).toHaveAttribute("data-director-background-mode","panorama");
    await directorEditor.getByRole("button",{name:"视频回画布",exact:true}).click();await expect.poll(async()=>(await getDirector()).outputs.length,{timeout:120000}).toBe(2);
    await page.screenshot({path:path.join(out,"actual-director-panorama-background.png")});
    applied=await getDirector();assert.deepEqual(applied.project.cameras,directorProject.cameras);assert.deepEqual(applied.project.entities,directorProject.entities);assert.deepEqual(applied.project.keyframes,directorProject.keyframes);
    const applyIntent={expectedRevision:applied.revision,operationId:randomUUID(),project:{...applied.project,sceneReference:{...applied.project.sceneReference,text:"FORGED_DIRECTOR_SCENE_DEFINITION"}}};
    const trustedApply=await h.request<any>("a","PATCH",`/api/canvas/director-nodes/${directorId}`,applyIntent);assert.equal(trustedApply.status,200,JSON.stringify(trustedApply.body));assert.ok(!JSON.stringify(trustedApply.body.node.project.sceneReference).includes("FORGED_DIRECTOR"));applied=trustedApply.body.node;
    const directorFrozen=JSON.stringify(applied.project),directorOutputs=applied.outputs;
    for(const output of directorOutputs){
      const response=await h.request<any>("a","GET",`/api/artworks/get?ids=${encodeURIComponent(output.artworkId)}`);assert.equal(response.status,200);const artwork=response.body.artworks.find((art:any)=>art.id===output.artworkId);assert.ok(artwork);
      const url=output.kind==="image"?artwork.image:artwork.videoUrl,bytes=await h.request<ArrayBuffer>("a","GET",url);assert.equal(bytes.status,200);assert.ok(bytes.body.byteLength>1000);assert.equal((await h.request("b","GET",url)).status,404);
      const file=path.join(out,output.kind==="image"?"director-2d.png":"director-panorama.webm");await writeFile(file,Buffer.from(bytes.body));
      if(output.kind==="video"){const probe=spawnSync("ffprobe",["-v","error","-show_streams","-show_format","-of","json",file],{encoding:"utf8",windowsHide:true});assert.equal(probe.status,0,probe.stderr);const metadata=JSON.parse(probe.stdout);assert.equal(metadata.streams[0].width,1280);assert.equal(metadata.streams[0].height,720);assert.ok(Math.abs(Number(metadata.format.duration)-2)<.5);await writeFile(path.join(out,"director-probe.json"),JSON.stringify(metadata,null,2));}
    }
    assert.deepEqual(await h.creditState("a"),renderCredits);
    await directorEditor.getByRole("button",{name:"保存并关闭",exact:true}).click();

    console.log("SCENE_PHASE=MIXED_TRANSACTION");
    const copyInput = {operationId: randomUUID(), ids: [id, referenceId, videoId, directorId], projectKey};
    const copied = await h.request<any>("a", "POST", "/api/canvas/nodes/copy", copyInput); assert.equal(copied.status, 200, JSON.stringify(copied.body));
    assert.deepEqual((await h.request<any>("a", "POST", "/api/canvas/nodes/copy", copyInput)).body, copied.body);
    const copy = copied.body.sceneNodes[0], copiedVideo = copied.body.nodes[0];
    assert.equal(copy.scene.states[0].referenceArtworkIds[0], copied.body.idMap[referenceId]);
    assert.equal(copiedVideo.inputs[0].nodeId, sceneInputIdentity(copy.id, state.id));
    assert.equal(copiedVideo.lastTaskId, null);
    const copiedDirector=copied.body.directorNodes[0];assert.equal(copiedDirector.project.sceneReference.sceneId,copy.id);assert.equal(copiedDirector.project.sceneReference.revision,1);assert.equal(copiedDirector.project.panoramaArtworkId,copied.body.idMap[referenceId]);assert.deepEqual(copiedDirector.outputs,[]);
    const before = await get(copy.id);
    const failed = await h.request("a", "POST", "/api/canvas/history", {operationId: randomUUID(), operations: [{type: "scene-patch", id: copy.id, expectedRevision: before.revision, fields: {x: 9876}}, {type: "visibility", id: "missing-image", visible: true}]});
    assert.equal(failed.status, 409); assert.equal((await get(copy.id)).x, before.x);
    const deletion = {operationId: randomUUID(), sceneIds: [copy.id], directorIds:[copiedDirector.id], videoIds: [copiedVideo.id], artworkIds: copied.body.artworkIds};
    assert.equal((await h.request("a", "POST", "/api/canvas/nodes/delete", deletion)).status, 200);
    assert.equal((await h.request("a", "POST", "/api/canvas/nodes/delete", deletion)).status, 200);
    // Scene is deliberately restored before its images. Validate final state,
    // not operation order, while retaining an all-or-nothing history transaction.
    const brokenRestore = await h.request("a", "POST", "/api/canvas/history", {operationId: randomUUID(), operations: [{type: "video-visibility", id: copiedVideo.id, visible: true}, {type: "scene-visibility", id: copy.id, visible: true}]});
    assert.equal(brokenRestore.status, 409); assert.equal((await h.request("a", "GET", `/api/canvas/video-nodes/${copiedVideo.id}`)).status, 404);
    const restoration = {operationId: randomUUID(), operations: [{type:"director-visibility",id:copiedDirector.id,visible:true},{type: "scene-visibility", id: copy.id, visible: true}, {type: "video-visibility", id: copiedVideo.id, visible: true}, ...copied.body.artworkIds.map((id: string) => ({type: "visibility", id, visible: true}))]};
    const restored = await h.request("a", "POST", "/api/canvas/history", restoration); assert.equal(restored.status, 200, JSON.stringify(restored.body));
    assert.equal((await h.request("a", "GET", `/api/canvas/scene-nodes/${copy.id}`)).status, 200);
    assert.equal((await h.request("b", "POST", "/api/canvas/nodes/copy", {...copyInput, operationId: randomUUID()})).status, 404);

    console.log("SCENE_PHASE=WORKFLOW_FREEZE");
    const role = {id: "role", nodeId: sceneInputIdentity(id, state.id), kind: "text", role: "context", value: "CLIENT_FORGED"};
    async function makeShot(title: string, previous?: string) {
      const result = await h.request<any>("a", "POST", "/api/canvas/video-nodes", {id: "vnode-role-chain-" + randomUUID(), projectKey, title, expectedRevision: 0, operationId: randomUUID(), config: {...config, prompt: "保持 {{ref 1}} 的夜景和身份"}, inputs: [role, ...(!previous ? directorOutputs.map((output:any,index:number)=>({id:`director-${index}`,nodeId:output.artworkId,kind:output.kind,role:output.kind==="image"?"reference":"source_video",value:"/media/pending"})) : []), ...(previous ? [{id: "previous", nodeId: previous, kind: "video", role: "source_video", value: "/media/pending"}] : [])]});
      assert.equal(result.status, 201, JSON.stringify(result.body)); return result.body.node;
    }
    const a = await makeShot("场景连续镜头A"), b = await makeShot("场景连续镜头B", a.id);
    const intent = {id: randomUUID(), projectKey, nodes: [a,b].map(item => ({id: item.id, revision: item.revision}))};
    const accepted = await h.request<any>("a", "POST", "/api/canvas/video-workflows", intent); assert.equal(accepted.status, 202, JSON.stringify(accepted.body));
    const run = async () => (await h.request<any>("a", "GET", `/api/video/workflows/${intent.id}`)).body.run;
    const frozenRun = await run(), frozenPlan = JSON.stringify(frozenRun.plan);
    assert.ok(frozenPlan.includes("木廊暖灯照明")); assert.ok(!frozenPlan.includes("CLIENT_FORGED"));
    assert.ok(frozenPlan.includes(`inline:scene:${id}#${state.id}@`));
    assert.deepEqual(await h.workflowFreezeState("a", intent.id), {encrypted: true, inputDigestSaved: true});
    assert.equal(frozenRun.nodes.filter((item: any) => item.taskId).length, 1);
    node = await get(id);
    const modified = await h.request<any>("a", "PATCH", `/api/canvas/scene-nodes/${id}`, {operationId: randomUUID(), expectedRevision: node.revision, scene: {...node.scene, description: "LATER_ROLE_DEFINITION"}}); assert.equal(modified.status, 200, JSON.stringify(modified.body));
    assert.equal((await h.request("a", "PATCH", `/api/canvas/scene-nodes/${id}`, {operationId: randomUUID(), expectedRevision: modified.body.node.revision, deleted: true})).status, 200);
    await finish(frozenRun.nodes.find((item: any) => item.id === a.id).taskId);
    const resumed = await h.request<any>("a", "POST", `/api/video/workflows/${intent.id}`, {action: "resume"}); assert.equal(resumed.status, 200, JSON.stringify(resumed.body));
    const bTaskId = (await run()).nodes.find((item: any) => item.id === b.id).taskId; assert.ok(bTaskId);
    await finish(bTaskId); const bFrozen = await h.taskPersistence("a", bTaskId);
    const bPlan = await h.compiledTaskEvidence("a", bTaskId);
    assert.equal(bPlan.digest, bFrozen.parameters.compiledPlanDigest);
    assert.ok(bPlan.renderedPrompt?.includes("木廊暖灯照明")); assert.ok(!JSON.stringify(bPlan).includes("LATER_ROLE_DEFINITION"));
    assert.equal(JSON.stringify((await run()).plan), frozenPlan);
    assert.equal(JSON.stringify((await getDirector()).project),directorFrozen);
    const applyReplay=await h.request<any>("a","PATCH",`/api/canvas/director-nodes/${directorId}`,applyIntent);assert.equal(applyReplay.status,200,JSON.stringify(applyReplay.body));assert.equal(applyReplay.body.node.revision,applied.revision);
    const frozenCopy=await h.request<any>("a","POST","/api/canvas/nodes/copy",{ids:[directorId],projectKey,operationId:randomUUID()});assert.equal(frozenCopy.status,200,JSON.stringify(frozenCopy.body));assert.equal(JSON.stringify(frozenCopy.body.directorNodes[0].project.sceneReference),JSON.stringify(applied.project.sceneReference));
    const calls = h.supplierCalls().filter(call => call.phase === "create").length;
    assert.equal((await h.request("a", "POST", "/api/canvas/video-workflows", intent)).status, 202);
    assert.equal(h.supplierCalls().filter(call => call.phase === "create").length, calls);
    assert.deepEqual(errors, []);
    const evidence = {
      pendingPrompt,mentionSelection,realBrowserCanvas: true, nativeSceneDirectorConnection:true, actualImageAndPanoramaWebgl:true, directorImageVideoOutputsFree:true, directorSnapshotSurvivesSceneDeletion:true, directorApplyTrustedAndReplayAfterDeletion:true, mixedDirectorSnapshotRemap:true, menuCreateUploadSaveRefresh: true, statesAndDefault: true, imageGenerationDraftOnly: true, dragLockDuplicateDeleteUndoRedo: true, nativeHandleConnection: true, namedMentionAndLookSwitch: true, uiVideoGeneration: true, mixedCopyAliasAndImagesRemapped: true, mixedDeletionRestoreBeforeImageAtomic: true, failedHistoryRollsBackAll: true, workflowRolesFrozen: true, laterEditDeleteLeavesQueuedStageUnchanged: true, replayNoNewCalls: true, taskIds: [uiTaskId, ...((await run()).nodes.map((item: any) => item.taskId))], simulatedCreatesAdded: calls - createsBefore, paidCalls: 0, pageErrors: errors};
    await writeFile(path.join(out, "interaction-result.json"), JSON.stringify(evidence, null, 2));
    return evidence;
  } catch (error) {
    await writeFile(path.join(out, "browser-diagnostics.json"), JSON.stringify({errors, network}, null, 2));
    if (page) {await page.screenshot({path: path.join(out, "failure.png")}).catch(() => {}); await writeFile(path.join(out, "failure.txt"), await page.locator("body").innerText().catch(() => ""));}
    throw error;
  } finally {await browser.close();}
}
