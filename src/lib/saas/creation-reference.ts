import 'server-only';
import {getPool} from '@/lib/db';
import {ensureCreationSchema} from './creation-schema';
import {legacyCreationId} from './legacy-creations';
export async function resolveCreationReference(type:string,id:string,email:string){
 await ensureCreationSchema();const pool=getPool();let target=id;
 if(type==='model-call'){const row=(await pool.query('SELECT operation_id FROM app_bi_model_calls WHERE id=$1 AND email=$2',[id,email])).rows[0];if(!row?.operation_id)return null;target=row.operation_id;}
 const kinds:Record<string,string[]>= {'artwork':['artwork'],'billing':['billing'],'model-call':['billing','image:generate','image:imagegen','video'],'image-job':['image:generate','image:imagegen','image:suite','image:aplus'],'video-task':['video'],'canvas-task':['canvas-image','canvas']};
 if(!kinds[type])return null;
 const linked=(await pool.query(`WITH RECURSIVE roots AS(SELECT c.id,c.parent_id,c.actor_email,c.tenant_id FROM app_creation_links l JOIN app_creation_records c ON c.id=l.creation_id WHERE l.target_type=ANY($1::text[]) AND l.target_id=$2 AND l.actor_email=$3
 UNION ALL SELECT p.id,p.parent_id,p.actor_email,p.tenant_id FROM app_creation_records p JOIN roots c ON c.parent_id=p.id AND c.actor_email=p.actor_email AND c.tenant_id IS NOT DISTINCT FROM p.tenant_id)
 SELECT id,tenant_id FROM roots WHERE parent_id IS NULL ORDER BY id LIMIT 1`,[kinds[type],target,email])).rows[0];
 if(linked)return linked.tenant_id?`/admin/tenants/${linked.tenant_id}?tab=creations&creationId=${encodeURIComponent(linked.id)}`:`/admin/creations?creationId=${encodeURIComponent(linked.id)}`;
 const tables:Record<string,'app_image_jobs'|'app_canvas_image_tasks'|'app_video_tasks'|'app_artworks'>={'artwork':'app_artworks','image-job':'app_image_jobs','video-task':'app_video_tasks','canvas-task':'app_canvas_image_tasks'};
 if(tables[type]&&(await pool.query(`SELECT 1 FROM ${tables[type]} WHERE id=$1 AND email=$2`,[target,email])).rowCount)return `/admin/creations?source=legacy&user=${encodeURIComponent(email)}&creationId=${encodeURIComponent(legacyCreationId({table:tables[type],id:target,email}))}`;
 return null;
}
