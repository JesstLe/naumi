#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const ACTIVE=new Set(['pending','queued','running','processing','generating']);
const FAILED=new Set(['error','failed','rejected']);
const normalize=s=>({pending:'queued',reviewing:'queued',processing:'running',generating:'running',done:'succeeded',completed:'succeeded',success:'succeeded',error:'failed',rejected:'failed',needs_attention:'needs_review'}[s]||s);

function analyze(snapshot){
 if(snapshot.collectionFailed||snapshot.schemaVersion!==1||snapshot.readOnly!==true||!Array.isArray(snapshot.rows))throw Error('INVALID_OBSERVATION');
 const now=Date.parse(snapshot.observedAt);if(!Number.isFinite(now))throw Error('INVALID_OBSERVATION_TIME');
 const rows=snapshot.rows,byId=new Map(),parents=new Map();
 for(const r of rows){const k=`${r.table}:${r.id}:${r.owner}`;if(byId.has(k))throw Error('DUPLICATE_OBSERVATION');byId.set(k,r);}
 for(const r of rows)for(const id of r.children||[]){const k=`app_image_jobs:${id}:${r.owner}`;if(!parents.has(k))parents.set(k,[]);parents.get(k).push(r);}
 function rootOf(row){let r=row,seen=new Set();for(let i=0;i<8;i++){const k=`${r.table}:${r.id}:${r.owner}`;if(seen.has(k))return row;seen.add(k);const p=parents.get(k);if(p?.length!==1)return r;r=p[0];}return row;}
 const findings=new Map();
 function add(row,type,evidence,classification='needs-triage'){
  const root=rootOf(row),rootPseudonym='op-'+hash([snapshot.target,root.table,root.id,root.owner]).slice(0,32),id='case-'+hash([rootPseudonym,type]).slice(0,24);
  const observation={recordPseudonym:'row-'+hash([row.table,row.id,row.owner]).slice(0,24),sourceTable:row.table,kind:row.kind,status:row.status,resultStatus:row.resultStatus||null,...evidence};
  if(findings.has(id))findings.get(id).evidence.push(observation);
  else findings.set(id,{id,rootPseudonym,type,classification,sourceCommit:snapshot.sourceCommit,firstSeen:snapshot.observedAt,lastSeen:snapshot.observedAt,evidence:[observation],replayStatus:'not-run',productionStatus:'observed',resolution:'OPEN'});
 }
 let preserved=0;
 for(const r of rows){
  if(r.historyProtected){preserved++;continue;}
  const updated=Date.parse(r.updatedAt),created=Date.parse(r.createdAt);if(!Number.isFinite(updated)||!Number.isFinite(created))throw Error('INVALID_ROW_TIME');
  const staleMinutes=Math.max(0,(now-updated)/60000),ageMinutes=Math.max(0,(now-created)/60000),s=r.resultStatus||r.status;
  const facts={staleMinutes:Math.floor(staleMinutes),ageMinutes:Math.floor(ageMinutes),deliveredOutputs:r.deliveredOutputs||0,checkpointCount:r.checkpointCount||0,activeLease:Number.isFinite(Date.parse(r.leaseUntil))&&Date.parse(r.leaseUntil)>now};
  if(ACTIVE.has(s)&&facts.deliveredOutputs>0&&staleMinutes>=5)add(r,'status-output-mismatch',facts);
  const children=(r.children||[]).map(id=>byId.get(`app_image_jobs:${id}:${r.owner}`));
  if(r.kind==='imagegen'&&ACTIVE.has(s)&&children.length&&children.every(c=>c&&!c.historyProtected&&c.status==='done'&&c.deliveredOutputs>0&&now-Date.parse(c.updatedAt)>=300000))add(r,'parent-receipt-stale',{...facts,completedChildren:children.length},'application-defect-candidate');
  if(FAILED.has(s))add(r,'generation-failed',{...facts,errorCategory:errorCategory(r.errorCode,r.error)},'needs-cause-proof');
  if(['needs_attention','needs_review'].includes(s))add(r,'unresolved-outcome',{...facts,errorCategory:errorCategory(r.errorCode,r.error)},'requires-original-receipt');
  if(ACTIVE.has(s)&&staleMinutes>=15&&ageMinutes>=(r.table==='app_video_tasks'?120:30))add(r,'stalled-or-timeout',{...facts,unknownSubmission:(r.paidStates||[]).includes('started')},'observation-not-retry-permission');
  if((r.checkpointCount||0)>0&&!facts.deliveredOutputs&&staleMinutes>=5)add(r,'checkpoint-not-delivered',facts,'original-result-only');
 }
 for(const d of snapshot.adminDetails||[])if(d.httpStatus===200&&normalize(d.listStatus)!==normalize(d.detailStatus)){
  const r=byId.get(`${d.table}:${d.id}:${d.owner}`);if(r&&!r.historyProtected)add(r,'admin-list-detail-mismatch',{listStatus:d.listStatus,detailStatus:d.detailStatus},'application-defect-candidate');
 }
 for(const a of snapshot.scannerActivities||[])if(a.key==='recovery-dispatch-scan'&&a.state==='unknown')add({table:'app_release_activities',id:a.key,owner:snapshot.target,kind:'recovery-scan',status:a.state},'scanner-permanent-block',{outcome:a.outcome,heartbeatAt:a.heartbeatAt},'confirmed-fixed-key-poisoning');
 const apiHealthy=(snapshot.adminApi||[]).length>=2&&snapshot.adminApi.every(r=>r.status===200);
 const truncated=snapshot.coverage?.truncatedTables||[];
 return {schemaVersion:1,target:snapshot.target,observedAt:snapshot.observedAt,sourceCommit:snapshot.sourceCommit,image:snapshot.image,coverage:{...snapshot.coverage,apiHealthy,complete:apiHealthy&&!truncated.length,scope:'72h terminal history plus bounded nonterminal sweep; not lifetime completeness'},observedRows:rows.length,preservedHistoryRows:preserved,logicalIncidentCount:new Set([...findings.values()].filter(f=>f.type!=='scanner-permanent-block').map(f=>f.rootPseudonym)).size,findings:[...findings.values()],supplierCalls:0,businessWrites:0,deployed:false};
}
function errorCategory(code,message){const s=String(code||'')+' '+String(message||'');return /timeout|超时/i.test(s)?'timeout':/403|quota|额度/i.test(s)?'supplier-quota-or-permission':/unknown|不一致|核查/i.test(s)?'unresolved-submission':/结果|图片/i.test(s)?'output-unavailable':'unclassified';}
function merge(previous,report){
 const cases=structuredClone(previous?.cases||{});
 for(const f of report.findings){const old=cases[f.id];cases[f.id]={...f,firstSeen:old?.firstSeen||f.firstSeen,observations:(old?.observations||0)+1,resolution:old?.resolution||'OPEN',localFix:old?.localFix||null};}
 // Absence from a bounded page is never proof of resolution or deployment.
 return {schemaVersion:1,lastObservedAt:report.observedAt,cases};
}
function atomic(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp-'+crypto.randomUUID();fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(tmp,file);}
function record(input,out){
 const raw=fs.readFileSync(input);if(raw.length>32*1024*1024)throw Error('OBSERVATION_TOO_LARGE');
 const report=analyze(JSON.parse(raw)),ledgerFile=path.join(out,'cases.json');
 fs.mkdirSync(out,{recursive:true});const id=report.observedAt.replace(/[^0-9]/g,'')+'-'+hash(raw.toString()).slice(0,8),reportFile=path.join(out,'observations',id+'.json');
 if(fs.existsSync(reportFile))return {reportFile,report,duplicate:true};
 const previous=fs.existsSync(ledgerFile)?JSON.parse(fs.readFileSync(ledgerFile,'utf8')):null;
 atomic(reportFile,report);atomic(ledgerFile,merge(previous,report));
 const summary=['# 后台异常巡检',`采集时间：${report.observedAt}`,`版本：${report.sourceCommit}`,`覆盖：${report.coverage.complete?'有界窗口完整':'PARTIAL，保留采集缺口'}`,`逻辑异常任务：${report.logicalIncidentCount}；异常条目：${report.findings.length}；保全历史行：${report.preservedHistoryRows}`, '线上写入0；供应商调用0；修复未部署。', '',...report.findings.map(f=>`- ${f.id} | ${f.type} | ${f.rootPseudonym} | ${f.resolution}`)].join('\n');
 fs.writeFileSync(path.join(out,'LATEST.md'),summary+'\n');
 return {reportFile,report,duplicate:false};
}
function verifyLedger(file){
 const bytes=fs.readFileSync(file);if(bytes.length>32*1024*1024)throw Error('LEDGER_TOO_LARGE');const x=JSON.parse(bytes);
 if(x.schemaVersion!==1||!x.cases||!Number.isFinite(Date.parse(x.lastObservedAt)))throw Error('INVALID_LEDGER');
 const types=new Set(['status-output-mismatch','parent-receipt-stale','generation-failed','unresolved-outcome','stalled-or-timeout','checkpoint-not-delivered','admin-list-detail-mismatch','scanner-permanent-block']);
 const counts={};
 for(const [id,c] of Object.entries(x.cases)){
  if(id!==c.id||!/^case-[a-f0-9]{24}$/.test(id)||!/^op-[a-f0-9]{32}$/.test(c.rootPseudonym)||!types.has(c.type)||!/^[a-f0-9]{40}$/.test(c.sourceCommit)||c.replayStatus!=='not-run'||c.productionStatus!=='observed')throw Error('INVALID_OBSERVED_CASE');
  counts[c.type]=(counts[c.type]||0)+1;
 }
 return {sha256:crypto.createHash('sha256').update(bytes).digest('hex'),cases:Object.keys(x.cases).length,byType:counts,lastObservedAt:x.lastObservedAt,exactRequestsReplayed:0,historicalIncidentsResolved:0};
}
module.exports={analyze,merge,record,verifyLedger};
if(require.main===module){try{const args=process.argv.slice(2);if(args.length!==2)throw Error('USE_INPUT_JSON_OUTPUT_DIRECTORY');const r=record(path.resolve(args[0]),path.resolve(args[1]));console.log(`ADMIN_ANOMALY_WATCH=RECORDED INCIDENTS=${r.report.logicalIncidentCount} FINDINGS=${r.report.findings.length} COVERAGE=${r.report.coverage.complete?'BOUNDED_COMPLETE':'PARTIAL'} DUPLICATE=${r.duplicate?1:0} DEPLOYED=0`);}catch(e){console.error('ADMIN_ANOMALY_WATCH=ERROR '+e.message);process.exitCode=1;}}
