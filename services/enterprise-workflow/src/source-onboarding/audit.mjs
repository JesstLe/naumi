// Operator-only, read-only onboarding. Never import the application's schema initializers.
import { createHash, createPrivateKey } from 'node:crypto';

export class SourceAuditError extends Error {}
const requireValue = (value, code) => { if (!value) throw new SourceAuditError(code); };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const instance = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,79}$/;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function sourceSite(raw) {
  requireValue(raw && typeof raw === 'object' && !Array.isArray(raw), 'SITE_CONFIG_INVALID');
  const keys = ['version', 'adminUrl', 'enterpriseId', 'expectedEnterpriseName'];
  requireValue(Object.keys(raw).length === keys.length && keys.every(k => Object.hasOwn(raw, k)), 'SITE_CONFIG_FIELDS_INVALID');
  requireValue(raw.version === 1 && typeof raw.enterpriseId === 'string' && uuid.test(raw.enterpriseId), 'SITE_ENTERPRISE_INVALID');
  requireValue(typeof raw.expectedEnterpriseName === 'string' && raw.expectedEnterpriseName.trim().length > 0 && raw.expectedEnterpriseName.length <= 120, 'SITE_ENTERPRISE_NAME_REQUIRED');
  requireValue(typeof raw.adminUrl === 'string' && raw.adminUrl.length <= 1000, 'SITE_ADMIN_URL_INVALID');
  let url; try { url = new URL(raw.adminUrl); } catch { throw new SourceAuditError('SITE_ADMIN_URL_INVALID'); }
  requireValue(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/admin', 'SITE_ADMIN_URL_INVALID');
  requireValue(url.href === raw.adminUrl, 'SITE_ADMIN_URL_CANONICAL_REQUIRED');
  return { version: 1, adminUrl: url.href, origin: url.origin, enterpriseId: raw.enterpriseId.toLowerCase(), expectedEnterpriseName: raw.expectedEnterpriseName };
}

export function sourceBridge(env, enterpriseId) {
  const sourceInstanceId = instance.test(env.NAUMI_ENTERPRISE_SOURCE_INSTANCE_ID || '') ? env.NAUMI_ENTERPRISE_SOURCE_INSTANCE_ID : null;
  const mode = env.NAUMI_ENTERPRISE_DEPLOYMENT_MODE ?? 'shared';
  const ids = (env.NAUMI_ENTERPRISE_ALLOWED_IDS || '').split(',').map(v => v.trim()).filter(Boolean);
  const policyValid = !!sourceInstanceId && ['shared', 'dedicated'].includes(mode) && ids.length <= 100 && ids.every(v => uuid.test(v)) && new Set(ids).size === ids.length && (mode !== 'dedicated' || ids.length === 1);
  const enterpriseAllowed = policyValid && (!ids.length || ids.includes(enterpriseId));
  let serviceOriginValid = false, signingKeyValid = false;
  try {
    const u = new URL(env.NAUMI_WORKFLOW_SERVICE_URL || '');
    serviceOriginValid = !u.username && !u.password && !u.search && !u.hash && u.pathname === '/' && (u.protocol === 'https:' || u.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(u.hostname));
  } catch {}
  try { signingKeyValid = createPrivateKey(env.NAUMI_WORKFLOW_SIGNING_KEY || '').asymmetricKeyType === 'ed25519'; } catch {}
  const signingKidValid = /^[a-zA-Z0-9._-]{1,80}$/.test(env.NAUMI_WORKFLOW_SIGNING_KID || '');
  return { sourceInstanceId, policyValid, enterpriseAllowed, serviceOriginValid, signingKidValid, signingKeyValid, publicKeyPairMatch: 'not-checked', serviceReachability: 'not-checked' };
}

const columns = {
  app_account_teams: ['id', 'name', 'owner_email', 'enabled'],
  app_enterprise_settings: ['team_id', 'enabled'],
  app_enterprise_members: ['enterprise_id', 'email', 'supervisor_email', 'role_id', 'employment', 'version'],
  app_users: ['email', 'name', 'banned', 'account_expires_at'],
  app_team_access_grants: ['email', 'enabled', 'revoked_at', 'starts_at', 'expires_at'],
};

/** Source DB may be live: one bounded repeatable-read snapshot, explicit public tables, no writes. */
export async function inspectSource(pool, rawSite, env = {}) {
  const site = sourceSite(rawSite), bridge = sourceBridge(env, site.enterpriseId);
  const tx = await pool.connect(); let transaction = false;
  try {
    await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); transaction = true;
    await tx.query("SET LOCAL statement_timeout = '5s'");
    await tx.query("SET LOCAL lock_timeout = '1s'");
    await tx.query("SET LOCAL idle_in_transaction_session_timeout = '15s'");
    const shape = (await tx.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[])", [Object.keys(columns)])).rows;
    const missingColumns = Object.entries(columns).flatMap(([table, fields]) => fields.filter(field => !shape.some(r => r.table_name === table && r.column_name === field)).map(field => table + '.' + field));
    requireValue(missingColumns.length === 0, 'SOURCE_SCHEMA_INCOMPLETE');
    const enterprise = (await tx.query(`SELECT t.id,t.name,t.owner_email,t.enabled,s.enabled AS enterprise_enabled,
      u.email IS NOT NULL AS owner_exists,COALESCE(NOT u.banned AND (u.account_expires_at IS NULL OR u.account_expires_at>now()),false) AS owner_available,
      COALESCE(g.enabled AND g.revoked_at IS NULL AND g.starts_at<=now() AND (g.expires_at IS NULL OR g.expires_at>now()),false) AS owner_grant_active
      FROM public.app_account_teams t JOIN public.app_enterprise_settings s ON s.team_id=t.id
      LEFT JOIN public.app_users u ON u.email=t.owner_email LEFT JOIN public.app_team_access_grants g ON g.email=t.owner_email
      WHERE t.id=$1`, [site.enterpriseId])).rows;
    requireValue(enterprise.length === 1, 'SOURCE_ENTERPRISE_NOT_FOUND');
    const company = enterprise[0];
    requireValue(company.name === site.expectedEnterpriseName, 'SOURCE_ENTERPRISE_NAME_MISMATCH');
    const members = (await tx.query(`SELECT m.email,m.supervisor_email,m.role_id,m.employment,m.version,
      u.name,u.email IS NOT NULL AS account_exists,COALESCE(u.banned,true) AS banned,u.account_expires_at,
      COALESCE(NOT u.banned AND (u.account_expires_at IS NULL OR u.account_expires_at>now()),false) AS account_available
      FROM public.app_enterprise_members m LEFT JOIN public.app_users u ON u.email=m.email
      WHERE m.enterprise_id=$1 ORDER BY m.email LIMIT 2001`, [site.enterpriseId])).rows;
    requireValue(members.length <= 2000, 'SOURCE_ROSTER_LIMIT_EXCEEDED');
    const owner = (await tx.query('SELECT email,name,banned,account_expires_at FROM public.app_users WHERE email=$1', [company.owner_email])).rows[0];
    const now = (await tx.query("SELECT now() AS observed_at,current_setting('transaction_read_only') AS read_only")).rows[0];
    requireValue(now.read_only === 'on', 'SOURCE_READ_ONLY_REQUIRED');
    const tablePresence = (await tx.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' AND tablename=ANY($1::text[])", [['app_artworks', 'app_image_jobs', 'app_canvas_image_tasks', 'app_video_tasks', 'app_ledger']])).rows.map(r => r.tablename).sort();
    await tx.query('ROLLBACK'); transaction = false;
    const rows = [
      { sourceSubject: company.owner_email, alias: owner?.name || '', sourceRole: 'owner', supervisor: null, sourceRoleId: null, sourceVersion: null, accountAvailable: company.owner_available },
      ...members.map(m => ({ sourceSubject: m.email, alias: m.name || '', sourceRole: m.employment, supervisor: m.supervisor_email, sourceRoleId: m.role_id, sourceVersion: m.version, accountAvailable: m.account_available })),
    ].map(row => ({ ...row, realName: null, workflowSubject: null, workflowTeams: [], mappingStatus: 'unreviewed' }));
    const snapshotSha256 = hash({ site, company, members, owner });
    const issues = [];
    if (!company.enabled || !company.enterprise_enabled) issues.push('SOURCE_ENTERPRISE_DISABLED');
    if (!company.owner_exists || !company.owner_available || !company.owner_grant_active) issues.push('SOURCE_OWNER_ENTRY_UNAVAILABLE');
    if (!bridge.policyValid) issues.push('SOURCE_INSTANCE_POLICY_NOT_CONFIGURED');
    else if (!bridge.enterpriseAllowed) issues.push('SOURCE_ENTERPRISE_NOT_ALLOWED');
    if (!bridge.serviceOriginValid || !bridge.signingKidValid || !bridge.signingKeyValid) issues.push('WORKFLOW_BRIDGE_NOT_CONFIGURED');
    if (rows.some(r => !r.accountAvailable)) issues.push('SOURCE_ACCOUNTS_UNAVAILABLE');
    // A database snapshot is not a real employee login or source API authorization test.
    issues.push('EMPLOYEE_SESSION_NOT_VERIFIED', 'WORKFLOW_BINDINGS_NOT_VERIFIED', 'REALNAME_ALIAS_MAPPING_NOT_REVIEWED');
    const summary = { version: 1, observedAt: new Date(now.observed_at).toISOString(), adminUrl: site.adminUrl, enterpriseId: company.id, enterpriseName: company.name,
      sourceInstanceId: bridge.sourceInstanceId, snapshotSha256, sourceReadOnly: true, sourceWrites: 0, memberCount: members.length, accountCount: rows.length,
      availableAccounts: rows.filter(r => r.accountAvailable).length, enterpriseEnabled: company.enabled && company.enterprise_enabled, ownerGrantActive: company.owner_grant_active,
      bridge, sourceTablePresence: tablePresence, recordContentsRead: false, employeeReady: false, issues,
      attribution: 'current-membership-not-historical-ownership' };
    return { summary, roster: { version: 1, purpose: 'manual-identity-review-not-provisioning', site, sourceInstanceId: bridge.sourceInstanceId, observedAt: summary.observedAt, snapshotSha256, rows } };
  } finally {
    if (transaction) await tx.query('ROLLBACK').catch(() => {});
    tx.release();
  }
}

export async function probeSource(rawSite, fetcher = fetch) {
  const site = sourceSite(rawSite);
  const paths = ['/admin', '/api/version', '/api/enterprise/workflow?action=discovery', '/api/enterprise/integration?action=context'];
  const checks = [];
  for (const path of paths) {
    try {
      const r = await fetcher(site.origin + path, { method: 'GET', redirect: 'manual', credentials: 'omit', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
      const check = { path, status: r.status, json: (r.headers.get('content-type') || '').split(';')[0].trim() === 'application/json', result: 'observed' };
      // Never follow a login redirect or retain HTML, cookies, arbitrary bodies, or error strings.
      if (path === '/api/version' && r.status === 200 && check.json) {
        const reader = r.body?.getReader(); let size = 0; const chunks = [];
        if (reader) try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; requireValue(size <= 16384, 'PROBE_BODY_LIMIT'); chunks.push(value); } } finally { await reader.cancel().catch(() => {}); }
        let v; try { v = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new SourceAuditError('PROBE_VERSION_INVALID'); }
        requireValue(typeof v.commit === 'string' && /^[a-f0-9]{40}$/.test(v.commit) && typeof v.version === 'string' && /^[a-zA-Z0-9._-]{1,80}$/.test(v.version), 'PROBE_VERSION_INVALID');
        check.version = { commit: v.commit, version: v.version };
      } else await r.body?.cancel();
      checks.push(check);
    } catch { checks.push({ path, result: 'probe-failed' }); }
  }
  return { version: 1, observedAt: new Date().toISOString(), adminUrl: site.adminUrl, anonymous: true, credentialsSent: false, employeeReady: false, checks };
}
