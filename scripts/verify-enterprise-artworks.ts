import assert from "node:assert/strict";
import fs from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import sharp from "sharp";

async function main() {
  const out = resolve(process.env.NAUMI_ARTWORKS_EVIDENCE_DIR || "output/enterprise-artworks-parity");
  fs.mkdirSync(out, { recursive: true });
  const connection = { url: process.env.DATABASE_URL || JSON.parse(fs.readFileSync(out + "/fixture-connection.json", "utf8")).url };
  assert.equal(new URL(connection.url).hostname, "127.0.0.1");
  const baseline = process.argv.includes("--baseline"), schema = "enterprise_artworks_" + randomUUID().replaceAll("-", "");
  const bootstrap = new pg.Client({ connectionString: connection.url }); await bootstrap.connect(); await bootstrap.query(`CREATE SCHEMA ${schema}`); await bootstrap.end();
  Object.assign(process.env, { DATABASE_URL: connection.url, PGOPTIONS: `-c search_path=${schema}`, NAUMI_VERIFY_ISOLATED_DB: "1", NAUMI_MULTI_USER: "1", SETTINGS_SECRET: "enterprise-artworks-fixture-0123456789abcdef", OPENAI_API_KEY: "", SMTP_HOST: "", MEDIA_PRIVATE: "1", STORAGE_DRIVER: "local", MEDIA_DIR: out + "/fixture-media", NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "" });
  const db = await import("../src/lib/db"), erp = await import("../src/lib/enterprise/server"), bi = await import("../src/lib/bi/repository"), native = await import("../src/lib/native-auth");
  const { parseBiQuery } = await import("../src/lib/bi/contracts");
  const old = await import("../src/app/api/enterprise/content/route");
  await erp.ensureEnterpriseSchema(); await bi.ensureBiSchema(); const pool = db.getPool(); await db.setSetting("multi_user_enabled", "1");
  const owner = "北方@username.naumi.local", director = "总监@username.naumi.local", lead = "组长@username.naumi.local", member = "玄策@username.naumi.local", intern = "实习生@username.naumi.local", outsider = "外企员工@username.naumi.local", otherOwner = "外企老板@username.naumi.local", sibling = "别组员工@username.naumi.local", adminEmail = "admin@fixture.test";
  const root = randomUUID(), sub = randomUUID(), foreign = randomUUID(), until = new Date(Date.now() + 20 * 86400000).toISOString();
  const accounts = [owner, director, lead, member, intern, outsider, otherOwner, sibling, adminEmail];
  for (const email of accounts) await db.getOrCreateUser(email, email.split("@")[0]);
  await pool.query("UPDATE app_users SET role='admin' WHERE email=$1", [adminEmail]);
  for (const email of [owner, lead, otherOwner]) await pool.query("INSERT INTO app_team_access_grants(email,scope,expires_at,created_by,updated_by)VALUES($1,'owned',$2,'fixture','fixture')", [email, until]);
  for (const [id, email, name] of [[root, owner, "天地合大健康"], [sub, lead, "组长团队"], [foreign, otherOwner, "另一个企业"]]) await pool.query("INSERT INTO app_account_teams(id,owner_email,name,authorized_until)VALUES($1,$2,$3,$4)", [id, email, name, until]);
  for (const email of [director, lead, member, sibling]) await pool.query("INSERT INTO app_account_team_members(email,team_id)VALUES($1,$2)", [email, root]);
  await pool.query("INSERT INTO app_account_team_members(email,team_id)VALUES($1,$2)", [intern, sub]);
  await pool.query("UPDATE app_users SET account_expires_at=$2 WHERE email=$1", [intern, until]);
  const admin = { email: adminEmail, admin: true, consoleAdmin: true };
  await erp.activateEnterprise(admin, root, director, [sub]);
  // Foreign owner has an enabled enterprise with a valid role/employee, not a fake client flag.
  const foreignRole = randomUUID();
  await pool.query("INSERT INTO app_enterprise_settings(team_id)VALUES($1)", [foreign]);
  await pool.query("INSERT INTO app_enterprise_roles(enterprise_id,id,name,level,manage_members,view_records)VALUES($1,$2,'管理',10,true,true)", [foreign, foreignRole]);
  await pool.query("INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,role_id,employment)VALUES($1,$2,$3,$4,'permanent')", [foreign, outsider, otherOwner, foreignRole]);
  const png = await sharp({ create: { width: 1024, height: 768, channels: 4, background: "#4c8ace" } }).png().toBuffer();
  const image = "data:image/png;base64," + png.toString("base64");
  for (const [i, email] of accounts.entries()) {
    await pool.query("INSERT INTO app_bi_account_profiles(email,company,account_type,updated_by)VALUES($1,$2,'enterprise','fixture')", [email, email === outsider || email === otherOwner ? "另一个企业" : "天地合大健康"]);
    await pool.query(`INSERT INTO app_artworks(id,email,title,category,prompt,image_url,gradient,resolution,image_width,image_height,created_at,creation_provenance,source_url)VALUES($1,$2,$3,'generate',$4,$5,'fixture','1K',1024,768,'2026-10-16T09:00:00+08:00',$6,$7)`, ["art-" + i, email, email.split("@")[0] + "商品主图", email === intern ? "=FORMULA_NOT_CODE" : "保留商品主体，生成浅色背景", image, JSON.stringify({ version: 1, entry: "canvas", operation: "generate", ref: "fixture-" + i, evidence: "server-route" }), "https://private.invalid/source?token=NEVER_EXPOSE_SOURCE"]);
  }
  await pool.query("INSERT INTO app_artworks(id,email,title,category,prompt,image_url,gradient,created_at,deleted_at)VALUES('art-deleted',$1,'回收作品','upload','',$2,'fixture','2026-10-16T09:01:00+08:00',now()),('art-old',$1,'历史作品','upload','',$2,'fixture','2020-01-01T00:00:00Z',NULL)", [intern, image]);
  const snapshot = await erp.enterpriseSnapshot({ email: owner, admin: false }, root), expected = snapshot.members.map(m => m.email).sort();
  const request = (actor: string, endpoint: string, extra: Record<string, string> = {}, method = "GET", body?: unknown) => new Request(`http://fixture.test/api/enterprise/${endpoint}?${new URLSearchParams({ enterpriseId: root, from: "2026-10-16", to: "2026-10-16", ...extra })}`, { method, headers: { cookie: actor ? `nv_user=${native.signUserSession(actor, Date.now())}` : "", "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (baseline) {
    const response = await old.GET(request(owner, "content", { email: member, section: "artworks" })); const data = await response.json(); assert.equal(response.status, 200); assert.equal(data.size, 20); assert.equal("operation_label" in data.rows[0], false); assert("image_url" in data.rows[0]);
    console.log("BASELINE=PASS GALLERY_RAW_FIELDS=1 PROVENANCE_COLUMNS=0 ALL_MEMBERS_QUERY=0 EXIT=0"); await pool.end(); return;
  }
  const api = await import("../src/app/api/enterprise/artworks/route"), media = await import("../src/app/api/enterprise/media/route");
  const { enterpriseArtworks, parseEnterpriseArtworks } = await import("../src/lib/enterprise/artworks");
  const { managedImageSource } = await import("../src/lib/browser-image-source");
  const { imageCacheManifest } = await import("../src/lib/browser-image-manifest");
  const read = (email: string, extra: Record<string, string> = {}) => api.GET(request(email, "artworks", extra));
  let response: Response = await read(owner), data = await response.json(); assert.equal(response.status, 200, JSON.stringify(data)); assert.equal(data.size, 30); assert.equal(data.total, expected.length); assert.deepEqual(data.rows.map((r: any) => r.email).sort(), expected);
  for (const row of data.rows) {
    const adminRows = await bi.queryBi(parseBiQuery(new URLSearchParams({ section: "artworks", id: row.id, status: "all" })));
    assert.equal(row.operation_label, "生成图片"); assert.equal(row.source_label, "画布 · 生成图片"); assert.equal(row.provenance_status, "创建时记录");
    assert.deepEqual(row, adminRows.rows[0], "Enterprise artwork presentation must exactly match admin");
  }
  assert(!JSON.stringify(data).includes("NEVER_EXPOSE_SOURCE")); assert(!JSON.stringify(data).includes("image_url")); assert(!JSON.stringify(data).includes("creation_provenance"));
  console.log("PARITY=PASS ADMIN_ROWS_EXACT=1 OWNER_EMPLOYEES_ONLY=1 SOURCE_URL_REDACTED=1");
  response = await read(owner, { email: member }); data = await response.json(); assert.equal(data.total, 1);
  response = await read(owner, { q: "外企" }); assert.equal((await response.json()).total, 0);
  response = await read(owner, { q: "玄策" }); assert.equal((await response.json()).total, 1);
  response = await read(owner, { accountType: "personal" }); assert.equal((await response.json()).total, 0);
  response = await read(owner, { size: "1", page: "999" }); data = await response.json(); assert.equal(data.total, expected.length); assert.equal(data.rows.length, 0);
  response = await read(owner, { size: "1", page: "2" }); data = await response.json(); assert.equal(data.rows.length, 1); assert.equal(data.total, expected.length); assert.equal(data.page, 2);
  response = await read(owner, { status: "deleted" }); data = await response.json(); assert.equal(data.total, 1); assert.equal(data.rows[0].id, "art-deleted");
  response = await read(owner, { status: "all" }); assert.equal((await response.json()).total, expected.length + 1);
  response = await read(owner, { id: "art-old", status: "all" }); assert.equal((await response.json()).rows[0].id, "art-old");
  for (const actor of [owner, director, lead]) for (const bad of [outsider, otherOwner, adminEmail]) assert.equal((await read(actor, { email: bad })).status, 403);
  assert.equal((await read(owner, { email: owner })).status, 403);
  assert.equal((await read(owner, { enterpriseId: foreign })).status, 403);
  assert.equal((await read(outsider, { enterpriseId: root })).status, 403);
  assert.equal((await read(member)).status, 403);
  assert.equal((await read("")).status, 401);
  response = await read(lead); data = await response.json(); assert.deepEqual(data.rows.map((r: any) => r.email).sort(), [lead, intern].sort());
  response = await read(owner, { id: "art-5", status: "all" }); assert.equal((await response.json()).total, 0);
  for (const params of [{ section: "users" }, { section: "operations" }, { from: "2026-02-30" }, { page: "0" }, { status: "invalid" }] as Record<string,string>[]) assert.equal((await read(owner, params)).status, 400);
  console.log("ISOLATION=PASS CROSS_ENTERPRISE=403 FOREIGN_RECORD_ID=EMPTY NON_MANAGER=403 ANON=401 SUBTREE_ONLY=1 FILTERS_PAGING_RECYCLE=PASS");
  response = await read(owner, { format: "csv" }); const csv = await response.text(); assert.equal(response.status, 200); assert(csv.includes("创建操作")); assert(csv.includes("'=FORMULA_NOT_CODE")); assert(!csv.includes(outsider)); assert(!csv.includes("NEVER_EXPOSE_SOURCE"));
  assert.equal((await read(owner, { format: "csv", email: outsider })).status, 403);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  console.log("CSV=PASS SAME_SCOPE=1 FORMULA_ESCAPED=1 PRIVATE_NO_STORE=1");
  const memberId = "art-" + accounts.indexOf(member), foreignId = "art-" + accounts.indexOf(outsider);
  response = await media.GET(request(owner, "media", { email: member, id: memberId })); assert.equal(response.status, 200); let metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata(); assert.equal(metadata.width, 480);
  response = await media.GET(request(owner, "media", { email: member, id: memberId, full: "1" })); assert.equal(response.status, 200); metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata(); assert.equal(metadata.width, 1024);
  assert.equal((await media.GET(request(owner, "media", { email: outsider, id: foreignId }))).status, 403);
  assert.equal((await media.GET(request(owner, "media", { email: member, id: foreignId }))).status, 404);
  assert.equal((await media.GET(request(owner, "media", { email: intern, id: "art-deleted" }))).status, 200);
  const thumb = "/api/enterprise/media?" + new URLSearchParams({ enterpriseId: root, email: member, id: memberId }), full = thumb + "&full=1";
  assert.notEqual(managedImageSource(thumb, "http://fixture.test"), managedImageSource(full, "http://fixture.test"));
  response = await imageCacheManifest(request(owner, "../media/cache-manifest", {}, "POST", { sources: [thumb, full] }), false); const manifest = await response.json(); assert.equal(response.status, 200, JSON.stringify(manifest)); assert.notEqual(manifest.results[thumb].version, manifest.results[full].version); assert(manifest.results[full].fetchUrl.includes('full=1')); fs.writeFileSync(out+"/cache-manifest.json",JSON.stringify(manifest,null,2));
  console.log("MEDIA=PASS OWNED_THUMB=480 OWNED_FULL=1024 CROSS_ENTERPRISE=403 ID_SUBSTITUTION=404 CACHE_VARIANTS=DISTINCT");
  // Live revocation applies even when the client retains old enterprise/member IDs.
  await pool.query("UPDATE app_enterprise_members SET supervisor_email=$3 WHERE enterprise_id=$1 AND email=$2", [root, intern, director]);
  assert.equal((await read(lead, { email: intern })).status, 403);
  assert.equal((await media.GET(request(lead, "media", { email: intern, id: "art-deleted" }))).status, 403);
  await pool.query("UPDATE app_enterprise_members SET supervisor_email=$3 WHERE enterprise_id=$1 AND email=$2", [root, intern, lead]);
  await pool.query("UPDATE app_team_access_grants SET enabled=false WHERE email=$1", [owner]);
  for (const params of [{}, { format: "csv" }] as Record<string,string>[]) assert.equal((await read(owner, params)).status, 403);
  assert.equal((await media.GET(request(owner, "media", { email: member, id: memberId }))).status, 403);
  response = await imageCacheManifest(request(owner, "../media/cache-manifest", {}, "POST", { sources: [thumb, full] }), false); const denied = await response.json(); assert(!denied.results?.[thumb] && !denied.results?.[full]);
  console.log("REVOCATION=PASS REPARENTED_MEMBER=403 GRANT_DISABLED_LIST_CSV_MEDIA=403 CACHED_MANIFEST=DENIED");
  await pool.query("UPDATE app_team_access_grants SET enabled=true WHERE email=$1", [owner]);
  // IDs/snapshot stay private in ignored output for the authenticated local UI fixture.
  fs.writeFileSync(out + "/fixture-state.json", JSON.stringify({ schema, root, foreign, owner, director, lead, member, intern, outsider, adminEmail, snapshot, cookie: `nv_user=${native.signUserSession(owner, Date.now())}` }));
  assert.throws(() => parseEnterpriseArtworks(new URLSearchParams({ enterpriseId: root, section: "calls" })));
  await assert.rejects(() => enterpriseArtworks({ email: owner, admin: false }, root, parseBiQuery(new URLSearchParams({ section: "users" }))), /仅支持/);
  console.log("MODIFIED=PASS QUERY_PARITY=EXACT SCOPE=SERVER_ENFORCED PROVIDER_CALLS=0 EXIT=0");
  await pool.end();
}
main().catch(e => { console.error(e); process.exitCode = 1; });
