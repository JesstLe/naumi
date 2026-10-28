import "server-only";
import type {PoolClient} from "pg";
import {getPool} from "@/platform/db/pool";
import {ModelConfigError} from "../model-config/types";
import {assertCreationInputsTx} from "../saas/creation-writer";
import {storageKeyFromManagedUrl} from "../object-storage/runtime";
import {verifiedOwnedMedia,inspectedOwnedMediaTx} from "../video/media-inspection";

export type AudioMaterial = {id: string; url: string; storageKey: string; sha256: string; duration: number};
export async function requireAudioMaterials(actor: string, ids: readonly string[], tx?: PoolClient): Promise<AudioMaterial[]> {
  const unique = [...new Set(ids)]; if (!unique.length) return [];
  try {
    const rows = (await (tx ?? getPool()).query(`SELECT id,status,category,video_url FROM app_artworks WHERE email=$1 AND id=ANY($2::text[]) AND deleted_at IS NULL${tx ? " FOR SHARE" : ""}`, [actor, unique])).rows;
    const byId = new Map(rows.map(row => [String(row.id), row]));
    const result: AudioMaterial[] = [];
    for (const id of unique) {
      const row = byId.get(id), key = storageKeyFromManagedUrl(row?.video_url || "");
      if (!row || row.status !== "completed" || row.category !== "audio" || !key) throw new ModelConfigError("AUDIO_REFERENCE_UNAVAILABLE", "音频不存在、尚未完成或无权访问", 404);
      const media = tx ? await inspectedOwnedMediaTx(tx, actor, key, id) : await verifiedOwnedMedia(actor, key, id);
      if (!media.mimeType.startsWith("audio/") || !media.probe.audioCodecs.length || media.probe.videoCodec || media.probe.durationSeconds <= 0) throw new ModelConfigError("AUDIO_REFERENCE_INVALID", "素材没有有效的独立音频流", 422);
      result.push({id, url: `/media/${key}`, storageKey: key, sha256: media.sha256, duration: media.probe.durationSeconds});
    }
    if (tx) await assertCreationInputsTx(tx, actor, unique);
    else {const client = await getPool().connect(); try {await assertCreationInputsTx(client, actor, unique);} finally {client.release();}}
    return result;
  } catch (error) {
    if (error instanceof Error && ["素材不存在或无权访问", "不能直接引用其他企业的素材"].includes(error.message)) throw new ModelConfigError("AUDIO_REFERENCE_UNAVAILABLE", error.message, 404);
    throw error;
  }
}
