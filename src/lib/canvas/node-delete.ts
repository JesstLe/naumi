import "server-only";
import {createHash} from "node:crypto";
import {getPool,ensureSchema} from "../db";
import {ensureVideoNodeSchema} from "./video-node-repository";
import {authorizeVideoProject} from "./video-node-service";
import {ensureDirectorNodeSchema} from "./director-node-repository";
import {ensureCharacterNodeSchema} from "./character-node-repository";
/** Project removal is one transaction even when it contains more than the per-selection API limit. */
export async function deleteCanvasProject(actorRaw:string,projectKey:string,operationId:string){
  const actor=actorRaw.toLowerCase();await ensureSchema();await ensureVideoNodeSchema();await ensureDirectorNodeSchema();await ensureCharacterNodeSchema();await authorizeVideoProject(actor,projectKey);
  const digest=createHash("sha256").update(`delete-project:${projectKey}`).digest("hex"),client=await getPool().connect();
  try{await client.query("BEGIN");await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[actor]);
    const previous=(await client.query("SELECT fingerprint FROM app_canvas_history_ops WHERE email=$1 AND id=$2",[actor,operationId])).rows[0];
    if(previous){if(previous.fingerprint!==digest)throw new Error("操作编号已使用");await client.query("COMMIT");return;}
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`video-node-graph:${actor}`]);
    await client.query("SELECT id FROM app_canvas_video_nodes WHERE email=$1 AND project_key=$2 FOR UPDATE",[actor,projectKey]);
    await client.query("UPDATE app_canvas_video_nodes SET deleted_at=now(),revision=revision+1,updated_at=now() WHERE email=$1 AND project_key=$2 AND deleted_at IS NULL",[actor,projectKey]);
    await client.query("UPDATE app_canvas_director_nodes SET deleted_at=now(),revision=revision+1,updated_at=now() WHERE email=$1 AND project_key=$2 AND deleted_at IS NULL",[actor,projectKey]);
    await client.query("UPDATE app_canvas_character_nodes SET deleted_at=now(),revision=revision+1,updated_at=now() WHERE email=$1 AND project_key=$2 AND deleted_at IS NULL",[actor,projectKey]);
    const kind=projectKey.slice(0,projectKey.indexOf(":")),id=projectKey.slice(projectKey.indexOf(":")+1);
    await client.query("UPDATE app_artworks SET deleted_at=now() WHERE email=$1 AND deleted_at IS NULL AND (($2='tree' AND (group_id=$3 OR id=$3)) OR ($2='batch' AND batch_id=$3))",[actor,kind,id]);
    await client.query("DELETE FROM app_canvas_text_nodes WHERE email=$1 AND project_key=$2",[actor,projectKey]);
    await client.query("DELETE FROM app_project_names WHERE email=$1 AND key=$2",[actor,projectKey]);
    await client.query("INSERT INTO app_canvas_video_projects(email,project_key,deleted_at) VALUES($1,$2,now()) ON CONFLICT(email,project_key) DO UPDATE SET deleted_at=EXCLUDED.deleted_at",[actor,projectKey]);
    await client.query("INSERT INTO app_canvas_history_ops(id,email,fingerprint) VALUES($1,$2,$3)",[operationId,actor,digest]);await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
