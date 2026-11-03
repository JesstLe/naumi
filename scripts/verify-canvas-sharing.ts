import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readdir, readFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import sharp from "sharp";
import { getPool, listArtworksByIds, listCanvasTextNodes, deleteArtworksByIds, purgeArtworksByIds } from "../src/lib/db";
import { closeDatabasePools } from "../src/lib/db/connection";
import { ensureCanvasSharingSchema } from "../src/lib/canvas-sharing/schema";
import { createShare, changeShare, getShare, listShares, getSharePreview } from "../src/lib/canvas-sharing/application";
import { getSharePreviewTx, prepareApprovalTx, changeShareTx, validateShareForMessageTx } from "../src/lib/canvas-sharing/service";
import { copyStagedMedia, prepareMediaStaging, cleanupStagedMedia, cleanupExpiredShareMedia } from "../src/lib/canvas-sharing/media";
import { fingerprint, newIdentity, type ShareScope } from "../src/lib/canvas-sharing/domain";
import { nodeTables } from "../src/lib/canvas-sharing/snapshot";
import { insertSharedArtworkTx, insertSharedTextTx } from "../src/lib/canvas/sharing-repository";
import { saveVideoNodeTx, getVideoNode } from "../src/lib/canvas/video-node-repository";
import { saveDirectorNodeTx, getDirectorNode } from "../src/lib/canvas/director-node-repository";
import { saveCharacterNodeTx, getCharacterNode } from "../src/lib/canvas/character-node-repository";
import { saveSceneNodeTx, getSceneNode } from "../src/lib/canvas/scene-node-repository";
import { saveAudioNodeTx, getAudioNode } from "../src/lib/canvas/audio-node-repository";
import { saveTimelineNodeTx, getTimelineNode } from "../src/lib/canvas/timeline-node-repository";
import { saveAudioNode } from "../src/lib/canvas/audio-node-service";
import { saveTimelineNode } from "../src/lib/canvas/timeline-node-service";
import { recordMediaProbe } from "../src/lib/video/media-inspection";
import { listCanvasImageVersions } from "../src/lib/canvas/image-version-store";
import { deleteCanvasProject } from "../src/lib/canvas/node-delete";
import { newDirectorProject } from "../src/lib/director/project";
import { newCharacterProject } from "../src/lib/character/project";
import { newSceneProject } from "../src/lib/scene/project";
import { newAudioProject } from "../src/lib/audio/project";
import { newTimelineProject } from "../src/lib/timeline/project";
import { writeStoredObject, readManagedObject, deleteImageByUrl, MEDIA_DIR } from "../src/lib/storage";
import { registerMediaAsset, canReadMedia } from "../src/lib/media-assets";
import { withCollaborationScope } from "./verify-canvas-sharing.scope-fixture";
import * as sharesRoute from "../src/app/api/collaboration/shares/route";
import * as shareRoute from "../src/app/api/collaboration/shares/[id]/route";
import * as previewRoute from "../src/app/api/collaboration/shares/[id]/preview/route";

