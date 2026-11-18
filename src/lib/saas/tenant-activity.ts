import 'server-only';
import type {PoolClient} from 'pg';
import type {TenantDateWindow} from './overview-activity';

// The two values have different time scopes. Use the existing tenant/time
// index for the range count and stop the lifetime lookup at the first root.
export const tenantPageActivitySql=`SELECT page.tenant_id,(
  SELECT count(*)::int FROM app_creation_records c
  WHERE c.tenant_id=page.tenant_id AND c.scope_kind='tenant' AND c.parent_id IS NULL
    AND c.accepted_at>=$2::timestamptz AND c.accepted_at<$3::timestamptz
) AS n,(
  SELECT c.accepted_at FROM app_creation_records c
  WHERE c.tenant_id=page.tenant_id AND c.scope_kind='tenant' AND c.parent_id IS NULL
  ORDER BY c.accepted_at DESC,c.id DESC LIMIT 1
) AS last FROM unnest($1::uuid[]) AS page(tenant_id)`;

export async function readTenantPageActivity(tx:Pick<PoolClient,'query'>,tenantIds:string[],window:TenantDateWindow){
  const {rows}=await tx.query<{tenant_id:string;n:number;last:Date|null}>(
    tenantPageActivitySql,[tenantIds,window.start,window.end],
  );
  return new Map(rows.map(row=>[row.tenant_id,row]));
}
