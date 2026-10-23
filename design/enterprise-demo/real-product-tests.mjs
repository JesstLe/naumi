// Pure synthetic fixtures only. Run: node design/enterprise-demo/real-product-tests.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import './real-product-model.js';

const M = globalThis.EnterpriseRealModel;
const source = await readFile(new URL('./real-product-model.js', import.meta.url), 'utf8');
let cases = 0;
function check(name, run) {
  try { run(); cases++; }
  catch (error) { error.message = `${name}: ${error.message}`; throw error; }
}
const columnIds = ['title', 'image', 'designer', 'owner', 'started', 'finished', 'status', 'schedule', 'quantity', 'files', 'dispatch', 'taskType', 'attributes', 'send', 'parentText'];
const columns = columnIds.map(id => ({ id, label: `合成列 ${id}`, type: ['image', 'files'].includes(id) ? id : 'text' }));
const row = (id, cells = {}, extra = {}) => ({ id, cells, archived: false, parentId: null, parentConfirmed: false, originRow: null, ...extra });
const doc = rows => ({ columns: structuredClone(columns), rows });
const ids = rows => rows.map(row => row.id);
const ref = (id, name = '合成附件.txt', kind = 'source') => ({ name, id, kind });
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const projectedKeys = ['id', 'title', 'owner', 'designer', 'status', 'schedule', 'started', 'finished', 'dispatch', 'quantity', 'taskType', 'originRow', 'parentId', 'parentTitle', 'parentConfirmed', 'hasUnconfirmedParent', 'images', 'files'];

check('UMD browser, CommonJS and AMD share the exact API', () => {
  assert.deepEqual(Object.keys(M), ['project', 'filter', 'page']);
  const browser = {};
  runInNewContext(source, browser);
  assert.equal(typeof browser.EnterpriseRealModel.project, 'function');
  const common = { module: { exports: {} } };
  runInNewContext(source, common);
  assert.equal(common.module.exports, common.EnterpriseRealModel);
  let amd;
  const define = (dependencies, factory) => { assert.equal(dependencies.length, 0); amd = factory(); };
  define.amd = {};
  const context = { define };
  runInNewContext(source, context);
  assert.equal(amd, context.EnterpriseRealModel);
  assert.equal(JSON.stringify(browser.EnterpriseRealModel.project(doc([]))), JSON.stringify(M.project(doc([]))));
  const require = createRequire(import.meta.url);
  assert.equal(require('./real-product-model.js'), M);
});

check('empty worksheet and defensive empty input', () => {
  const expected = { rows: [], counts: { records: 0, named: 0, completed: 0, inProgress: 0, notStarted: 0, unknown: 0, assigned: 0, unassigned: 0, attachments: 0 }, statusCounts: [], designerCounts: [] };
  for (const input of [doc([]), undefined, null, {}, { rows: null }, { rows: [null, false, [], row('gone', {}, { archived: true })] }]) {
    assert.deepEqual(M.project(input), expected);
  }
  assert.deepEqual(M.filter([], {}), []);
  assert.deepEqual(M.filter(null), []);
  assert.deepEqual(M.page([], 99999), { rows: [], total: 0, page: 1, pages: 1, size: 30 });
});

const fixture364 = doc(Array.from({ length: 364 }, (_, i) => row(`synthetic-${i}`, {
  title: i % 7 === 0 ? '' : `合成记录 ${i}`,
  designer: i % 5 === 0 ? '' : i % 2 === 0 ? '合成设计甲' : '合成设计乙',
  owner: i % 3 === 0 ? '合成来源甲' : '合成来源乙',
  status: ['', '已完成', '未开始', '进行中'][i % 4],
  schedule: i % 2 === 0 ? '合成排期甲' : '合成排期乙',
  started: '2026-01-01', finished: i % 4 === 1 ? '2026-01-02' : '',
  dispatch: '2025-12-31', quantity: String(i % 9), taskType: '合成类型',
  image: i % 4 === 0 ? [ref(`image-${i}`, `合成图片 ${i}.png`)] : [],
  files: i % 6 === 0 ? [ref(`file-${i}`, `合成文件 ${i}.txt`, 'worksheet')] : []
}, { originRow: i + 2 })));
const snapshot364 = JSON.stringify(fixture364);
freeze(fixture364);
const product364 = M.project(fixture364);

