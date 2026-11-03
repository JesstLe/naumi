import "server-only";
import type { PoolClient } from "pg";
import { writeCopiedImagePromptTx } from "../canvas/image-prompt-repository";
import { remapImagePromptDocument } from "../canvas/image-prompt-schema";
import { saveVideoNodeTx } from "../canvas/video-node-repository";
import { saveDirectorNodeTx } from "../canvas/director-node-repository";
import { saveCharacterNodeTx } from "../canvas/character-node-repository";
import { saveSceneNodeTx } from "../canvas/scene-node-repository";
import { saveAudioNodeTx } from "../canvas/audio-node-repository";
import { saveTimelineNodeTx } from "../canvas/timeline-node-repository";
import { insertSharedArtworkTx, insertSharedTextTx } from "../canvas/sharing-repository";
import { acceptCreationTx, creationLinkTx, completeCreationTx } from "../saas/creation-writer";
import { storageKeyFromManagedUrl } from "../storage";
import { fail, newIdentity, newOperation } from "./domain";
import { parseReference, type ShareSnapshot } from "./snapshot";
import { storageDriver, type StagedMedia } from "./media";

/** Caller owns the authorized transaction. No connections, storage I/O, generation or billing here. */
export async function createShareCopyTx(tx: PoolClient, shareId: string, recipient: string, enterpriseId: string, snapshot: ShareSnapshot, stage: StagedMedia) {
  const prior = (await tx.query("SELECT project_key FROM app_canvas_share_copies WHERE share_id=$1", [shareId])).rows[0];
  if (prior) return String(prior.project_key);
  const staged = (await tx.query("SELECT state,share_id,keys,expires_at FROM app_canvas_share_media_staging WHERE attempt_id=$1 FOR UPDATE", [stage.attemptId])).rows[0];
  if (!staged || staged.state !== "staging" || staged.share_id !== shareId || new Date(staged.expires_at).getTime() < Date.now() || JSON.stringify(staged.keys) !== JSON.stringify(stage.media.map(m => m.targetKey))) fail("SHARE_STAGE_EXPIRED", "素材复制已过期，请重新批准");
  const mapping = new Map(snapshot.nodes.map(node => [node.id, newIdentity(`${shareId}:${node.id}`)]));
  const key = `tree:${newIdentity(`project:${shareId}`)}`, nodes = new Map(snapshot.nodes.map(n => [n.id, n]));
  const remap = (id: string) => { const result = mapping.get(id); if (!result) fail("SHARE_REFERENCE_MISSING", "分享依赖未完整冻结", 422); return result; };
  const ref = (value: string) => {
    const p = parseReference(value); if (p.inline) return `inline:${newIdentity(`${shareId}:${value}`)}`;
    const n = nodes.get(p.id);
    if ((p.prefix === "audio-node:" || p.prefix === "timeline-node:") && n?.data.completed_artwork)
      return `${p.prefix === "audio-node:" ? "audio" : "video"}:${remap(n.data.completed_artwork)}`;
    return `${p.prefix}${remap(p.id)}${p.suffix}`;
  };
  const url = (value: string | null) => {
    if (!value) return value; const sourceKey = storageKeyFromManagedUrl(value), media = stage.media.find(m => m.key === sourceKey);
    if (!media) fail("SHARE_MEDIA_MISSING", "分享素材未完整复制", 422); return `/media/${media.targetKey}`;
  };
  // Canonical account/graph order is shared with the snapshot loader and native copy.
  await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [recipient]);
  await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`video-node-graph:${recipient}`]);
  await tx.query("INSERT INTO app_canvas_video_projects(email,project_key) VALUES($1,$2)", [recipient, key]);
  await tx.query("INSERT INTO app_project_names(email,key,name) VALUES($1,$2,$3)", [recipient, key, snapshot.title]);
  for (const media of stage.media) {
    await tx.query(`INSERT INTO app_media_assets(key,owner,public,driver,remote_ready,content_type,sha256,bytes) VALUES($1,$2,false,$3,$4,$5,$6,$7)`, [media.targetKey, recipient, storageDriver, media.remoteReady, media.mime, media.sha256, media.bytes]);
    if (media.probe) await tx.query("INSERT INTO app_video_media_probes(storage_key,sha256,probe,decoder_version) VALUES($1,$2,$3::jsonb,1)", [media.targetKey, media.sha256, JSON.stringify(media.probe)]);
    await tx.query("INSERT INTO app_creation_contexts(actor_email,context_kind,context_id,scope_kind,tenant_id) VALUES($1,'media',$2,'tenant',$3)", [recipient, `/media/${media.targetKey}`, enterpriseId]);
  }
  const creation = await acceptCreationTx(tx, "canvas-copy", shareId, recipient, {}, { actorEmail: recipient, scopeKind: "tenant", tenantId: enterpriseId, parentContext: key, requestText: snapshot.title });
  if (!creation) throw new Error("分享副本创作记录未形成");
  const artworks: string[] = [];
  for (const node of snapshot.nodes) {
    const d = structuredClone(node.data), id = remap(node.id), base = { id, operationId: newOperation(`${shareId}:${node.id}`), expectedRevision: 0, title: d.title, x: d.x, y: d.y, width: d.width, height: d.height };
    switch (node.kind) {
      case "artwork": {
        d.image_url = url(d.image_url); d.video_url = url(d.video_url); d.parent_id = d.parent_id ? remap(d.parent_id) : null; d.parent_ids = d.parent_ids.map(remap);
        d.canvas_group_id = d.canvas_group_id ? newIdentity(`${shareId}:group:${d.canvas_group_id}`) : null;
        if (d.canvas_image_version) d.canvas_image_version = { ...d.canvas_image_version, id: d.canvas_image_version.id === "initial" ? "initial" : newIdentity(`${shareId}:version:${node.id}:${d.canvas_image_version.id}`), image: url(d.canvas_image_version.image) };
        await insertSharedArtworkTx(tx, recipient, id, key, d); artworks.push(id);
        for (const v of node.versions || []) await tx.query("INSERT INTO app_canvas_image_versions(email,node_id,version_id,asset) VALUES($1,$2,$3,$4::jsonb)", [recipient, id, v.id === "initial" ? "initial" : newIdentity(`${shareId}:version:${node.id}:${v.id}`), JSON.stringify({ ...v.asset, image: url(v.asset.image) })]);
        break;
      }
      case "text": d.source_ids = d.source_ids.map(ref); d.product_ids = d.product_ids.map(ref); d.target_ids = d.target_ids.filter((v: string) => mapping.has(parseReference(v).id)).map(ref); await insertSharedTextTx(tx, recipient, id, key, d); break;
      case "video": {
        const reference = (r: Record<string, any>) => ({ ...r, id: newIdentity(`${shareId}:reference:${node.id}:${r.id}`), ...(r.artworkId ? { artworkId: remap(r.artworkId) } : {}), ...(r.url ? { url: url(r.url) } : {}), ...(r.storageKey ? { storageKey: url(`/media/${r.storageKey}`)!.slice(7) } : {}) });
        const config = { ...d.config, ...(d.config.references ? { references: d.config.references.map(reference) } : {}),
          ...(d.config.elements ? { elements: d.config.elements.map((e: any) => ({ ...e, ...(e.id ? { id: newIdentity(`${shareId}:element:${node.id}:${e.id}`) } : {}), references: e.references.map(reference) })) } : {}),
          ...(d.config.shots ? { shots: d.config.shots.map((s: any) => ({ ...s, ...(s.id ? { id: newIdentity(`${shareId}:shot:${node.id}:${s.id}`) } : {}), ...(s.textNodeId ? { textNodeId: ref(s.textNodeId) } : {}) })) } : {}) };
        await saveVideoNodeTx(tx, recipient, { ...base, config, inputs: d.inputs.map((r: any) => ({ ...r, id: newIdentity(`${shareId}:reference:${node.id}:${r.id}`), nodeId: ref(r.nodeId), value: r.kind === "text" ? r.value : url(r.value) })) }, key);
        if (d.result_id) await tx.query("UPDATE app_canvas_video_nodes SET display_result_id=$3 WHERE email=$1 AND id=$2", [recipient, id, remap(d.result_id)]); break;
      }
      case "director": {
        const p = d.project, inner = (v: string) => newIdentity(`${shareId}:director:${node.id}:${v}`);
        p.entities = p.entities.map((e: any) => ({ ...e, id: inner(e.id) })); p.cameras = p.cameras.map((c: any) => ({ ...c, id: inner(c.id) })); p.activeCameraId = inner(p.activeCameraId);
        p.keyframes = p.keyframes.map((f: any) => ({ ...f, id: inner(f.id), cameraId: inner(f.cameraId), entities: f.entities.map((e: any) => ({ ...e, id: inner(e.id) })) }));
        if (p.panoramaArtworkId) p.panoramaArtworkId = remap(p.panoramaArtworkId);
        if (p.sceneReference) {
          const s = p.sceneReference, original = nodes.get(s.sceneId), matches = original?.kind === "scene" && original.data.scene.states.some((state: any) => state.id === s.stateId && JSON.stringify(state.referenceArtworkIds) === JSON.stringify(s.referenceArtworkIds));
          // Saved director snapshots are self-contained in the native service. Historical/removed scene identity is namespaced,
          // not rebound to a different live scene; later director edits preserve this exact frozen snapshot.
          p.sceneReference = { ...s, sceneId: matches ? remap(s.sceneId) : newIdentity(`${shareId}:frozen-scene:${node.id}:${s.sceneId}:${s.revision}`), revision: matches ? 1 : s.revision,
            referenceArtworkIds: s.referenceArtworkIds.map(remap), background: s.background ? { ...s.background, artworkId: remap(s.background.artworkId) } : null };
        }
        await saveDirectorNodeTx(tx, recipient, { ...base, project: p }, key);
        await tx.query("UPDATE app_canvas_director_nodes SET outputs=$3::jsonb WHERE email=$1 AND id=$2", [recipient, id, JSON.stringify(d.outputs.map((o: any) => ({ ...o, artworkId: remap(o.artworkId) })))]); break;
      }
      case "character": for (const a of d.character.appearances) a.referenceArtworkIds = a.referenceArtworkIds.map(remap); await saveCharacterNodeTx(tx, recipient, { ...base, character: d.character }, key); break;
      case "scene": for (const s of d.scene.states) { s.referenceArtworkIds = s.referenceArtworkIds.map(remap); if (s.background) s.background.artworkId = remap(s.background.artworkId); } await saveSceneNodeTx(tx, recipient, { ...base, scene: d.scene }, key); break;
      case "audio": {
        const a = d.audio; if (a.sourceArtworkId) a.sourceArtworkId = remap(a.sourceArtworkId);
        if (a.adopted) { a.adopted.artworkId = remap(a.adopted.artworkId); a.adopted.sourceArtworkId = remap(a.adopted.sourceArtworkId); }
        await saveAudioNodeTx(tx, recipient, { ...base, audio: a }, key); break;
      }
      case "timeline": {
        const p = d.timeline; for (const t of p.tracks) { t.id = newIdentity(`${shareId}:track:${node.id}:${t.id}`); for (const c of t.clips) {
          c.id = newIdentity(`${shareId}:clip:${node.id}:${c.id}`); c.artworkId = remap(c.artworkId);
          if (c.canvasSourceId && mapping.has(parseReference(c.canvasSourceId).id)) c.canvasSourceId = ref(c.canvasSourceId);
          else delete c.canvasSourceId;
        } }
        await saveTimelineNodeTx(tx, recipient, { ...base, timeline: p, adopted: null }, key); break;
      }
    }
    if (node.imagePrompt) {
      if(node.imagePrompt.activeKeys.some(key=>!mapping.has(key.slice(5))))fail("SHARE_REFERENCE_MISSING","分享引用未完整冻结",422);
      await writeCopiedImagePromptTx(tx,recipient,id,key,remapImagePromptDocument(node.imagePrompt,mapping,{detached:snapshot.source.kind==="artwork"}),{scopeKind:"tenant",tenantId:enterpriseId});
    }
    if (node.settings) await tx.query("INSERT INTO app_canvas_node_settings(email,node_id,kind,settings) VALUES($1,$2,$3,$4::jsonb)", [recipient, id, node.kind === "text" ? "text" : "image", JSON.stringify(node.settings)]);
    await creationLinkTx(tx, creation, recipient, node.kind === "artwork" ? "artwork" : `${node.kind}-node`, id, "output");
    if (node.kind === "artwork") await tx.query("INSERT INTO app_creation_contexts(actor_email,context_kind,context_id,scope_kind,tenant_id) VALUES($1,'media',$2,'tenant',$3)", [recipient, id, enterpriseId]);
  }
  await completeCreationTx(tx, creation, recipient, "succeeded", { artworkIds: artworks, summary: "授权副本已创建（未执行生成）" });
  await tx.query("INSERT INTO app_canvas_share_copies(share_id,recipient_id,project_key,snapshot_digest,id_map) VALUES($1,$2,$3,$4,$5::jsonb)", [shareId, recipient, key, snapshot.digest, JSON.stringify(Object.fromEntries(mapping))]);
  await tx.query("UPDATE app_canvas_share_media_staging SET state='committed',updated_at=now() WHERE attempt_id=$1", [stage.attemptId]);
  return key;
}
