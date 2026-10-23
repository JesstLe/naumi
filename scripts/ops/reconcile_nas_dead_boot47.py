"""Exact dead-boot reconciliation; preserve all paid intents and supplier facts.

Never clears a lease or refunds a bill. The only domain change is isolating
unknown submissions; confirmed stored results re-enter their original paid-done
continuation, whose supplier callback is not executed.
"""
import base64,copy,datetime as dt,json,pathlib,re,sys,time
from release47_host import HostTransaction,require,public_identity,environment,sha,file_sha
import release47_controls as controls

TARGET='47.105.59.142'
MACHINE='eb32806db06dfe9ec55f17a3be5c59476ca0a45fec8ce442e0437530212cb3df'
ROOT=pathlib.Path('/opt/naumi-staging/evidence/nas-upload-release47-20261022')

def timestamp(s):return dt.datetime.fromisoformat(s.replace('Z','+00:00'))

def plan(data,identity,started,now):
 activities=data['activities'];jobs={j['id']:j for j in data['jobs']}
 require(len(activities)==18 and len(jobs)==15,'EXACT_REVIEWED_SET_CHANGED')
 changes=[];stored=[];parents=[]
 require(all(re.fullmatch(r'(?:job|imagegen)-[0-9a-f-]{36}',k)for k in jobs),'UNSAFE_JOB_IDENTIFIER')
 for a in activities:
  require(a['instance_id']==identity['instanceId'] and a['boot_id']!=identity['bootId'] and
   a['activity_kind']=='accepted-work' and a['state']=='active' and
   timestamp(a['heartbeat_at'])<started,'CURRENT_OR_UNPROVEN_PROCESS_OWNER')
  if a['work_scope']!='durable-image':
   require(a['work_scope']in ['reference-sync','imagegen-batch'] and a['claim_token']is None,
    'UNKNOWN_NON_IMAGE_SCOPE');continue
  kind,identifier=a['work_key'].split(':',1);j=jobs[identifier];s=j['snapshot']
  require(j['kind']==kind and j['lease_token']==a['claim_token'] and j['lease_until'] and
   timestamp(j['lease_until'])<now and s['status']=='pending' and not j['billing_settled'],
   'JOB_CLAIM_OR_STATUS_CHANGED')
  if kind=='imagegen':
   require(not s.get('paidOperations') and len(s.get('children',{}))==1,'UNREVIEWED_PARENT')
   parents.append(j);continue
  paid=s.get('paidOperations',{});require(kind=='generate' and list(paid)==[identifier], 'EXACT_PAID_INTENT_REQUIRED')
  state=paid[identifier]['state']
  if state=='done':
   images=paid[identifier].get('result')
   require(isinstance(images,list) and len(images)==1 and images[0].get('id') and
    images[0].get('url','').startswith('data:image/'),'COMPLETE_STORED_BYTES_REQUIRED')
   header,encoded=images[0]['url'].split(',',1)
   require(';base64'in header and 0<len(base64.b64decode(encoded,validate=True))<=64*1024*1024,
    'INVALID_STORED_IMAGE')
   stored.append(j)
  else:
   require(state=='started' and not s.get('images') and 'releaseQuarantine'not in s,'UNREVIEWED_UNKNOWN_OUTCOME')
   changed=copy.deepcopy(s);changed.update(status='needs_attention',
    error='原执行进程已中断，任务保留待核对，不会重复生成或扣费',
    releaseQuarantine={'releaseId':'release47-nas-upload-20261022','reason':'confirmed-dead-owner',
     'paidOutcome':'unresolved','retryAllowed':False})
   require(changed['paidOperations']==s['paidOperations'],'PAID_INTENT_CHANGED')
   changes.append({'id':identifier,'before':j,'snapshot':changed})
 require(len(changes)==11 and len(stored)==3 and len(parents)==1,'EXACT_CLASSIFICATION_CHANGED')
 require(next(iter(parents[0]['snapshot']['children'].values()))['jobId']in {j['id']for j in stored},'PARENT_CHILD_CHANGED')
 return {'changes':changes,'stored':stored,'parents':parents,'activities':activities}