check('364 rows, literal statuses, blank titles and deterministic order', () => {
  assert.equal(product364.rows.length, 364);
  assert.deepEqual(ids(product364.rows), ids(fixture364.rows));
  assert.equal(product364.rows[0].title, '');
  assert.deepEqual(product364.counts, { records: 364, named: 312, completed: 91, inProgress: 91, notStarted: 91, unknown: 91, assigned: 291, unassigned: 73, attachments: 152 });
  assert.deepEqual(product364.statusCounts, ['', '已完成', '未开始', '进行中'].map(status => ({ status, count: 91 })));
  assert.equal(product364.counts.completed + product364.counts.inProgress + product364.counts.notStarted + product364.counts.unknown, 364);
  for (const projected of product364.rows) assert.deepEqual(Object.keys(projected), projectedKeys);
  assert.deepEqual(Object.keys(product364), ['rows', 'counts', 'statusCounts', 'designerCounts']);
});

check('designer aggregates include blank names and exact status subtotals', () => {
  assert.deepEqual(product364.designerCounts.map(group => group.name), ['', '合成设计乙', '合成设计甲']);
  for (const group of product364.designerCounts) {
    const matching = product364.rows.filter(row => row.designer === group.name);
    assert.deepEqual(group, { name: group.name, count: matching.length, completed: matching.filter(row => row.status === '已完成').length, inProgress: matching.filter(row => row.status === '进行中').length });
  }
  assert.equal(product364.designerCounts.reduce((total, group) => total + group.count, 0), 364);
});

check('statuses stay literal and never become acceptance facts', () => {
  const statuses = ['', '已完成', '进行中', '未开始', '待复核', 'accepted', '已验收', '已完成 ', ' completed ', '__proto__', 'constructor', 'prototype'];
  const product = M.project(doc(statuses.map((status, i) => row(`status-${i}`, { title: '', status, designer: i % 2 ? '__proto__' : '' }))));
  assert.deepEqual(product.rows.map(row => row.status), statuses);
  assert.deepEqual(product.statusCounts, statuses.map(status => ({ status, count: 1 })));
  assert.deepEqual([product.counts.completed, product.counts.inProgress, product.counts.notStarted, product.counts.unknown], [1, 1, 1, 9]);
  assert.equal(product.counts.named, 0);
  assert.equal(M.filter(product.rows, { status: 'accepted' }).length, 1);
  assert.equal(product.rows.find(row => row.status === '已完成').status, '已完成');
  assert.equal(product.designerCounts.find(group => group.name === '__proto__').count, 6);
  for (const result of product.rows) for (const key of ['orderId', 'accepted', 'acceptedAt', 'credits', 'points', 'personId', 'accountId', 'assignee']) assert.equal(Object.hasOwn(result, key), false);
});