const author = "author@fixture.invalid", recipient = "recipient@fixture.invalid", third = "third@fixture.invalid", outsider = "outside@fixture.invalid";
const enterprise = randomUUID(), otherEnterprise = randomUUID(), projectKey = "tree:fixture-root";
const scope = (actorId: string): ShareScope => ({ actorId, enterpriseId: enterprise, ownerId: author, memberIds: new Set([author, recipient, third]) });
const pool = getPool(); let checks = 0;
let outboundCalls = 0;
globalThis.fetch = async () => { outboundCalls++; throw new Error("Fixture forbids all outbound fetch; no supplier/network I/O expected"); };
const pass = (name: string) => { checks++; console.log(`PASS ${checks} ${name}`); };
const transaction = async <T>(run: (tx: import("pg").PoolClient) => Promise<T>) => { const tx = await pool.connect(); try { await tx.query("BEGIN"); const value = await run(tx); await tx.query("COMMIT"); return value; } catch (e) { await tx.query("ROLLBACK"); throw e; } finally { tx.release(); } };
const fails = async (run: () => Promise<unknown>, code?: string) => { await assert.rejects(run, (e: any) => !code || e.code === code); };
const count = async (table: string) => Number((await pool.query(`SELECT count(*) n FROM ${table}`)).rows[0].n);
const createRequest = () => createShare(recipient, enterprise, { action: "request", authorId: author, operationId: randomUUID() });
const approve = (id: string, version = 1) => ({ action: "approve", expectedVersion: version, operationId: randomUUID(), source: { projectKey, kind: "workflow" } });
const sourceHash = async () => {
  const values = []; for (const table of Object.values(nodeTables)) values.push((await pool.query(`SELECT * FROM ${table} WHERE email=$1 ORDER BY id`, [author])).rows);
  values.push((await pool.query("SELECT * FROM app_canvas_image_versions WHERE email=$1 ORDER BY node_id,version_id", [author])).rows); return fingerprint(values);
};
const nativeWrite = (id: string) => ({ id, operationId: randomUUID(), expectedRevision: 0, title: id, x: 123, y: 456, width: 420, height: 300 });
async function main() {
  assert.match(process.env.DATABASE_URL || "", /@127\.0\.0\.1:\d+\/canvas_sharing_fixture/);
  await fails(() => transaction(tx => validateShareForMessageTx(tx, author, enterprise, [author, recipient], randomUUID())), "SHARE_MESSAGE_FORBIDDEN");
  pass("cold message validator rejects nonexistent share without nested schema initialization");
  await ensureCanvasSharingSchema();
  await pool.query("CREATE TABLE fixture_share_members(enterprise_id uuid,email text,active boolean NOT NULL DEFAULT true,banned boolean NOT NULL DEFAULT false,PRIMARY KEY(enterprise_id,email))");
  for (const [e, email] of [[enterprise, author], [enterprise, recipient], [enterprise, third], [otherEnterprise, outsider]]) await pool.query("INSERT INTO fixture_share_members(enterprise_id,email) VALUES($1,$2)", [e, email]);
  const pixels = await sharp({ create: { width: 12, height: 10, channels: 4, background: "#9fd1f0" } }).png().toBuffer();
  const fixtureDir = path.join(MEDIA_DIR, "decoded-fixture"); await mkdir(fixtureDir, { recursive: true });
  const videoFile = path.join(fixtureDir, "sample.mp4"), audioFile = path.join(fixtureDir, "sample.wav");
  for (const [file, input, codec] of [[videoFile, "color=c=blue:s=16x16:r=24:d=1", "libx264"], [audioFile, "sine=frequency=440:duration=1", "pcm_s16le"]]) {
    const result = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", input, "-threads", "1", file === videoFile ? "-c:v" : "-c:a", codec, file], { encoding: "utf8", windowsHide: true }); assert.equal(result.status, 0, result.stderr);
  }
  const mediaKeys = ["fixture/source.png", "fixture/history.png", "fixture/video.mp4", "fixture/audio.wav"];
  for (const key of mediaKeys) {
    const mime = key.endsWith(".mp4") ? "video/mp4" : key.endsWith(".wav") ? "audio/wav" : "image/png"; const file = key.endsWith(".mp4") ? videoFile : audioFile;
    const bytes = mime === "image/png" ? pixels : await readFile(file); await writeStoredObject(bytes, mime, key); await registerMediaAsset(key, bytes, mime, false, author, false);
    if (mime !== "image/png") {
      const decode = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-threads", "1", "-f", "null", "-"], { encoding: "utf8", windowsHide: true }); assert.equal(decode.status, 0, decode.stderr);
      const inspect = spawnSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], { encoding: "utf8", windowsHide: true }); assert.equal(inspect.status, 0);
      const p = JSON.parse(inspect.stdout), v = p.streams.find((s: any) => s.codec_type === "video"), audios = p.streams.filter((s: any) => s.codec_type === "audio");
      await recordMediaProbe(key, createHash("sha256").update(bytes).digest("hex"), { durationSeconds: Number(p.format.duration), width: v?.width || 0, height: v?.height || 0, videoCodec: v?.codec_name || null, audioCodecs: audios.map((s: any) => s.codec_name), formatName: p.format.format_name, frameRate: v ? 24 : null });
    }
  }
  await transaction(async tx => {
    await tx.query("INSERT INTO app_canvas_video_projects(email,project_key) VALUES($1,$2)", [author, projectKey]);
    await tx.query("INSERT INTO app_project_names(email,key,name) VALUES($1,$2,'Author project')", [author, projectKey]);
    await tx.query("INSERT INTO app_creation_contexts(actor_email,context_kind,context_id,scope_kind,tenant_id) VALUES($1,'project',$2,'tenant',$3)", [author, projectKey, enterprise]);
    for (const [id, url, category] of [["image-source", "/media/fixture/source.png", "image"], ["video-source", "/media/fixture/video.mp4", "video"], ["audio-source", "/media/fixture/audio.wav", "audio"]]) await insertSharedArtworkTx(tx, author, id, projectKey, {
      title: id, category, prompt: "SECRET AUTHOR PROMPT", status: "completed", image_url: category === "video" ? "/media/fixture/source.png" : url,
      video_url: category === "video" || category === "audio" ? url : null, canvas_x: 20, canvas_y: 30, canvas_width: 300, canvas_height: 200, image_width: 12, image_height: 10,
      parent_id: null, parent_ids: [], canvas_group_id: "source-group", canvas_image_version: null,
    });
    await insertSharedTextTx(tx, author, "text-source", projectKey, { title: "text", prompt: "Text instruction", content: "AUTHOR CONTENT", status: "generating", canvas_x: 55, canvas_y: 66, canvas_width: 300, canvas_height: 176, source_ids: ["image-source"], target_ids: ["video-node"], product_ids: ["image-source"] });
    const asset = { image: "/media/fixture/history.png", prompt: "version prompt", width: 12, height: 10, ratio: "1:1", resolution: "1K", style: null };
    await tx.query("INSERT INTO app_canvas_image_versions(email,node_id,version_id,operation_id,asset,attachment) VALUES($1,'image-source','old-version',$2,$3::jsonb,$4::jsonb)", [author, randomUUID(), JSON.stringify(asset), JSON.stringify({ token: "old-token", nodeId: "image-source" })]);
    await tx.query("UPDATE app_artworks SET canvas_image_version=$1::jsonb,canvas_image_revision=7,creation_provenance=$2::jsonb WHERE id='image-source'", [JSON.stringify({ id: "old-version", ...asset }), JSON.stringify({ quote: "old-quote", taskId: "old-task" })]);
    const character = newCharacterProject(); character.appearances[0].referenceArtworkIds = ["image-source"];
    const scene = newSceneProject(); scene.states[0].referenceArtworkIds = ["image-source"]; scene.states[0].background = { artworkId: "image-source", projection: "image" };
    await saveCharacterNodeTx(tx, author, { ...nativeWrite("character-source"), character }, projectKey);
    await saveSceneNodeTx(tx, author, { ...nativeWrite("scene-source"), scene }, projectKey);
    const director = newDirectorProject(); director.panoramaArtworkId = "image-source"; director.sceneReference = { sceneId: "scene-source", stateId: "base", revision: 1, name: "scene", stateName: "base", text: "scene text", referenceArtworkIds: ["image-source"], background: { artworkId: "image-source", projection: "image" } };
    await saveDirectorNodeTx(tx, author, { ...nativeWrite("director-source"), project: director }, projectKey);
    await tx.query("UPDATE app_canvas_director_nodes SET outputs='[{\"artworkId\":\"video-source\",\"kind\":\"video\"}]' WHERE email=$1", [author]);
    const audio = newAudioProject(); audio.sourceArtworkId = "audio-source"; audio.adopted = { artworkId: "audio-source", sourceArtworkId: "audio-source", edit: audio.edit, jobId: randomUUID() }; audio.render = { operationId: randomUUID(), baseRevision: 1, sourceArtworkId: "audio-source", edit: audio.edit };
    await saveAudioNodeTx(tx, author, { ...nativeWrite("audio-node"), audio }, projectKey);
    const timeline = newTimelineProject(); timeline.tracks[0].clips.push({ id: "clip-1", artworkId: "video-source", canvasSourceId: "video-source", position: 0, inPoint: 0, duration: 1, gain: 1, fadeIn: 0, fadeOut: 0, audioEnabled: true, transitionIn: 0 });
    await saveTimelineNodeTx(tx, author, { ...nativeWrite("timeline-node"), timeline, adopted: { artworkId: "video-source", jobId: randomUUID(), project: timeline } }, projectKey);
    await saveVideoNodeTx(tx, author, { ...nativeWrite("video-node"), config: { prompt: "{{ref 1}} 图片1", durationSeconds: 4, providerOptions: { quality: "high", seed: 42 }, references: [{ id: "ref-image", kind: "image", role: "reference", artworkId: "image-source", url: "/media/fixture/history.png" }], shots: [{ id: "shot1", textNodeId: "text:text-source", prompt: "shot prompt", durationSeconds: 4 }] }, inputs: [
      { id: "ref-image", nodeId: "image:image-source", kind: "image", role: "reference", value: "/media/fixture/history.png" },
      { id: "ref-text", nodeId: "text:text-source", kind: "text", role: "context", value: "AUTHOR CONTENT" },
      { id: "ref-character", nodeId: "character:character-source#base", kind: "text", role: "context", value: "character" },
      { id: "ref-scene", nodeId: "scene:scene-source#base", kind: "text", role: "context", value: "scene" },
      { id: "ref-audio", nodeId: "audio-node:audio-node", kind: "audio", role: "source_audio", value: "/media/fixture/audio.wav" },
      { id: "ref-timeline", nodeId: "timeline-node:timeline-node", kind: "video", role: "source_video", value: "/media/fixture/video.mp4" },
    ] }, projectKey);
    await tx.query("UPDATE app_canvas_video_nodes SET last_task_id='old-task',last_result_id='video-source' WHERE email=$1", [author]);
    await tx.query("INSERT INTO app_canvas_node_settings(email,node_id,kind,settings) VALUES($1,'text-source','text','{\"order\":7}')", [author]);
  });
  const originalHash = await sourceHash(), ledger = await count("app_ledger"), imageJobs = await count("app_image_jobs"), videoJobs = await count("app_video_tasks");
  pass("real native schemas/repositories seeded: 8 node categories, image history, generated media, tenant project");

  const request = await createRequest(); assert.equal(request.status, "requested"); assert.equal(request.previewUrl, null);
  assert.equal(JSON.stringify(request).includes("SECRET"), false); assert.equal((await listShares(third, enterprise, "sent")).items.length, 0);
  await fails(() => getShare(third, enterprise, request.id), "SHARE_NOT_FOUND"); await fails(() => getShare(outsider, otherEnterprise, request.id), "SHARE_NOT_FOUND");
  await fails(() => changeShare(recipient, enterprise, request.id, approve(request.id)), "SHARE_FORBIDDEN");
  pass("request needs only author; no source/private canvas listing or prompt disclosure; third party/cross tenant rejected");
  await pool.query("UPDATE fixture_share_members SET banned=true WHERE email=$1", [recipient]);
  await fails(() => getShare(recipient, enterprise, request.id), "FIXTURE_MEMBERSHIP_DENIED");
  await fails(() => changeShare(author, enterprise, request.id, approve(request.id)), "SHARE_FORBIDDEN");
  await pool.query("UPDATE fixture_share_members SET banned=false WHERE email=$1", [recipient]); pass("disabled actor and disabled recipient denied by explicit external-scope PG fixture");
  const offerInput = { action: "offer", operationId: randomUUID(), requesterId: recipient, source: { projectKey, nodeIds: ["image-source"], kind: "artwork" } };
  const offer = await createShare(author, enterprise, offerInput); assert.equal(offer.status, "offered");
  assert.equal((await createShare(author, enterprise, offerInput)).id, offer.id);
  const beforeConflict = await count("app_canvas_shares");
  await fails(() => createShare(author, enterprise, { ...offerInput, requesterId: third }), "SHARE_OPERATION_CONFLICT"); assert.equal(await count("app_canvas_shares"), beforeConflict);
  const preview = await getSharePreview(recipient, enterprise, offer.id); assert.equal((await sharp(preview).metadata()).format, "png"); assert.equal(preview.includes(Buffer.from("SECRET")), false);
  await fails(() => getSharePreview(third, enterprise, offer.id)); pass("offer author ownership, selected preview PNG, create idempotency and conflicting fingerprint zero writes");
  await withCollaborationScope(author, enterprise, tx => validateShareForMessageTx(tx, author, enterprise, [author, recipient], offer.id));
  await fails(() => withCollaborationScope(author, enterprise, tx => validateShareForMessageTx(tx, author, enterprise, [author, recipient, third], offer.id)), "SHARE_MESSAGE_FORBIDDEN");
  await fails(() => withCollaborationScope(author, enterprise, tx => validateShareForMessageTx(tx, author, enterprise, [author, third], offer.id)), "SHARE_MESSAGE_FORBIDDEN");
  pass("message card allows exact direct participant set; third-member and changed set rejected");
  const requestedOffer = await changeShare(recipient, enterprise, offer.id, { action: "request", expectedVersion: 1, operationId: randomUUID() }); assert.equal(requestedOffer.version, 2);
  const rejected = await changeShare(author, enterprise, offer.id, { action: "reject", expectedVersion: 2, operationId: randomUUID() }); assert.equal(rejected.status, "rejected"); await fails(() => getSharePreview(recipient, enterprise, offer.id)); pass("offered -> requested -> rejected; preview authority removed");

  const operation = approve(request.id), parallel = await Promise.all([changeShare(author, enterprise, request.id, operation), changeShare(author, enterprise, request.id, operation)]);
  assert.equal(parallel[0].id, parallel[1].id); assert.equal(await count("app_canvas_share_copies"), 1);
  const approved = await getShare(recipient, enterprise, request.id); assert.equal(approved.status, "approved"); assert.ok(approved.resultProjectKey); assert.equal((await getShare(author, enterprise, request.id)).resultProjectKey, null);
  await fails(() => changeShare(author, enterprise, request.id, { ...operation, expectedVersion: 2 }), "SHARE_OPERATION_CONFLICT");
  await fails(() => changeShare(author, enterprise, request.id, { ...operation, operationId: randomUUID() }), "SHARE_VERSION_CONFLICT"); assert.equal(await count("app_canvas_share_copies"), 1);
  pass("parallel same operation approval creates exactly one copy; CAS/fingerprint conflicts zero extra copies");
  const copy = (await pool.query("SELECT * FROM app_canvas_share_copies WHERE share_id=$1", [request.id])).rows[0], map = copy.id_map;
  assert.equal(Object.keys(map).length, 10); assert.ok(Object.values(map).every(id => !Object.keys(map).includes(id as string)));
  const arts = await listArtworksByIds(recipient, [map["image-source"], map["video-source"], map["audio-source"]]); assert.equal(arts.length, 3);
  const texts = await listCanvasTextNodes(recipient); assert.equal(texts[0].sourceIds[0], map["image-source"]); assert.equal(texts[0].status, "completed");
  const video = (await getVideoNode(recipient, map["video-node"]))!; assert.equal(video.lastTaskId, null); assert.equal(video.lastResultId, null); assert.equal(video.displayResultId, map["video-source"]); assert.equal(video.config.prompt, "{{ref 1}} 图片1");
  assert.equal(video.inputs[2].nodeId, `character:${map["character-source"]}#base`); assert.equal(video.inputs[3].nodeId, `scene:${map["scene-source"]}#base`);
  assert.equal(video.inputs[4].nodeId, `audio:${map["audio-source"]}`); assert.equal(video.inputs[5].nodeId, `video:${map["video-source"]}`);
  assert.equal(video.config.references![0].id, video.inputs[0].id); assert.equal(video.config.references![0].artworkId, map["image-source"]);
  const director = (await getDirectorNode(recipient, map["director-source"]))!; assert.equal(director.outputs[0].artworkId, map["video-source"]); assert.equal(director.project.sceneReference!.sceneId, map["scene-source"]); assert.notEqual(director.project.activeCameraId, "camera-1");
  assert.equal((await getCharacterNode(recipient, map["character-source"]))!.character.appearances[0].referenceArtworkIds[0], map["image-source"]);
  assert.equal((await getSceneNode(recipient, map["scene-source"]))!.scene.states[0].background!.artworkId, map["image-source"]);
  const audio = (await getAudioNode(recipient, map["audio-node"]))!; assert.equal(audio.audio.render, null); assert.equal(audio.audio.adopted, null); assert.equal(audio.audio.sourceArtworkId, map["audio-source"]);
  const timeline = (await getTimelineNode(recipient, map["timeline-node"]))!; assert.equal(timeline.render, null); assert.equal(timeline.adopted, null); assert.equal(timeline.timeline.tracks[0].clips[0].artworkId, map["video-source"]); assert.notEqual(timeline.timeline.tracks[0].clips[0].id, "clip-1");
  const versions = await listCanvasImageVersions(recipient, map["image-source"]); assert.equal(versions.versions.length, 1); assert.notEqual(versions.currentVersionId, "old-version");
  const stored = (await pool.query("SELECT * FROM app_canvas_image_versions WHERE email=$1", [recipient])).rows[0]; assert.equal(stored.operation_id, null); assert.equal(stored.attachment, null);
  const receiverContext = (await pool.query("SELECT tenant_id FROM app_creation_contexts WHERE actor_email=$1 AND context_kind='project' AND context_id=$2", [recipient, approved.resultProjectKey])).rows[0]; assert.equal(receiverContext.tenant_id, enterprise);
  assert.equal((await pool.query("SELECT status FROM app_creation_records WHERE actor_email=$1", [recipient])).rows[0].status, "succeeded");
  assert.equal(await count("app_ledger"), ledger); assert.equal(await count("app_image_jobs"), imageJobs); assert.equal(await count("app_video_tasks"), videoJobs); assert.equal(await sourceHash(), originalHash);
  pass("all 8 types native-readable: nodes/layout/edges/prompts/parameters/history/media remapped; runtime/receipts absent; source hash/tasks/ledger unchanged");
  await transaction(tx => saveVideoNodeTx(tx, recipient, { id: video.id, operationId: randomUUID(), expectedRevision: video.revision, title: "independent edit" }, approved.resultProjectKey!));
  assert.equal((await getVideoNode(recipient, video.id))!.title, "independent edit");
  const editedAudio = await saveAudioNode(recipient, { id: audio.id, expectedRevision: audio.revision, operationId: randomUUID(), audio: { ...audio.audio, edit: { ...audio.audio.edit, gain: 0.5 } } }); assert.equal(editedAudio.audio.edit.gain, 0.5);
  const editedTimeline = await saveTimelineNode(recipient, { id: timeline.id, expectedRevision: timeline.revision, operationId: randomUUID(), timeline: { ...timeline.timeline, masterGain: 0.5 } }); assert.equal(editedTimeline.timeline.masterGain, 0.5);
  assert.equal(await sourceHash(), originalHash); pass("recipient video/audio/timeline independent native service edits with copied byte-bound decoder evidence leave author unchanged");
  const revoked = await changeShare(author, enterprise, request.id, { action: "revoke", expectedVersion: 2, operationId: randomUUID() }); assert.equal(revoked.status, "revoked"); assert.equal((await getShare(recipient, enterprise, request.id)).resultProjectKey, approved.resultProjectKey); assert.ok(await getVideoNode(recipient, video.id)); pass("revoke approved share does not delete independent recipient copy");

  const changed = await createRequest(), changeOp = approve(changed.id);
  const prep = await withCollaborationScope(author, enterprise, (tx, s) => prepareApprovalTx(tx, s, changed.id, changeOp)); assert.ok("snapshot" in prep);
  const stage = await prepareMediaStaging(changed.id, prep.snapshot); await copyStagedMedia(stage);
  await pool.query("UPDATE app_canvas_text_nodes SET prompt='later edit' WHERE email=$1", [author]);
  await fails(() => withCollaborationScope(author, enterprise, (tx, s) => changeShareTx(tx, s, changed.id, changeOp, { prepared: prep, stage })), "SHARE_SOURCE_CHANGED");
  assert.equal(await cleanupStagedMedia(stage.attemptId), true); assert.equal(await count("app_canvas_share_copies"), 1); pass("source changes during storage phase reject stale snapshot and return staged resources");
  await pool.query("UPDATE app_canvas_text_nodes SET prompt='Text instruction' WHERE email=$1", [author]);
  const failure = await createRequest(), failureOp = approve(failure.id), target = newIdentity(`${failure.id}:video-node`);
  await pool.query(`CREATE FUNCTION fixture_reject_copy() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${target}' THEN RAISE EXCEPTION 'fixture injected repository failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fixture_failure BEFORE INSERT ON app_canvas_video_nodes FOR EACH ROW EXECUTE FUNCTION fixture_reject_copy()`);
  const beforeArts = await count("app_artworks"), beforeCreation = await count("app_creation_records"), beforeMedia = await count("app_media_assets"), beforeProjects = await count("app_canvas_video_projects");
  await fails(() => changeShare(author, enterprise, failure.id, failureOp));
  for (const [table, expected] of [["app_artworks", beforeArts], ["app_creation_records", beforeCreation], ["app_media_assets", beforeMedia], ["app_canvas_video_projects", beforeProjects]] as const) assert.equal(await count(table), expected);
  assert.equal((await getShare(recipient, enterprise, failure.id)).status, "requested");
  assert.equal(Number((await pool.query("SELECT count(*) n FROM app_canvas_share_media_staging WHERE state='staging'")).rows[0].n), 0);
  await pool.query("DROP TRIGGER fixture_failure ON app_canvas_video_nodes; DROP FUNCTION fixture_reject_copy()"); pass("injected native repository failure rolls back all project/node/creation/media writes and cleans staged bytes");
  const missing = await createRequest();
  await pool.query("UPDATE app_canvas_text_nodes SET source_ids='[\"foreign-private\"]' WHERE email=$1", [author]);
  await fails(() => changeShare(author, enterprise, missing.id, approve(missing.id)), "SHARE_DEPENDENCY_UNAVAILABLE");
  await pool.query("UPDATE app_canvas_text_nodes SET source_ids='[\"image-source\"]' WHERE email=$1", [author]);
  await pool.query("UPDATE app_canvas_video_nodes SET config=config||'{\"workflowTaskId\":\"private-task\"}'::jsonb WHERE email=$1", [author]);
  await fails(() => changeShare(author, enterprise, missing.id, approve(missing.id)), "SHARE_UNSUPPORTED_WORKFLOW");
  await pool.query("UPDATE app_canvas_video_nodes SET config=config-'workflowTaskId' WHERE email=$1", [author]);
  await pool.query("UPDATE app_creation_contexts SET tenant_id=$2 WHERE actor_email=$1 AND context_kind='project'", [author, otherEnterprise]);
  await fails(() => changeShare(author, enterprise, missing.id, approve(missing.id)), "SHARE_TENANT_MISMATCH");
  await pool.query("UPDATE app_creation_contexts SET tenant_id=$2 WHERE actor_email=$1 AND context_kind='project'", [author, enterprise]);
  pass("foreign dependencies/private execution workflows/source-tenant mismatch fail atomically without omitted nodes");
  await pool.query("UPDATE app_artworks SET image_url='http://127.0.0.1/private' WHERE email=$1 AND id='image-source'", [author]);
  await fails(() => changeShare(author, enterprise, missing.id, approve(missing.id)), "SHARE_UNMANAGED_MEDIA");
  await pool.query("UPDATE app_artworks SET image_url='/media/fixture/source.png' WHERE email=$1 AND id='image-source'", [author]);
  await pool.query("UPDATE app_canvas_video_nodes SET config=config||'{\"providerOptions\":{\"accessToken\":\"private\"}}'::jsonb WHERE email=$1", [author]);
  await fails(() => changeShare(author, enterprise, missing.id, approve(missing.id)), "SHARE_UNSUPPORTED_AUTHORITY");
  await pool.query("UPDATE app_canvas_video_nodes SET config=config||'{\"providerOptions\":{\"quality\":\"high\",\"seed\":42}}'::jsonb WHERE email=$1", [author]);
  assert.equal(outboundCalls, 0); pass("arbitrary URL/SSRF and embedded execution secrets rejected before network or copy writes");
  const single = await createRequest(), selected = await changeShare(author, enterprise, single.id, { ...approve(single.id), source: { projectKey, nodeIds: ["text-source"], kind: "workflow" } });
  const singleCopy = (await pool.query("SELECT id_map FROM app_canvas_share_copies WHERE share_id=$1", [single.id])).rows[0].id_map;
  assert.deepEqual(Object.keys(singleCopy).sort(), ["image-source", "text-source"]); assert.equal(selected.status, "approved");
  assert.equal((await sharp(await getSharePreview(recipient, enterprise, single.id)).metadata()).format, "png");
  pass("selected workflow copies only authorized node + required dependency; text-only selection previews raster layout without prompt JSON");
  const race = await createRequest(), concurrent = await Promise.allSettled([changeShare(author, enterprise, race.id, approve(race.id)), changeShare(author, enterprise, race.id, approve(race.id))]);
  assert.equal(concurrent.filter(r => r.status === "fulfilled").length, 1); assert.equal(Number((await pool.query("SELECT count(*) n FROM app_canvas_share_copies WHERE share_id=$1", [race.id])).rows[0].n), 1);
  pass("different operation concurrent CAS approvals produce one winner and one independent copy");
  const sourceRecord = randomUUID();
  await pool.query("INSERT INTO app_creation_records(id,actor_email,scope_kind,tenant_id,source_kind,source_id) VALUES($1,$2,'tenant',$3,'fixture-source',$1)", [sourceRecord, author, otherEnterprise]);
  await pool.query("INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email,relation) VALUES($1,'artwork','image-source',$2,'output')", [sourceRecord, author]);
  await fails(() => createShare(author, enterprise, { ...offerInput, operationId: randomUUID() }), "SHARE_TENANT_MISMATCH");
  await pool.query("DELETE FROM app_creation_links WHERE creation_id=$1", [sourceRecord]); await pool.query("DELETE FROM app_creation_records WHERE id=$1", [sourceRecord]);
  pass("immutable creation output tenant evidence blocks cross-enterprise sharing even when project context looks valid");
  const expires = await createRequest(), expireOp = approve(expires.id), expirePrep = await withCollaborationScope(author, enterprise, (tx, s) => prepareApprovalTx(tx, s, expires.id, expireOp)); assert.ok("snapshot" in expirePrep);
  const expireStage = await prepareMediaStaging(expires.id, expirePrep.snapshot); await copyStagedMedia(expireStage);
  await pool.query("UPDATE app_canvas_share_media_staging SET expires_at=now()-interval '1 second' WHERE attempt_id=$1", [expireStage.attemptId]);
  assert.equal(await cleanupExpiredShareMedia(), 1);
  await fails(() => withCollaborationScope(author, enterprise, (tx, s) => changeShareTx(tx, s, expires.id, expireOp, { prepared: expirePrep, stage: expireStage })), "SHARE_STAGE_EXPIRED");
  pass("expired crash-staging journal returns bytes and fences delayed finalization");
  const beforePages = (await pool.query("SELECT count(*) n FROM app_canvas_shares WHERE author_id=$1 AND enterprise_id=$2", [author, enterprise])).rows[0].n;
  await transaction(async tx => { for (let i = 0; i < 55; i++) await tx.query("INSERT INTO app_canvas_shares(id,enterprise_id,author_id,requester_id,status,title,kind,created_at) VALUES($1,$2,$3,$4,'requested','pagination','workflow','2099-01-01T00:00:00.123456Z')", [randomUUID(), enterprise, author, recipient]); });
  const seen = new Set<string>(); let cursor: string | null = null;
  do { const page = await listShares(author, enterprise, "sent", cursor); for (const item of page.items) { assert.equal(seen.has(item.id), false); seen.add(item.id); } cursor = page.nextCursor; } while (cursor);
  assert.equal(seen.size, Number(beforePages) + 55); pass("keyset pagination preserves PG microseconds and tied timestamp UUID order, no duplicates or skipped shares");
  const req = (method: string, body?: unknown, actor: string | null = author, origin = "http://fixture.local") => new Request(`http://fixture.local/api/collaboration/shares?enterpriseId=${enterprise}`, { method, headers: { ...(actor ? { "x-fixture-actor": actor } : {}), "content-type": "application/json", origin }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await sharesRoute.POST(req("POST", offerInput, null))).status, 401);
  assert.equal((await sharesRoute.POST(req("POST", offerInput, author, "https://evil.invalid"))).status, 403);
  assert.equal((await sharesRoute.POST(req("POST", { ...offerInput, unexpected: true }))).status, 400);
  const freshOffer = { ...offerInput, operationId: randomUUID() }, response = await sharesRoute.POST(req("POST", freshOffer)); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
  const httpShare = (await response.json()).share;
  const detail = await shareRoute.GET(req("GET", undefined, recipient), { params: Promise.resolve({ id: httpShare.id }) }); assert.equal(detail.status, 200); assert.equal((await detail.text()).includes("SECRET"), false);
  const pngResponse = await previewRoute.GET(req("GET", undefined, recipient), { params: Promise.resolve({ id: httpShare.id }) }); assert.equal(pngResponse.headers.get("content-type"), "image/png"); assert.equal((await sharp(Buffer.from(await pngResponse.arrayBuffer())).metadata()).format, "png");
  pass("real route Request/Response: auth 401, origin 403, validation 400, no-store and PNG-only preview; explicit enterprise-auth fixture");
  const previewBefore = await getSharePreview(recipient, enterprise, httpShare.id); assert.ok(previewBefore.length);
  await deleteCanvasProject(author, projectKey, randomUUID()); await deleteArtworksByIds(author, ["image-source", "video-source", "audio-source"]); await purgeArtworksByIds(author, ["image-source", "video-source", "audio-source"]);
  for (const key of mediaKeys) { await deleteImageByUrl(`/media/${key}`); await fails(() => readManagedObject(`/media/${key}`)); }
  for (const art of arts) {
    for (const url of [art.image, art.videoUrl].filter(Boolean) as string[]) { assert.equal(await canReadMedia(url.slice(7), recipient), true); assert.equal(await canReadMedia(url.slice(7), author), false); assert.ok((await readManagedObject(url)).bytes.length); }
  }
  assert.ok((await readManagedObject(versions.image)).bytes.length); assert.ok(await getVideoNode(recipient, video.id));
  pass("real source project deletion + hard artwork purge + storage deletion: recipient media/history still independently readable, author denied target media");
  const committed = (await pool.query("SELECT attempt_id,keys FROM app_canvas_share_media_staging WHERE state='committed'")).rows;
  assert.equal(committed.length, 3); assert.equal(await cleanupStagedMedia(committed[0].attempt_id), false); await cleanupExpiredShareMedia();
  const files = await readdir(MEDIA_DIR, { recursive: true });
  const cleaned = (await pool.query("SELECT keys FROM app_canvas_share_media_staging WHERE state='cleaned'")).rows;
  for (const row of cleaned) for (const key of row.keys) assert.equal(files.some(p => p.replaceAll("\\", "/") === key), false);
  assert.equal(pool.waitingCount, 0); assert.equal(pool.totalCount, pool.idleCount); pass("committed-media cleanup guard, failed/duplicate staged object removal and pool resource return");
  assert.equal(outboundCalls, 0);
  console.log(`MODIFIED=PASS checks=${checks} layers=real_pg+native_repository+local_storage+real_http_handlers external_enterprise_auth=fixture supplier_calls=0`);
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { await closeDatabasePools(); console.log("DATABASE_POOLS=CLOSED"); });
