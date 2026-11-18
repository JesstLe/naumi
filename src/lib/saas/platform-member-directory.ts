import 'server-only';
import type {PoolClient} from 'pg';
import type {TenantMemberPageQuery} from './tenant-contracts';

const MEMBER_PAGE_SIZE=50,SUPERVISOR_PAGE_SIZE=30;
const search=(q:string)=>q?'%'+q.replace(/[\\%_]/g,'\\$&')+'%':null;
const matched='($2::text IS NULL OR u.name ILIKE $2 OR m.email ILIKE $2)';
const memberFields=`m.email,u.name,m.supervisor_email,m.role_id,COALESCE(r.name,'员工') role_name,
  m.employment,m.membership_status,m.membership_expires_at,m.joined_at,m.left_at,m.version,
  u.banned,u.account_expires_at,u.management_version`;
const memberSource=`FROM app_enterprise_members m JOIN app_users u ON u.email=m.email
  LEFT JOIN app_enterprise_roles r ON r.enterprise_id=m.enterprise_id AND r.id=m.role_id`;
const roleFields='r.id,r.name,r.level,r.manage_members,r.view_records,r.version';

export async function readPlatformMembers(tx:PoolClient,id:string,query?:TenantMemberPageQuery){
  if(!query){
    const {rows:members}=await tx.query(`SELECT ${memberFields} ${memberSource} WHERE m.enterprise_id=$1 ORDER BY u.name,m.email`,[id]);
    const {rows:roles}=await tx.query(`SELECT ${roleFields} FROM app_enterprise_roles r WHERE r.enterprise_id=$1 ORDER BY r.level,r.id`,[id]);
    return {members,roles};
  }
  // Limit before looking up display names for members' direct supervisors.
  const {rows}=await tx.query(`SELECT page.*,sup.name AS supervisor_name FROM (
      SELECT ${memberFields} ${memberSource} WHERE m.enterprise_id=$1 AND ${matched}
      ORDER BY u.name,m.email LIMIT $3 OFFSET $4
    ) page LEFT JOIN app_enterprise_members lead ON lead.enterprise_id=$1 AND lead.email=page.supervisor_email
    LEFT JOIN app_users sup ON sup.email=lead.email ORDER BY page.name,page.email`,
    [id,search(query.q),MEMBER_PAGE_SIZE+1,(query.page-1)*MEMBER_PAGE_SIZE]);
  const {rows:roles}=await tx.query(`SELECT ${roleFields},COALESCE(c.n,0)::int member_count FROM app_enterprise_roles r
    LEFT JOIN (
      SELECT role_id,count(*) AS n FROM app_enterprise_members WHERE enterprise_id=$1 AND role_id IS NOT NULL GROUP BY role_id
    ) c ON c.role_id=r.id WHERE r.enterprise_id=$1 ORDER BY r.level,r.id`,[id]);
  return {members:rows.slice(0,MEMBER_PAGE_SIZE),roles,memberPage:{page:query.page,hasMore:rows.length>MEMBER_PAGE_SIZE}};
}

export async function readPlatformSupervisors(tx:PoolClient,id:string,query:TenantMemberPageQuery){
  // Membership eligibility is unchanged in the browser; the write path still
  // validates active identity, hierarchy and CAS against current data.
  const {rows}=await tx.query<{email:string;name:string}>(`SELECT m.email,u.name
    FROM app_enterprise_members m JOIN app_users u ON u.email=m.email
    JOIN app_enterprise_roles r ON r.enterprise_id=m.enterprise_id AND r.id=m.role_id
    WHERE m.enterprise_id=$1 AND r.manage_members AND ${matched}
    ORDER BY u.name,m.email LIMIT $3 OFFSET $4`,
    [id,search(query.q),SUPERVISOR_PAGE_SIZE+1,(query.page-1)*SUPERVISOR_PAGE_SIZE]);
  return {supervisors:rows.slice(0,SUPERVISOR_PAGE_SIZE),hasMore:rows.length>SUPERVISOR_PAGE_SIZE};
}
