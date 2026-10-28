import "server-only";
import {ensureCanvasImageVersions,selectCanvasImageVersionTx} from "./canvas/image-version-store";
import { z } from "zod";
import { createHash } from "node:crypto";
import { getPool, ensureSchema,listArtworksByIds } from "@/lib/db";
import {verifiedOwnedMedia} from "@/lib/video/media-inspection";
import {storageKeyFromManagedUrl} from "@/lib/storage";
import { nodeSettingsSchema } from "@/lib/canvas/node-settings";
import { ensureCanvasSettingsSchema } from "@/lib/canvas-node-settings-store";
import {videoNodeWriteSchema} from "@/lib/canvas/video-node-schema";
import {ensureVideoNodeSchema,saveVideoNodeTx} from "@/lib/canvas/video-node-repository";
import {authorizeNodeInputs} from "@/lib/canvas/video-node-service";
import {directorNodeWriteSchema} from "@/lib/canvas/director-node-schema";
import {ensureDirectorNodeSchema,saveDirectorNodeTx} from "@/lib/canvas/director-node-repository";
import {assertCreationProjectInput} from "@/lib/saas/creation-context";
import {characterNodeWriteSchema} from "@/lib/canvas/character-node-schema";
import {ensureCharacterNodeSchema,saveCharacterNodeTx} from "@/lib/canvas/character-node-repository";
import {sceneNodeWriteSchema} from "./canvas/scene-node-schema";
import {ensureSceneNodeSchema,saveSceneNodeTx} from "./canvas/scene-node-repository";
import {lockSceneImagesTx} from "./canvas/scene-references";
import {audioNodeWriteSchema} from "./canvas/audio-node-schema";
import {ensureAudioNodeSchema,saveAudioNodeTx} from "./canvas/audio-node-repository";
import {validateAudioProject} from "./canvas/audio-project-validation";
import {requireVisualImages} from "./canvas/visual-images";
import {lockCharacterImagesTx} from "@/lib/canvas/character-references";

import {timelineNodeWriteSchema} from "./canvas/timeline-node-schema";
import {ensureTimelineNodeSchema,saveTimelineNodeTx} from "./canvas/timeline-node-repository";
import {validateTimelineProject,validateTimelineAdoption} from "./canvas/timeline-project-validation";

