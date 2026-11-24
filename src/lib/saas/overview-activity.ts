import 'server-only';
import {reportAccountVisibleSql} from '../accounts/creation-policy';
import type {PoolClient} from 'pg';

export type TenantDateWindow={from:string;to:string;start:string;end:string};

// Group by local day and by tenant in the same scan. Summing the tenant groups
// counts personal rows too, while count(tenant_id) excludes the null group.
export const overviewActivitySql=`WITH activity AS MATERIALIZED (
  SELECT (accepted_at AT TIME ZONE 'Asia/Shanghai')::date AS day,tenant_id,GROUPING(tenant_id) AS daily,
    count(*) AS creations,count(*) FILTER(WHERE status='needs_review') AS review,count(*) FILTER(WHERE status='failed') AS failed
  FROM app_creation_records c WHERE parent_id IS NULL AND accepted_at>=$3::timestamptz AND accepted_at<$4::timestamptz AND ${reportAccountVisibleSql('c.actor_email')}
  GROUP BY GROUPING SETS ((day),(tenant_id))
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
