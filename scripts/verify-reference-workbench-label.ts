import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import vm from 'node:vm';

async function main() {
  const baseline = process.argv.includes('--baseline');
  const label = baseline ? '批量出图' : '参考工作台';
  const source = readFileSync('src/lib/tool-meta.ts', 'utf8');
  const result = await build({ stdin: { contents: 'import {TOOLS,toolByKey,toolBySlug} from "./src/lib/tool-meta"; globalThis.__catalog={TOOLS,toolByKey,toolBySlug};', resolveDir: process.cwd() }, bundle: true, write: false, platform: 'browser', format: 'iife', nodePaths: process.env.NAUMI_LABEL_TEST_NODE_MODULES ? [process.env.NAUMI_LABEL_TEST_NODE_MODULES] : [] });
  const context = vm.createContext({ console });
  vm.runInContext(result.outputFiles[0].text, context);
  const catalog = (context as any).__catalog;
  const tool = catalog.toolBySlug('batchshot');
  assert.equal(tool.key, label);
  assert.equal(tool.href, '/batchshot');
  assert.equal(tool.cost, 0);
  assert.equal(tool.workspace, true);
  assert.equal(tool.live, true);
  assert.equal(tool.inMenu, true);
  assert.equal(catalog.TOOLS.filter((item: any) => item.slug === 'batchshot').length, 1);
  assert.equal(catalog.toolByKey('批量出图'), tool, 'old label still resolves the same tool');
  if (!baseline) {
    assert.equal(catalog.toolByKey('参考工作台'), tool);
    assert.equal(tool.en, 'Reference workbench');
    assert.equal(tool.action, '打开参考工作台');
    assert.ok(!source.includes('action: "开始批量出图"'));
  }
  const page = readFileSync('src/app/batchshot/page.tsx', 'utf8');
  assert.ok(page.includes('title: `' + label + ' — ${BRAND}`'));
  assert.ok(page.includes('redirect(process.env.REFERENCE_WORKBENCH_URL?.trim() || "https://47.105.59.142/workbench")'));
  const client = readFileSync('src/components/labs/workbench-client.tsx', 'utf8');
  assert.ok(client.includes('text-c-text">' + label + '</span>'));
  assert.ok(client.includes('leading-6">' + label + '</h1>'));
  assert.ok(readFileSync('src/lib/desktop/routes.ts','utf8').includes('"batchshot"'));
  assert.ok(readFileSync('src/lib/feature-access/catalog.ts','utf8').includes('id: tool.slug, label: tool.key'));
  console.log((baseline ? 'BASELINE_LABEL=PASS OLD_LABEL' : 'MODIFIED_LABEL=PASS REFERENCE_WORKBENCH OLD_LABEL_ALIAS') + ' ROUTE_BATCHSHOT PERMISSION_SLUG COST0 REDIRECT_LAYOUT_QUEUE_UNCHANGED');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
