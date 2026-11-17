import type {PublicationStore} from './publication-store';
import type {DeliveryStore} from './delivery-store';
import {WorkflowError,type Actor,type Principal} from './contracts';
import type {PoolClient} from 'pg';
import type {Publication} from './publication-contracts';
import {ensure,digest} from './performance-domain';
import {preflightCommand,preflightQuery,type ImageInspection,type PreflightIssue} from './preflight-contracts';
import {inspectPublicationImage,imageIssues,INSPECTOR_VERSION} from './image-inspector';
export class PreflightStore{
 private running=0;
 private checkingFiles=0;
 constructor(readonly publications:PublicationStore,readonly delivery:DeliveryStore,private inspect=inspectPublicationImage){}
 private async available(tx:PoolClient){ensure((await tx.query('SELECT 1 FROM enterprise_workflow.schema_version WHERE version=32')).rowCount,'PREFLIGHT_MIGRATION_REQUIRED',503);}
 private fingerprint(n:Publication){return digest({source:n.source,target:n.target,slot:n.slot,locale:n.locale,externalObjectId:n.externalObjectId});}
 private async prior(tx:PoolClient,a:Actor,id:string){return (await tx.query('SELECT fingerprint,document FROM enterprise_workflow.publication_preflights WHERE enterprise_id=$1 AND id=$2',[a.enterpriseId,id])).rows[0];}
 async execute(p:Principal,raw:unknown){const c=preflightCommand.parse(raw),fp=digest({p,c});ensure(this.running<2,'PREFLIGHT_BUSY',429);this.running++;
  try{const before=await this.publications.fileRead(p,c.publicationId,async(tx,a,n,snapshot)=>{await this.available(tx);ensure(a.permissions.some(v=>v==='request'||v==='manage'),'PREFLIGHT_OPERATOR_REQUIRED',403);const prior=await this.prior(tx,a,c.id);if(prior){ensure(prior.fingerprint===fp,'IDEMPOTENCY_CONFLICT');return {prior:prior.document};}ensure(n.version===c.expectedVersion,'PUBLICATION_VERSION_CONFLICT');ensure(n.source.files.length<=20&&n.source.files.reduce((v,f)=>v+f.bytes,0)<=128*1024*1024,'PREFLIGHT_INPUT_LIMIT',413);await this.publications.assertFileReadiness(tx,a,n,snapshot?'snapshot':'metadata');return {publication:n};});if(before.prior)return {report:before.prior,replayed:true};const n=before.publication!;const files:{file:Publication['source']['files'][number];inspection:ImageInspection;status:string;issues:PreflightIssue[]}[]=[];
   for(const file of n.source.files){let inspected:ImageInspection;if(file.bytes>32*1024*1024)inspected={status:'incomplete',code:'INSPECTOR_BYTE_LIMIT'};else{const r=await this.delivery.download(p,file.id);if(r.asset.sha256!==file.sha256||r.asset.bytes!==file.bytes||r.asset.revision!==file.revision){r.stream.destroy();ensure(false,'PUBLICATION_SOURCE_CHANGED');}const parts:Buffer[]=[];let size=0;for await(const part of r.stream){const b=Buffer.from(part);size+=b.length;ensure(size<=32*1024*1024,'PREFLIGHT_INPUT_LIMIT',413);parts.push(b);}const bytes=Buffer.concat(parts);ensure(bytes.length===file.bytes&&digestBytes(bytes)===file.sha256,'ASSET_CORRUPT');inspected=await this.inspect(bytes);}const issues=inspected.status==='checked'?imageIssues(inspected.measurement,c.spec):[{code:inspected.code,expected:'complete png/jpeg decode',actual:null}];files.push({file,inspection:inspected,status:inspected.status==='checked'?(issues.length?'fail':'pass'):inspected.status,issues});}
   const issues:PreflightIssue[]=[];if(files.length<c.spec.minFiles||files.length>c.spec.maxFiles)issues.push({code:'FILE_COUNT',expected:{min:c.spec.minFiles,max:c.spec.maxFiles},actual:files.length});const status=issues.length||files.some(f=>f.status==='fail')?'fail':files.some(f=>f.status==='incomplete')?'incomplete':'pass';
   // Detect corruption after decoding, including files too large to inspect.
   await this.delivery.verifyAcceptedFiles(p.enterpriseId,n.source.files);
   return await this.publications.fileScope(p,c.publicationId,async(tx,a,current)=>{await this.available(tx);ensure(a.permissions.some(v=>v==='request'||v==='manage'),'PREFLIGHT_OPERATOR_REQUIRED',403);await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`preflight:${a.enterpriseId}:${c.id}`]);const prior=await this.prior(tx,a,c.id);if(prior){ensure(prior.fingerprint===fp,'IDEMPOTENCY_CONFLICT');return {report:prior.document,replayed:true};}ensure(current.version===c.expectedVersion,'PUBLICATION_VERSION_CONFLICT');ensure(this.fingerprint(n)===this.fingerprint(current),'PUBLICATION_SOURCE_CHANGED');await this.publications.assertFileReadiness(tx,a,current,'metadata');const report={id:c.id,publicationId:c.publicationId,publicationVersion:c.expectedVersion,createdBy:a.subject,createdAt:new Date().toISOString(),sourceFingerprint:this.fingerprint(n),source:n.source,target:n.target,spec:c.spec,specHash:digest(c.spec),inspectorVersion:INSPECTOR_VERSION,verification:'technical_advisory_not_platform_or_company_approval',status,issues,files,summary:{passed:files.filter(f=>f.status==='pass').length,failed:files.filter(f=>f.status==='fail').length,incomplete:files.filter(f=>f.status==='incomplete').length}};await tx.query('INSERT INTO enterprise_workflow.publication_preflights(enterprise_id,id,publication_id,publication_version,subject,fingerprint,document)VALUES($1,$2,$3,$4,$5,$6,$7)',[a.enterpriseId,c.id,n.id,n.version,a.subject,fp,report]);await tx.query("INSERT INTO enterprise_workflow.publication_file_audit(id,enterprise_id,publication_id,subject,operation,detail)VALUES($1,$2,$3,$4,'preflight',$5)",[c.id,a.enterpriseId,n.id,a.subject,{reportId:c.id,specHash:report.specHash,sourceFingerprint:report.sourceFingerprint,status}]);return {report,replayed:false};});
  }finally{this.running--;}}
 async read(p:Principal,raw:unknown){const q=preflightQuery.parse(raw);
  if(q.action==='list')return this.publications.fileRead(p,q.publicationId,async(tx,a,n)=>{
   await this.available(tx);const args=[a.enterpriseId,n.id],rows=(await tx.query(`SELECT document->'id' AS id,document->'status' AS status,document->'publicationVersion' AS "publicationVersion",
    document#>'{spec,label}' AS label,document#>'{spec,versionLabel}' AS "versionLabel",document->'createdAt' AS "createdAt",document->'createdBy' AS "createdBy"
    FROM enterprise_workflow.publication_preflights WHERE enterprise_id=$1 AND publication_id=$2 ORDER BY created_at DESC,id DESC LIMIT 30 OFFSET $3`,[...args,(q.page-1)*30])).rows;
   return {items:rows,total:Number((await tx.query('SELECT count(*) n FROM enterprise_workflow.publication_preflights WHERE enterprise_id=$1 AND publication_id=$2',args)).rows[0].n),publicationVersion:n.version,canRun:a.permissions.some(v=>v==='request'||v==='manage'),page:q.page};
  });
  const {result}=await this.publications.fileRead(p,q.publicationId,async(tx,a,n,snapshot)=>{
   await this.available(tx);const r=await this.prior(tx,a,q.id);ensure(r?.document.publicationId===n.id,'PREFLIGHT_NOT_FOUND',404);
   return {files:n.source.files,result:{report:r.document,currentPublicationVersion:n.version,currentAvailability:await this.publications.fileAvailability(tx,a,n,snapshot),sourceMatches:r.document.sourceFingerprint===this.fingerprint(n),canRun:a.permissions.some(v=>v==='request'||v==='manage')}};
  },{verifyFiles:async({files,result})=>{
   if(result.currentAvailability.status!=='available')return;
   ensure(this.checkingFiles<2,'PREFLIGHT_BUSY',429);this.checkingFiles++;
   try{await this.delivery.verifyAcceptedFiles(p.enterpriseId,files);}
   catch(e){if(!(e instanceof WorkflowError))throw e;result.currentAvailability={status:'unavailable',checkedAt:result.currentAvailability.checkedAt,code:e.code};}
   finally{this.checkingFiles--;}
  },checkCurrent:async(tx,a,n,read)=>{
   const availability=await this.publications.fileAvailability(tx,a,n,true);if(availability.status==='unavailable')read.result.currentAvailability=availability;
  }});
  return result;
 }
}
import {createHash} from 'node:crypto';
const digestBytes=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