const parentDocument = doc([
  row('parent-a', { title: '合成同名父项', designer: '合成父设计', status: '已完成' }),
  row('parent-b', { title: '合成同名父项' }),
  row('candidate', { title: '合成候选子项', parentText: '合成同名父项' }, { parentId: 'parent-a' }),
  row('confirmed', { title: '合成确认子项' }, { parentId: 'parent-b', parentConfirmed: true, originRow: 20 }),
  row('missing', { title: '合成缺父子项' }, { parentId: 'absent', parentConfirmed: true }),
  row('deleted-parent', { title: '合成已删父项' }, { archived: true }),
  row('deleted-child', { title: '合成保留子项' }, { parentId: 'deleted-parent', parentConfirmed: true }),
  row('hint-only', { title: '合成标签子项', parentText: '合成同名父项' }),
  row('multiple', { title: '合成多候选子项' }, { parentId: ['parent-a', 'parent-b'], parentConfirmed: true }),
  row('self', { title: '合成自关联' }, { parentId: 'self', parentConfirmed: true }),
  row('standalone', { title: '' }),
  row('missing-confirmation', {}, { parentId: 'parent-a', parentConfirmed: undefined }),
  row('nonboolean-confirmation', {}, { parentId: 'parent-a', parentConfirmed: 'true' })
]);
const parents = M.project(freeze(parentDocument));

check('only confirmed valid IDs provide parent context; no inferred or extra rows', () => {
  assert.deepEqual(ids(parents.rows), parentDocument.rows.filter(row => !row.archived).map(row => row.id));
  const confirmed = parents.rows.find(row => row.id === 'confirmed');
  assert.deepEqual([confirmed.parentId, confirmed.parentTitle, confirmed.parentConfirmed, confirmed.hasUnconfirmedParent], ['parent-b', '合成同名父项', true, false]);
  for (const id of ['candidate', 'missing', 'deleted-child', 'hint-only', 'multiple', 'self', 'missing-confirmation', 'nonboolean-confirmation']) {
    const result = parents.rows.find(row => row.id === id);
    assert.deepEqual([result.parentId, result.parentTitle, result.parentConfirmed, result.hasUnconfirmedParent], [null, '', false, true], id);
  }
  const standalone = parents.rows.find(row => row.id === 'standalone');
  assert.deepEqual([standalone.parentId, standalone.parentTitle, standalone.parentConfirmed, standalone.hasUnconfirmedParent], [null, '', false, false]);
  assert.equal(parents.counts.records, 12);
  assert.equal(parents.counts.completed, 1);
  assert.deepEqual(ids(M.filter(parents.rows, { query: '合成确认子项' })), ['confirmed']);
  assert.equal(parents.rows.find(row => row.id === 'confirmed').designer, '');
  assert.equal(parents.rows.find(row => row.id === 'confirmed').status, '');
});

check('duplicate parent IDs and cycles remain standalone', () => {
  const product = M.project(doc([
    row('duplicate', { title: '合成父甲' }), row('duplicate', { title: '合成父乙' }),
    row('duplicate-child', {}, { parentId: 'duplicate', parentConfirmed: true }),
    row('cycle-a', {}, { parentId: 'cycle-b', parentConfirmed: true }),
    row('cycle-b', {}, { parentId: 'cycle-c', parentConfirmed: true }),
    row('cycle-c', {}, { parentId: 'cycle-a', parentConfirmed: true }),
    row('cycle-child', {}, { parentId: 'cycle-b', parentConfirmed: true })
  ]));
  assert.equal(product.rows.length, 7);
  for (const result of product.rows.slice(2)) assert.deepEqual([result.parentId, result.parentConfirmed, result.hasUnconfirmedParent], [null, false, true]);
});

check('confirmed context is not a hierarchy traversal or a field inheritance', () => {
  const rows = Array.from({ length: 10000 }, (_, i) => row(`chain-${i}`, { title: `合成链 ${i}` }, { parentId: i ? `chain-${i - 1}` : null, parentConfirmed: i > 0 }));
  // Child-first order also exercises iterative, memoized validation without recursion.
  rows.reverse();
  const product = M.project(doc(rows));
  assert.deepEqual(ids(product.rows), ids(rows));
  assert.equal(product.rows[0].parentId, 'chain-9998');
  assert.equal(product.rows[0].parentTitle, '合成链 9998');
  assert.equal(product.rows.at(-1).parentConfirmed, false);
  assert.equal(product.rows.at(-1).hasUnconfirmedParent, false);
  assert.equal(M.filter(product.rows, { query: 'chain-9999' }).length, 1);
});

