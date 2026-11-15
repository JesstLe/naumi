import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import ts from 'typescript';

// Source ownership/wiring only; runtime, PG, Worker, deployment and supplier
// acceptance keep their existing verifiers. This does not infer live success.
export const videoDomainFiles=[
  'src/lib/video/types.ts','src/lib/video/capabilities.ts','src/lib/video/service.ts',
  'src/lib/video/creation.ts','src/lib/video/submission.ts','src/lib/video/compiled-submission.ts',
  'src/lib/video/prepare-execution.ts','src/lib/video/prepare-inputs.ts','src/lib/video/compile.ts',
  'src/lib/video/compile-preview.ts','src/lib/video/legacy-workflow-creation.ts',
  'src/lib/video/runtime.ts','src/lib/video/worker.ts','src/lib/video/task-repository.ts',
  'src/lib/video/node-submission.ts','src/lib/video/media-jobs.ts',
  'src/app/layout.tsx','src/app/video/page.tsx','src/app/api/video/catalog/route.ts',
  'src/app/api/video/generate/route.ts','src/app/api/video/tasks/route.ts',
  'src/app/api/video/tasks/[id]/route.ts','src/app/api/video/tasks/[id]/retry/route.ts',
  'src/app/api/video/tasks/[id]/send-to-canvas/route.ts','src/app/api/video/extract/route.ts',
  'src/components/video/video-studio-client.tsx','src/components/video/video-studio-session.tsx',
  'src/components/canvas/video/use-video-history.ts','src/components/canvas/video/use-video-generation.ts',
  'src/components/canvas/canvas-client.tsx','src/components/canvas/use-canvas-video-task-follow.ts',
  'src/lib/canvas/video-task-follow.ts','src/lib/canvas/video-node-service.ts',
  'src/lib/canvas/scene-projection.ts','src/components/canvas/nodes/artwork-node.tsx',
  'src/components/canvas/video/player.tsx','src/components/canvas/video/result-dock.tsx',
];
export function verifyVideoDomain({read,exists}){
  const checks=[],cache=new Map();
  const source=file=>{if(!cache.has(file)){const text=read(file),ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);assert.equal(ast.parseDiagnostics.length,0,'source syntax '+file);cache.set(file,{text,ast});}return cache.get(file);};
  const walk=(node,visit)=>{visit(node);ts.forEachChild(node,child=>walk(child,visit));};
  const check=(id,run)=>{try{run();checks.push(id);}catch(error){throw new Error('VIDEO_DOMAIN_CHECK_FAILED '+id+': '+error.message,{cause:error});}};
  const names=file=>{const found=new Set();walk(source(file).ast,n=>{if(ts.isIdentifier(n)||ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))found.add(n.text);});return found;};
  const has=(file,...expected)=>expected.forEach(name=>assert(names(file).has(name),file+' missing '+name));
  function calls(file){const aliases=new Map();for(const s of source(file).ast.statements){if(ts.isImportDeclaration(s)&&s.importClause?.namedBindings&&ts.isNamedImports(s.importClause.namedBindings))for(const item of s.importClause.namedBindings.elements)aliases.set(item.name.text,item.propertyName?.text||item.name.text);}
    const found=[];walk(source(file).ast,n=>{if(!ts.isCallExpression(n))return;const e=n.expression,name=ts.isIdentifier(e)?e.text:ts.isPropertyAccessExpression(e)?e.name.text:ts.isElementAccessExpression(e)&&ts.isStringLiteral(e.argumentExpression)?e.argumentExpression.text:undefined;if(name)found.push(aliases.get(name)||name);});return found;}
  const call=(file,...expected)=>expected.forEach(name=>assert(calls(file).includes(name),file+' must call '+name));
  const forbid=(file,forbidden)=>assert.deepEqual(calls(file).filter(name=>forbidden.includes(name)),[],file+' retired/side-effect call');
  const exported=(file,name,runtimeOnly=false)=>source(file).ast.statements.some(s=>{
    if(ts.isExportDeclaration(s)&&s.exportClause&&ts.isNamedExports(s.exportClause))return (!runtimeOnly||!s.isTypeOnly)&&s.exportClause.elements.some(item=>(!runtimeOnly||!item.isTypeOnly)&&item.name.text===name);
    if(!s.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.ExportKeyword))return false;
    if(runtimeOnly&&(ts.isTypeAliasDeclaration(s)||ts.isInterfaceDeclaration(s)))return false;
    return s.name?.text===name||ts.isVariableStatement(s)&&s.declarationList.declarations.some(item=>ts.isIdentifier(item.name)&&item.name.text===name);
  });
  function reexports(file,module,expected){const entries=source(file).ast.statements.filter(s=>ts.isExportDeclaration(s)&&!s.isTypeOnly&&s.moduleSpecifier?.text===module&&s.exportClause&&ts.isNamedExports(s.exportClause));assert(entries.length,file+' reexport owner '+module);for(const name of expected)assert(entries.some(s=>s.exportClause.elements.some(item=>!item.isTypeOnly&&item.name.text===name)),file+' export '+name);}
  const text=(file,pattern)=>assert.match(source(file).text,pattern,file);
  const retired=['normalizeVideoInput','resolveVideoCapability','supportsVideoIntent','mediaFits','reconcileVideoSettings','fallbackCapability','validateAgainstCapability','buildVideoCreate'];
  check('owner-files-and-retired-simulator',()=>{videoDomainFiles.forEach(file=>assert(exists(file),'missing '+file));assert(!exists('src/components/generate/video-studio.tsx'),'simulated studio must remain retired');});
  check('public-task-and-provider-types',()=>['VideoGenerationRequest','VideoProviderAdapter','VideoTaskSnapshot','TransientPollError','VideoReference'].forEach(name=>assert(exported('src/lib/video/types.ts',name),name)));
  check('descriptive-catalogue-has-no-execution-gate-exports',()=>{const file='src/lib/video/capabilities.ts';for(const name of ['getVideoModelCapability','validateAgainstCapability','videoCatalog','fallbackCapability'])assert(!exported(file,name,true),'retired gate export '+name);assert(!source(file).ast.statements.some(s=>ts.isExportDeclaration(s)&&!s.isTypeOnly&&(!s.exportClause||ts.isNamespaceExport(s.exportClause))),'implicit runtime gate exports');assert(exported(file,'documentedVideoCapability',true));});
  check('public-facade-keeps-real-owners',()=>{reexports('src/lib/video/service.ts','./creation',['createVideoGeneration']);reexports('src/lib/video/service.ts','./runtime',['pollAndSettle','recoverDueVideoTasks','requestFromQueuedTask']);reexports('src/lib/video/service.ts','./queries',['listVideoTaskViews']);});
  check('catalogue-projects-binding-and-missing-mapping',()=>{call('src/app/api/video/catalog/route.ts','publicModelCatalog','projectVideoUiContract');has('src/app/api/video/catalog/route.ts','mapping_required','configured');forbid('src/app/api/video/catalog/route.ts',retired);});
  check('new-acceptance-has-one-compiled-owner',()=>{call('src/lib/video/submission.ts','createCompiledVideo');forbid('src/lib/video/submission.ts',retired);has('src/lib/video/submission.ts','VIDEO_EXECUTION_NOT_CONFIGURED','legacyWorkflowCreationActive');});
  check('shared-prepare-resolves-and-compiles',()=>{call('src/lib/video/prepare-execution.ts','prepareVideoExecutionInputs','bindPublishedVideoExecution','compileVideoRequest');forbid('src/lib/video/prepare-execution.ts',retired);});
  check('resolver-keeps-authenticated-media-facts',()=>{call('src/lib/video/prepare-inputs.ts','resolveVideoDraft','verifiedOwnedMedia','assertCreationProjectInput','assertCreationObjectRefs');forbid('src/lib/video/prepare-inputs.ts',retired);});
  check('compiler-has-no-descriptive-admission',()=>forbid('src/lib/video/compile.ts',retired));
  check('preview-uses-same-owner-without-acceptance',()=>{call('src/lib/video/compile-preview.ts','prepareVideoExecution');forbid('src/lib/video/compile-preview.ts',[...retired,'createVideoGeneration','createVideoTaskWithReservation','reserveTaskBillingTx','quoteForActor','fetch']);});
  check('canvas-forwards-draft-without-old-input-fallback',()=>{call('src/lib/video/node-submission.ts','createVideoGeneration','bindActualCreationProject');forbid('src/lib/video/node-submission.ts',[...retired,'resolveCanvasNodeInputs','authorizeNodeInputs','requireOwnedVideoText','readOwnedVideoWorkflow']);has('src/lib/video/node-submission.ts','submitByocComfyVideo','VIDEO_NODE_REVISION_CONFLICT','OPERATION_CONFLICT','CREATION_SCOPE_CONFLICT');});
  check('accepted-history-is-db-and-snapshot-scoped',()=>{call('src/lib/video/legacy-workflow-creation.ts','query','decryptAtRest');has('src/lib/video/legacy-workflow-creation.ts','execution_version','frozen_nodes_enc','WORKFLOW_SNAPSHOT_UNAVAILABLE');text('src/lib/video/legacy-workflow-creation.ts',/execution_version\s*!==\s*0/);});
  check('compiled-acceptance-keeps-quote-and-shared-transaction',()=>call('src/lib/video/compiled-submission.ts','prepareVideoExecution','quoteForActor','assertQuotedVersion','createVideoTaskWithReservation','associateVideoTaskTx','associateWorkflowTaskTx'));
  check('queued-reader-keeps-v3-and-v2-identity',()=>{call('src/lib/video/runtime.ts','readTaskCompiledVideoPlan');text('src/lib/video/runtime.ts',/parameters\.version\s*===\s*3/);text('src/lib/video/runtime.ts',/parameters\.version\s*===\s*2/);});
  check('polling-renews-original-reservation',()=>call('src/lib/video/runtime.ts','touchReservation','claimVideoTaskPoll'));
  check('transient-polling-retries-without-refunding',()=>{text('src/lib/video/runtime.ts',/instanceof\s+TransientPollError/);call('src/lib/video/runtime.ts','scheduleVideoTaskRetry','scheduleTransientTaskRetry');});
  check('worker-calls-real-task-and-workflow-recovery',()=>call('src/lib/video/worker.ts','recoverDueVideoTasks','recoverVideoWorkflows'));
  check('embedded-worker-is-idempotent-and-mode-gated',()=>{call('src/lib/video/worker.ts','applicationTasksRunHere');has('src/lib/video/worker.ts','started','unref','NAUMI_VIDEO_WORKER');});
  check('layout-keeps-gated-worker-bootstrap',()=>call('src/app/layout.tsx','startVideoWorker'));
  check('generate-keeps-authentication-and-current-application',()=>call('src/app/api/video/generate/route.ts','authenticatedEmail','sameSiteBiMutation','createVideoGeneration'));
  check('generate-keeps-image-compatibility-and-task-receipt',()=>{has('src/app/api/video/generate/route.ts','imageUrl','result');has('src/lib/video/compiled-submission.ts','taskId','cost');});
  check('task-detail-remains-read-only-and-owned',()=>{call('src/app/api/video/tasks/[id]/route.ts','authorizedTargetEmail','getVideoTask','deleteFinishedVideoTask');forbid('src/app/api/video/tasks/[id]/route.ts',['pollAndSettle','createVideoGeneration','submitQueuedVideoTask']);});
  check('task-list-keeps-history-and-id-poll-compatibility',()=>call('src/app/api/video/tasks/route.ts','listVideoTaskViews','pollAndSettle','getVideoTaskByIdempotencyKey'));
  check('task-list-keeps-source-filter-and-bounds',()=>{text('src/app/api/video/tasks/route.ts',/searchParams\.get\("sourceIds"\)/);text('src/app/api/video/tasks/route.ts',/sourceIds\.length\s*>\s*500\b/);has('src/app/api/video/tasks/route.ts','sourceIds','options','pendingOnly','cursor');});
  check('retry-creates-explicit-new-operation-from-frozen-input',()=>{const file='src/app/api/video/tasks/[id]/retry/route.ts';call(file,'createVideoGeneration','compiledVideoRetryInput','getVideoTaskByIdempotencyKey');has(file,'retryOf','failed','cancelled','OPERATION_CONFLICT');text(file,/!\["failed",\s*"cancelled"\]\.includes\(task\.status\)/);});
  check('send-to-canvas-uses-asset-owner-not-route-writes',()=>{call('src/app/api/video/tasks/[id]/send-to-canvas/route.ts','authenticatedEmail','sendVideoTaskToCanvas');call('src/lib/canvas/video-node-service.ts','importVideoAsset','saveVideoNodeTx','associateVideoTaskTx','completeVideoNodeTx');text('src/lib/canvas/video-node-service.ts',/INSERT INTO app_artworks SELECT/);});
  check('workbench-facade-keeps-current-session',()=>reexports('src/components/video/video-studio-client.tsx','./video-studio-session',['VideoStudioClient']));
  check('workbench-uses-shared-preview-history-generation',()=>{call('src/components/video/video-studio-session.tsx','useVideoHistory','useVideoGeneration','useVideoCompilePreview','submit');has('src/components/video/video-studio-session.tsx','count','VideoSettingsFields','VideoPlayer');});
  check('history-keeps-pagination-delete-and-send',()=>{has('src/components/canvas/video/use-video-history.ts','nextCursor','loadMore','DELETE');text('src/components/canvas/video/use-video-history.ts',/send-to-canvas/);call('src/components/canvas/video/use-video-history.ts','request');});
  check('generation-keeps-batch-bound-and-operation-replay',()=>{const file='src/components/canvas/video/use-video-generation.ts';text(file,/Number\.isInteger\(count\)/);text(file,/count\s*<\s*1\s*\|\|\s*count\s*>\s*8\b/);has(file,'idempotencyKey','completed','count');text(file,/idempotencyKey=/);});
  check('canvas-binds-document-scoped-video-follower',()=>{call('src/components/canvas/canvas-client.tsx','useCanvasVideoTaskFollow');call('src/components/canvas/use-canvas-video-task-follow.ts','createCanvasVideoTaskFollower','follow');});
  check('follower-keeps-source-id-chunks-and-owned-limit',()=>{text('src/lib/canvas/video-task-follow.ts',/Math\.ceil\(ids\.length\s*\/\s*80\)/);text('src/lib/canvas/video-task-follow.ts',/ids\.slice\(i\s*\*\s*80,\s*i\s*\*\s*80\s*\+\s*80\)/);text('src/lib/canvas/video-task-follow.ts',/limit=500&sourceIds=/);});
  check('follower-failed-http-is-retried-not-silenced',()=>{text('src/lib/canvas/video-task-follow.ts',/responses\.some\(response\s*=>\s*!response\.ok\)\)\s*throw/);text('src/lib/canvas/video-task-follow.ts',/catch\s*\{\s*later\(12000\)/);});
  check('follower-retains-task-identity-without-generation',()=>{has('src/lib/canvas/video-task-follow.ts','taskId','needs_attention','artworkId');forbid('src/lib/canvas/video-task-follow.ts',['createVideoGeneration','submitQueuedVideoTask','pollAndSettle']);});
  check('scene-and-artwork-renderers-retain-video-audio-surfaces',()=>{const file='src/lib/canvas/scene-projection.ts';has(file,'videoUrl');text(file,/const sorted\s*=\s*\[\.\.\.arts\]\.sort\(/);text(file,/=\s*sorted\.map\(/);has('src/components/canvas/nodes/artwork-node.tsx','videoUrl','audio','VideoNodeSurface');});
  check('result-dock-keeps-frame-audio-and-continuation-actions',()=>has('src/components/canvas/video/result-dock.tsx','frame','extract_audio','onContinue'));
  check('player-keeps-native-current-time',()=>has('src/components/canvas/video/player.tsx','currentTime','mediaRef','onTimeUpdate','video','audio'));
  check('extraction-uses-durable-media-owner-and-matching-parent',()=>{const file='src/app/api/video/extract/route.ts';call(file,'authenticatedEmail','listArtworksByIds','createMediaJob','getMediaJob');has(file,'parentArtworkId','extract_audio','frame','jobId');text(file,/storageKeyFromManagedUrl\(parent\.videoUrl\|\|parent\.image\)\s*!==\s*key/);});
  check('media-publisher-preserves-primary-and-secondary-lineage',()=>{call('src/lib/video/media-jobs.ts','addArtworksTx');text('src/lib/video/media-jobs.ts',/parentId:\s*parents\[0\]\s*\|\|\s*null/);text('src/lib/video/media-jobs.ts',/parentIds:\s*parents\.slice\(1\)/);});
  check('media-publisher-keeps-real-audio-and-frame-categories',()=>text('src/lib/video/media-jobs.ts',/mimeType\.startsWith\("image\/"\)\s*\?\s*"main"\s*:\s*mimeType\.startsWith\("audio\/"\)\s*\?\s*"audio"/));
  return {checks,files:videoDomainFiles.length,scope:'source ownership/wiring only; not runtime, deployment or upstream acceptance'};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const index=process.argv.indexOf('--source-root');
  const root=index<0?path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'):path.resolve(process.argv[index+1]);
  const result=verifyVideoDomain({read:file=>readFileSync(path.join(root,file),'utf8'),exists:file=>existsSync(path.join(root,file))});
  console.log('VIDEO_DOMAIN_CONTRACT=PASS CHECKS='+result.checks.length+' FILES='+result.files+' STATIC_SOURCE=1 RUNTIME_ACCEPTANCE=NOT_CLAIMED');
}