def main():
 data=json.loads((ROOT/'CURRENT_DEBT_FULL.private.json').read_bytes())
 previous=ROOT/'reconcile';resume=previous.exists()
 if resume:
  require((previous/'backup-readable.json').is_file()and not (previous/'CAS_REQUEST.private.sql').exists(),
   'PRIOR_MUTATION_MUST_BE_RECONCILED_NOT_REPEATED')
 with HostTransaction(TARGET,MACHINE,ROOT/('reconcile-r2'if resume else 'reconcile'))as tx:
  row=tx.inspect('naumi47-web-admin-query-20261021');web=public_identity(row);db=public_identity(tx.inspect('naumi-staging-db-1'))
  status=controls.app_status(tx,web);identity=status['identity']
  require(status['observations']['trackedAcceptedWork']==0 and status['observations']['agentRuns']==0,'CURRENT_WORK_ACTIVE')
  p=plan(data,identity,timestamp(row['State']['StartedAt']),dt.datetime.now(dt.timezone.utc))
  tx.save('RECONCILIATION_PLAN.private.json',p)
  if resume:
   old=json.loads((previous/'backup-readable.json').read_bytes());require(file_sha(old['path'])==old['sha256'],'BACKUP_CHANGED')
   tx.save('BACKUP_REUSED.json',{'backup':old,'priorFailureBeforeMutation':True})
  else:tx.backup_database(db)
  # Verify actual image decoding BEFORE permitting any original continuation.
  js="""import{createRequire}from'node:module';const require=createRequire(import.meta.url);let raw='';for await(const b of process.stdin)raw+=b;const rows=JSON.parse(raw);const sharp=require('sharp'),c=require('crypto');const out=[];for(const j of rows){const image=j.snapshot.paidOperations[j.id].result[0],b=Buffer.from(image.url.split(',')[1],'base64');const m=await sharp(b).metadata();await sharp(b).resize(1,1).raw().toBuffer();out.push({id:j.id,bytes:b.length,width:m.width,height:m.height,sha256:c.createHash('sha256').update(b).digest('hex')});}console.log(JSON.stringify(out));"""
  proof=json.loads(tx.run(['docker','exec','-i','-e','NODE_OPTIONS=',web['id'],'node','--input-type=module','-e',js],stdin=json.dumps(p['stored']).encode(),timeout=40))
  require(len(proof)==3 and all(v['width']>0 and v['height']>0 for v in proof),'DECODED_STORED_PROOF_REQUIRED')
  tx.save('STORED_IMAGE_DECODE.json',proof)
  env=environment(tx.inspect(db['id']))
  def sql(q):return tx.run(['docker','exec','-i',db['id'],'psql','-XqAt','-v','ON_ERROR_STOP=1','-U',env['POSTGRES_USER'],'-d',env['POSTGRES_DB']],stdin=q.encode(),timeout=50)
  # Back up the entire affected relation set before any CAS mutation.
  ids=','.join("'"+j['id']+"'"for j in p['changes']+p['stored']+p['parents'])
  original=sql("BEGIN READ ONLY;SELECT json_build_object('billing',(SELECT json_agg(to_jsonb(b))FROM app_billing_operations b WHERE id IN ("+ids+")),'reservations',(SELECT json_agg(to_jsonb(r))FROM app_gen_reservations r WHERE job_id IN ("+ids+")),'ledger',(SELECT json_agg(to_jsonb(l))FROM app_ledger l WHERE id IN (SELECT 'led-image-'||id FROM app_image_jobs WHERE id IN ("+ids+"))),'supplier',(SELECT json_agg(to_jsonb(c))FROM app_supplier_calls c WHERE operation_id IN ("+ids+")));COMMIT;")
  tx.save('ORIGINAL_BILLING_SUPPLIER.private.json',original)
  payload=json.dumps({'changes':p['changes'],'activities':p['activities']},ensure_ascii=False)
  require('$reconcile$'not in payload,'SQL_DELIMITER_COLLISION')
  statement="""BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='15s';
CREATE TEMP TABLE reconcile_input(v jsonb)ON COMMIT DROP;
INSERT INTO reconcile_input VALUES($reconcile$"""+payload+"""$reconcile$::jsonb);
DO $body$ DECLARE x jsonb;n int;BEGIN
FOR x IN SELECT value FROM reconcile_input,jsonb_array_elements(v->'changes')LOOP
 UPDATE app_image_jobs j SET snapshot=x->'snapshot',updated_at=now()
 WHERE j.id=x->>'id' AND to_jsonb(j)=x->'before' AND j.lease_until<now();
 GET DIAGNOSTICS n=ROW_COUNT;IF n<>1 THEN RAISE EXCEPTION 'JOB_CAS_CHANGED';END IF;
END LOOP;
FOR x IN SELECT value FROM reconcile_input,jsonb_array_elements(v->'activities')LOOP
 UPDATE app_release_activities a SET state='finished',finished_at=now(),outcome='owner-terminated:domain-preserved-nas47-reconciliation'
 WHERE a.id=(x->>'id')::uuid AND to_jsonb(a)=x;
 GET DIAGNOSTICS n=ROW_COUNT;IF n<>1 THEN RAISE EXCEPTION 'ACTIVITY_CAS_CHANGED';END IF;
END LOOP;END $body$;
SELECT json_build_object('isolated',11,'processObservationsClosed',18,'paidIntentReplayed',false,'billingChanged',false);
COMMIT;"""
  tx.pin(web);require(controls.app_status(tx,web)['identity']==identity,'BOOT_CHANGED')
  tx.save('CAS_REQUEST.private.sql',statement.encode());receipt=sql(statement);tx.save('CAS_RECEIPT.json',receipt)
  # The original paid-done branch returns the stored data URL before reaching
  # any supplier callback. Serial execution bounds memory during recovery.
  for j in p['stored']:
   spec=json.dumps({'workerJobId':j['id']})
   kick="const r=await fetch('http://127.0.0.1:3000/api/generate-image',{method:'POST',headers:{'content-type':'application/json','x-video-worker-secret':process.env.VIDEO_WORKER_SECRET},body:"+json.dumps(spec)+",signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('CONTINUATION_HTTP_'+r.status);console.log(JSON.stringify({status:r.status}));"
   tx.save('CONTINUATION_'+j['id']+'.json',tx.run(['docker','exec','-e','NODE_OPTIONS=',web['id'],'node','--input-type=module','-e',kick]))
   for _ in range(90):
    value=json.loads(sql("BEGIN READ ONLY;SELECT json_build_object('status',snapshot->>'status','billingSettled',billing_settled,'lease',lease_token IS NOT NULL) FROM app_image_jobs WHERE id='"+j['id']+"';COMMIT;"))
    if value['status']=='done'and value['billingSettled']and not value['lease']:break
    time.sleep(1)
   else:raise ValueError('ORIGINAL_RESULT_CONTINUATION_NOT_FINISHED')
   tx.save('COMPLETED_'+j['id']+'.json',value)
  after=json.loads(sql("BEGIN READ ONLY;SELECT json_build_object('jobs',(SELECT json_agg(to_jsonb(j))FROM app_image_jobs j WHERE id IN ("+ids+")),'billing',(SELECT json_agg(to_jsonb(b))FROM app_billing_operations b WHERE id IN ("+ids+")),'supplier',(SELECT json_agg(to_jsonb(c))FROM app_supplier_calls c WHERE operation_id IN ("+ids+")));COMMIT;"))
  tx.save('AFTER_BILLING_SUPPLIER.private.json',after)
  original=json.loads(original);before_billing={v['id']:v for v in original['billing']or[]};after_billing={v['id']:v for v in after['billing']or[]}
  after_jobs={v['id']:v for v in after['jobs']}
  for change in p['changes']:
   old=change['before'];new=after_jobs[old['id']]
   require(new['snapshot']==change['snapshot']and new['lease_token']==old['lease_token']and
    new['billing_settled']==old['billing_settled']and before_billing.get(old['id'])==after_billing.get(old['id']),
    'ISOLATED_ORIGINAL_INTENT_OR_BILL_CHANGED')
  require({v['id']for v in original['supplier']or[]}=={v['id']for v in after['supplier']or[]},'UNEXPECTED_SUPPLIER_CALL_CREATED')
  tx.save('PRESERVATION_RECEIPT.json',{'isolatedJobs':11,'storedResultsCompleted':3,
    'unknownPaidIntentsUnchanged':True,'unknownBillingUnchanged':True,'newSupplierCallRows':0})
  tx.save('FINAL_CURRENT_OBSERVATIONS.json',controls.app_status(tx,web))
  print('DEAD_BOOT_RECONCILIATION=PASS UNKNOWN_SUBMISSIONS_ISOLATED=11 STORED_RESULTS_CONTINUED=3')

if __name__=='__main__':main()
