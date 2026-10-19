import type {PoolClient} from 'pg';
import {WorkflowError,type Actor,type WorkOrder} from './contracts';
import {sourceDigest} from './source-files';
import type {CancellationImpact} from './cancellation-contracts';
/** Caller holds the order advisory lock; all dependency writers use that lock too. No source/third-party writes. */
export async function cancellationImpact(tx:PoolClient,a:Actor,o:WorkOrder){
 const files=(await tx.query('SELECT id,revision,sha256,bytes FROM enterprise_workflow.delivery_assets WHERE enterprise_id=$1 AND order_id=$2 ORDER BY id LIMIT 2001',[a.enterpriseId,o.id])).rows;
 const uploads=(await tx.query("SELECT id,state,bytes,expires_at FROM enterprise_workflow.delivery_upload_sessions WHERE enterprise_id=$1 AND order_id=$2 AND state='open' ORDER BY id LIMIT 1001 FOR SHARE",[a.enterpriseId,o.id])).rows;
 const projects=(await tx.query("SELECT id,version,document FROM enterprise_workflow.projects WHERE enterprise_id=$1 AND document->'links' @> jsonb_build_array(jsonb_build_object('orderId',$2::text)) ORDER BY id LIMIT 1001",[a.enterpriseId,o.id])).rows;
 const pubs=(await tx.query('SELECT id,version,status,team_id,task_id,shop_id FROM enterprise_workflow.publications WHERE enterprise_id=$1 AND order_id=$2 ORDER BY id LIMIT 1001',[a.enterpriseId,o.id])).rows;
 if(files.length>2000||uploads.length>1000||projects.length>1000||pubs.length>1000)throw new WorkflowError(422,'CANCELLATION_IMPACT_TOO_LARGE');
 const {cancellations,version,updatedAt,...business}=o;
 const hash=sourceDigest({business,files,uploads:uploads.map(u=>({...u,expires_at:new Date(u.expires_at).toISOString()})),projects:projects.map(p=>({id:p.id,version:p.version})),publications:pubs});
 const shops=(await tx.query("SELECT id,document FROM enterprise_workflow.catalog_entities WHERE enterprise_id=$1 AND kind='shop' AND id=ANY($2::uuid[])",[a.enterpriseId,[...new Set(pubs.map(p=>p.shop_id))]])).rows;
 const visiblePubs=pubs.filter(p=>p.team_id===a.teamId&&shops.some(s=>s.id===p.shop_id&&s.document.teamIds.includes(a.teamId))).map(p=>({id:p.id,version:p.version,status:p.status,taskId:p.task_id}));
 const visibleProjects=projects.filter(p=>p.document.teamId===a.teamId||p.document.grants.some((g:{teamId:string;state:string})=>g.teamId===a.teamId&&g.state==='approved')).map(p=>({id:p.id,title:p.document.title,status:p.document.status,version:p.version}));
 const impact:CancellationImpact={hash,tasks:o.tasks.map(t=>({id:t.id,title:t.title,status:t.status,assignee:t.assignee,points:t.points,percent:t.percent})),acceptedTaskIds:o.tasks.filter(t=>t.status==='accepted').map(t=>t.id),unfinishedTaskIds:o.tasks.filter(t=>t.status!=='accepted').map(t=>t.id),pendingHandovers:o.tasks.filter(t=>t.pendingHandover).map(t=>t.id),pendingChanges:(o.changes??[]).filter(c=>['proposed','approved'].includes(c.status)).map(c=>c.id),deliveryFiles:files.length,deliveryBytes:files.reduce((n,r)=>n+Number(r.bytes),0),openUploadSessions:uploads.length,policy:'retain-facts-files-project-links-and-channel-states',externalScope:'current-viewer-only-not-persisted'};
 return {impact,related:{projects:visibleProjects,publications:visiblePubs,scope:'current-viewer-only'}};
}
