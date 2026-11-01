import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import {spawn,execFileSync} from 'node:child_process';
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(root,...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024,windowsHide:true}).trimEnd();
const inside=(parent,child)=>{const relative=path.relative(parent,child);return relative!==''&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);};
export async function sourceIdentity(root){
 const commit=git(root,'rev-parse','HEAD'),dirty=git(root,'status','--porcelain','--untracked-files=normal')!=='';
 const files=git(root,'ls-files','--cached','--others','--exclude-standard','-z').split('\0').filter(Boolean).sort(),rows=[];
 // Ordered, complete byte hashing at every boundary; only eight bounded reads
 // overlap. No hash cache, mtime shortcut or skipped/finally-unchecked input.
 for(let start=0;start<files.length;start+=8){
  rows.push(...await Promise.all(files.slice(start,start+8).map(async file=>{
   const p=path.resolve(root,file);if(!inside(root,p))throw Error('SOURCE_PATH_ESCAPE');const stat=await fs.lstat(p).catch(()=>null);
   if(!stat)return [file,null];if(stat.isSymbolicLink())throw Error('SOURCE_SYMLINK: '+file);if(!stat.isFile())throw Error('SOURCE_NOT_FILE: '+file);
   return [file,hash(await fs.readFile(p))];
  })));
 }
 return {commit,dirty,files:rows.length,digest:hash(JSON.stringify(rows)),hashes:Object.fromEntries(rows)};
}
export function assertFixtureDatabase(env){let u;try{u=new URL(env.DATABASE_URL)}catch{throw Error('ISOLATED_FIXTURE_DATABASE_REQUIRED')};if(env.NAUMI_VERIFY_ISOLATED_DB!=='1'||u.hostname!=='127.0.0.1'||!u.pathname.includes('fixture'))throw Error('ISOLATED_FIXTURE_DATABASE_REQUIRED');}
/** Sequential child entrypoints with literal logs + exact source binding.
 * No retries, deployment, migrations, supplier credentials or package installation. */
