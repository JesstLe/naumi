/** Real VideoPromptEditor DOM/portal regression; no replacement component or supplier. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
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
const out = path.resolve(arg('--out') || process.env.CANVAS_TEST_OUT || process.env.REFERENCE_MENTION_EVIDENCE || 'output/reference-mention-locator');
const originalCommit = '13a380962edf9a9b2e5cb332c99f3fd06144c122';
const interactionFile = 'scripts/verify-timeline-native-interactions.ts';
const productFiles = [
  'src/components/canvas/video/prompt-editor.tsx',
  'src/components/canvas/inline-reference-editor.tsx',
  'src/components/canvas/reference-mention-panel.tsx',
  'src/components/canvas/inline-reference-dom.ts',
  'src/lib/video/prompt-references.ts',
];

// Only the App's state/onMention ports are supplied. Rendering, caret handling,
// wire-format insertion, token projection, disabled state and portal are real.
const entry = `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {VideoPromptEditor} from '@/components/canvas/video/prompt-editor';
import {insertVideoPromptReference} from '@/lib/video/prompt-references';
const choices=[
 {id:'timeline',nodeId:'timeline-node:fixture',title:'多轨',kind:'video',value:'fixture-artwork',available:true},
 {id:'pending',nodeId:'timeline-node:pending',title:'未完成',kind:'video',value:'pending-artwork',available:false},
];
function App(){
 const[prompt,setPrompt]=useState(''),[inputs,setInputs]=useState([]),[mentions,setMentions]=useState([]);
 const mention=(choice,start,end)=>{
  const after=inputs.some(input=>input.nodeId===choice.nodeId)?inputs:[...inputs,{id:'ref-'+choice.id,nodeId:choice.nodeId,kind:choice.kind,value:choice.value,role:'reference'}];
  const next=insertVideoPromptReference(prompt,inputs,after,choices,after.find(input=>input.nodeId===choice.nodeId).id,start,end);
  setInputs(after);setPrompt(next.prompt);setMentions(old=>[...old,choice.nodeId]);return next.caret;
 };
 window.mentionFixture={get:()=>({prompt,inputs,mentions})};
 return <section data-testid="video-node-dock"><VideoPromptEditor prompt={prompt} inputs={inputs} choices={choices} onPrompt={setPrompt} onMention={mention}/></section>;
}
createRoot(document.getElementById('root')).render(<App/>);
`;

type FixtureState = { prompt: string; inputs: Array<{ id: string; nodeId: string }>; mentions: string[] };
const fixtureState = (page: Page) => page.evaluate(() => (window as unknown as { mentionFixture: { get: () => FixtureState } }).mentionFixture.get());

async function main() {
  await mkdir(out, { recursive: true });
  const hashes: Record<string, string> = {};
  for (const file of productFiles) hashes[file] = createHash('sha256').update(await readFile(path.join(sourceRoot, file))).digest('hex');
  const bundle = await build({
    stdin: { contents: entry, loader: 'tsx', resolveDir: root },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { 'process.env': '{}', 'process.env.NODE_ENV': '"development"' },
    alias: { '@': path.join(sourceRoot, 'src'), react: path.join(root, 'node_modules/react'), 'react-dom': path.join(root, 'node_modules/react-dom') },
    tsconfig: path.join(sourceRoot, 'tsconfig.json'),
    nodePaths: [path.join(root, 'node_modules')],
  });
  await writeFile(path.join(out, 'fixture.js'), bundle.outputFiles[0].text);
  const executablePath = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(existsSync);
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const errors: string[] = [], unexpectedRequests: string[] = [];
  const cases: Array<Record<string, unknown>> = [];
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await context.route('**/*', route => { unexpectedRequests.push(route.request().url()); return route.abort(); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const editor = page.getByTestId('video-composer-prompt');
  async function open(query = '采用 @多轨') {
    await page.goto('about:blank');
    await page.setContent('<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui;background:#f8fafc;color:#334155}section{margin:80px;width:600px;padding:24px;background:#fff} [contenteditable]{min-height:100px;white-space:pre-wrap}button{min-height:66px;background:white;color:#334155}</style><div id="root"></div>');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await editor.fill(query);
    await expect(editor).toHaveAttribute('aria-expanded', 'true');
    const menuId = await editor.getAttribute('aria-controls');
    assert.ok(menuId);
    const menu = page.getByRole('listbox', { name: '选择引用素材', exact: true }).and(page.locator(`[id=${JSON.stringify(menuId)}]`));
    await expect(menu).toBeVisible();
    assert.equal(await menu.evaluate(element => element.parentElement === document.body), true, 'real listbox portals directly to body');
    assert.equal(await page.getByTestId('video-node-dock').getByRole('listbox').count(), 0, 'real menu is not a dock descendant');
    return { menuId, menu };
  }
  try {
    if (legacy) {
      const legacySourcePath = arg('--legacy-source');
      const original = legacySourcePath ? await readFile(path.resolve(legacySourcePath), 'utf8')
        : execFileSync('git', ['show', `${originalCommit}:${interactionFile}`], { cwd: root, encoding: 'utf8' });
      const ast = ts.createSourceFile(interactionFile, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      const selectors: string[] = [];
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'click') {
          const candidate = node.expression.expression.getText(ast);
          if (candidate.startsWith('dock.getByRole(') && candidate.includes('选择引用素材') && candidate.includes('多轨')) selectors.push(candidate);
        }
        ts.forEachChild(node, visit);
      };
      visit(ast); assert.equal(selectors.length, 1, 'bind exactly the original CI selector');
      const { menuId } = await open();
      const dock = page.getByTestId('video-node-dock');
      const oldLocator = new Function('dock', `return ${selectors[0]};`)(dock);
      const started = performance.now(); let failure = '';
      try { await oldLocator.click({ timeout: 350 }); } catch (error) { failure = String(error); }
      assert.match(failure, /Timeout/);
      assert.equal((await fixtureState(page)).prompt, '采用 @多轨');
      assert.deepEqual((await fixtureState(page)).mentions, []);
      assert.deepEqual(errors, []); assert.deepEqual(unexpectedRequests, []);
      const literal = 'REFERENCE_MENTION_LOCATOR=BASELINE_FAIL reason=dock_does_not_own_body_portal timeout_ms=350 suppliers=0 pageerrors=0';
      await writeFile(path.join(out, 'RESULT.json'), JSON.stringify({ mode: 'legacy', sourceRoot, productHashes: hashes, originalCommit, legacySourceSha256: createHash('sha256').update(original).digest('hex'), originalSelector: selectors[0], menuId, controlledTimeoutMs: 350, originalCiTimeoutMs: 90000, elapsedMs: performance.now() - started, failure, state: await fixtureState(page), errors, unexpectedRequests, result: literal, exit: 1 }, null, 2));
      console.log(literal); process.exitCode = 1; return;
    }

    const { selectReferenceMention } = await import(pathToFileURL(path.join(sourceRoot, 'scripts/verification/reference-mention-locator.ts')).href);
    const checkUnchanged = async (query: string) => {
      const state = await fixtureState(page); assert.equal(state.prompt, query); assert.deepEqual(state.mentions, []);
    };
    await open();
    await page.evaluate(() => {
      const decoy = document.createElement('div'); decoy.setAttribute('role', 'listbox'); decoy.setAttribute('aria-label', '选择引用素材'); decoy.id = 'unrelated-decoy';
      decoy.style.cssText = 'position:fixed;right:0;top:0;width:120px;';
      const option = document.createElement('button'); option.setAttribute('role', 'option'); option.textContent = '多轨'; option.addEventListener('click', () => decoy.dataset.clicked = 'true'); decoy.append(option); document.body.prepend(decoy);
    });
    assert.equal(await page.getByRole('listbox', { name: '选择引用素材', exact: true }).count(), 2);
    const receipt = await selectReferenceMention(page, editor, '多轨');
    await expect.poll(async () => (await fixtureState(page)).prompt).toBe('采用 {{ref 1}}');
    assert.deepEqual((await fixtureState(page)).mentions, ['timeline-node:fixture']);
    assert.equal((await fixtureState(page)).inputs[0].nodeId, 'timeline-node:fixture');
    await expect(editor.locator('[data-inline-token]')).toHaveCount(1);
    await expect(editor.locator('[data-inline-token]')).toHaveAttribute('data-inline-token', '{{ref 1}}');
    await expect(editor.locator('[data-inline-token]')).toHaveAttribute('data-reference-missing', 'false');
    await expect(editor.locator('[data-inline-token]')).toContainText('多轨');
    assert.equal(await page.locator('#unrelated-decoy').getAttribute('data-clicked'), null);
    cases.push({ name: 'real portal exact association ignores same-name decoy and persists wire token', receipt, state: await fixtureState(page) });

    for (const [name, mutate] of [
      ['missing-controls', 'element.removeAttribute("aria-controls")'],
      ['multiple-controls', 'element.setAttribute("aria-controls", element.getAttribute("aria-controls") + " unrelated-decoy")'],
      ['wrong-controls', 'element.setAttribute("aria-controls", "nonexistent-menu")'],
    ]) {
      await open();
      await editor.evaluate((element, source) => { new Function('element', source)(element); }, mutate);
      const started = performance.now(); let failure = '';
      try { await selectReferenceMention(page, editor, '多轨', { timeout: 300 }); } catch (error) { failure = String(error); }
      assert.ok(failure, name + ' rejects without a global fallback'); await checkUnchanged('采用 @多轨');
      cases.push({ name, elapsedMs: performance.now() - started, failure });
    }

    for (const invalid of ['name', 'role', 'duplicate-id']) {
      const { menu } = await open();
      await menu.evaluate((element, kind) => {
        if (kind === 'name') element.setAttribute('aria-label', '另一个菜单');
        else if (kind === 'role') element.setAttribute('role', 'presentation');
        else { const duplicate = element.cloneNode(true); document.body.append(duplicate); }
      }, invalid);
      let failure = '';
      try { await selectReferenceMention(page, editor, '多轨', { timeout: 300 }); } catch (error) { failure = String(error); }
      assert.ok(failure, 'associated id alone does not bypass role, accessible name or uniqueness'); await checkUnchanged('采用 @多轨');
      cases.push({ name: 'invalid-associated-menu-' + invalid, failure });
    }

    const disabled = await open('采用 @未完成');
    await expect(disabled.menu.getByRole('option', { name: '未完成尚未完成', exact: true })).toBeDisabled();
    let disabledFailure = '';
    try { await selectReferenceMention(page, editor, '未完成尚未完成', { timeout: 300 }); } catch (error) { disabledFailure = String(error); }
    assert.ok(disabledFailure); await checkUnchanged('采用 @未完成');
    cases.push({ name: 'disabled-product-choice-cannot-be-selected', failure: disabledFailure });

    const staged = await open();
    await page.evaluate(({ menuId }) => {
      const editor = document.querySelector('[data-testid="video-composer-prompt"]')!;
      const menu = document.getElementById(menuId)!;
      editor.setAttribute('aria-expanded', 'false'); menu.setAttribute('role', 'presentation');
      setTimeout(() => editor.setAttribute('aria-expanded', 'true'), 700);
      setTimeout(() => menu.setAttribute('role', 'listbox'), 1600);
    }, { menuId: staged.menuId });
    const budget = 1200, started = performance.now(); let budgetFailure = '';
    try { await selectReferenceMention(page, editor, '多轨', { timeout: budget }); } catch (error) { budgetFailure = String(error); }
    const elapsedMs = performance.now() - started;
    assert.ok(budgetFailure, 'later menu stage must not obtain a fresh timeout');
    // Diagnose actual remaining timeout rather than impose a second wall-clock
    // deadline on a loaded CI host. A reset at the menu stage would receive the
    // full 1200ms and select the late menu instead of producing this failure.
    const remainingTimeout = Number(budgetFailure.match(/Timeout:\s*(\d+)ms/)?.[1]);
    assert.ok(budgetFailure.includes('REFERENCE_MENTION_BUDGET_EXHAUSTED') || remainingTimeout > 0 && remainingTimeout < budget,
      'later stage receives only the remaining budget: ' + budgetFailure);
    await checkUnchanged('采用 @多轨');
    cases.push({ name: 'all-waits-share-one-deadline', budgetMs: budget, firstStageReadyMs: 700, lateMenuReadyMs: 1600, elapsedMs, failure: budgetFailure });

    assert.deepEqual(errors, []); assert.deepEqual(unexpectedRequests, []);
    for (const [file, hash] of Object.entries(hashes)) assert.equal(createHash('sha256').update(await readFile(path.join(sourceRoot, file))).digest('hex'), hash, 'product bytes remain unchanged');
    const literal = `REFERENCE_MENTION_LOCATOR=PASS cases=${cases.length} real_react=1 portal=body decoy_clicks=0 suppliers=0 network_requests=0 pageerrors=0`;
    await writeFile(path.join(out, 'RESULT.json'), JSON.stringify({ mode: 'current', sourceRoot, productHashes: hashes, cases, errors, unexpectedRequests, result: literal, exit: 0 }, null, 2));
    console.log(literal);
  } catch (error) {
    await writeFile(path.join(out, 'FAILURE.json'), JSON.stringify({ error: String(error), cases, errors, unexpectedRequests }, null, 2));
    throw error;
  } finally {
    await browser.close();
    console.log('REFERENCE_MENTION_LOCATOR_CLEANUP=PASS browser_closed=1 servers=0');
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
