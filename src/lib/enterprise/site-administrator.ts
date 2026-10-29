import 'server-only';
import type {Pool, PoolClient} from 'pg';
import {enterpriseSiteIdentity} from '@/lib/site-control/identity';

/** A native site administrator manages only the deployment's pinned enterprise.
 * Platform cookies, email aliases and client-supplied roles never grant this role. */
export async function administeredSite(tx: Pick<Pool | PoolClient, 'query'>, email: string): Promise<string | null> {
  const site = enterpriseSiteIdentity();
  if (!site) return null;
  const {rows} = await tx.query("SELECT 1 FROM app_users WHERE email=$1 AND role='admin' AND NOT banned AND (account_expires_at IS NULL OR account_expires_at>now()) FOR SHARE", [email]);
  return rows.length ? site.enterpriseId : null;
}

export async function siteAdministrators(tx: Pick<Pool | PoolClient, 'query'>, enterpriseId: string): Promise<string[]> {
  if (enterpriseSiteIdentity()?.enterpriseId !== enterpriseId) return [];
  const {rows} = await tx.query("SELECT email FROM app_users WHERE role='admin' AND NOT banned AND (account_expires_at IS NULL OR account_expires_at>now()) FOR SHARE");
  return rows.map(row => row.email);
}
