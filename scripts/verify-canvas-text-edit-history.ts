import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canvasTextEditPatch } from '../src/lib/canvas/text-edit-history';

const current = { content: 'new draft', title: 'Retained title', sourceIds: ['a'], targetIds: ['b'], productIds: ['c'], width: 420, height: 320 };
const patch = canvasTextEditPatch(current, current.content, 'original content');
assert.equal(patch?.from.content, 'original content'); assert.equal(patch?.to.content, current.content);
for (const fields of [patch?.from, patch?.to]) for (const key of ['title', 'sourceIds', 'targetIds', 'productIds', 'width', 'height'] as const) assert.deepEqual(fields?.[key], current[key]);
assert.equal(canvasTextEditPatch(current, current.content, '')?.from.content, '', 'empty focus baseline is meaningful');
assert.equal(canvasTextEditPatch(current, current.content, current.content), null, 'unchanged blur does not add history');
assert.equal(canvasTextEditPatch(current, current.content), null, 'non-focus caller keeps prior behavior');
assert.equal(canvasTextEditPatch(current, 'explicit change')?.from.content, current.content);
const long = canvasTextEditPatch(current, 'a'.repeat(13000), 'old'); assert.equal(long?.to.content.length, 12000);
assert.equal(current.content, 'new draft'); assert.equal(current.width, 420);
const nodeSource = readFileSync('src/components/canvas/nodes/text-node.tsx','utf8');
const composerSource = readFileSync('src/components/canvas/text-composer.tsx','utf8');
const ownerSource = readFileSync('src/lib/canvas/text-editing.ts','utf8');
const clientSource = readFileSync('src/components/canvas/canvas-client.tsx','utf8');
// A focus session captures the original owner callbacks as well as its initial
// body. Later renders or an account/project ABA cannot redirect its blur.
assert.match(nodeSource, /initial:body,draft:body,change:ctx.onContentChange,commit:ctx.onContentCommit/);
assert.match(nodeSource, /session.commit\(session.id,session.draft,session.initial\)/);
assert.match(nodeSource, /editSession.current=null/);
assert.match(composerSource, /initial:canvasTextContent\(selectedText\),draft:canvasTextContent\(selectedText\),change:content.onChange,commit:content.onCommit/);
assert.match(composerSource, /session.commit\(session.draft,session.initial\)/);
assert.match(ownerSource, /canvasTextEditPatch\(textPatchOf\(node\),updated.content,initialContent\)/);
assert.match(ownerSource, /scope.documentCurrent\(\)/);
assert.match(ownerSource, /ports\(\).autosave.*schedule\(id\)/);
assert.match(ownerSource, /ports\(\).autosave.*flush\(id\)/);
assert.match(clientSource, /textAutosave.schedule\(id,\{isCurrent:canvasTextDocument.scope.documentCurrent,document:canvasTextDocument\}\)/);
assert.match(clientSource, /save:\(node,context\)=>context.document.save\(node\)/);
console.log('TEXT_EDIT_HISTORY=PASS CONTROLLED_DRAFT_UNDO=FOCUS_BASELINE EMPTY_BASELINE=RETAINED UNCHANGED_BLUR=NO_HISTORY CURRENT_NONCONTENT_FIELDS=RETAINED MAX12000=PASS ORIGINAL_PERSISTENCE=UNCHANGED FOCUS_OWNER=CAPTURED');
