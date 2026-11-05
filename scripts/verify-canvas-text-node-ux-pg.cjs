'use strict';

// Real text CRUD/history function bodies and SQL, isolated in a new PG schema.
// This deliberately bypasses unrelated application schema/bootstrap, not SQL.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { Pool } = require('pg');
const args = process.argv.slice(2);
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const root = path.resolve(arg('--source-root', path.join(__dirname, '..')));
const out = path.resolve(arg('--output-root', process.env.CANVAS_TEXT_NODE_UX_PG_EVIDENCE || 'output/canvas-text-node-ux-pg'));
const connectionString = process.env.CANVAS_TEXT_FIXTURE_DATABASE_URL || (process.env.NAUMI_VERIFY_ISOLATED_DB === "1" ? process.env.DATABASE_URL : undefined);
assert.ok(connectionString, 'CANVAS_TEXT_FIXTURE_DATABASE_URL is required; .env is never read');
const url = new URL(connectionString);
assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
assert.equal(url.hostname, '127.0.0.1');
assert.ok(Number(url.port) > 0);
assert.equal(url.username, 'fixture');
assert.ok(url.pathname === '/naumi_text_node_ux_fixture' || process.env.NAUMI_VERIFY_ISOLATED_DB === '1' && url.pathname === '/refactor_fixture');
const schema = 'text_node_ux_' + crypto.randomUUID().replaceAll('-', '');
const pool = new Pool({ connectionString, max: 3, options: '-c search_path=' + schema, connectionTimeoutMillis: 5000 });
const checks = [], loaded = [], lines = [];
fs.mkdirSync(out, { recursive: true });
const emit = line => { lines.push(line); console.log(line); };
const command = [process.execPath, ...process.argv.slice(1)].map(value => JSON.stringify(value)).join(' ');
const input = { sourceRoot: root, database: `${url.protocol}//${url.username}@${url.hostname}:${url.port}${url.pathname}`, schema };
function source(relative) {
  const file = path.join(root, relative), bytes = fs.readFileSync(file);
  loaded.push({ path: file, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
  return bytes.toString('utf8');
}
function functions(text, names) {
  const ast = ts.createSourceFile('source.ts', text, ts.ScriptTarget.Latest, true), found = new Map();
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name && names.includes(node.name.text)) found.set(node.name.text, node.getText(ast));
    ts.forEachChild(node, visit);
  }
  visit(ast);
  for (const name of names) assert.ok(found.has(name), 'Real function exists: ' + name);
  return names.map(name => found.get(name)).join('\n');
}
const db = source('src/lib/canvas/text-node-repository.ts'), history = source('src/lib/canvas-history.ts');
const lifecycle = source('src/lib/canvas/native-node-lifecycle.ts');
// Pure concurrency/link/native selectors are the real modules. Only unrelated
// application schema startup and empty artwork receipt I/O are fixture ports.
for (const file of ['field-write.ts','text-write.ts','text-node-links.ts','native-node-records.ts']) source('src/lib/canvas/' + file);
const pure = require('esbuild').buildSync({ stdin: { contents: "export * from './src/lib/canvas/text-write';export * from './src/lib/canvas/text-node-links';export * from './src/lib/canvas/native-node-records';", resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text;
const pureModule = { exports: {} };
vm.runInNewContext(pure, { module: pureModule, exports: pureModule.exports });
const context = { exports: {}, ...pureModule.exports, ensureSchema: async () => {}, getPool: () => pool, currentCreationContext: () => null, createHash: crypto.createHash, Map, Set,
  readCanvasArtworkReceiptTx: async (_tx, _actor, ids) => { assert.equal(ids.length, 0, 'Text-only fixture must not suppress artwork reads'); return []; },
};
vm.createContext(context);
const code = functions(db, ['mapCanvasTextNode', 'listCanvasTextNodes', 'upsertCanvasTextNode']) + '\n' + functions(lifecycle, ['nativeHistoryIds','ensureNativeNodeSchemas','readNativeNodeReceiptsTx']) + '\n' + functions(history, ['saveCanvasHistory']);
const compiled = ts.transpileModule(code, { reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
assert.equal(compiled.diagnostics.filter(item => item.category === ts.DiagnosticCategory.Error).length, 0);
vm.runInContext(compiled.outputText, context);
const plain = value => JSON.parse(JSON.stringify(value));
const owner = 'writer@fixture.invalid', other = 'other@fixture.invalid';
const node = {
  id: 'text-manual', projectKey: 'tree:text-project', title: '可复用正文',
  prompt: '请润色为两句话，保留数字', content: '手写正文：保温杯 500ml，售价 99 元。',
  status: 'completed', canvasX: 12, canvasY: 24, width: 380, height: 240,
  createdAt: '2026-11-03T10:00:00.000Z', sourceIds: ['text-upstream', 'image-reference'], targetIds: ['image-output'], productIds: [],
};
const read = async id => (await context.listCanvasTextNodes(owner)).find(item => item.id === id);
const row = async id => plain((await pool.query('SELECT * FROM app_canvas_text_nodes WHERE id=$1', [id])).rows[0]);
const patch = content => ({ title: node.title, content, sourceIds: node.sourceIds, targetIds: node.targetIds, productIds: node.productIds, width: node.width, height: node.height });
const request = fields => ({ operationId: crypto.randomUUID(), operations: [{ type: 'text-patch', id: node.id, fields }] });
async function check(name, run) { await run(); checks.push(name); emit('CHECK=' + name); }

(async () => {
  let result = 'PASS', failure;
  try {
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(`CREATE TABLE app_canvas_text_nodes(
      id text PRIMARY KEY,email text NOT NULL,project_key text NOT NULL,title text NOT NULL,
      prompt text NOT NULL DEFAULT '',content text NOT NULL DEFAULT '',status text NOT NULL DEFAULT 'completed',error_message text NOT NULL DEFAULT '',
      canvas_x double precision DEFAULT 0,canvas_y double precision DEFAULT 0,canvas_width double precision DEFAULT 300,canvas_height double precision DEFAULT 176,
      created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),source_ids jsonb DEFAULT '[]',target_ids jsonb DEFAULT '[]',product_ids jsonb DEFAULT '[]');
      CREATE TABLE app_canvas_history_ops(id uuid,email text,fingerprint text,PRIMARY KEY(id,email));`);
    await check('MANUAL_CONTENT_AND_AI_INSTRUCTION_PERSIST_SEPARATELY', async () => {
      await context.upsertCanvasTextNode(owner, node);
      const saved = await read(node.id);
      assert.equal(saved.content, node.content); assert.equal(saved.prompt, node.prompt); assert.equal(saved.status, 'completed');
      assert.equal((await row(node.id)).email, owner);
    });
    await check('TEXT_LINKS_PROJECT_AND_POSITION_SURVIVE_REREAD', async () => {
      await context.upsertCanvasTextNode(owner, { ...node, id: 'text-upstream', title: '产品参数', content: '上游正文', sourceIds: [], targetIds: [node.id] });
      const saved = await read(node.id);
      assert.equal(saved.projectKey, node.projectKey); assert.deepEqual(plain(saved.sourceIds), node.sourceIds);
      assert.deepEqual(plain(saved.targetIds), node.targetIds); assert.equal(saved.canvasX, 12); assert.equal(saved.width, 380);
    });
    await check('CLEAR_CONTENT_PERSISTS_EMPTY_WITH_INSTRUCTION_RETAINED', async () => {
      await context.upsertCanvasTextNode(owner, { ...node, content: '' });
      const saved = await read(node.id); assert.equal(saved.content, ''); assert.equal(saved.prompt, node.prompt); assert.equal(saved.status, 'completed');
    });
    await check('GENERATION_FAILURE_RETAINS_SOURCE_TEXT', async () => {
      await context.upsertCanvasTextNode(owner, { ...node, status: 'failed', error: '隔离上游暂未返回正文' });
      const saved = await read(node.id); assert.equal(saved.content, node.content); assert.equal(saved.prompt, node.prompt);
      assert.equal(saved.status, 'failed'); assert.equal(saved.error, '隔离上游暂未返回正文');
    });
    await check('MANUAL_RECOVERY_CLEARS_STALE_GENERATION_ERROR', async () => {
      await context.upsertCanvasTextNode(owner, { ...node, error: '旧错误应清理' });
      const saved = await read(node.id); assert.equal(saved.status, 'completed'); assert.equal(saved.error, '');
    });
    await check('TEXT_PATCH_UNDO_AND_REDO_USE_REAL_TRANSACTION', async () => {
      await context.saveCanvasHistory(owner, request(patch('改写后正文')));
      assert.equal((await read(node.id)).content, '改写后正文');
      await context.saveCanvasHistory(owner, request(patch(node.content)));
      assert.equal((await read(node.id)).content, node.content); assert.equal((await read(node.id)).prompt, node.prompt);
      await context.saveCanvasHistory(owner, request(patch('改写后正文')));
      assert.equal((await read(node.id)).content, '改写后正文'); assert.equal((await read(node.id)).prompt, node.prompt);
      assert.equal((await read(node.id)).projectKey, node.projectKey); assert.deepEqual(plain((await read(node.id)).sourceIds), node.sourceIds);
    });
    await check('LEGACY_CONTENT_ONLY_HISTORY_PRESERVES_AI_INSTRUCTION', async () => {
      const fields = patch('旧客户端正文操作'); delete fields.prompt;
      await context.saveCanvasHistory(owner, request(fields));
      assert.equal((await read(node.id)).content, fields.content); assert.equal((await read(node.id)).prompt, node.prompt);
    });
    await check('CONCURRENT_DUPLICATE_OPERATION_IS_IDEMPOTENT', async () => {
      const operation = request(patch('同操作只执行一次'));
      await Promise.all([context.saveCanvasHistory(owner, operation), context.saveCanvasHistory(owner, operation)]);
      const before = await row(node.id); await context.saveCanvasHistory(owner, operation);
      assert.deepEqual(await row(node.id), before);
      assert.equal((await pool.query('SELECT * FROM app_canvas_history_ops WHERE email=$1 AND id=$2', [owner, operation.operationId])).rowCount, 1);
      await assert.rejects(context.saveCanvasHistory(owner, { ...operation, operations: [{ ...operation.operations[0], fields: patch('不同载荷') }] }), /操作编号已使用/);
      assert.deepEqual(await row(node.id), before);
    });
    await check('CROSS_OWNER_UPSERT_REJECTED_WITH_ZERO_ROW_CHANGE', async () => {
      const before = await row(node.id); await assert.rejects(context.upsertCanvasTextNode(other, { ...node, content: '越权修改' }), /无权修改/);
      assert.deepEqual(await row(node.id), before); assert.equal((await context.listCanvasTextNodes(other)).length, 0);
    });
    await check('CROSS_OWNER_HISTORY_REJECTED_WITHOUT_RECEIPT', async () => {
      const operation = request(patch('越权历史')), before = await row(node.id);
      await assert.rejects(context.saveCanvasHistory(other, operation), /无权修改/);
      assert.deepEqual(await row(node.id), before);
      assert.equal((await pool.query('SELECT * FROM app_canvas_history_ops WHERE id=$1', [operation.operationId])).rowCount, 0);
    });
    await check('FAILED_MIXED_STEP_ROLLS_BACK_PRIOR_TEXT_UPDATE', async () => {
      await context.upsertCanvasTextNode(other, { ...node, id: 'text-foreign', content: '他人原文' });
      const operation = request(patch('这段必须回滚')); operation.operations.push({ type: 'text-patch', id: 'text-foreign', fields: patch('越权') });
      const before = await row(node.id), foreign = await row('text-foreign');
      await assert.rejects(context.saveCanvasHistory(owner, operation), /无权修改/);
      assert.deepEqual(await row(node.id), before); assert.deepEqual(await row('text-foreign'), foreign);
      assert.equal((await pool.query('SELECT * FROM app_canvas_history_ops WHERE id=$1', [operation.operationId])).rowCount, 0);
    });
    await check('DELETE_AND_RESTORE_KEEP_CONTENT_INSTRUCTION_AND_LINKS', async () => {
      const saved = await read(node.id);
      await context.saveCanvasHistory(owner, { operationId: crypto.randomUUID(), operations: [{ type: 'text-delete', id: node.id }] });
      assert.equal(await read(node.id), undefined);
      await context.saveCanvasHistory(owner, { operationId: crypto.randomUUID(), operations: [{ type: 'text-restore', node: saved }] });
      const restored = await read(node.id);
      for (const field of ['content', 'prompt', 'projectKey', 'status']) assert.equal(restored[field], saved[field]);
      for (const field of ['sourceIds', 'targetIds', 'productIds']) assert.deepEqual(plain(restored[field]), plain(saved[field]));
    });
    if (args.includes('--verify-instruction-history')) await check('INDEPENDENT_INSTRUCTION_UNDO_REDO_IN_REAL_PG', async () => {
      const previous = await read(node.id);
      await context.saveCanvasHistory(owner, request({ ...patch(previous.content), prompt: '新的写作要求' }));
      assert.equal((await read(node.id)).prompt, '新的写作要求'); assert.equal((await read(node.id)).content, previous.content);
      await context.saveCanvasHistory(owner, request({ ...patch(previous.content), prompt: previous.prompt }));
      assert.equal((await read(node.id)).prompt, previous.prompt);
      await context.saveCanvasHistory(owner, request({ ...patch(previous.content), prompt: '新的写作要求' }));
      assert.equal((await read(node.id)).prompt, '新的写作要求'); assert.equal((await read(node.id)).content, previous.content);
    });
  } catch (error) {
    result = 'FAIL'; failure = error.stack; console.error(error); process.exitCode = 1;
  } finally {
    try { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
    catch (cleanup) { result = 'FAIL'; failure = (failure || '') + '\nSCHEMA_CLEANUP=' + cleanup.stack; process.exitCode = 1; }
    await pool.end();
    const exit = result === 'PASS' ? 0 : 1;
    emit(`CANVAS_TEXT_NODE_UX_PG=${result} CHECKS=${checks.length} REAL_SQL=1 SUPPLIER_CALLS=0 EXIT=${exit}`);
    fs.writeFileSync(path.join(out, 'PG_RESULT.json'), JSON.stringify({ result, command, input, checks, loaded, realSql: true, supplierCalls: 0, exit, ...(failure ? { failure } : {}) }, null, 2));
    fs.writeFileSync(path.join(out, 'STDOUT.txt'), lines.join('\n') + '\n');
    fs.writeFileSync(path.join(out, 'COMMAND.txt'), `COMMAND=${command}\nCANVAS_TEXT_FIXTURE_DATABASE_URL=${input.database}\nEXIT=${exit}\n`);
  }
})();