check('attachments accept only arrays of source/worksheet references and copy whitelisted fields', () => {
  const valid = { ...ref('original', '<b>合成原名</b>.png'), url: 'javascript:fixture', mime: 'fixture/type', excelRevision: 'fixture-revision', personId: 'fixture-person' };
  const input = doc([
    row('refs', { image: [valid, null, 'fixture.png', [], {}, ref('', '合成空ID'), ref('blank-name', ''), ref('other', '合成外部', 'external'), { ...ref('numeric'), id: 12 }, { ...ref('name-object'), name: {} }], files: [ref('worksheet', '合成文档.xlsx', 'worksheet'), ref('original', '合成同ID文件.txt')] }),
    row('not-arrays', { image: JSON.stringify([ref('serialized')]), files: { 0: ref('object'), length: 1 } }),
    row('scalar-refs', { image: '合成图片.png', files: ['合成附件.txt'] })
  ]);
  const before = JSON.stringify(input), product = M.project(input);
  assert.deepEqual(product.rows[0].images, [ref('original', '<b>合成原名</b>.png')]);
  assert.deepEqual(product.rows[0].files, [ref('worksheet', '合成文档.xlsx', 'worksheet'), ref('original', '合成同ID文件.txt')]);
  assert.deepEqual(product.rows[1].images, []);
  assert.deepEqual(product.rows[1].files, []);
  assert.deepEqual(product.rows[2].images, []);
  assert.deepEqual(product.rows[2].files, []);
  assert.equal(product.counts.attachments, 3);
  assert.notEqual(product.rows[0].images[0], valid);
  product.rows[0].images[0].name = '合成输出改名';
  product.rows[0].files.push(ref('new'));
  assert.equal(JSON.stringify(input), before);
});

check('cell IDs, literal text, original IDs and lineage survive without profile mapping', () => {
  const input = doc([
    row('literal-id', { title: '  合成标题  ', owner: '合成显示名', designer: '合成显示名', status: null, schedule: '排期原文', started: '日期原文', finished: '', dispatch: '下发原文', quantity: '02 套', taskType: '类型原文', attributes: '内部属性', send: '发送原文' }, { originRow: 0, profileId: 'fixture-profile' }),
    row(0, { title: '', designer: '   ', quantity: 0, status: undefined }),
    row('missing-cells', undefined), row('null-cells', null), row('object-cells', { title: { name: '合成对象' }, designer: [ref('not-person')], owner: false })
  ]);
  input.columns.reverse();
  input.columns.forEach(column => { column.label = '合成重命名列'; column.visible = false; });
  const product = M.project(input), first = product.rows[0];
  assert.equal(first.id, 'literal-id');
  assert.equal(first.originRow, 0);
  assert.equal(product.rows[1].id, 0);
  assert.equal(product.rows[1].originRow, null);
  assert.equal(first.title, '  合成标题  ');
  assert.equal(first.owner, '合成显示名');
  assert.equal(first.designer, '合成显示名');
  assert.equal(first.quantity, '02 套');
  assert.equal(product.rows[1].quantity, '0');
  assert.deepEqual([first.schedule, first.started, first.finished, first.dispatch, first.taskType], ['排期原文', '日期原文', '', '下发原文', '类型原文']);
  assert.deepEqual(product.rows.map(row => row.status), ['', '', '', '', '']);
  assert.equal(product.rows[4].title, '');
  assert.equal(product.rows[4].designer, '');
  assert.equal(product.rows[4].owner, 'false');
  assert.equal(product.counts.assigned, 1);
  assert.equal(product.counts.unassigned, 4);
  for (const result of product.rows) assert.deepEqual(Object.keys(result), projectedKeys);
});

