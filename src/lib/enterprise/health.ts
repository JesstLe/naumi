import 'server-only';
import type {TeamActor} from '@/lib/teams/grants';
import {TeamError} from '@/lib/teams/server';
import {enterpriseRead} from './server';

export async function enterpriseHealth(actor:TeamActor,id:string){
  return enterpriseRead({...actor,admin:false,consoleAdmin:false},id,async(tx,scope)=>{
    if(!scope.owner&&!scope.manageMembers)throw new TeamError('当前岗位没有运行健康查看权限',403);
    const emails=[...scope.visible,...(scope.owner?[scope.team.owner_email]:[])];
    const {rows:[tasks]}=await tx.query(`WITH tasks AS (
      SELECT created_at,COALESCE(snapshot#>>'{result,status}',snapshot->>'status','unknown') status FROM app_image_jobs WHERE email=ANY($1::text[])
      UNION ALL SELECT created_at,status FROM app_canvas_image_tasks WHERE email=ANY($1::text[])
      UNION ALL SELECT created_at,status FROM app_video_tasks WHERE email=ANY($1::text[]))
      SELECT count(*) FILTER(WHERE status IN ('queued','pending'))::int queued,
      count(*) FILTER(WHERE status IN ('processing','running','generating'))::int running,
      count(*) FILTER(WHERE status IN ('unknown','needs_attention','needs_review'))::int review,
      count(*) FILTER(WHERE created_at>now()-interval '1 hour' AND status IN ('done','completed','succeeded','success'))::int succeeded,
      count(*) FILTER(WHERE created_at>now()-interval '1 hour' AND status IN ('failed','error','rejected'))::int failed,
      min(created_at) FILTER(WHERE status IN ('queued','pending','processing','running','generating')) oldest FROM tasks`,[emails]);
    const exists=await tx.query("SELECT to_regclass('app_worker_tick_receipts') IS NOT NULL AS present, EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('app_worker_tick_receipts') AND attname='nonacceptance_at' AND NOT attisdropped) AS has_negative");
    let worker:{lastAcceptedAt:string|null;recentTicks:number;state:'observed'|'not_recorded'}={lastAcceptedAt:null,recentTicks:0,state:'not_recorded'};
    // Capability lookup supports v1 without converting the whole receipt row
    // (including its result JSON) merely to check one optional timestamp column.
    if(exists.rows[0].present){const {rows:[row]}=await tx.query("SELECT max(accepted_at) last, count(*) FILTER(WHERE accepted_at>now()-interval '5 minutes')::int n FROM app_worker_tick_receipts"+(exists.rows[0].has_negative?" WHERE nonacceptance_at IS NULL":""));worker={lastAcceptedAt:row.last?.toISOString()||null,recentTicks:row.n,state:row.last?'observed':'not_recorded'};}
    return {observedAt:new Date().toISOString(),database:'available' as const,worker,tasks,scope:scope.owner?'all_members' as const:'subordinates' as const};
  });
}
export type EnterpriseHealth=Awaited<ReturnType<typeof enterpriseHealth>>;
