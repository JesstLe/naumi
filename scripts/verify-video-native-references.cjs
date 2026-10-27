const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const esbuild = require('esbuild');

const mode = process.argv[2] || 'MODIFIED', root = path.resolve(process.argv[3] || '.');
const modified = mode === 'MODIFIED';
function load(file) {
  const result = esbuild.buildSync({ entryPoints: [path.join(root, file)], bundle: true, platform: 'node', format: 'cjs', write: false, nodePaths: [path.resolve('node_modules')] });
  const module = { exports: {} };
  vm.runInThisContext('(function(module,exports,require){' + result.outputFiles[0].text + '\n})', { filename: file })(module, module.exports, require);
  return module.exports;
}
const compile = load('src/lib/video/prompt.ts').compileVideoPrompt;
const input = (id, kind = 'image', nodeId = id) => ({ id, nodeId, kind, role: kind === 'text' ? 'context' : kind === 'video' ? 'source_video' : kind === 'audio' ? 'source_audio' : 'reference', value: kind === 'text' ? '原文对白\n不截断' : 'https://fixture.test/' + id });
const before = [input('a'), input('b'), input('v', 'video'), input('s', 'audio'), input('t', 'text')];
const reversed = [before[3], before[1], before[4], before[2], before[0]];

async function repositoryChecks(remap) {
  const source = fs.readFileSync(path.join(root, 'src/lib/canvas/video-node-repository.ts'), 'utf8');
  const ast = ts.createSourceFile('repository.ts', source, ts.ScriptTarget.Latest, true);
  const functions = {};
  ts.forEachChild(ast, node => { if (ts.isFunctionDeclaration(node) && node.name) functions[node.name.text] = node.getText(ast); });
  assert.ok(functions.saveVideoNodeTx && functions.mapNode);
  const old = { id: 'node', project_key: 'tree:node', revision: 3, title: '视频', x: 1, y: 2, width: 384, height: 320,
    config: { prompt: '锁定 {{ref 1}} 与 图片2', providerOptions: { seed: 0, cameraFixed: false, unknown: 'preserved' } }, inputs: structuredClone(before),
    last_task_id: null, last_result_id: null, display_result_id: null, deleted_at: null, created_at: new Date(), updated_at: new Date() };
  let row = structuredClone(old), operation, writes = 0, sql = [];
  const client = { async query(query, values = []) {
    sql.push(query);
    if (query.includes('FROM app_canvas_video_node_operations')) return { rows: operation ? [operation] : [] };
    if (query.includes('SELECT * FROM app_canvas_video_nodes')) return { rows: [row] };
    if (query.includes('SELECT id,inputs FROM app_canvas_video_nodes')) return { rows: [{ id: row.id, inputs: row.inputs }] };
    if (query.startsWith('INSERT INTO app_canvas_video_projects')) return { rows: [] };
    if (query.startsWith('INSERT INTO app_canvas_video_nodes')) {
      writes++; row = { ...row, revision: row.revision + 1, config: JSON.parse(values[8]), inputs: JSON.parse(values[9]) }; return { rows: [row] };
    }
    if (query.startsWith('INSERT INTO app_canvas_video_node_operations')) { operation = { node_id: values[2], input_digest: values[3], result: JSON.parse(values[4]) }; return { rows: [] }; }
    if (query.includes('pg_advisory_xact_lock')) return { rows: [] };
    throw Error('Unexpected fixture SQL: ' + query);
  } };
  class ModelConfigError extends Error { constructor(code, message, status) { super(message); this.code = code; this.status = status; } }
  const context = vm.createContext({ exports: {}, createHash: crypto.createHash, canonicalConfig: JSON.stringify, ModelConfigError, remapVideoPromptReferences: remap,
    require(name) { assert.equal(name, '../video/prompt-references'); return { remapVideoPromptReferences: remap }; } });
  const code = functions.mapNode + '\n' + functions.saveVideoNodeTx;
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText, context);
  const request = { id: 'node', expectedRevision: 3, operationId: 'op', inputs: reversed };
  const result = await context.saveVideoNodeTx(client, 'fixture@test', request, 'tree:node');
  assert.equal(result.config.prompt, modified ? '锁定 {{ref 5}} 与 图片1' : old.config.prompt);
  assert.deepEqual(JSON.parse(JSON.stringify(result.config.providerOptions)), old.config.providerOptions);
  const replay = await context.saveVideoNodeTx(client, 'fixture@test', request, 'tree:node');
  assert.equal(replay.revision, result.revision); assert.equal(writes, 1);
  assert.equal(sql.some(query => /^(BEGIN|COMMIT|ROLLBACK)$/.test(query)), false);
  operation = undefined;
  await assert.rejects(context.saveVideoNodeTx(client, 'fixture@test', { ...request, operationId: 'other' }, 'tree:node'), /已更新/);
  row = structuredClone(old); operation = undefined;
  const explicit = { ...request, operationId: 'edit', config: { ...old.config, prompt: '新的意图 {{ref 1}}' } };
  const edited = await context.saveVideoNodeTx(client, 'fixture@test', explicit, 'tree:node');
  assert.equal(edited.config.prompt, explicit.config.prompt);
  return 'PASS';
}

