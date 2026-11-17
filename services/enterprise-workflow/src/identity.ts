import { createPublicKey, verify, type KeyObject } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { z } from 'zod';
import { id, permission, type Actor, type Principal } from './contracts';
import type { ResolveActor } from './store';

const claims = z.strictObject({ iss: z.string(), aud: z.string(), sub: z.string().trim().min(1).max(254),
  enterpriseId: id, teamId: id, iat: z.number().int(), exp: z.number().int(), jti: id });
const header = z.strictObject({ alg: z.literal('EdDSA'), typ: z.literal('JWT'), kid: z.string().min(1).max(80) });

/** Trusted BFF issuer only. No token minting endpoint; private signing keys stay in the BFF. */
export function createBffAuthenticator(options: {
  issuer: string; audience: string; publicKeys: Record<string, string | KeyObject>; now?: () => number;
}) {
  if (!options.issuer || !options.audience || !Object.keys(options.publicKeys).length) throw new Error('TRUST_CONFIG_REQUIRED');
  const keys = new Map(Object.entries(options.publicKeys).map(([kid, value]) => {
    const key = typeof value === 'string' ? createPublicKey(value) : value;
    if (key.type !== 'public' || key.asymmetricKeyType !== 'ed25519') throw new Error('ED25519_PUBLIC_KEY_REQUIRED');
    return [kid, key] as const;
  }));
  return async (request: IncomingMessage): Promise<Principal | null> => {
    try {
      const value = request.headers.authorization;
      if (!value || value.length > 8192 || !value.startsWith('Bearer ')) return null;
      const parts = value.slice(7).split('.');
      if (parts.length !== 3 || parts.some(p => !/^[A-Za-z0-9_-]+$/.test(p))) return null;
      const h = header.parse(JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')));
      const key = keys.get(h.kid); if (!key) return null;
      if (!verify(null, Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'))) return null;
      const c = claims.parse(JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')));
      const now = Math.floor((options.now?.() ?? Date.now()) / 1000);
      if (c.iss !== options.issuer || c.aud !== options.audience || c.exp <= now || c.iat > now || c.exp <= c.iat || c.exp - c.iat > 300) return null;
      return { enterpriseId: c.enterpriseId, subject: c.sub, teamId: c.teamId };
    } catch { return null; }
  };
}

const member = z.strictObject({ permissions: z.array(permission).min(1), work_kinds: z.array(z.enum(['design', 'artwork'])) });
const activeTeamMembers=`FROM enterprise_workflow.team_members m
  JOIN enterprise_workflow.accounts a USING(enterprise_id,subject)
  JOIN enterprise_workflow.teams t USING(enterprise_id,team_id)
  WHERE m.enterprise_id=$1 AND m.team_id=$2 AND a.enabled AND t.enabled AND m.enabled
    AND (a.expires_at IS NULL OR a.expires_at>now()) AND (m.expires_at IS NULL OR m.expires_at>now())`;
function parseMember(principal: Principal, row: unknown): Actor|null {
  const parsed=member.safeParse(row);
  if(!parsed.success)return null;
  const permissions=principal.sourcePermissions===undefined?parsed.data.permissions:parsed.data.permissions.filter(value=>principal.sourcePermissions!.includes(value));
  return permissions.length?{...principal,permissions,workKinds:permissions.includes('execute')?parsed.data.work_kinds:[]}:null;
}
/** Each request resolves exactly one team. No union of roles across teams; no permission cache. */
async function databaseActor(tx: Parameters<ResolveActor>[0], principal: Principal, lock: boolean): Promise<Actor | null> {
  if (!id.safeParse(principal.teamId).success) return null;
  if(principal.sourceBinding){
    const s=principal.sourceBinding;
    const current=await tx.query(`SELECT 1 FROM enterprise_workflow.source_identities i JOIN enterprise_workflow.source_enterprises e USING(source_instance,source_enterprise,enterprise_id) WHERE i.source_instance=$1 AND i.source_enterprise=$2 AND i.source_subject=$3 AND i.enterprise_id=$4 AND i.subject=$5 AND i.enabled AND e.enabled${lock?' FOR SHARE OF i,e':''}`,[s.sourceInstance,s.sourceEnterprise,s.sourceSubject,principal.enterpriseId,principal.subject]);
    if(current.rowCount!==1)return null;
  }
  const result = await tx.query(`SELECT m.permissions,m.work_kinds ${activeTeamMembers} AND m.subject=$3${lock?' FOR SHARE OF m,a,t':''}`,
  [principal.enterpriseId, principal.teamId, principal.subject]);
  return parseMember(principal,result.rows[0]);
}

async function readDatabaseTeamMembers(tx:Parameters<ResolveActor>[0],scope:Pick<Principal,'enterpriseId'|'teamId'>,subjects:readonly string[]){
  if(!subjects.length||!id.safeParse(scope.teamId).success)return [];
  const {rows}=await tx.query<{subject:string;permissions:unknown;work_kinds:unknown}>(`SELECT m.subject,m.permissions,m.work_kinds ${activeTeamMembers} AND m.subject=ANY($3::text[])`,[scope.enterpriseId,scope.teamId,subjects]);
  const actors:Actor[]=[];
  for(const {subject,...row} of rows){const a=parseMember({enterpriseId:scope.enterpriseId,teamId:scope.teamId,subject},row);if(a)actors.push(a);}
  return actors;
}
export const resolveDatabaseActor: ResolveActor = Object.assign(
  (tx: Parameters<ResolveActor>[0], p: Principal) => databaseActor(tx, p, true),
  {readSnapshot: (tx: Parameters<ResolveActor>[0], p: Principal) => databaseActor(tx, p, false),readTeamMembers:readDatabaseTeamMembers},
);
