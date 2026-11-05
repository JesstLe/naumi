/** Actual ImageReferenceComposer/InlineReferenceEditor pending-prompt contract. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { chromium, expect, type Page } from '@playwright/test';
import ts from 'typescript';

const arg = (name: string) => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
const root = process.cwd(), sourceRoot = path.resolve(arg('--source-root') || root);
const legacy = process.argv.includes('--legacy');
const out = path.resolve(arg('--out') || process.env.CANVAS_TEST_OUT || 'output/native-pending-prompt');
const originalCommit = 'a8a36ffed670312a91a0b25fa4af35476329990f';
const interactionFile = 'scripts/verify-scene-native-interactions.ts';
const scene = '庭院 · 交互\n石阶连接木廊，石桌靠东，跨镜头保持布局\n夜景：木廊暖灯照明，空间位置保持';
const character = '林舟 · 交互\n短发，左眉有疤，跨镜头保持身份\n外套：深蓝外套，保持左眉疤痕';
const unicode = '庭院 🌌 · café\n木廊「东侧」𠮷野，灯光：蓝 → 金\n夜景：保持 e\u0301 与 é 的原始字符';
const productFiles = [
  'src/components/canvas/image-reference-composer.tsx',
  'src/components/canvas/inline-reference-editor.tsx',
  'src/components/canvas/inline-reference-dom.ts',
  'src/components/canvas/reference-mention-panel.tsx',
];

// State/ports only: all contentEditable rendering, multiline editing, readOnly
// behavior and token detection come from the actual product components.
const entry = `
import React,{useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {ImageReferenceComposer} from '@/components/canvas/image-reference-composer';
function Composer({prompt,onPrompt,readOnly=false}){
 const textareaRef=useRef(null);
 return <ImageReferenceComposer references={[]} prompt={prompt} onPrompt={onPrompt} textareaRef={textareaRef} placeholder="节点提示词" readOnly={readOnly} onRole={()=>{}} onRemove={()=>{}} onPreview={()=>{}} onLocate={()=>{}}/>;
}
function App(){
 const[prompt,setPrompt]=useState(''),[readOnly,setReadOnly]=useState(false),[duplicate,setDuplicate]=useState(false),[hidden,setHidden]=useState(false),[decoy,setDecoy]=useState('外部同名编辑器：不属于目标 dock');
 window.pendingPromptFixture={get:()=>({prompt,readOnly,duplicate,hidden,decoy}),configure:value=>{setPrompt(value.prompt);setReadOnly(!!value.readOnly);setDuplicate(!!value.duplicate);setHidden(!!value.hidden)}};
 return <main><aside data-testid="outside-dock"><Composer prompt={decoy} onPrompt={setDecoy}/></aside><section data-testid="pending-node-dock" style={{display:hidden?'none':'block'}}><Composer prompt={prompt} onPrompt={setPrompt} readOnly={readOnly}/>{duplicate&&<Composer prompt={prompt} onPrompt={setPrompt} readOnly={readOnly}/>}</section></main>;
}
createRoot(document.getElementById('root')).render(<App/>);
`;
type FixtureConfig = { prompt: string; readOnly?: boolean; duplicate?: boolean; hidden?: boolean };
type FixtureState = FixtureConfig & { decoy: string };
const fixtureState = (page: Page) => page.evaluate(() => (window as unknown as { pendingPromptFixture: { get: () => FixtureState } }).pendingPromptFixture.get());

async function main() {
  await mkdir(out, { recursive: true });
  const productHashes: Record<string, string> = {};
  for (const file of productFiles) productHashes[file] = createHash('sha256').update(await readFile(path.join(sourceRoot, file))).digest('hex');
  const bundle = await build({
    stdin: { contents: entry, loader: 'tsx', resolveDir: root }, outfile: path.join(out, 'fixture.js'),
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { 'process.env': '{}', 'process.env.NODE_ENV': '"development"' },
    alias: { '@': path.join(sourceRoot, 'src'), react: path.join(root, 'node_modules/react'), 'react-dom': path.join(root, 'node_modules/react-dom') },
    nodePaths: [path.join(root, 'node_modules')], tsconfig: path.join(sourceRoot, 'tsconfig.json'),
  });
  for (const file of bundle.outputFiles) await writeFile(file.path, file.contents);
  const browserCode = bundle.outputFiles.find(file => file.path.endsWith('.js'))!.text;
  const css = bundle.outputFiles.filter(file => file.path.endsWith('.css')).map(file => file.text).join('\n');
  const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const errors: string[] = [], unexpectedRequests: string[] = [], cases: Array<Record<string, unknown>> = [];
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await context.route('**/*', route => { unexpectedRequests.push(route.request().url()); return route.abort(); });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  const dock = page.getByTestId('pending-node-dock');
  const editor = dock.getByRole('textbox', { name: '节点提示词', exact: true });
  async function open(config: FixtureConfig) {
    await page.goto('about:blank');
    await page.setContent('<!doctype html><meta charset="utf-8"><style>' + css + 'body{font:14px system-ui;background:#f8fafc;color:#334155}main{width:820px;margin:24px auto}section,aside{padding:20px;background:#fff;border:1px solid #e2e8f0;margin:16px} [contenteditable]{min-height:112px;white-space:pre-wrap}</style><div id="root"></div>');
    await page.addScriptTag({ content: browserCode });
    await page.getByTestId('outside-dock').getByRole('textbox', { name: '节点提示词', exact: true }).waitFor();
    await page.evaluate(value => (window as unknown as { pendingPromptFixture: { configure: (value: FixtureConfig) => void } }).pendingPromptFixture.configure(value), config);
    await expect.poll(async () => (await fixtureState(page)).prompt).toBe(config.prompt);
    assert.equal(await dock.locator('textarea').count(), 0, 'actual pending composer is not a textarea');
  }
  async function unchanged(config: FixtureConfig) {
    assert.equal((await fixtureState(page)).prompt, config.prompt);
    assert.equal((await fixtureState(page)).decoy, '外部同名编辑器：不属于目标 dock');
  }
  try {
    if (legacy) {
      const oldFile = arg('--legacy-source');
      const original = oldFile ? await readFile(path.resolve(oldFile), 'utf8') : execFileSync('git', ['show', `${originalCommit}:${interactionFile}`], { cwd: root, encoding: 'utf8' });
      const ast = ts.createSourceFile(interactionFile, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      const initializers: string[] = [], assertions: string[] = [];
      const visit = (node: ts.Node) => {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'pendingText' && node.initializer) initializers.push(node.initializer.getText(ast));
        if (ts.isCallExpression(node) && node.expression.getText(ast) === 'assert.ok' && node.arguments[0]?.getText(ast).includes('pendingText.some')) assertions.push(node.getText(ast));
        ts.forEachChild(node, visit);
      };
      visit(ast); assert.equal(initializers.length, 1); assert.equal(assertions.length, 1);
      assert.ok(initializers[0].includes('locator("textarea")'), 'bind original scene textarea locator exactly');
      assert.ok(assertions[0].includes('木廊暖灯照明') && assertions[0].includes('石桌靠东'), 'bind original keyword assertion exactly');
      await open({ prompt: scene });
      await expect(editor).toHaveText(scene, { useInnerText: false });
      const compiled = ts.transpileModule('async function collect(page) { return ' + initializers[0] + '; }', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
      const pendingText: string[] = await new Function('page', compiled + ';return collect(page);')(page);
      assert.deepEqual(pendingText, []);
      let failure = '';
      try { new Function('pendingText', 'assert', assertions[0] + ';')(pendingText, assert); } catch (error) { failure = String(error); }
      assert.ok(failure.includes('[]')); await unchanged({ prompt: scene });
      assert.deepEqual(errors, []); assert.deepEqual(unexpectedRequests, []);
      const result = 'NATIVE_PENDING_PROMPT=BASELINE_FAIL reason=textarea_does_not_match_contenteditable observed=[] suppliers=0 pageerrors=0';
      await writeFile(path.join(out, 'RESULT.json'), JSON.stringify({ mode: 'legacy', sourceRoot, originalCommit, productHashes, originalSourceSha256: createHash('sha256').update(original).digest('hex'), originalInitializer: initializers[0], originalAssertion: assertions[0], pendingText, actualPrompt: await editor.textContent(), actualTag: await editor.evaluate(element => element.tagName), failure, errors, unexpectedRequests, result, exit: 1 }, null, 2));
      console.log(result); process.exitCode = 1; return;
    }

    const { assertPlainPendingPrompt } = await import(pathToFileURL(path.join(sourceRoot, 'scripts/verification/native-pending-prompt.ts')).href);
    for (const [name, prompt] of [['scene-three-lines', scene], ['character-three-lines', character], ['unicode-and-exact-newlines', unicode]]) {
      await open({ prompt });
      assert.equal(await page.getByRole('textbox', { name: '节点提示词', exact: true }).count(), 2, 'same-name real composer exists outside dock');
      const receipt = await assertPlainPendingPrompt(dock, prompt);
      assert.equal(receipt.text, prompt); assert.equal(receipt.tag.toUpperCase(), 'DIV'); assert.equal(receipt.contentEditable, 'true'); assert.equal(receipt.ariaReadonly, 'false'); assert.equal(receipt.tokens, 0);
      await unchanged({ prompt }); cases.push({ name, receipt });
    }

    await open({ prompt: '' });
    await editor.fill('林舟 🌌 · 编辑');
    await editor.press('End'); await editor.press('Enter');
    await editor.pressSequentially('左眉疤痕，保持身份');
    await editor.press('Enter'); await editor.pressSequentially('外套：深蓝 🎬');
    const typed = '林舟 🌌 · 编辑\n左眉疤痕，保持身份\n外套：深蓝 🎬';
    await expect.poll(async () => (await fixtureState(page)).prompt).toBe(typed);
    const typedReceipt = await assertPlainPendingPrompt(dock, typed);
    assert.equal(typedReceipt.text, typed); await unchanged({ prompt: typed });
    cases.push({ name: 'real-contenteditable-typing-and-multiline-onPrompt', receipt: typedReceipt });

    async function reject(name: string, config: FixtureConfig, expected = scene) {
      await open(config); const started = performance.now(); let failure = '';
      try { await assertPlainPendingPrompt(dock, expected, { timeout: 300 }); } catch (error) { failure = String(error); }
      assert.ok(failure, name + ' must reject rather than use decoy, textarea, partial match or token text');
      await unchanged(config); cases.push({ name, expected, actual: config.prompt, elapsedMs: performance.now() - started, failure });
    }
    await reject('wrong-prefix-not-keyword-substring', { prompt: '错误标题\n' + scene.split('\n').slice(1).join('\n') });
    await reject('missing-third-line', { prompt: scene.split('\n').slice(0, 2).join('\n') });
    await reject('extra-trailing-line', { prompt: scene + '\n额外文本' });
    await reject('line-breaks-are-not-collapsed-whitespace', { prompt: scene.replaceAll('\n', ' ') });
    await reject('real-readonly-composer', { prompt: scene, readOnly: true });
    await reject('hidden-real-composer', { prompt: scene, hidden: true });
    await reject('duplicate-real-editors-inside-dock', { prompt: scene, duplicate: true });

    await open({ prompt: '参考【图1】\n保持身份\n外套：深蓝' });
    await expect(editor.locator('[data-inline-token]')).toHaveCount(1);
    const tokenText = (await editor.textContent())!; let tokenFailure = '';
    try { await assertPlainPendingPrompt(dock, tokenText, { timeout: 300 }); } catch (error) { tokenFailure = String(error); }
    assert.ok(tokenFailure, 'a matching rendered text still rejects an actual inline token');
    await unchanged({ prompt: '参考【图1】\n保持身份\n外套：深蓝' });
    cases.push({ name: 'real-product-token-rejected-even-when-visible-text-matches', expected: tokenText, tokens: await editor.locator('[data-inline-token]').count(), failure: tokenFailure });

    assert.deepEqual(errors, []); assert.deepEqual(unexpectedRequests, []);
    for (const [file, hash] of Object.entries(productHashes)) assert.equal(createHash('sha256').update(await readFile(path.join(sourceRoot, file))).digest('hex'), hash, 'product bytes remain unchanged');
    const result = `NATIVE_PENDING_PROMPT=PASS cases=${cases.length} real_react=1 editor=contenteditable decoy_changes=0 suppliers=0 network_requests=0 pageerrors=0`;
    await writeFile(path.join(out, 'RESULT.json'), JSON.stringify({ mode: 'current', sourceRoot, productHashes, cases, errors, unexpectedRequests, result, exit: 0 }, null, 2));
    console.log(result);
  } catch (error) {
    await writeFile(path.join(out, 'FAILURE.json'), JSON.stringify({ error: String(error), cases, errors, unexpectedRequests }, null, 2));
    throw error;
  } finally {
    await browser.close(); console.log('NATIVE_PENDING_PROMPT_CLEANUP=PASS browser_closed=1 servers=0');
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
