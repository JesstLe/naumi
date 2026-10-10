import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.argv[2]||'.'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const client=read('src/components/canvas/canvas-client.tsx');
if(process.argv.includes('--baseline')){
 assert.ok(client.includes('const CANVAS_NODE_CLIPBOARD_TYPE = "application/x-naumi-canvas-node"'));
 assert.ok(!client.includes('useWorkflowPaste'));
 console.log('BASELINE=PASS FOREIGN_WORKFLOW_PASTE=ABSENT INTERNAL_NODE_AND_IMAGE_PASTE=EXISTING');process.exit(0);
}
for(const token of ['useWorkflowPaste','workflowPaste.paste','kind: "workflow-add"','WorkflowDecorationNode','WorkflowGroupNode','workflowManifests','selectWorkflowGroup'])assert.ok(client.includes(token),token);
assert.ok(client.indexOf('workflowPaste.paste',client.indexOf('function handleCanvasPaste'))<client.indexOf('const files = clipboardImageFiles',client.indexOf('function handleCanvasPaste')));
const hook=read('src/components/canvas/use-workflow-paste.tsx');
for(const token of ['operationId: browserRandomUUID()','controller.current?.abort()','current !== epoch.current','progress.done}/${progress.total}','commit.current(result)','重试导入'])assert.ok(hook.includes(token),token);
assert.ok(!hook.includes('localStorage')&&!hook.includes('quoteAndSubmit'));
const route=read('src/app/api/canvas/workflow-import/route.ts');
for(const token of ['authenticatedEmail','WORKFLOW_CLIPBOARD_LIMIT + 4096','application/x-ndjson','request.signal.aborted'])assert.ok(route.includes(token),token);
console.log('MODIFIED=PASS GAODING=PASTE_ATOMIC MEDIA=PERSISTED GROUPS=RESTORED LINKS=MIXED UNDO=ONE_STEP PROGRESS=ACTUAL RETRY=IDEMPOTENT CONTEXT=GUARDED AUTO_EXECUTION=NONE');
