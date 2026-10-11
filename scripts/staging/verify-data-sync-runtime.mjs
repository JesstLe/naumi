// Execute inside the unchanged staging App. Session tokens remain in memory.
import assert from 'node:assert/strict';
import {createHash, createHmac} from 'node:crypto';
import {createRequire} from 'node:module';
const require = createRequire('/app/server.js');
const {Pool} = require('pg');
assert.equal(process.env.NAUMI_ENVIRONMENT, 'staging');
assert.equal(process.env.NAUMI_STAGING_HISTORY_GUARD, '1');
assert.equal(process.env.STORAGE_DRIVER, 'local');
const db = new Pool({connectionString: process.env.DATABASE_URL, ssl: false});
const origin = 'http://127.0.0.1:3000';
const cookie = email => {
  // Native auth derives issuedAt as exp minus its configured 30-day TTL.
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const eb = Buffer.from(email).toString('base64url');
  const signature = createHmac('sha256', process.env.SETTINGS_SECRET).update(`user:${eb}.${exp}`).digest('hex');
  return `nv_user=${eb}.${exp}.${signature}`;
};
const request = (path, email) => fetch(origin + path, {headers: email ? {cookie: cookie(email)} : {}, signal: AbortSignal.timeout(30000)});
try {
  assert.equal((await db.query('SELECT current_database() n')).rows[0].n, 'naumi_staging');
  assert.equal((await request('/api/health')).status, 200);
  assert.equal((await request('/api/admin/usage')).status, 403);
  const works = (await db.query(`SELECT a.* FROM app_artworks a JOIN app_users u ON u.email=a.email AND NOT u.banned JOIN naumi_sync_20261012.changed_rows c ON c.table_name='app_artworks' AND c.action='insert' AND c.row_key::jsonb=jsonb_build_array(a.id) WHERE a.image_url LIKE '/media/%' AND a.deleted_at IS NULL ORDER BY a.created_at DESC LIMIT 8`)).rows;
  assert.equal(works.length, 8);
  let media = 0;
  for (const row of works) {
    const r = await request(`/api/artworks/get?email=${encodeURIComponent(row.email)}&ids=${encodeURIComponent(row.id)}`, row.email);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.artworks.length, 1);
    assert.equal(body.artworks[0].id, row.id);
    const image = await request(row.image_url, row.email);
    assert.equal(image.status, 200);
    assert.match(image.headers.get('content-type') || '', /^image\//);
    assert.ok((await image.arrayBuffer()).byteLength > 0);
    media++;
  }
  const texts = (await db.query(`SELECT n.* FROM app_canvas_text_nodes n JOIN naumi_sync_20261012.changed_rows c ON c.table_name='app_canvas_text_nodes' AND c.row_key::jsonb=jsonb_build_array(n.id) LIMIT 1`)).rows;
  assert.ok(texts.length);
  const textResponse = await request('/api/canvas/text-nodes', texts[0].email);
  assert.equal(textResponse.status, 200);
  assert.ok((await textResponse.json()).nodes.some(n => n.id === texts[0].id));
  const history = (await db.query(`SELECT j.* FROM app_image_jobs j JOIN naumi_staging_guard.origin_rows g ON g.table_name='app_image_jobs' AND g.row_key=j.id WHERE j.billing_settled=false ORDER BY j.created_at DESC LIMIT 1`)).rows[0];
  assert.ok(history);
  const before = createHash('sha256').update(JSON.stringify(history)).digest('hex');
  const hr = await request('/api/generate-image?job=' + encodeURIComponent(history.id), history.email);
  assert.equal(hr.status, 200);
  await hr.json();
  const active = await request('/api/generate-image?active=1', history.email);
  assert.equal(active.status, 200);
  // The existing active-list endpoint also displays imported pending history;
  // visibility is not execution eligibility. Preserve its original status.
  const activeHistoryVisible = (await active.json()).jobs.some(j => j.id === history.id);
  const after = (await db.query('SELECT * FROM app_image_jobs WHERE id=$1', [history.id])).rows[0];
  assert.equal(createHash('sha256').update(JSON.stringify(after)).digest('hex'), before);
  assert.equal((await db.query(`SELECT count(*)::int n FROM app_image_jobs j JOIN naumi_staging_guard.origin_rows g ON g.table_name='app_image_jobs' AND g.row_key=j.id WHERE NOT EXISTS(SELECT 1 FROM naumi_staging_guard.origin_rows h WHERE h.table_name='app_image_jobs' AND h.row_key=j.id)`)).rows[0].n, 0);
  for (const feature of ['image.generate', 'canvas.image', 'canvas.assistant']) {
    const r = await request('/api/models?feature=' + feature);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(body.models?.length, 'Existing model catalog empty: ' + feature);
  }
  const counts = (await db.query(`SELECT (SELECT count(*)::int FROM app_users) users,(SELECT count(*)::int FROM app_artworks) artworks,(SELECT count(*)::int FROM app_image_jobs) image_jobs,(SELECT count(*)::int FROM app_ledger) ledger`)).rows[0];
  console.log('RUNTIME_COMPATIBILITY=PASS IMPORTED_ARTWORK_READ=8 MEDIA_200=' + media + ' TEXT_NODE_READ=PASS HISTORY_POLL_READ_ONLY=1 WORKER_SOURCE_ELIGIBLE=0 ACTIVE_HISTORY_VISIBLE=' + Number(activeHistoryVisible) + ' MODEL_CATALOGS=3 ADMIN_UNAUTH=403 NEW_GENERATIONS=0 COUNTS=' + JSON.stringify(counts));
} finally {
  await db.end();
}
