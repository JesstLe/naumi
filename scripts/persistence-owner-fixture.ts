/** Versioned verifier metadata; not imported by production. Private legacy SQL
 * owners are syntax-projected only where the original module had no export. */
import {access} from 'node:fs/promises';
import path from 'node:path';
export const PERSISTENCE_14=["persistence","billing","models","model-runtime","video-defaults","supplier-video","creation","media","login","image-skills","imagegen-quotes","billing-quotes","imagegen-batches","workbench"];
export const PERSISTENCE_37=["persistence","billing","models","model-runtime","video-defaults","supplier-video","supplier-cost","supplier-models","provider-catalog","model-health","execution-audit","teams","enterprise","tenants","creation","media","login","image-skills","imagegen-quotes","billing-quotes","imagegen-batches","workbench","bi","canvas-settings","canvas-workflow-import","canvas-video-nodes","canvas-node-copy","competitor","packaging","postprocess","media-inspection","media-jobs","video-assets","reference-upload","script-assets","video-workflows","video-canvas-batches"];
export async function expectedPersistenceSteps(root:string){try{await access(path.join(root,'src/lib/application/persistence.ts'));return PERSISTENCE_37;}catch{}try{await access(path.join(root,'src/lib/model-config/startup.ts'));return PERSISTENCE_14;}catch{}return PERSISTENCE_14.filter(n=>n!=='supplier-video');}
export type PersistenceOwner={from:string;to:string;name:string;newName:string;publicName?:string|null;owner?:string|null;pool?:boolean;queryOnly?:boolean};
export const PERSISTENCE_OWNERS:PersistenceOwner[]=[
 {
  "from": "src/lib/teams/server.ts",
  "name": "ensureTeamSchema",
  "newName": "ensureTeamSchema",
  "to": "src/lib/teams/schema.ts",
  "owner": "teams",
  "publicName": "ensureTeamSchema",
  "pool": false
 },
 {
  "from": "src/lib/enterprise/server.ts",
  "name": "ensureEnterpriseSchema",
  "newName": "ensureEnterpriseSchema",
  "to": "src/lib/enterprise/schema.ts",
  "owner": "enterprise",
  "publicName": "ensureEnterpriseSchema",
  "pool": false
 },
 {
  "from": "src/lib/saas/tenants.ts",
  "name": "ensureTenantSchema",
  "newName": "ensureTenantSchema",
  "to": "src/lib/saas/tenant-schema.ts",
  "owner": "tenants",
  "publicName": "ensureTenantSchema",
  "pool": false
 },
 {
  "from": "src/lib/bi/repository.ts",
  "name": "ensureBiSchema",
  "newName": "ensureBiSchema",
  "to": "src/lib/bi/schema.ts",
  "owner": "bi",
  "publicName": "ensureBiSchema",
  "pool": false
 },
 {
  "from": "src/lib/competitor/repository.ts",
  "name": "ensureCompetitorSchema",
  "newName": "ensureCompetitorSchema",
  "to": "src/lib/competitor/schema.ts",
  "owner": "competitor",
  "publicName": null,
  "pool": false
 },
 {
  "from": "src/lib/packaging-strategy/server.ts",
  "name": "schema",
  "newName": "ensurePackagingSchema",
  "to": "src/lib/packaging-strategy/schema.ts",
  "owner": "packaging",
  "publicName": null,
  "pool": false
 },
 {
  "from": "src/lib/canvas-node-settings-store.ts",
  "name": "ensureCanvasSettingsSchema",
  "newName": "ensureCanvasSettingsSchema",
  "to": "src/lib/canvas/storage-schema.ts",
  "owner": "canvas-settings",
  "publicName": "ensureCanvasSettingsSchema",
  "pool": false
 },
 {
  "from": "src/lib/canvas-workflow-import.ts",
  "name": "ensureWorkflowImportSchema",
  "newName": "ensureWorkflowImportSchema",
  "to": "src/lib/canvas/storage-schema.ts",
  "owner": "canvas-workflow-import",
  "publicName": "ensureWorkflowImportSchema",
  "pool": false
 },
 {
  "from": "src/lib/canvas/video-node-repository.ts",
  "name": "ensureVideoNodeSchema",
  "newName": "ensureVideoNodeSchema",
  "to": "src/lib/canvas/storage-schema.ts",
  "owner": "canvas-video-nodes",
  "publicName": "ensureVideoNodeSchema",
  "pool": false
 },
 {
  "from": "src/lib/video/assets.ts",
  "name": "ensureVideoAssetSchema",
  "newName": "ensureVideoAssetSchema",
  "to": "src/lib/video/storage-schema.ts",
  "owner": "video-assets",
  "publicName": "ensureVideoAssetSchema",
  "pool": false
 },
 {
  "from": "src/lib/video/media-inspection.ts",
  "name": "ensureMediaInspectionSchema",
  "newName": "ensureMediaInspectionSchema",
  "to": "src/lib/video/storage-schema.ts",
  "owner": "media-inspection",
  "publicName": "ensureMediaInspectionSchema",
  "pool": false
 },
 {
  "from": "src/lib/video/media-jobs.ts",
  "name": "ensureMediaJobSchema",
  "newName": "ensureMediaJobSchema",
  "to": "src/lib/video/storage-schema.ts",
  "owner": "media-jobs",
  "publicName": "ensureMediaJobSchema",
  "pool": false
 },
 {
  "from": "src/lib/video/script-assets.ts",
  "name": "ensureScriptSchema",
  "newName": "ensureVideoScriptSchema",
  "to": "src/lib/video/storage-schema.ts",
  "owner": "script-assets",
  "publicName": null,
  "pool": false
 },
 {
  "from": "src/lib/video/reference-upload.ts",
  "name": "ensureReferenceUploadSchema",
  "newName": "ensureVideoReferenceUploadSchema",
  "to": "src/lib/video/storage-schema.ts",
  "owner": "reference-upload",
  "publicName": null,
  "pool": false
 },
 {
  "from": "src/lib/video/workflow.ts",
  "name": "ensureWorkflowSchema",
  "newName": "ensureVideoWorkflowSchema",
  "to": "src/lib/video/storage-schema.ts",
  "owner": "video-workflows",
  "publicName": "ensureVideoWorkflowSchema",
  "pool": false
 },
 {
  "from": "src/lib/video/canvas-batch.ts",
  "name": "ensureBatchSchema",
  "newName": "ensureVideoBatchSchema",
  "to": "src/lib/video/storage-schema.ts",
  "owner": "video-canvas-batches",
  "publicName": null,
  "pool": false
 },
 {
  "from": "src/lib/media-postprocess.ts",
  "name": "ensurePostprocessSchema",
  "newName": "ensurePostprocessSchema",
  "to": "src/lib/media-postprocess-schema.ts",
  "owner": "postprocess",
  "publicName": "ensurePostprocessSchema",
  "pool": true
 },
 {
  "from": "src/lib/model-config/execution-audit.ts",
  "name": "ensureExecutionAuditSchema",
  "newName": "ensureExecutionAuditSchema",
  "to": "src/lib/model-config/execution-audit-schema.ts",
  "owner": "execution-audit",
  "publicName": "ensureExecutionAuditSchema",
  "pool": true
 },
 {
  "from": "src/lib/model-config/catalog-store.ts",
  "name": "ensure",
  "newName": "ensureProviderCatalogSchema",
  "to": "src/lib/model-config/catalog-schema.ts",
  "owner": "provider-catalog",
  "publicName": null,
  "pool": true
 },
 {
  "from": "src/lib/image-skills/server.ts",
  "name": "ensureImageSkills",
  "newName": "ensureImageSkills",
  "to": "src/lib/image-skills/schema.ts",
  "owner": null,
  "publicName": "ensureImageSkills",
  "pool": false
 },
 {
  "from": "src/lib/imagegen/quotes.ts",
  "name": "ensureImagegenQuotes",
  "newName": "ensureImagegenQuotes",
  "to": "src/lib/imagegen/storage-schema.ts",
  "owner": null,
  "publicName": "ensureImagegenQuotes",
  "pool": false
 },
 {
  "from": "src/lib/imagegen/batch-repository.ts",
  "name": "ensureImagegenBatches",
  "newName": "ensureImagegenBatches",
  "to": "src/lib/imagegen/storage-schema.ts",
  "owner": null,
  "publicName": "ensureImagegenBatches",
  "pool": false
 },
 {
  "from": "src/lib/billing/image-quotes.ts",
  "name": "ensureImageBillingQuotes",
  "newName": "ensureImageBillingQuotes",
  "to": "src/lib/billing/image-quote-schema.ts",
  "owner": null,
  "publicName": "ensureImageBillingQuotes",
  "pool": false
 },
 {
  "from": "src/lib/reference-workbench/repository.ts",
  "name": "ensureWorkbench",
  "newName": "ensureWorkbench",
  "to": "src/lib/reference-workbench/schema.ts",
  "owner": null,
  "publicName": "ensureWorkbench",
  "pool": false
 },
 {
  "from": "src/lib/media-assets.ts",
  "name": "ensureMediaSchema",
  "newName": "ensureMediaSchema",
  "to": "src/lib/media-assets-schema.ts",
  "owner": null,
  "publicName": "ensureMediaSchema",
  "pool": false
 },
 {
  "from": "src/lib/model-config/schema.ts",
  "name": "ensureModelSchema",
  "newName": "ensureModelSchema",
  "to": "src/lib/model-config/storage-schema.ts",
  "owner": null,
  "publicName": "ensureModelSchema",
  "pool": true
 },
 {
  "from": "src/lib/auth-login-limit.ts",
  "name": "ensureLoginGuardSchema",
  "newName": "ensureLoginGuardSchema",
  "to": "src/lib/auth-login-schema.ts",
  "owner": null,
  "publicName": "ensureLoginGuardSchema",
  "pool": true
 },
 {
  "from": "src/lib/video/frozen-capability.ts",
  "name": "ensureVideoDefaultsSchema",
  "newName": "ensureVideoDefaultsSchema",
  "to": "src/lib/video/model-defaults-schema.ts",
  "owner": null,
  "publicName": "ensureVideoDefaultsSchema",
  "pool": true
 },
 {
  "from": "src/lib/supplier-models/video-access.ts",
  "name": "ensureSupplierVideoSchema",
  "newName": "ensureSupplierVideoSchema",
  "to": "src/lib/supplier-models/video-schema.ts",
  "owner": null,
  "publicName": "ensureSupplierVideoSchema",
  "pool": true
 },
 {
  "from": "src/lib/canvas/node-copy.ts",
  "name": "copyCanvasNodes DDL",
  "newName": "ensureCanvasNodeCopySchema",
  "to": "src/lib/canvas/storage-schema.ts",
  "owner": "canvas-node-copy",
  "queryOnly": true
 },
 {
  "from": "src/lib/model-health/schema.ts",
  "to": "src/lib/model-health/schema.ts",
  "name": "ensureHealthSchema",
  "newName": "ensureHealthSchema",
  "publicName": "ensureHealthSchema",
  "pool": true
 },
 {
  "from": "src/lib/supplier-cost/schema.ts",
  "to": "src/lib/supplier-cost/schema.ts",
  "name": "ensureSupplierSchema",
  "newName": "ensureSupplierSchema",
  "publicName": "ensureSupplierSchema",
  "pool": true
 },
 {
  "from": "src/lib/supplier-models/schema.ts",
  "to": "src/lib/supplier-models/schema.ts",
  "name": "ensureSupplierModels",
  "newName": "ensureSupplierModels",
  "publicName": "ensureSupplierModels",
  "pool": true
 }
];