const id = z.string().min(1).max(200);
const coordinate = z.number().finite().min(-1e7).max(1e7);
const textFields = z.object({
  title: z.string().max(80), prompt: z.string().max(4000).optional(), content: z.string().max(20000),
  sourceIds: z.array(id).max(200), targetIds: z.array(id).max(200), productIds: z.array(id).max(200),
  width: z.number().min(8).max(4096), height: z.number().min(8).max(100000),
});
const textNode = textFields.extend({ id, prompt: z.string().max(4000), projectKey: id, canvasX: coordinate, canvasY: coordinate,
  status: z.enum(["idle", "generating", "completed", "failed"]), createdAt: z.string().datetime(),
});
export const videoHistoryFields=videoNodeWriteSchema.omit({id:true,projectKey:true,expectedRevision:true,operationId:true,deleted:true});
export const directorHistoryFields=directorNodeWriteSchema.omit({id:true,projectKey:true,expectedRevision:true,operationId:true,deleted:true});
export const characterHistoryFields=characterNodeWriteSchema.omit({id:true,projectKey:true,expectedRevision:true,operationId:true,deleted:true});
export const timelineHistoryFields=timelineNodeWriteSchema.omit({id:true,projectKey:true,expectedRevision:true,operationId:true,deleted:true});
export const audioHistoryFields=audioNodeWriteSchema.omit({id:true,projectKey:true,expectedRevision:true,operationId:true,deleted:true});
export const sceneHistoryFields=sceneNodeWriteSchema.omit({id:true,projectKey:true,expectedRevision:true,operationId:true,deleted:true});
export const historyRequest = z.object({
  operationId: z.string().uuid(),
  operations: z.array(z.discriminatedUnion("type", [
    z.object({ type: z.literal("visibility"), id, visible: z.boolean() }),
    z.object({ type: z.literal("text-restore"), node: textNode }),
    z.object({ type: z.literal("text-delete"), id }),
    z.object({ type: z.literal("video-visibility"), id, visible:z.boolean() }),
    z.object({ type: z.literal("video-patch"), id, expectedRevision:z.number().int().nonnegative(), fields:videoHistoryFields }),
    z.object({ type: z.literal("director-visibility"), id, visible:z.boolean() }),
    z.object({ type: z.literal("director-patch"), id, expectedRevision:z.number().int().nonnegative(), fields:directorHistoryFields }),
    z.object({ type: z.literal("character-visibility"), id, visible:z.boolean() }),
    z.object({ type: z.literal("character-patch"), id, expectedRevision:z.number().int().nonnegative(), fields:characterHistoryFields }),
    z.object({type:z.literal("timeline-visibility"),id,visible:z.boolean()}),
    z.object({type:z.literal("timeline-patch"),id,expectedRevision:z.number().int().nonnegative(),fields:timelineHistoryFields}),
    z.object({ type: z.literal("audio-visibility"), id, visible:z.boolean() }),
    z.object({ type: z.literal("audio-patch"), id, expectedRevision:z.number().int().nonnegative(), fields:audioHistoryFields }),
    z.object({ type: z.literal("scene-visibility"), id, visible:z.boolean() }),
    z.object({ type: z.literal("scene-patch"), id, expectedRevision:z.number().int().nonnegative(), fields:sceneHistoryFields }),
    z.object({ type: z.literal("video-result"),id,expectedRevision:z.number().int().nonnegative(),artworkId:id.nullable(),expectedArtworkId:id.nullable().optional() }),
    z.object({ type: z.literal("position"), id, text: z.boolean(), x: coordinate, y: coordinate }),
    z.object({ type: z.literal("group"), id, value: id.nullable() }),
    z.object({ type: z.literal("parent"), id, parentId: id, add: z.boolean() }),
    z.object({ type: z.literal("text-patch"), id, fields: textFields }),
    z.object({ type: z.literal("rename"), id, title: z.string().max(80) }),
    z.object({ type: z.literal("size"), id, x: coordinate, y: coordinate, width: z.number().min(80).max(4096), height: z.number().min(80).max(4096) }),
    z.object({ type: z.literal("mark"), id, marked: z.boolean() }),
    z.object({ type: z.literal("node-settings"), id, text: z.boolean(), video:z.boolean().optional(), director:z.boolean().optional(), character:z.boolean().optional(), scene:z.boolean().optional(), audio:z.boolean().optional(), timeline:z.boolean().optional(), settings: nodeSettingsSchema }),
    z.object({ type: z.literal("workflow-asset"), id, assetOperationId: z.string().uuid(), filled: z.boolean() }),
    z.object({type:z.literal("image-version"),id,versionId:id,expectedRevision:z.number().int().nonnegative(),expectedImage:z.string().min(1).max(4096)}),
  ])).min(1).max(400),
});