const searchRows = M.project(doc([
  row('search-a', { title: '合成 Alpha 工作', designer: '合成设计甲', owner: '合成来源甲', status: '进行中', schedule: '合成排期', files: [ref('pdf', '合成说明.PDF')] }, { originRow: 42 }),
  row('search-b', { title: '合成 alpha 工作', designer: '合成设计乙', owner: '合成来源甲', status: '已完成' }),
  row('search-c', { title: '合成 Alpha 工作', designer: '合成设计甲', owner: '合成来源乙', status: '进行中' }),
  row('search-blank', { title: '', designer: '', owner: '', status: '', image: [ref('png', '合成图片.PNG')] }),
  row('search-partial', { title: '合成 Alpha 工作', designer: '合成设计甲乙', owner: '合成来源甲', status: '进行中 ' }),
  row('search-hidden', { title: '合成已归档关键字' }, { archived: true })
])).rows;

check('keyword search is case-insensitive, literal and includes displayed fields', () => {
  assert.deepEqual(ids(M.filter(searchRows, { query: ' ALPHA ' })), ['search-a', 'search-b', 'search-c', 'search-partial']);
  for (const query of ['合成设计甲', '合成来源甲', '进行中', '合成排期', '说明.pdf', '42', 'search-a']) assert(ids(M.filter(searchRows, { query })).includes('search-a'), query);
  assert.deepEqual(ids(M.filter(searchRows, { query: '图片.png' })), ['search-blank']);
  assert.deepEqual(M.filter(searchRows, { query: '合成已归档关键字' }), []);
  assert.deepEqual(M.filter(searchRows, { query: 'Alpha.*' }), []);
  assert.deepEqual(ids(M.filter(searchRows, { query: '   ' })), ids(searchRows));
  assert.deepEqual(ids(M.filter(searchRows)), ids(searchRows));
});

check('all exact filters combine with query via AND without reordering', () => {
  assert.deepEqual(ids(M.filter(searchRows, { query: 'alpha', status: '进行中', designer: '合成设计甲', owner: '合成来源甲' })), ['search-a']);
  assert.deepEqual(ids(M.filter(searchRows, { designer: '合成设计甲', status: '进行中' })), ['search-a', 'search-c']);
  assert.deepEqual(ids(M.filter(searchRows, { status: '进行中 ' })), ['search-partial']);
  assert.deepEqual(M.filter(searchRows, { designer: '设计甲' }), []);
  assert.deepEqual(M.filter(searchRows, { status: '已完成', designer: '合成设计甲' }), []);
  assert.deepEqual(ids(M.filter(searchRows, { status: '', designer: '', owner: '' })), ['search-blank']);
  assert.deepEqual(ids(M.filter(searchRows, { status: null, designer: undefined, owner: null })), ids(searchRows));
  assert.equal(M.filter(searchRows, { status: '进行中' })[0], searchRows[0]);
});

check('query length is capped at 120', () => {
  const query = 'x'.repeat(120);
  const rows = M.project(doc([row('long-match', { title: query }), row('long-other', { title: 'x'.repeat(119) })])).rows;
  assert.deepEqual(ids(M.filter(rows, { query: query + 'ignored' })), ['long-match']);
  assert.deepEqual(ids(M.filter(rows, { query: '  ' + query + 'ignored  ' })), ['long-match']);
});

