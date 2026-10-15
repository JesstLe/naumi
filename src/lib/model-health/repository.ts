import "server-only";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { ModelSnapshot } from "../model-config/types";
import type { HealthOverview, HealthPolicy, HealthResult, HealthModelView } from "./contracts";
import { configuredHealthTargets, type HealthTarget } from "./targets";
import { ensureHealthSchema } from "./schema";

const iso = (date: Date | null | undefined) => date?.toISOString() || null;
const policyFrom = (r: any): HealthPolicy => ({ enabled: r.enabled, staleHours: r.stale_hours, dailyMaxCalls: r.daily_max_calls, timeZone: "Asia/Shanghai" });
const lock = "SELECT pg_advisory_xact_lock(hashtextextended('naumi-model-health-budget',0))";
export function createHealthRepository(pool: Pool) {
  return {
    async policy() { await ensureHealthSchema(pool); return policyFrom((await pool.query("SELECT * FROM app_model_health_policy WHERE singleton=true")).rows[0]); },
    async savePolicy(policy: HealthPolicy, revision: number, actor: string) {
      await ensureHealthSchema(pool);
      const tx = await pool.connect();
      try {
        await tx.query("BEGIN"); await tx.query(lock);
        const r = await tx.query("UPDATE app_model_health_policy SET enabled=$1,stale_hours=$2,daily_max_calls=$3,revision=revision+1,actor=$4,updated_at=now() WHERE singleton=true AND revision=$5 RETURNING revision", [policy.enabled, policy.staleHours, policy.dailyMaxCalls, actor, revision]);
        await tx.query("COMMIT"); return !!r.rowCount;
      } catch (e) { await tx.query("ROLLBACK"); throw e; } finally { tx.release(); }
    },
    async observe(target: Pick<HealthTarget, "key" | "provider" | "upstream">, result: HealthResult) {
      await ensureHealthSchema(pool);
      const tx=await pool.connect();
      try {
      await tx.query("BEGIN");await tx.query(lock);
      // Failures do not erase prior success; latest result still wins display status.
      await tx.query(`INSERT INTO app_model_health_observations(key,provider_id,wire_model,last_business_success_at,last_success_at,last_outcome_at,success,reason,last_status,latency_ms,uncertain)
        VALUES($1,$2,$3,CASE WHEN $4 THEN now() END,CASE WHEN $4 THEN now() END,now(),$4,$5,$6,$7,$8)
        ON CONFLICT(key) DO UPDATE SET last_business_success_at=CASE WHEN $4 THEN now() ELSE app_model_health_observations.last_business_success_at END,
        last_success_at=CASE WHEN $4 THEN now() ELSE app_model_health_observations.last_success_at END,last_outcome_at=now(),success=$4,reason=$5,last_status=$6,latency_ms=$7,
        uncertain=CASE WHEN $4 THEN false ELSE app_model_health_observations.uncertain OR $8 END`, [target.key,target.provider.id,target.upstream.model,result.success,result.reason,result.status,result.latencyMs,!!result.uncertain]);
      await tx.query("COMMIT");
      }catch(e){await tx.query("ROLLBACK");throw e;}finally{tx.release();}
    },
    async claim(targets: HealthTarget[], version: number,workerHeartbeat=true) {
      await ensureHealthSchema(pool);
      const tx = await pool.connect();
      try {
        await tx.query("BEGIN"); await tx.query(lock);
        if(workerHeartbeat)await tx.query("UPDATE app_model_health_policy SET last_tick_at=now() WHERE singleton=true");
        // An expired paid claim is not a retry token. Persist uncertainty until a
        // business success or an audited administrator reconciliation clears it.
        const expired = (await tx.query("UPDATE app_model_health_probes SET state='unknown',reason='interrupted',finished_at=now() WHERE state='running' AND expires_at<=now() RETURNING key,started_at")).rows;
        for (const r of expired) await tx.query("UPDATE app_model_health_observations SET uncertain=true,success=false,reason='interrupted',last_outcome_at=now() WHERE key=$1 AND (last_outcome_at IS NULL OR last_outcome_at<=$2)", [r.key,r.started_at]);
        const p = (await tx.query("SELECT *,(now() AT TIME ZONE 'Asia/Shanghai')::date::text AS day FROM app_model_health_policy WHERE singleton=true")).rows[0];
        if (!p.enabled || !p.daily_max_calls) { await tx.query("COMMIT"); return null; }
        if ((await tx.query("SELECT 1 FROM app_model_health_probes WHERE state='running' LIMIT 1")).rowCount) { await tx.query("COMMIT"); return null; }
        const count = Number((await tx.query("SELECT count(*) AS n FROM app_model_health_probes WHERE budget_day=$1 AND state<>'skipped'", [p.day])).rows[0].n);
        if (count >= p.daily_max_calls) { await tx.query("COMMIT"); return null; }
        const rows = (await tx.query(`SELECT *, last_business_success_at>now()-($2*interval '1 hour') fresh,
          probe_not_before>now() waiting FROM app_model_health_observations WHERE key=ANY($1) FOR UPDATE`, [targets.map(t => t.key), p.stale_hours])).rows;
        const byKey = new Map(rows.map(r => [r.key, r]));
        const due = targets.filter(t => t.supported && !byKey.get(t.key)?.fresh && !byKey.get(t.key)?.waiting && !byKey.get(t.key)?.uncertain)
          .sort((a, b) => (byKey.get(a.key)?.last_probe_at?.getTime() || 0) - (byKey.get(b.key)?.last_probe_at?.getTime() || 0) || a.key.localeCompare(b.key));
        const target = due[0];
        if (!target) { await tx.query("COMMIT"); return null; }
        const id = randomUUID();
        await tx.query("INSERT INTO app_model_health_probes(id,key,provider_id,wire_model,model_version,budget_day,state,expires_at) VALUES($1,$2,$3,$4,$5,$6,'running',now()+($7*interval '1 millisecond'))", [id,target.key,target.provider.id,target.upstream.model,version,p.day,target.provider.timeoutMs+120000]);
        await tx.query(`INSERT INTO app_model_health_observations(key,provider_id,wire_model,last_probe_at,probe_not_before) VALUES($1,$2,$3,now(),now()+($4*interval '1 hour'))
          ON CONFLICT(key) DO UPDATE SET last_probe_at=now(),probe_not_before=now()+($4*interval '1 hour')`, [target.key,target.provider.id,target.upstream.model,p.stale_hours]);
        await tx.query("COMMIT"); return { id, target };
      } catch (e) { await tx.query("ROLLBACK"); throw e; } finally { tx.release(); }
    },
    async finish(id: string, result: HealthResult) {
      const tx = await pool.connect();
      try {
        await tx.query("BEGIN");
        await tx.query(lock);
        const r = (await tx.query("UPDATE app_model_health_probes SET state=$2,reason=$3,status=$4,latency_ms=$5,finished_at=now() WHERE id=$1 AND state='running' RETURNING key,started_at", [id,result.skipped?"skipped":result.uncertain?"unknown":result.success?"success":"failed",result.reason,result.status,result.latencyMs])).rows[0];
        if (r && result.skipped) await tx.query("UPDATE app_model_health_observations SET probe_not_before=now()+interval '5 minutes' WHERE key=$1",[r.key]);
        else if (r) await tx.query(`UPDATE app_model_health_observations SET success=$2,reason=$3,last_status=$4,latency_ms=$5,last_outcome_at=now(),
          last_success_at=CASE WHEN $2 THEN now() ELSE last_success_at END,uncertain=$6 WHERE key=$1 AND (last_outcome_at IS NULL OR last_outcome_at<=$7)`, [r.key,result.success,result.reason,result.status,result.latencyMs,!!result.uncertain,r.started_at]);
        // A newer business result wins, but the probe remains in history/budget.
        await tx.query("COMMIT");
      } catch (e) { await tx.query("ROLLBACK"); throw e; } finally { tx.release(); }
    },
    async reconcile(key:string,observedAt:string,actor:string){
      await ensureHealthSchema(pool);const tx=await pool.connect();
      try{
        await tx.query("BEGIN");await tx.query(lock);
        const r=await tx.query(`UPDATE app_model_health_observations o SET uncertain=false,success=NULL,reason='reconciled',last_outcome_at=now(),
          probe_not_before=GREATEST(probe_not_before,now()+((SELECT stale_hours FROM app_model_health_policy WHERE singleton=true)*interval '1 hour'))
          WHERE key=$1 AND uncertain=true AND date_trunc('milliseconds',last_outcome_at)=$2::timestamptz
          AND NOT EXISTS(SELECT 1 FROM app_model_health_probes WHERE key=o.key AND state='running') RETURNING key`,[key,observedAt]);
        if(r.rowCount)await tx.query("INSERT INTO app_model_health_reconciliations(key,observed_at,actor,resolution) VALUES($1,$2,$3,'administrator-verified-not-running')",[key,observedAt,actor]);
        await tx.query("COMMIT");return !!r.rowCount;
      }catch(e){await tx.query("ROLLBACK");throw e;}finally{tx.release();}
    },
    async overview(snapshot: ModelSnapshot): Promise<HealthOverview> {
      await ensureHealthSchema(pool);
      const targets = configuredHealthTargets(snapshot.config);
      const p = (await pool.query("SELECT *,(now() AT TIME ZONE 'Asia/Shanghai')::date::text AS day,now() AS current_time FROM app_model_health_policy WHERE singleton=true")).rows[0];
      const policy = policyFrom(p);
      const [observations, probes, count] = await Promise.all([
        pool.query("SELECT * FROM app_model_health_observations WHERE key=ANY($1)", [targets.map(t => t.key)]),
        pool.query("SELECT * FROM app_model_health_probes WHERE key=ANY($1) ORDER BY started_at DESC LIMIT 100", [targets.map(t => t.key)]),
        pool.query("SELECT count(*) AS n FROM app_model_health_probes WHERE budget_day=$1 AND state<>'skipped'", [p.day]),
      ]);
      const views = targets.map(t => {
        const r = observations.rows.find(r => r.key === t.key);
        const checking = probes.rows.some(r => r.key === t.key && r.state === "running" && r.expires_at > p.current_time);
        const state = checking ? "checking" : r?.uncertain || r?.reason==='reconciled' ? "unknown" : r?.success === false ? "unhealthy" : r?.last_success_at ? p.current_time-r.last_success_at > policy.staleHours*3600000 ? "stale" : "healthy" : t.supported ? "unknown" : "unsupported";
        const businessDue = r?.last_business_success_at ? r.last_business_success_at.getTime()+policy.staleHours*3600000 : 0;
        const next = Math.max(businessDue,r?.probe_not_before?.getTime()||0);
        const view: HealthModelView = { key:t.key,upstreamIds:t.upstreamIds,label:t.upstream.label,model:t.upstream.model,modality:t.upstream.modality,state,reason:r?.reason||null,lastStatus:r?.last_status??null,lastBusinessSuccessAt:iso(r?.last_business_success_at),lastProbeAt:iso(r?.last_probe_at),lastSuccessAt:iso(r?.last_success_at),lastObservedAt:iso(r?.last_outcome_at),nextEligibleAt:t.supported&&!r?.uncertain?new Date(Math.max(next,p.current_time.getTime())).toISOString():null,latencyMs:r?.latency_ms??null };
        return {providerId:t.provider.id,view};
      });
      return { policy,revision:p.revision,modelVersion:snapshot.version,budget:{day:p.day,used:Number(count.rows[0].n),limit:policy.dailyMaxCalls},worker:{lastTickAt:iso(p.last_tick_at)},
        providers:snapshot.config.providers.filter(p=>targets.some(t=>t.provider.id===p.id)).map(p=>{
          const models=views.filter(v=>v.providerId===p.id).map(v=>v.view), good=models.filter(m=>m.state==="healthy").length,bad=models.filter(m=>m.state==="unhealthy").length;
          return {id:p.id,name:p.name,models,state:good===models.length?"healthy":bad===models.length?"unhealthy":bad||good?"degraded":"unknown"};
        }),recent:probes.rows.map(r=>({id:r.id,providerId:r.provider_id,model:r.wire_model,state:r.state,reason:r.reason,status:r.status,startedAt:iso(r.started_at)!,finishedAt:iso(r.finished_at)})) };
    },
  };
}