/** A whole history step commits once, including mixed image/text operations. */
export async function saveCanvasHistory(email: string, input: z.infer<typeof historyRequest>) {
  email=email.toLowerCase();
  await ensureSchema();
  if(input.operations.some(op=>op.type==="image-version"))await ensureCanvasImageVersions();
  const hasVideo=input.operations.some(op=>op.type==="video-patch"||op.type==="video-visibility"||op.type==="video-result"||op.type==="node-settings"&&op.video);
  if(hasVideo)await ensureVideoNodeSchema();
  const hasDirector=input.operations.some(op=>op.type==="director-patch"||op.type==="director-visibility"||op.type==="node-settings"&&op.director);
  if(hasDirector)await ensureDirectorNodeSchema();
  const hasCharacter=input.operations.some(op=>op.type==="character-patch"||op.type==="character-visibility"||op.type==="node-settings"&&op.character);
  if(hasCharacter)await ensureCharacterNodeSchema();
  const hasTimeline=input.operations.some(op=>op.type==="timeline-patch"||op.type==="timeline-visibility"||op.type==="node-settings"&&op.timeline);
  if(hasTimeline)await ensureTimelineNodeSchema();
  const hasAudio=input.operations.some(op=>op.type==="audio-patch"||op.type==="audio-visibility"||op.type==="node-settings"&&op.audio);
  if(hasAudio)await ensureAudioNodeSchema();
  const hasScene=input.operations.some(op=>op.type==="scene-patch"||op.type==="scene-visibility"||op.type==="node-settings"&&op.scene);
  if(hasScene)await ensureSceneNodeSchema();
  if (input.operations.some(op => op.type === "node-settings")) await ensureCanvasSettingsSchema();
  if (input.operations.some(op => op.type === "workflow-asset")) await (await import("@/lib/canvas-workflow-import")).ensureWorkflowImportSchema();
  const fingerprint = createHash("sha256").update(JSON.stringify(input.operations)).digest("hex");
  const verifiedResults=new Map<string,string>();
  if(input.operations.some(op=>op.type==="video-result")){
    // Replay first, even if a previously accepted input has since been removed. Media I/O never holds a transaction connection.
    const previous=(await getPool().query("SELECT fingerprint FROM app_canvas_history_ops WHERE email=$1 AND id=$2",[email,input.operationId])).rows[0];
    if(previous){if(previous.fingerprint!==fingerprint)throw new Error("操作编号已使用");return;}
    for(const op of input.operations){if(op.type!=="video-result"||!op.artworkId||verifiedResults.has(op.artworkId))continue;
      const art=(await listArtworksByIds(email,[op.artworkId]))[0],key=storageKeyFromManagedUrl(art?.videoUrl||"");if(!art||art.status!=="completed"||!key)throw new Error("视频素材不存在或无权访问");
      const media=await verifiedOwnedMedia(email,key,art.id);if(!media.mimeType.startsWith("video/"))throw new Error("请选择真实视频素材");verifiedResults.set(art.id,art.videoUrl!);
    }
  }
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // Serialize steps per owner, including concurrent retries of one request.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [email]);
    const previous = await client.query("SELECT fingerprint FROM app_canvas_history_ops WHERE email=$1 AND id=$2", [email,input.operationId]);
    if (previous.rows.length) {
      if (previous.rows[0].fingerprint !== fingerprint) throw new Error("操作编号已使用");
      await client.query("COMMIT"); return;
    }
    if(hasVideo||hasDirector||hasCharacter||hasScene||hasAudio||hasTimeline)await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`video-node-graph:${email}`]);
    const changedCharacters=new Set<string>(),changedScenes=new Set<string>(),changedTimelines=new Set<string>(),changedAudios=new Set<string>(),changedDirectors=new Set<string>();
    for (const [index,op] of input.operations.entries()) {
      if(op.type==="timeline-patch"||op.type==="timeline-visibility"){
        const row=(await client.query("SELECT revision,project_key,timeline FROM app_canvas_timeline_nodes WHERE email=$1 AND id=$2 FOR UPDATE",[email,op.id])).rows[0];
        if(!row)throw new Error("多轨不存在或无权修改");
        await assertCreationProjectInput(email,String(row.project_key),client);
        const bytes=createHash("sha256").update(`timeline:${input.operationId}:${index}:${op.id}`).digest().subarray(0,16);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=bytes.toString("hex");
        const operationId=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
        const write=timelineNodeWriteSchema.parse({id:op.id,expectedRevision:op.type==="timeline-patch"?op.expectedRevision:Number(row.revision),operationId,...(op.type==="timeline-patch"?op.fields:{deleted:!op.visible})});
        await saveTimelineNodeTx(client,email,write,String(row.project_key));changedTimelines.add(op.id);continue;
      }
      if(op.type==="audio-patch"||op.type==="audio-visibility"){
        const row=(await client.query("SELECT revision,project_key,audio FROM app_canvas_audio_nodes WHERE email=$1 AND id=$2 FOR UPDATE",[email,op.id])).rows[0];
        if(!row)throw new Error("音频不存在或无权修改");
        await assertCreationProjectInput(email,String(row.project_key));
        const bytes=createHash("sha256").update(`audio:${input.operationId}:${index}:${op.id}`).digest().subarray(0,16);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=bytes.toString("hex");
        const operationId=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
        const write=audioNodeWriteSchema.parse({id:op.id,expectedRevision:op.type==="audio-patch"?op.expectedRevision:Number(row.revision),operationId,...(op.type==="audio-patch"?op.fields:{deleted:!op.visible})});
        await saveAudioNodeTx(client,email,write,String(row.project_key));changedAudios.add(op.id);continue;
      }
      if(op.type==="image-version"){await selectCanvasImageVersionTx(client,email,op.id,op.versionId,op.expectedImage,op.expectedRevision);continue;}
      if(op.type==="scene-patch"||op.type==="scene-visibility"){
        const row=(await client.query("SELECT revision,project_key,scene FROM app_canvas_scene_nodes WHERE email=$1 AND id=$2 FOR UPDATE",[email,op.id])).rows[0];
        if(!row)throw new Error("场景不存在或无权修改");
        await assertCreationProjectInput(email,String(row.project_key));
        const bytes=createHash("sha256").update(`scene:${input.operationId}:${index}:${op.id}`).digest().subarray(0,16);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=bytes.toString("hex");
        const operationId=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
        const write=sceneNodeWriteSchema.parse({id:op.id,expectedRevision:op.type==="scene-patch"?op.expectedRevision:Number(row.revision),operationId,...(op.type==="scene-patch"?op.fields:{deleted:!op.visible})});
        await saveSceneNodeTx(client,email,write,String(row.project_key));changedScenes.add(op.id);continue;
      }
      if(op.type==="character-patch"||op.type==="character-visibility"){
        const row=(await client.query("SELECT revision,project_key,character FROM app_canvas_character_nodes WHERE email=$1 AND id=$2 FOR UPDATE",[email,op.id])).rows[0];
        if(!row)throw new Error("角色不存在或无权修改");
        await assertCreationProjectInput(email,String(row.project_key));
        const bytes=createHash("sha256").update(`character:${input.operationId}:${index}:${op.id}`).digest().subarray(0,16);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=bytes.toString("hex");
        const operationId=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
        const write=characterNodeWriteSchema.parse({id:op.id,expectedRevision:op.type==="character-patch"?op.expectedRevision:Number(row.revision),operationId,...(op.type==="character-patch"?op.fields:{deleted:!op.visible})});
        await saveCharacterNodeTx(client,email,write,String(row.project_key));changedCharacters.add(op.id);continue;
      }
      if(op.type==="director-patch"||op.type==="director-visibility"){
        const row=(await client.query("SELECT revision,project_key FROM app_canvas_director_nodes WHERE email=$1 AND id=$2 FOR UPDATE",[email,op.id])).rows[0];
        if(!row)throw new Error("导演节点不存在或无权修改");
        await assertCreationProjectInput(email,String(row.project_key));
        const digest=createHash("sha256").update(`director:${input.operationId}:${index}:${op.id}`).digest().subarray(0,16);digest[6]=(digest[6]&15)|64;digest[8]=(digest[8]&63)|128;const hex=digest.toString("hex");
        const operationId=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
        const write=directorNodeWriteSchema.parse({id:op.id,expectedRevision:op.type==="director-patch"?op.expectedRevision:Number(row.revision),operationId,...(op.type==="director-patch"?op.fields:{deleted:!op.visible})});
        await saveDirectorNodeTx(client,email,write,String(row.project_key));changedDirectors.add(op.id);continue;
      }
      if(op.type==="video-result"){
        const node=(await client.query("SELECT revision,display_result_id,deleted_at FROM app_canvas_video_nodes WHERE email=$1 AND id=$2 FOR UPDATE",[email,op.id])).rows[0];if(!node||node.deleted_at)throw new Error("视频节点不存在或无权修改");if(Number(node.revision)!==op.expectedRevision||op.expectedArtworkId!==undefined&&(node.display_result_id||null)!==op.expectedArtworkId)throw new Error("视频节点已更新，请重新选择结果");
        if(op.artworkId){const art=(await client.query("SELECT video_url,status,deleted_at FROM app_artworks WHERE email=$1 AND id=$2 FOR SHARE",[email,op.artworkId])).rows[0];if(!art||art.deleted_at||art.status!=="completed"||art.video_url!==verifiedResults.get(op.artworkId))throw new Error("视频素材已删除或改变");}
        await client.query("UPDATE app_canvas_video_nodes SET display_result_id=$3,revision=revision+1,updated_at=now() WHERE email=$1 AND id=$2",[email,op.id,op.artworkId]);continue;
      }
      if(op.type==="video-patch"||op.type==="video-visibility"){
        const row=(await client.query("SELECT revision,project_key FROM app_canvas_video_nodes WHERE email=$1 AND id=$2 FOR UPDATE",[email,op.id])).rows[0];
        if(!row)throw new Error("视频节点不存在或无权修改");
        const digest=createHash("sha256").update(`${input.operationId}:${index}:${op.id}`).digest().subarray(0,16);digest[6]=(digest[6]&15)|64;digest[8]=(digest[8]&63)|128;const hex=digest.toString("hex");
        const operationId=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
        const write=videoNodeWriteSchema.parse({id:op.id,expectedRevision:op.type==="video-patch"?op.expectedRevision:Number(row.revision),operationId,...(op.type==="video-patch"?op.fields:{deleted:!op.visible})});
        // Identity authorization applies to supplied changes. Visibility restores the owned durable record, never a client snapshot.
        if(op.type==="video-patch")await authorizeNodeInputs(email,write);
        await saveVideoNodeTx(client,email,write,String(row.project_key));continue;
      }
      if (op.type === "text-restore") {
        const n = op.node;
        const result = await client.query(`INSERT INTO app_canvas_text_nodes(id,email,project_key,title,prompt,content,status,canvas_x,canvas_y,canvas_width,canvas_height,created_at,source_ids,target_ids,product_ids)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb)
          ON CONFLICT(id) DO UPDATE SET project_key=EXCLUDED.project_key,title=EXCLUDED.title,prompt=EXCLUDED.prompt,content=EXCLUDED.content,status=EXCLUDED.status,
          canvas_x=EXCLUDED.canvas_x,canvas_y=EXCLUDED.canvas_y,canvas_width=EXCLUDED.canvas_width,canvas_height=EXCLUDED.canvas_height,
          source_ids=EXCLUDED.source_ids,target_ids=EXCLUDED.target_ids,product_ids=EXCLUDED.product_ids,updated_at=now()
          WHERE app_canvas_text_nodes.email=EXCLUDED.email`, [n.id,email,n.projectKey,n.title,n.prompt,n.content,n.status,n.canvasX,n.canvasY,n.width,n.height,n.createdAt,JSON.stringify(n.sourceIds),JSON.stringify(n.targetIds),JSON.stringify(n.productIds)]);
        if (!result.rowCount) throw new Error("文字节点不存在或无权修改");
        continue;
      }
      const text = op.type === "text-delete" || op.type === "text-patch" || ((op.type === "position" || op.type === "node-settings") && op.text);
      const video=op.type==="node-settings"&&op.video===true;
      const table = text ? "app_canvas_text_nodes" : video?"app_canvas_video_nodes":op.type==="node-settings"&&op.director?"app_canvas_director_nodes":op.type==="node-settings"&&op.character?"app_canvas_character_nodes":op.type==="node-settings"&&op.scene?"app_canvas_scene_nodes":op.type==="node-settings"&&op.timeline?"app_canvas_timeline_nodes":op.type==="node-settings"&&op.audio?"app_canvas_audio_nodes":"app_artworks";
      const owned = await client.query(`SELECT * FROM ${table} WHERE email=$1 AND id=$2 FOR UPDATE`, [email,op.id]);
      if (!owned.rows.length) throw new Error("节点不存在或无权修改，请刷新画布");
      const row = owned.rows[0];
      if(op.type==="node-settings"&&op.director)await assertCreationProjectInput(email,String(row.project_key));
      if(op.type==="node-settings"&&(op.character||op.scene||op.audio))await assertCreationProjectInput(email,String(row.project_key));
      if(op.type==="node-settings"&&op.timeline)await assertCreationProjectInput(email,String(row.project_key),client);
      if (op.type === "workflow-asset") {
        const versions = await client.query("SELECT before_asset,after_asset FROM app_canvas_workflow_asset_ops WHERE email=$1 AND id=$2 AND node_id=$3", [email,op.assetOperationId,op.id]);
        const version = versions.rows[0];
        if (!version || row.deleted_at || ![version.before_asset.image,version.after_asset.image].includes(row.image_url)) throw new Error("补图版本已改变，请刷新画布");
        const asset = op.filled ? version.after_asset : version.before_asset;
        await client.query("UPDATE app_artworks SET image_url=$3,source_url=$4,image_width=$5,image_height=$6 WHERE email=$1 AND id=$2", [email,op.id,asset.image,asset.source,asset.width,asset.height]);
        continue;
      }
      if (op.type === "node-settings") {
        if (!text && row.deleted_at) throw new Error("节点已删除，请刷新画布");
        await client.query(`INSERT INTO app_canvas_node_settings(email,node_id,kind,settings) VALUES($1,$2,$3,$4::jsonb)
          ON CONFLICT(email,node_id) DO UPDATE SET kind=EXCLUDED.kind,settings=EXCLUDED.settings,updated_at=now()`,
          [email,op.id,op.text ? "text" : "image",JSON.stringify(op.settings)]);
        continue;
      }
      if (op.type === "visibility") await client.query("UPDATE app_artworks SET deleted_at=CASE WHEN $3 THEN NULL ELSE now() END WHERE email=$1 AND id=$2",[email,op.id,op.visible]);
      else if (op.type === "text-delete") await client.query("DELETE FROM app_canvas_text_nodes WHERE email=$1 AND id=$2",[email,op.id]);
      else if (op.type === "position") await client.query(`UPDATE ${table} SET canvas_x=$3,canvas_y=$4 WHERE email=$1 AND id=$2`,[email,op.id,op.x,op.y]);
      else if (op.type === "rename") await client.query("UPDATE app_artworks SET title=$3 WHERE email=$1 AND id=$2",[email,op.id,op.title]);
      else if (op.type === "size") await client.query("UPDATE app_artworks SET canvas_x=$3,canvas_y=$4,canvas_width=$5,canvas_height=$6 WHERE email=$1 AND id=$2",[email,op.id,op.x,op.y,op.width,op.height]);
      else if (op.type === "mark") await client.query("UPDATE app_artworks SET marked=$3 WHERE email=$1 AND id=$2",[email,op.id,op.marked]);
      else if (op.type === "group") {
        if (op.value) {
          const other = await client.query("SELECT 1 FROM app_artworks WHERE email=$1 AND canvas_group_id=$2 AND group_id IS DISTINCT FROM $3 AND deleted_at IS NULL",[email,op.value,row.group_id]);
          if (other.rows.length) throw new Error("不能跨项目成组");
        }
        await client.query("UPDATE app_artworks SET canvas_group_id=$3 WHERE email=$1 AND id=$2",[email,op.id,op.value]);
      } else if (op.type === "text-patch") {
        const f=op.fields;
        await client.query(`UPDATE app_canvas_text_nodes SET title=$3,prompt=COALESCE($4,prompt),content=$5,source_ids=$6::jsonb,target_ids=$7::jsonb,product_ids=$8::jsonb,canvas_width=$9,canvas_height=$10,updated_at=now() WHERE email=$1 AND id=$2`,[email,op.id,f.title,f.prompt,f.content,JSON.stringify(f.sourceIds),JSON.stringify(f.targetIds),JSON.stringify(f.productIds),f.width,f.height]);
      } else if (op.type === "parent") {
        if (op.add) {
          const parent=await client.query("SELECT group_id FROM app_artworks WHERE email=$1 AND id=$2 AND deleted_at IS NULL",[email,op.parentId]);
          if (!parent.rows.length || parent.rows[0].group_id!==row.group_id) throw new Error("父节点不存在或跨项目");
          const cycle=await client.query(`WITH RECURSIVE ancestors AS (
            SELECT id,parent_id,parent_ids FROM app_artworks WHERE email=$1 AND id=$2
            UNION SELECT a.id,a.parent_id,a.parent_ids FROM app_artworks a JOIN ancestors p
            ON a.id=p.parent_id OR p.parent_ids ? a.id WHERE a.email=$1
          ) SELECT 1 FROM ancestors WHERE id=$3`,[email,op.parentId,op.id]);
          if (cycle.rows.length) throw new Error("不能形成循环连线");
        }
        const parents = new Set<string>(row.parent_ids || []);
        let primary=row.parent_id;
        if (op.add) { if (!primary) primary=op.parentId; else if (primary!==op.parentId) parents.add(op.parentId); }
        else { if (primary===op.parentId) primary=null; parents.delete(op.parentId); }
        await client.query("UPDATE app_artworks SET parent_id=$3,parent_ids=$4::jsonb WHERE email=$1 AND id=$2",[email,op.id,primary,JSON.stringify(Array.from(parents))]);
      }
    }
    // Validate the final graph state: a mixed undo may restore a character
    // before its image operations. All rows remain inside this transaction.
    if(changedCharacters.size){
      const rows=(await client.query("SELECT character FROM app_canvas_character_nodes WHERE email=$1 AND id=ANY($2::text[]) AND deleted_at IS NULL",[email,[...changedCharacters]])).rows;
      for(const row of rows)await lockCharacterImagesTx(client,email,row.character);
    }
    if(changedScenes.size){
      const rows=(await client.query("SELECT scene FROM app_canvas_scene_nodes WHERE email=$1 AND id=ANY($2::text[]) AND deleted_at IS NULL",[email,[...changedScenes]])).rows;
      for(const row of rows)await lockSceneImagesTx(client,email,row.scene);
    }
    if(changedTimelines.size){
      const rows=(await client.query("SELECT timeline,adopted FROM app_canvas_timeline_nodes WHERE email=$1 AND id=ANY($2::text[]) AND deleted_at IS NULL",[email,[...changedTimelines]])).rows;
      for(const row of rows){await validateTimelineProject(email,row.timeline,client);if(row.adopted)await validateTimelineAdoption(email,row.adopted,client);}
    }
    if(changedAudios.size){
      const rows=(await client.query("SELECT audio FROM app_canvas_audio_nodes WHERE email=$1 AND id=ANY($2::text[]) AND deleted_at IS NULL",[email,[...changedAudios]])).rows;
      for(const row of rows)await validateAudioProject(email,row.audio,client);
    }
    if(changedDirectors.size){
      const rows=(await client.query("SELECT project FROM app_canvas_director_nodes WHERE email=$1 AND id=ANY($2::text[]) AND deleted_at IS NULL",[email,[...changedDirectors]])).rows;
      for(const row of rows)if(row.project.panoramaArtworkId)await requireVisualImages(email,[row.project.panoramaArtworkId],"scene",client);
    }
    await client.query("INSERT INTO app_canvas_history_ops(id,email,fingerprint) VALUES($1,$2,$3)",[input.operationId,email,fingerprint]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