export async function runRefactorVerification({root,out,cases,commandFor,expectedSha,allowDirty=false,env=process.env,scope='core',resume,nativeSdkManifest}){
 root=await fs.realpath(path.resolve(root));out=path.resolve(out);if(!inside(path.join(root,'output'),out))throw Error('EVIDENCE_MUST_BE_INSIDE_OUTPUT');
 await fs.mkdir(out,{recursive:false});const file=path.join(out,'REPORT.json'),report={schemaVersion:1,status:'RUNNING',scope,source:null,startedAt:new Date().toISOString(),cases:cases.map(c=>({id:c.id,group:c.group,status:'NOT_RUN',command:(()=>{const command=commandFor(c);if(c.nativeCase&&nativeSdkManifest){const i=command.indexOf('--out');if(i<0)throw Error('NATIVE_EVIDENCE_ARGUMENT_REQUIRED');command[i+1]=path.join(out,c.id);}return command;})()}))};
 const write=()=>fs.writeFile(file,JSON.stringify(report,null,2)+'\n');await write();
 try{
  if(!/^[0-9a-f]{40}$/.test(expectedSha||''))throw Error('EXPECTED_SOURCE_SHA_REQUIRED');
  const identity=await sourceIdentity(root);report.source=identity;const database=env.DATABASE_URL?new URL(env.DATABASE_URL):null;report.environment={node:process.version,platform:process.platform,arch:process.arch,fixtureDatabase:database?{host:database.hostname,port:database.port,database:database.pathname}:null,fixtureFlag:env.NAUMI_VERIFY_ISOLATED_DB||null};await write();if(identity.commit!==expectedSha)throw Error('SOURCE_SHA_MISMATCH');if(identity.dirty&&!allowDirty)throw Error('DIRTY_SOURCE_NOT_ACCEPTED');
  if(cases.some(c=>c.nativeCase)){if(!nativeSdkManifest)throw Error('FIXED_NATIVE_SDK_REQUIRED');const sdkBytes=await fs.readFile(nativeSdkManifest),sdk=JSON.parse(sdkBytes.toString('utf8'));if(sdk.status!=='PASS'||sdk.source?.commit!==identity.commit||sdk.source?.digest!==identity.digest||sdk.source?.dirty)throw Error('NATIVE_SDK_SOURCE_MISMATCH');report.environment.nativeSdkManifestSha256=hash(sdkBytes);report.environment.nativeSdkImageId=sdk.sdkImageId;await write();} if(cases.some(c=>c.pg))assertFixtureDatabase(env);
  if(new Set(cases.map(c=>c.id)).size!==cases.length||!cases.length)throw Error('INVALID_CASE_CATALOGUE');
  let previous;if(resume){previous=JSON.parse(await fs.readFile(resume,'utf8'));if(previous.source?.commit!==identity.commit||previous.source?.digest!==identity.digest||previous.scope!==scope||JSON.stringify(previous.environment)!==JSON.stringify(report.environment))throw Error('RESUME_SOURCE_MISMATCH');}
  for(const row of report.cases){const boundary=await sourceIdentity(root);if(boundary.digest!==identity.digest||boundary.commit!==identity.commit)throw Error('SOURCE_CHANGED_DURING_VERIFICATION');const spec=cases.find(c=>c.id===row.id),p=path.resolve(root,spec.file);if(!inside(root,p)||!(await fs.stat(p).catch(()=>null))?.isFile())throw Error('CASE_ENTRY_MISSING: '+spec.file);
   const reused=previous?.cases.find(c=>c.id===row.id&&c.status==='PASS');if(reused&&JSON.stringify(reused.command)===JSON.stringify(row.command)&&hash(await fs.readFile(reused.log))===reused.logSha256){Object.assign(row,reused,{reused:true});await write();continue;}
   row.status='RUNNING';row.startedAt=new Date().toISOString();row.log=path.join(out,row.id+'.log');await write();await fs.writeFile(row.log,'COMMAND='+JSON.stringify(row.command)+'\nSOURCE_COMMIT='+identity.commit+'\nSOURCE_DIGEST='+identity.digest+'\n');
   const evidence=path.join(out,row.id);await fs.mkdir(evidence);const inheritedOptions=spec.clientReact?(env.NODE_OPTIONS||'').replace(/--conditions(?:=|\s+)react-server(?:\s|$)/g,' '):env.NODE_OPTIONS||'';const stageEnv={...env,NODE_OPTIONS:[inheritedOptions,spec.clientReact?'':'--conditions=react-server'].join(' ').trim()};for(const name of ['CANVAS_SAVE_REVIEW_EVIDENCE','CANVAS_SAVE_TRANSPORT_EVIDENCE','DEPENDENCY_COMPAT_EVIDENCE','MODEL_UI_RUNNER_EVIDENCE','SUPPLIER_LIBRARY_EVIDENCE','MODEL_MANAGEMENT_EVIDENCE','ADMIN_SETTINGS_EVIDENCE','ADMIN_USAGE_EVIDENCE','WORKBENCH_ASSET_EVIDENCE','DB_EVIDENCE','IDENTITY_CREATION_EVIDENCE','NATIVE_NODE_INGRESS_EVIDENCE','NATIVE_DRAG_EVIDENCE','APP_PERSISTENCE_EVIDENCE','TEXT_CONCURRENCY_EVIDENCE','ARTWORK_CONCURRENCY_EVIDENCE','ARTWORK_WRITER_EVIDENCE','HISTORY_EVIDENCE','VIDEO_OPTIONS_EVIDENCE','WORKBENCH_EVIDENCE','MODEL_CATALOG_EVIDENCE','PROJECT_CATALOG_EVIDENCE','CANVAS_INPUT_EVIDENCE','CANVAS_CLIPBOARD_EVIDENCE','CANVAS_IMAGE_STABILITY_EVIDENCE','IMAGE_DELIVERY_BYTES_EVIDENCE','CANVAS_PLACEMENT_EVIDENCE','VIDEO_PERFORMANCE_EVIDENCE'])stageEnv[name]=evidence;
   for(const name of ['LOCAL_NODE_HISTORY_EVIDENCE','TEXT_FAILURE_EVIDENCE','TEXT_TASK_EVIDENCE','CANVAS_IMAGE_IMPORTS_EVIDENCE','NATIVE_ACTIONS_EVIDENCE','SECONDARY_GENERATION_EVIDENCE','PENDING_PRESENTATION_EVIDENCE','GENERATION_PRESENTATION_EVIDENCE','CANVAS_REQUEST_WORKFLOW_EVIDENCE','COMFY_RUN_EVIDENCE','R3_EVIDENCE','CANVAS_CREATION_EVIDENCE','SOURCE_IDENTITY_EVIDENCE','WORKER_MEDIA_EVIDENCE','DIRECTOR_UI_EVIDENCE','DIRECTOR_APP_EVIDENCE','ADMIN_ENTRY_EVIDENCE','ADMIN_SHELL_EVIDENCE','CHARACTER_UI_EVIDENCE','CHARACTER_APP_EVIDENCE','SCENE_UI_EVIDENCE','SCENE_APP_EVIDENCE','DATAURL_EVIDENCE','CANVAS_REGEN_EVIDENCE','IMAGE_VERSION_EVIDENCE','AUDIO_APP_EVIDENCE','AUDIO_UI_EVIDENCE','AUDIO_RULES_EVIDENCE','TIMELINE_EVIDENCE','CANVAS_TEST_OUT'])stageEnv[name]=evidence;
   if(spec.id==='native-parent-database')stageEnv.NATIVE_PARENT_EVIDENCE=evidence;
   if(spec.id==='legacy-generation-session')stageEnv.GENERATION_SESSION_EVIDENCE=evidence;
   if(spec.id==='model-management-session')stageEnv.MODEL_MANAGEMENT_SESSION_EVIDENCE=evidence;
   if(spec.id==='published-draft-continuation')stageEnv.MODEL_DRAFT_CONTINUATION_EVIDENCE=evidence;
   if(spec.id==='media-metadata-ownership')stageEnv.MEDIA_METADATA_EVIDENCE=evidence;
   if(spec.id==='billing-task-ownership')stageEnv.BILLING_TASK_OWNERSHIP_EVIDENCE=evidence;
   if(spec.id==='first-paid-checkpoint')stageEnv.FIRST_PAID_CHECKPOINT_EVIDENCE=evidence;
   if(spec.id==='imagegen-supplier-outcomes')stageEnv.IMAGEGEN_SUPPLIER_OUTCOME_EVIDENCE=evidence;
   if(spec.id==='imagegen-batch-retry')stageEnv.IMAGEGEN_BATCH_RETRY_EVIDENCE=evidence;
   if(spec.id==='imagegen-remote-put')stageEnv.IMAGEGEN_REMOTE_PUT_EVIDENCE=evidence;
   if(spec.id==='audio-ui')stageEnv.AUDIO_SOURCE_WAV=path.join(out,'audio-rules','original.wav');
   if(spec.id==='timeline-ui')stageEnv.TIMELINE_SOURCE_ASSETS=path.join(out,'timeline-rules');
   stageEnv.TIMELINE_APP_EVIDENCE=evidence;
   if(spec.id==='browser-cache-resilience')stageEnv.BROWSER_CACHE_RESILIENCE_EVIDENCE=evidence;
   if(spec.id==='browser-cache-efficiency')stageEnv.BROWSER_CACHE_EFFICIENCY_EVIDENCE=evidence;
   if(spec.id==='image-notice-visibility')stageEnv.IMAGE_NOTICE_VISIBILITY_EVIDENCE=evidence;
   if(spec.id==='billing-presentation')stageEnv.BILLING_PRESENTATION_EVIDENCE=evidence;
   if(spec.id==='canvas-video-follow')stageEnv.CANVAS_VIDEO_FOLLOW_EVIDENCE=evidence;
   if(spec.id==='canvas-text-editing')stageEnv.CANVAS_TEXT_EDITING_EVIDENCE=evidence;
   if(spec.id==='canvas-stitch')stageEnv.CANVAS_STITCH_EVIDENCE=evidence;
   if(spec.id==='canvas-stitch-pg')stageEnv.CANVAS_STITCH_PG_EVIDENCE=evidence;
   if(spec.id==='media-representation')stageEnv.MEDIA_REPRESENTATION_EVIDENCE=evidence;
   if(spec.id==='canvas-text-editing-dom')stageEnv.CANVAS_TEXT_EDITING_DOM_EVIDENCE=evidence;
   if(spec.id==='canvas-render-isolation')stageEnv.CANVAS_RENDER_ISOLATION_EVIDENCE=evidence;
   if(spec.id==='canvas-downloads')stageEnv.CANVAS_DOWNLOAD_EVIDENCE=evidence;
   if(spec.id==='canvas-download-browser')stageEnv.CANVAS_DOWNLOAD_BROWSER_EVIDENCE=evidence;
   if(spec.id==='canvas-node-operations-client')stageEnv.NODE_OP_EVIDENCE=evidence;
   if(spec.id==='canvas-node-creation')stageEnv.NODE_CREATION_EVIDENCE=evidence;
   if(spec.id==='mixed-load-driver')stageEnv.MIXED_LOAD_EVIDENCE=evidence;
   if(spec.id==='native-fixture-lifecycle')stageEnv.NATIVE_FIXTURE_EVIDENCE=evidence;
   if(spec.id==='native-fixture-memory')stageEnv.NATIVE_MEMORY_EVIDENCE=evidence;
   if(spec.id==='native-fixture-http')stageEnv.NATIVE_HTTP_EVIDENCE=evidence;
   if(spec.id==='image-scheduling-pg')stageEnv.IMAGE_SCHEDULING_EVIDENCE=evidence;
   if(spec.id==='canvas-native-editor-session')stageEnv.NATIVE_EDITOR_EVIDENCE=evidence;
   if(spec.id==='canvas-native-editors-dom')stageEnv.NATIVE_EDITOR_DOM_EVIDENCE=evidence;
   if(spec.id==='canvas-artwork-picker')stageEnv.ARTWORK_PICKER_EVIDENCE=evidence;
   if(spec.id==='canvas-artwork-picker-dom')stageEnv.ARTWORK_PICKER_DOM_EVIDENCE=evidence;
   if(spec.id==='canvas-node-preferences')stageEnv.NODE_PREFERENCES_EVIDENCE=evidence;
   if(spec.id==='canvas-node-preferences-dom')stageEnv.NODE_PREFERENCES_DOM_EVIDENCE=evidence;
   if(['canvas-node-renderers','canvas-scene-reconciliation'].includes(spec.id))stageEnv.SCENE_EVIDENCE=evidence;
   if(spec.id==='canvas-text-editing-pg')stageEnv.CANVAS_TEXT_EDITING_PG_EVIDENCE=evidence;
   if(spec.id==='canvas-project-navigation')stageEnv.CANVAS_PROJECT_NAVIGATION_EVIDENCE=evidence;
   if(spec.id==='canvas-selection-owner')stageEnv.CANVAS_SELECTION_OWNER_EVIDENCE=evidence;
   if(spec.id==='canvas-selection-projection')stageEnv.SELECTION_PROJECTION_EVIDENCE=evidence;
   if(spec.id==='saved-text-results')stageEnv.SAVED_TEXT_EVIDENCE=evidence;
   if(spec.id==='canvas-assistant-session')stageEnv.ASSISTANT_SESSION_EVIDENCE=evidence;
   if(spec.id==='text-document')stageEnv.TEXT_EVIDENCE=evidence;
   if(spec.id==='enterprise-source-onboarding')stageEnv.SOURCE_ONBOARDING_EVIDENCE=evidence;
   if(spec.id==='enterprise-source-audit')stageEnv.SOURCE_AUDIT_EVIDENCE=evidence;
   if(spec.id==='enterprise-workflow-runtime')stageEnv.NAUMI_RUNTIME_EVIDENCE_DIR=evidence;
   if(['enterprise-source-audit','enterprise-pilot-plan','enterprise-workflow-runtime'].includes(spec.id)){
    const temp=path.join(evidence,'temp');await fs.mkdir(temp);stageEnv.TEMP=temp;stageEnv.TMP=temp;
   }
   if(spec.id==='canvas-arrange')stageEnv.CANVAS_ARRANGE_EVIDENCE=evidence;
   if(spec.id==='canvas-overlay-owner')stageEnv.CANVAS_OVERLAY_OWNER_EVIDENCE=evidence;
   if(spec.id==='canvas-viewport-owner')stageEnv.CANVAS_VIEWPORT_OWNER_EVIDENCE=evidence;
   if(spec.id==='canvas-view-navigation')stageEnv.VIEW_NAVIGATION_EVIDENCE=evidence;
   if(spec.id==='canvas-view-navigation-dom')stageEnv.VIEW_NAVIGATION_DOM_EVIDENCE=evidence;
   if(spec.id==='canvas-image-model')stageEnv.CANVAS_IMAGE_MODEL_EVIDENCE=evidence;
   if(spec.id==='canvas-image-model-dom')stageEnv.CANVAS_IMAGE_MODEL_DOM_EVIDENCE=evidence;
   if(spec.id==='canvas-theme-controls')stageEnv.CANVAS_THEME_CONTROLS_EVIDENCE=evidence;
   if(spec.id==='canvas-theme-panels')stageEnv.CANVAS_THEME_PANELS_EVIDENCE=evidence;
   if(spec.id==='canvas-theme-matrix')stageEnv.CANVAS_THEME_MATRIX_EVIDENCE=evidence;
   if(spec.id==='schema-bootstrap-client')stageEnv.SCHEMA_BOOTSTRAP_EVIDENCE=evidence;
   if(spec.id==='request-schema-startup')stageEnv.REQUEST_SCHEMA_STARTUP_EVIDENCE=evidence;
   if(spec.id==='distributed-rate-limit')stageEnv.DISTRIBUTED_RATE_LIMIT_EVIDENCE=evidence;
   if(spec.id==='parent-completion')stageEnv.IMAGEGEN_PARENT_COMPLETION_EVIDENCE=evidence;
   if(spec.id==='cutout-receipt')stageEnv.CUTOUT_RECEIPT_EVIDENCE=evidence;
   if(spec.id==='canvas-fanout-owners')stageEnv.CANVAS_FANOUT_OWNERS_EVIDENCE=evidence;
   if(spec.id==='canvas-fanout-receipt')stageEnv.CANVAS_FANOUT_RECEIPT_EVIDENCE=evidence;
   if(spec.id==='image-auto-frame')stageEnv.IMAGE_AUTO_FRAME_EVIDENCE=evidence;
   if(spec.id==='canvas-text-prompt-feedback')stageEnv.CANVAS_TEXT_PROMPT_EVIDENCE=evidence;
   if(spec.id==='canvas-io-boundaries')stageEnv.CANVAS_IO_EVIDENCE=evidence;
   if(spec.id==='canvas-artwork-document')stageEnv.ARTWORK_EVIDENCE=evidence;
   if(spec.id==='prompt-optimizer')stageEnv.CANVAS_PROMPT_EVIDENCE=evidence;
   if(spec.id==='primary-generation')stageEnv.PRIMARY_GENERATION_EVIDENCE=evidence;
   if(spec.id==='text-image-runs')stageEnv.TEXT_IMAGE_RUN_EVIDENCE=evidence;
   if(spec.id==='local-image-edits')stageEnv.LOCAL_IMAGE_EDIT_EVIDENCE=evidence;
   if(spec.id==='local-image-edits-pg')stageEnv.LOCAL_IMAGE_EDIT_PG_EVIDENCE=evidence;
   if(spec.id==='image-size')stageEnv.CANVAS_SIZE_EVIDENCE=evidence;
   if(spec.id==='apimart-polling-boundary')stageEnv.X6_OUT=evidence;
   if(spec.id==='native-documents')stageEnv.NATIVE_DOCUMENT_EVIDENCE=evidence;
   if(spec.id==='native-documents-pg')stageEnv.NATIVE_DOCUMENT_PG_EVIDENCE=evidence;
   if(spec.id==='reference-retention')stageEnv.REFERENCE_RETENTION_EVIDENCE=evidence;
   if(spec.id==='admin-user-usage-pg')stageEnv.ADMIN_USER_USAGE_EVIDENCE=evidence;
   if(spec.id==='admin-user-usage-routes')stageEnv.ADMIN_USAGE_ROUTES_EVIDENCE=evidence;
   if(spec.id==='admin-member-history-pg')stageEnv.CRUD_EVIDENCE_ROOT=evidence;
   if(spec.id==='nas-delivery')stageEnv.P0_NAS_EVIDENCE=evidence;
   if(spec.id==='business-routing-lifecycle')stageEnv.BUSINESS_ROUTING_LIFECYCLE_EVIDENCE=evidence;
   if(spec.id==='dataurl-delivery')stageEnv.DATAURL_PNG=path.join(out,'dataurl-decoder','fixture-1536x2048.png');
   let literal='';const child=spawn(row.command[0],row.command.slice(1),{cwd:root,env:stageEnv,windowsHide:true,stdio:['ignore','pipe','pipe']});const completion=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});row.pid=child.pid;const log=chunk=>{literal+=chunk.toString('utf8');process.stdout.write(chunk);};child.stdout.on('data',log);child.stderr.on('data',log);const result=await completion;await write();
   await fs.appendFile(row.log,literal+'\nEXIT='+result.code+' SIGNAL='+result.signal+'\n');row.exit=result.code;row.signal=result.signal;row.finishedAt=new Date().toISOString();row.logSha256=hash(await fs.readFile(row.log));row.marker=spec.expect?literal.includes(spec.expect):true;row.status=result.code===0&&row.marker?'PASS':'FAIL';await write();const afterCase=await sourceIdentity(root);if(afterCase.digest!==identity.digest||afterCase.commit!==identity.commit)throw Error('SOURCE_CHANGED_DURING_VERIFICATION');if(row.status==='FAIL')break;
  }
  const after=await sourceIdentity(root);report.after={commit:after.commit,digest:after.digest,dirty:after.dirty};if(after.commit!==identity.commit||after.digest!==identity.digest)throw Error('SOURCE_CHANGED_DURING_VERIFICATION');
  report.status=report.cases.every(c=>c.status==='PASS')?(scope==='core'&&!identity.dirty?'PASS':'PARTIAL'):'FAIL';report.completeCore=report.status==='PASS';
 }catch(error){for(const row of report.cases)if(row.status==='RUNNING'){row.status='FAIL';row.error=error instanceof Error?error.message:String(error);}report.status='FAIL';report.error=error instanceof Error?error.message:String(error);report.completeCore=false;}
 report.finishedAt=new Date().toISOString();report.passed=report.cases.filter(c=>c.status==='PASS').length;report.failed=report.cases.filter(c=>c.status==='FAIL').length;report.notRun=report.cases.filter(c=>c.status==='NOT_RUN').length;await write();return report;
}
