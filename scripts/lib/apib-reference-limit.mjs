import {createHash} from 'node:crypto';
import {canonical} from './apib-activation.mjs';
import {EDIT_IDS,EDIT_SOURCE_SHA,digest,rollbackEdit} from './apib-edit-activation.mjs';
export {EDIT_IDS,digest};
const need=(v,c)=>{if(!v)throw Error(c)};
export function verifyReferenceLimit(config,plan){
 need(plan.kind==='apib-reference-limit16'&&plan.delta.length===2,'TWO_REFERENCE_LIMIT_FIELDS_REQUIRED');need(digest(config)===plan.candidateDigest,'CANDIDATE_DIGEST_CHANGED');
 for(const id of EDIT_IDS){const u=config.upstreamModels.find(u=>u.id===id);need(u?.enabled&&u.providerId==='apib-image'&&u.capabilities.edit&&!u.capabilities.verified&&u.capabilities.maxReferenceImages===16,'REFERENCE_LIMIT_MISMATCH')}
 return{enabledEditIds:EDIT_IDS,deltaCount:2,referenceLimit:16,verifiedPromotions:0,weightChanges:0,providerCalls:0};
}
export function makeReferenceLimitPlan(snapshot,billing,sourceBytes,operationId){
 need(snapshot.version>=122&&snapshot.digest===digest(snapshot.config),'MODEL_BASELINE_INVALID');need(/^[a-f0-9-]{36}$/.test(operationId),'OPERATION_ID_INVALID');need(createHash('sha256').update(sourceBytes).digest('hex')===EDIT_SOURCE_SHA,'SOURCE_CHANGED');
 const config=structuredClone(snapshot.config),delta=[];
 for(const id of EDIT_IDS){const u=config.upstreamModels.find(u=>u.id===id);need(u?.enabled&&u.providerId==='apib-image'&&u.capabilities.edit&&!u.capabilities.verified&&u.capabilities.maxReferenceImages===6,'REFERENCE_BASELINE_CHANGED');delta.push({id,path:['capabilities','maxReferenceImages'],before:{present:true,value:6},after:{present:true,value:16}});u.capabilities.maxReferenceImages=16}
 const plan={schemaVersion:1,kind:'apib-reference-limit16',operationId,baseline:{version:snapshot.version,digest:snapshot.digest,billingVersion:billing.version,billingHash:digest(billing)},candidateDigest:digest(config),sourceSha256:EDIT_SOURCE_SHA,delta,imagegenWasAbsent:{},config,policy:{references:[1,16],paidAcceptance:'PAUSED_BY_USER',paidProbes:false,verifiedPromotions:0,weightChanges:0}};
 verifyReferenceLimit(config,plan);need(canonical(rollbackEdit(config,plan))===canonical(snapshot.config),'SELECTIVE_INVERSE_FAILED');return plan;
}
export function rollbackReferenceLimit(current,plan){return rollbackEdit(current,plan)}