check('pagination defaults, exact boundaries, invalid input and clamping', () => {
  const first = M.page(product364.rows);
  assert.deepEqual([first.total, first.page, first.pages, first.size, first.rows.length], [364, 1, 13, 30, 30]);
  assert.equal(first.rows[0], product364.rows[0]);
  assert.equal(first.rows[29], product364.rows[29]);
  const second = M.page(product364.rows, '2');
  assert.deepEqual(ids(second.rows), ids(product364.rows.slice(30, 60)));
  for (const requested of [13, 14, 10000, 10001, Number.MAX_SAFE_INTEGER, Infinity]) {
    const last = M.page(product364.rows, requested);
    assert.deepEqual([last.page, last.rows.length, last.rows[0].id, last.rows.at(-1).id], [13, 4, 'synthetic-360', 'synthetic-363']);
  }
  for (const requested of [undefined, null, '', 0, -1, -Infinity, NaN, 'invalid', 1.9]) assert.equal(M.page(product364.rows, requested).page, 1);
  for (const size of [undefined, null, '', 0, -1, Infinity, NaN, 'invalid']) assert.equal(M.page(product364.rows, 1, size).size, 30);
  assert.deepEqual([M.page(product364.rows, 2, '7').size, M.page(product364.rows, 2, '7').rows[0].id], [7, 'synthetic-7']);
  assert.equal(M.page(product364.rows, 1, 7.9).size, 7);
  assert.equal(M.page(product364.rows, 1, 1000).pages, 1);
  assert.equal(M.page(product364.rows, 1, 1000).rows.length, 364);
  assert.deepEqual(M.page(null, 5), { rows: [], total: 0, page: 1, pages: 1, size: 30 });
  const tenThousand = Array.from({ length: 10000 }, (_, i) => ({ id: `page-${i}` }));
  assert.deepEqual(ids(M.page(tenThousand, 10001, 1).rows), ['page-9999']);
  const filtered = M.filter(product364.rows, { status: '已完成' });
  assert.deepEqual([M.page(filtered, 999).total, M.page(filtered, 999).page, M.page(filtered, 999).pages, M.page(filtered, 999).rows.length], [91, 4, 4, 1]);
});

check('HTML remains inert source text; no markup or identity is inferred', () => {
  const html = '<img src=x onerror="fixture()"> & <script>fixture()</script>';
  const input = doc([row('html', { title: html, designer: '<b>合成设计</b>', owner: '&lt;合成来源&gt;', status: '<i>已完成</i>', files: [ref('html-ref', '<strong>合成附件</strong>.txt')] })]);
  const product = M.project(input), result = product.rows[0];
  assert.equal(result.title, html);
  assert.equal(result.designer, '<b>合成设计</b>');
  assert.equal(result.owner, '&lt;合成来源&gt;');
  assert.equal(result.status, '<i>已完成</i>');
  assert.equal(product.counts.completed, 0);
  assert.equal(product.counts.unknown, 1);
  assert.deepEqual(ids(M.filter(product.rows, { query: 'onerror="fixture()"' })), ['html']);
  assert.deepEqual(ids(M.filter(product.rows, { query: '<strong>' })), ['html']);
  assert.equal(Object.hasOwn(result, 'html'), false);
});

check('projection, filtering, paging and output changes leave the original document untouched', () => {
  assert.equal(JSON.stringify(fixture364), snapshot364);
  const before = JSON.stringify(product364);
  const filtered = M.filter(product364.rows, { query: '合成', designer: '合成设计甲' });
  M.page(filtered, 2, 5);
  M.filter(product364.rows, { status: '' });
  assert.equal(JSON.stringify(product364), before);
  assert.equal(JSON.stringify(fixture364), snapshot364);
  const mutable = doc([row('isolation', { title: '合成原题', image: [ref('original-image', '合成原图.png')], files: [ref('original-file')] })]);
  const original = JSON.stringify(mutable), result = M.project(mutable);
  result.rows[0].title = '合成输出标题';
  result.rows[0].images[0].id = 'changed-output';
  result.rows[0].files.length = 0;
  result.rows.push(row('output-only'));
  result.statusCounts[0].count = 100;
  result.designerCounts[0].name = '合成输出人员';
  assert.equal(JSON.stringify(mutable), original);
  assert.notEqual(M.project(mutable).rows[0], mutable.rows[0]);
});

console.log(`REAL_PRODUCT_MODEL_PASS: cases=${cases} synthetic_rows=364 umd=browser+node+amd source_unchanged=1 literal_status=1 confirmed_context_only=1 filters=AND pagination=1`);