async function main() {
  if (!modified) {
    assert.equal(compile('{{ref 1}}', before).bindings['ref 1'].id, 'a');
    assert.equal(compile('{{ref 1}}', reversed).bindings['ref 1'].id, 's');
    assert.equal(compile('{{ref 1}}', before.slice(1)).bindings['ref 1'].id, 'b');
    await repositoryChecks();
    console.log(`${mode}=PASS REORDER_RETARGET=REPRODUCED DELETE_RETARGET=REPRODUCED TX_REPLAY=PASS EXIT=0`);
    return;
  }
  const { remapVideoPromptReferences: remap, displayVideoPrompt: display, serializeVideoPrompt: serialize, insertVideoPromptReference: insert, videoReferenceNames: names } = load('src/lib/video/prompt-references.ts');
  const prompt = '先看 {{ref 1}}，对比 图片2；运动 视频1，声音 音频1，文字 {{ ref 5 }}。';
  const changed = remap(prompt, before, reversed);
  assert.equal(changed, '先看 {{ref 5}}，对比 图片1；运动 视频1，声音 音频1，文字 {{ref 3}}。');
  assert.equal(compile(changed, reversed).bindings['ref 5'].id, 'a');
  assert.equal(compile(changed, reversed).bindings['图片1'].id, 'b');
  assert.equal(remap(prompt, before, before), prompt);
  const removed = remap(prompt, before, before.slice(1));
  assert.ok(removed.startsWith('先看 {{ref 0}}'));
  assert.throws(() => compile(removed, before.slice(1)), /已移除/);
  assert.equal(remap('{{ref 99}}', before, before), '{{ref 0}}');
  assert.equal(remap('{{ref 1}}', before, [{ ...before[0], nodeId: 'different' }, ...before.slice(1)]), '{{ref 0}}');
  const choices = before.map((item, index) => ({ nodeId: item.nodeId, title: ['产品主图', '产品主图', '运镜片段', '音色样本', '剧本'][index] }));
  const shown = display(prompt, before, choices);
  assert.ok(shown.includes('@【产品主图】') && shown.includes('@【产品主图 · 2】'));
  assert.ok(!shown.includes('{{ref') && !shown.includes('图片2'));
  const restored = serialize(shown, before, choices);
  assert.equal(compile(restored, before).prompt, compile(prompt, before).prompt);
  assert.equal(display(removed, before.slice(1), choices).includes('@【失效引用】'), true);
  assert.equal(serialize('@【失效引用】', before, choices), '{{ref 0}}');
  assert.equal(names(before, [{ nodeId: 'a', title: '失效引用' }]).get('a'), '失效引用 · 2');
  assert.equal(serialize('普通 @人名 和原文【保留】', before, choices), '普通 @人名 和原文【保留】');
  const mention = insert('开头 @结尾', before, before, choices, 'v', 3, 4);
  assert.equal(mention.prompt, '开头 {{ref 3}}结尾');
  assert.equal(mention.caret, '开头 @【运镜片段】'.length);
  const replace = insert('{{ref 1}} / 结尾', before, before, choices, 'b', 2, 4);
  assert.equal(replace.prompt, '{{ref 2}} / 结尾');
  let permutations = 0;
  function permute(values, prefix = []) {
    if (!values.length) {
      const request = remap('{{ref 1}} {{ref 2}} {{ref 3}} {{ref 4}} {{ref 5}}', before, prefix);
      const order = Array.from(request.matchAll(/ref (\d+)/g), match => prefix[Number(match[1]) - 1].id);
      assert.deepEqual(order, before.map(item => item.id)); permutations++; return;
    }
    values.forEach((value, index) => permute(values.filter((_, i) => i !== index), [...prefix, value]));
  }
  permute(before);
  await repositoryChecks(remap);
  const labels = load('src/lib/video/option-labels.ts');
  assert.equal(labels.videoOptionLabel('seed'), '随机种子'); assert.equal(labels.videoOptionLabel('opaqueVendorFlag'), undefined);
  assert.equal(labels.videoOptionValueLabel('character_orientation', 'image'), '跟随角色图片');
  console.log(`MODIFIED=PASS PERMUTATIONS=${permutations} NAMED_MENTIONS=PASS IDENTITY=STABLE REMOVAL=INVALID_NOT_RETARGETED LEGACY_WIRE=COMPATIBLE TX_REPLAY=PASS ZERO_FALSE_UNKNOWN=PRESERVED EXIT=0`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
