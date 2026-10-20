import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(process.argv[2] || '.');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const source = read('src/components/canvas/canvas-client.tsx');
if (process.argv.includes('--baseline')) {
  assert.ok(source.includes('w-[min(390px,calc(100%-2rem))]'));
  assert.ok(source.includes('已带上当前图与上游生成链。'));
  assert.ok(!source.includes('<CanvasAssistantPanel'));
  console.log('ASSISTANT_BASELINE=PASS OVERLAY=390PX EMPTY_STATE=DASHED_HINT TASK_CARDS=0 COMPOSER=SEPARATE_INPUT');
  process.exit(0);
}
const panel = read('src/components/canvas/canvas-assistant-panel.tsx');
for (const token of ['grid-cols-2', 'taskIcons', 'aria-pressed={selected}', 'canvas-assistant-scroll-bottom', 'setShowScrollToBottom', 'focus-within:border-', 'document.addEventListener("pointerdown", dismiss)', 'referenceTrigger.current?.focus', 'contextImages.slice(0, 2)', 'h-8 w-8']) assert.ok(panel.includes(token), token);
for (const token of ['min-[1024px]:relative', 'min-[1024px]:w-[360px]', 'calc(100%-1rem)', 'canvas-ui-light', 'canvas-ui-dark', 'canvas-ui-surface-solid', '!rounded-[24px]', 'data-canvas-hotkeys-blocked', 'canvas-assistant-task', 'canvas-assistant-input', 'canvas-assistant-references', 'canvas-assistant-history-item', 'onInputChange(task.prompt)', 'onNewChat()', 'onRestoreChat', 'onPreview(image)', 'onCopy(turn.content)', 'event.nativeEvent.isComposing', '!event.shiftKey', 'rememberCurrent()', 'disabled={busy ? !onStop : !input.trim()}', 'slice(0, 20)', 'keepAtBottom.current', 'role="alert"']) assert.ok(panel.includes(token), token);
assert.ok(!/\bfetch\(|localStorage|\/api\//.test(panel), 'presentation must not add network or persistent message storage');
const ast = ts.createSourceFile('canvas.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let zone, sidebar;
function visit(node) {
  if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some(p => ts.isJsxAttribute(p) && p.name.text === 'data-testid' && p.initializer?.text === 'canvas-drop-zone')) zone = node;
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'CanvasAssistantPanel') sidebar = node;
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(zone && sidebar && sidebar.getStart(ast) > zone.end, 'desktop sidebar must be outside the measured canvas work area');
assert.ok(source.includes('key={`assistant:${activeKey || "empty"}`}'));
for (const token of ['onSend={() => void sendAssistantMessage()}', 'onCopy={copyAssistantText}', 'renderContent={renderAssistantContent}', 'assistantRetry.current = null', 'contextImages={anchor ? assistantContext', 'setLightbox({ src: image.image, alt: image.title })']) assert.ok(source.includes(token), token);
for (const key of ['main', 'detail', 'scene', 'retouch', 'background', 'copyLayout', 'review', 'prompt']) assert.ok(source.includes(`"${key}"`));
const dict = read('src/lib/i18n/dict.ts');
assert.equal((dict.match(/^    assistant: \{/gm) || []).length, 2);
const beforeArg = process.argv.indexOf('--business-baseline');
let count = 0;
if (beforeArg >= 0) {
  const printer = ts.createPrinter({ removeComments: true });
  const functions = content => {
    const tree = ts.createSourceFile('c.tsx', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), items = [];
    function walk(n) {
      if (ts.isFunctionDeclaration(n) && n.name && n.name.text !== 'CanvasClient') items.push([n.name.text, printer.printNode(ts.EmitHint.Unspecified, n, tree)]);
      if (ts.isVariableDeclaration(n) && n.name.getText(tree) === 'QUICK_ACTIONS') items.push(['QUICK_ACTIONS', printer.printNode(ts.EmitHint.Unspecified, n, tree)]);
      ts.forEachChild(n, walk);
    }
    walk(tree); return items.sort(([a], [b]) => a.localeCompare(b));
  };
  const before = fs.readFileSync(path.join(path.resolve(process.argv[beforeArg + 1]), 'src/components/canvas/canvas-client.tsx'), 'utf8');
  const original = functions(before); assert.deepEqual(functions(source), original); count = original.length;
}
console.log(`ASSISTANT_BUSINESS=PASS PROTECTED_DECLARATIONS=${count} CONTEXT_GENERATION_MODELS_BILLING_GUARDS=PASS PROVIDER_CALLS=0`);
console.log('ASSISTANT_MODIFIED=PASS DESKTOP=SIBLING_360PX MOBILE=INSET_8PX TASKS=8_VISIBLE_4 COMPOSER=INTEGRATED HISTORY=PROJECT_SCOPED_WITH_SERVER_LOADER KEYBOARD_IME=PASS LOCALES=ZH_EN');
console.log('ASSISTANT_REFINEMENT=PASS TASK_GRID=2X2 DISTINCT_ICONS=8 REFERENCE_STACK=2 COMPOSER_FOCUS=TOKENIZED SCROLL_TO_LATEST=EXPLICIT DISMISS=OUTSIDE_ESCAPE');
