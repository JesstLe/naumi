import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {renderEnterpriseProxy,judgeEnterpriseRetirement} from './enterprise-production/proxy-contract.mjs';
const plan={publicOrigin:'http://127.0.0.1:18482',listenPort:18482,webPort:18520,slot:'blue',revision:1};
test('renderer is deterministic, full-URI input cannot inject directives, and writes never fail over',()=>{
 const a=renderEnterpriseProxy(plan);assert.deepEqual(a,renderEnterpriseProxy(plan));assert(a.text.includes('proxy_next_upstream off;'));assert(a.text.includes('proxy_request_buffering off;'));assert(a.text.includes('location = /preview.html'));assert(a.text.includes('include /etc/nginx/mime.types;'));
 for(const bad of [{...plan,slot:'blue; return 200'},{...plan,webPort:18482},{...plan,revision:0},{...plan,publicOrigin:'http://u:p@127.0.0.1:18482'},{...plan,publicOrigin:'https://example.invalid/path'},{...plan,extra:'unrecognized'}])assert.throws(()=>renderEnterpriseProxy(bad));
});
test('synthetic complete counters only permit outer review; unknown and malformed counters are never zeros',()=>{
 // Unit input, not a captured runtime snapshot. Never exported as live release evidence.
 const expected={web:{instanceId:'fixture-web',bootId:randomUUID(),commit:'a'.repeat(40)},runtime:{installationId:'fixture-runtime',slot:'blue',bootId:randomUUID(),releaseId:'b'.repeat(64)}};
 const input={receivedAt:new Date().toISOString(),expected,web:{observedAt:new Date().toISOString(),identity:expected.web,transport:{verified:true},coverage:{allApplicationRequests:true,allBackgroundAcceptedWork:true,allAgentExecutions:true,allApplicationAdmissions:true},admission:{mode:'draining'},observations:{activeRequests:0,acceptedTasks:0,agentSessions:0,workerLeases:0,unknownLeases:0}},runtime:{...expected.runtime,status:'drained',acceptingWork:false,activeRequests:0,activeWork:0}};
 assert.equal(judgeEnterpriseRetirement(input).disposition,'READY_FOR_OUTER_REVIEW');assert(!('complete' in judgeEnterpriseRetirement(input)));
 for(const field of ['activeRequests','acceptedTasks','agentSessions','workerLeases','unknownLeases'])for(const value of [null,false,'0',-1,0.5,1]){const v=structuredClone(input);v.web.observations[field]=value;assert.equal(judgeEnterpriseRetirement(v).disposition,'HOLD');}
 for(const value of [null,false,'0',1]){const v=structuredClone(input);v.runtime.activeRequests=value;assert.equal(judgeEnterpriseRetirement(v).disposition,'HOLD');}
 assert.equal(judgeEnterpriseRetirement({...input,receivedAt:'2000-01-01T00:00:00Z'}).disposition,'HOLD');
 assert.equal(judgeEnterpriseRetirement({...input,expected:{...expected,web:{...expected.web,bootId:randomUUID()}}}).disposition,'HOLD');
});
