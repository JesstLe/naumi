import 'server-only';
import type {PoolClient} from 'pg';

export type TenantDateWindow={from:string;to:string;start:string;end:string};

// Keep the existing root/time covering index usable for ordinary traffic.
// Subtract only private actors via the actor/time index instead of reading every
// root heap tuple merely to check its actor. The same grouping removes private-
// only tenant groups, so active tenant and personal counts stay consistent.
export const overviewActivitySql=`WITH activity_counts AS MATERIALIZED (
  SELECT (accepted_at AT TIME ZONE 'Asia/Shanghai')::date AS day,tenant_id,GROUPING(tenant_id) AS daily,
    count(*) AS creations,count(*) FILTER(WHERE status='needs_review') AS review,count(*) FILTER(WHERE status='failed') AS failed
  FROM app_creation_records WHERE parent_id IS NULL AND accepted_at>=$3::timestamptz AND accepted_at<$4::timestamptz
  GROUP BY GROUPING SETS ((day),(tenant_id))
  UNION ALL
  SELECT (c.accepted_at AT TIME ZONE 'Asia/Shanghai')::date AS day,c.tenant_id,GROUPING(c.tenant_id) AS daily,
    -count(*) AS creations,-count(*) FILTER(WHERE c.status='needs_review') AS review,-count(*) FILTER(WHERE c.status='failed') AS failed
  FROM app_account_creation_policies p CROSS JOIN LATERAL (
    SELECT accepted_at,tenant_id,status FROM app_creation_records
    WHERE actor_email=p.email AND parent_id IS NULL AND accepted_at>=$3::timestamptz AND accepted_at<$4::timestamptz OFFSET 0
  ) c WHERE p.policy->>'reportVisibility'='private'
  GROUP BY GROUPING SETS ((day),(c.tenant_id))
), activity AS MATERIALIZED (
  SELECT day,tenant_id,daily,sum(creations) AS creations,sum(review) AS review,sum(failed) AS failed
  FROM activity_counts GROUP BY day,tenant_id,daily HAVING sum(creations)>0
), totals AS (
  SELECT COALESCE(sum(creations),0)::int AS creations,count(tenant_id)::int AS active,
    COALESCE(sum(review),0)::int AS review,COALESCE(sum(failed),0)::int AS failed FROM activity WHERE daily=0
), days AS (
  SELECT d::date AS day FROM generate_series($1::date,$2::date,interval '1 day') AS d
)
SELECT totals.*, (SELECT jsonb_agg(jsonb_build_object('date',to_char(days.day,'YYYY-MM-DD'),'count',COALESCE(a.creations,0)::int) ORDER BY days.day)
  FROM days LEFT JOIN activity a ON a.daily=1 AND a.day=days.day) AS trend
FROM totals`;

export async function readOverviewActivity(tx:Pick<PoolClient,'query'>,dates:TenantDateWindow){
 return (await tx.query<{creations:number;active:number;review:number;failed:number;trend:{date:string;count:number}[]}>(
  overviewActivitySql,[dates.from,dates.to,dates.start,dates.end],
 )).rows[0];
}
