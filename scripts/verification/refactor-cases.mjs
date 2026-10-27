import path from "node:path";
/** One catalogue of existing regression entrypoints, not a second test framework.
 * Each group is required by core. Missing/failed scripts are never optional. */
const ts=(id,group,file,expect,args=[])=>({id,group,file,args,expect,pg:true,tsx:true});
const node=(id,group,file,expect,args=[])=>({id,group,file,args,expect,pg:false,tsx:false});
export const refactorCases=[
 node('model-management','foundation','scripts/verify-model-management-refactor.mjs','MODEL_MANAGEMENT_REFACTOR=PASS',['--static']),
 node('admin-settings','foundation','scripts/verify-admin-settings-refactor.mjs','ADMIN_SETTINGS=PASS',['--static']),
 ts('admin-settings-pg','foundation','scripts/verify-admin-settings-pg.ts','ADMIN_SETTINGS_PG=PASS'),
 node('admin-usage','foundation','scripts/verify-admin-usage-refactor.mjs','ADMIN_USAGE=PASS',['--static']),
 node('workbench-assets','foundation','scripts/verify-workbench-assets.mjs','WORKBENCH_ASSETS=PASS',['--static']),
 node('platform-unit','foundation','scripts/verify-platform-db.cjs','PLATFORM_DB=PASS'),
 ts('platform-pg','foundation','scripts/verify-platform-db-pg.ts','PLATFORM_DB_PG=PASS'),
 ts('identity','foundation','scripts/verify-identity-creation-boundaries-pg.ts','IDENTITY_CREATION_BOUNDARIES_PG=PASS'),
 ts('startup','foundation','scripts/verify-application-persistence-pg.ts','APPLICATION_PERSISTENCE_PG=PASS'),
 ts('catalog-read','foundation','scripts/verify-model-catalog-read-pg.ts','MODEL_CATALOG_READ=PASS'),
 ts('preparation','generation','scripts/verify-image-preparation-refactor.ts','IMAGE_PREPARATION_REFACTOR=PASS'),
 ts('delivery','generation','scripts/verify-image-delivery-continuation.ts','IMAGE_DELIVERY_CONTINUATION=PASS'),
 ts('completed-parent','generation','scripts/verify-completed-parent-entry-pg.ts','COMPLETED_PARENT_ENTRY=PASS'),
 ts('wallet','pricing','scripts/verify-billing-wallet.ts','PASS wallet reserve/settle/release'),
 ts('image-price','pricing','scripts/verify-pricing-friction-image.ts','MODIFIED=PASS',['--mode','modified']),
 ts('agent-price','pricing','scripts/verify-pricing-friction-agent.ts','AGENT_PRICING_MODIFIED=PASS'),
 ts('workbench-price','pricing','scripts/verify-pricing-friction-workbench.ts','WORKBENCH_MODIFIED=PASS',['--mode','modified']),
 node('text-fields','canvas','scripts/verify-canvas-text-write.cjs','CANVAS_TEXT_WRITE=PASS'),
 node('artwork-fields','canvas','scripts/verify-canvas-artwork-write.cjs','CANVAS_ARTWORK_WRITE=PASS'),
 ts('text-pg','canvas','scripts/verify-canvas-text-concurrency-pg.ts','CANVAS_TEXT_CONCURRENCY=PASS'),
 ts('artwork-pg','canvas','scripts/verify-canvas-artwork-concurrency-pg.ts','CANVAS_ARTWORK_CONCURRENCY=PASS'),
 ts('artwork-writer','canvas','scripts/verify-canvas-artwork-writer-pg.ts','CANVAS_ARTWORK_WRITER=PASS'),
 node('history','canvas','scripts/verify-canvas-history-refactor.cjs','CANVAS_HISTORY_REFACTOR=PASS'),
 ts('node-operations','canvas','scripts/verify-canvas-node-operations-pg.ts','CANVAS_NODE_OPERATIONS_PG=PASS'),
 ts('video-wire','video','scripts/verify-video-node-capability-options.ts','VIDEO_NODE_CAPABILITY_OPTIONS=PASS'),
 ts('video-source','video','scripts/verify-video-frozen-source-authority.ts','VIDEO_FROZEN_SOURCE_AUTHORITY=PASS'),
 node('worker-unit','runtime','scripts/test-worker-runtime.mjs','# fail 0',['--test-runner']),
 node('worker-process','runtime','scripts/verify-worker-handoff.mjs','WORKER_HANDOFF_PROCESS=PASS'),
];
export function caseCommand(item){if(process.platform==='win32'&&item.id==='worker-process')return ['docker','run','--rm','--init','--network','none','--read-only','--tmpfs','/tmp:rw,size=64m','--label','naumi.task=refactor-r6a-20261026','--mount','type=bind,src='+path.resolve('scripts')+',dst=/verification,readonly','--entrypoint','node','node:24-bookworm-slim','/verification/verify-worker-handoff.mjs'];return [process.execPath,...(item.args?.includes('--test-runner')?['--test','--test-reporter=tap']:item.tsx?['--conditions=react-server','--import','tsx']:[]),item.file,...(item.args||[]).filter(v=>v!=='--test-runner')];}
export function selectRefactorCases(group){if(!group||group==='core')return refactorCases;const selected=refactorCases.filter(c=>c.group===group);if(!selected.length)throw Error('UNKNOWN_VERIFICATION_GROUP: '+group);return selected;}
