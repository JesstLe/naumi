import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd(),coverage=JSON.parse(await readFile('scripts/video-fusion/coverage.json','utf8')),receipts=[];
async function receipt(key){
 const file=coverage.evidenceRegistry[key]?.artifact;assert.equal(typeof file,'string');
 const resolved=path.resolve(root,file),relative=path.relative(root,resolved);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
 const bytes=await readFile(resolved);receipts.push({key,artifact:file,sha256:createHash('sha256').update(bytes).digest('hex')});
 return file.endsWith('.json')?JSON.parse(bytes):bytes.toString('utf8');
}
function flags(value,keys){for(const key of keys)assert.equal(value[key],true,key);}
const rollback=await receipt('linuxRollback'),linux=await receipt('linuxProtection'),readonly=await receipt('readonly'),freeze=await receipt('linuxFreeze'),billing=await receipt('billing');
const billingCompletion=await receipt('billingCompletion');assert.equal(billingCompletion.ok,true);assert.equal(billingCompletion.exitCode,0);assert.equal(billingCompletion.command,'node scripts/verify-billing-all.mjs');assert.equal(billingCompletion.sha256,receipts.find(row=>row.key==='billing').sha256);assert.equal(billingCompletion.log,path.basename(coverage.evidenceRegistry.billing.artifact));
flags(rollback,['oldRuntimeTicksPreserveUncertainTask','fullImmutableTaskRowsCompared','frozenVideoDefaultsIncluded']);
flags(rollback,['ok','actualCompiledLinuxRuntimes','legacySchemaInitializedByOldRuntime','legacyRowsExistedBeforeAdditiveDdlAndPreserved','oldColumnsAndTypesPreserved','oldTaskCreatedAndCompletedByOldRuntime','oldTaskFrozenDataPreserved','privateMediaBytesAndRangeAndTwoAccountAuth','actualPresignedBytesAndTamperAndExpiry','expiredObjectUrlDoesNotBreakOwnedMediaRoute','accountLedgerModelAndBillingHashesPreserved','rollbackAndReupgrade','acceptedUnknownNeverResubmitted','mediaWorkerDrainedAndResumed','databaseRestorationProven','newMediaFrameCompletesOnUnchangedLegacyBilling']);
assert.equal(rollback.appUid,1001);assert.equal(rollback.legacyFixtureSeedSource,'c05a923e830d27aafcb1c0856dc15181dc21d92b');
assert.deepEqual(rollback.versions.map(value=>value.commit),['c05a923e830d27aafcb1c0856dc15181dc21d92b','e997b290b39fc9df63e4c3b6387fa008b7b0e18d','c05a923e830d27aafcb1c0856dc15181dc21d92b','e997b290b39fc9df63e4c3b6387fa008b7b0e18d']);
flags(linux,['ok','actualCompiledProductionApp','networkNone','taskProtection','frozenStagesAcrossRestart','legacyPrimaryAndResults']);
flags(readonly,['ok','actualAppDb','adminExplicitTargetRead','ordinaryAccountTargetDenied','defaultOwnerStillIsolated','taskInspectionNoSupplierPolling','targetBalanceUnchanged','writeGenerateCancelDeleteCannotImpersonateTarget','publicSnapshotNoExecutionSecrets']);
flags(freeze,['ok','realAppDbAndWorker','encryptedStageCapsules','pendingStageModelMappingFrozen','pendingStageBillingVersionFrozen','fullOwnedTextFrozen','actualModelAndBillingPublication','actualAppRestart','replayNoNewTasks','ownerIsolation']);
for(const line of ['PASS dynamic quotes, frozen prices, partial/failure/BYOK policies, result validation','PASS wallet reserve/settle/release idempotency, unknown holds, expiry rollback, concurrency and transaction rollback','PASS admin authorization and stale quote rejection'])assert.ok(billing.includes(line),line);
assert.equal(rollback.formalSupplierCalls,0);assert.equal(linux.formalSupplierCalls,0);assert.equal(readonly.paidVideoApiCalls,0);assert.equal(freeze.paidVideoApiCalls,0);
const report={ok:true,scope:'actual-app-safety-with-isolated-suppliers',twoAccountPrivateMediaAndExpiredUrls:true,legacyDataConfigAndCreditsAcrossRestoredRollback:true,oneSettlementAndUnknownHeld:true,publishedConfigurationDoesNotChangeFrozenStages:true,adminReadonlyCannotImpersonateMutation:true,successfulFullBillingRunner:true,formalSupplierCalls:0,realVideoQualityValidated:false,productionReleaseProven:false,ciAllGreenClaimed:false,receipts};
const output='output/canvas-video-fusion-20261013/checkpoint-d/safety-20261017.json';await writeFile(output,JSON.stringify(report,null,2));console.log('VIDEO_SAFETY_AUDIT=PASS '+output);
