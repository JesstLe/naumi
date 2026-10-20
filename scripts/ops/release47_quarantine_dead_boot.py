"""Explicitly authorized isolation of exact dead-boot jobs; no paid replay/settlement.

Finishing a *process observation* records owner termination, not task completion.
The original paid intent, result, lease token, reservations and supplier rows stay.
"""
import copy,json,re
from release47_host import require,environment

AUTHORIZATION='保留并隔离旧任务，继续切换'
NAS_CONTINUATION='你做个监控，迁移完之后，上线，我要最终结果，上线，明白吧，中间遇到的问题自己解决，不要询问我，我去睡觉了'

def quarantined_snapshot(snapshot,release_id):
    require(snapshot.get('status')=='pending' and not snapshot.get('images'), 'EXACT_PENDING_UNDELIVERED_REQUIRED')
    paid=snapshot.get('paidOperations',{})
    require(len(paid)==1 and all(p.get('state') in ['started','done'] for p in paid.values()),'EXACT_PAID_INTENT_REQUIRED')
    require('releaseQuarantine' not in snapshot,'QUARANTINE_ALREADY_EXISTS_RECONCILE')
    result=copy.deepcopy(snapshot)
    result.update(status='needs_attention',error='原任务已隔离待核对，原回执和积分冻结保留，不会重新生成或重复扣费',
                  releaseQuarantine={'releaseId':release_id,'reason':'confirmed-dead-owner','paidOutcome':'unresolved','retryAllowed':False})
    require(result['paidOperations']==paid,'PAID_INTENT_CHANGED')
    return result

def execute(tx,spec,current_app):
    legacy=spec.get('authorization')==AUTHORIZATION
    nas=spec.get('authorization')==NAS_CONTINUATION and spec.get('expectedJobs')==13 and spec.get('expectedActivities')==16
    require(legacy or nas,'EXPLICIT_ISOLATION_AUTHORIZATION_REQUIRED')
    require(re.fullmatch('release47-[a-z0-9-]{6,80}',spec['releaseId']),'FIXED_RELEASE_REQUIRED')
    row=tx.pin(spec['web']);boot=current_app['identity']['bootId']
    require(boot==spec['newBoot'] and boot!=spec['oldBoot'] and current_app['observations']['trackedAcceptedWork']==0,'DEAD_BOOT_IDENTITY_UNPROVEN')
    require(row['State']['StartedAt']==spec['web']['startedAt'],'WEB_RESTARTED_DURING_REVIEW')
    env=environment(tx.inspect('naumi-staging-db-1'))
    def sql(q):
        return tx.run(['docker','exec','-i','naumi-staging-db-1','psql','-XqAt','-v','ON_ERROR_STOP=1','-U',env['POSTGRES_USER'],'-d',env['POSTGRES_DB']],stdin=q.encode(),timeout=60)
    query="""SELECT json_build_object('jobs',COALESCE((SELECT json_agg(to_jsonb(j) ORDER BY j.id) FROM app_image_jobs j JOIN app_release_activities a ON j.id=regexp_replace(a.work_key,'^generate:','') WHERE a.instance_id='%s' AND a.boot_id='%s' AND a.state<>'finished' AND a.work_scope='durable-image'),'[]'), 'activities',COALESCE((SELECT json_agg(to_jsonb(a) ORDER BY a.id) FROM app_release_activities a WHERE a.instance_id='%s' AND a.boot_id='%s' AND a.state<>'finished'),'[]'), 'billing',COALESCE((SELECT json_agg(to_jsonb(b) ORDER BY b.id) FROM app_billing_operations b WHERE b.id IN (SELECT regexp_replace(a.work_key,'^generate:','') FROM app_release_activities a WHERE a.instance_id='%s' AND a.boot_id='%s' AND a.state<>'finished' AND a.work_scope='durable-image')),'[]'));""" % tuple([spec['web']['name'],spec['oldBoot']]*3)
    before=json.loads(sql("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;SET LOCAL statement_timeout='5s';"+query+'COMMIT;'))
    require(len(before['jobs'])==spec['expectedJobs']==(13 if nas else 43) and len(before['activities'])==spec['expectedActivities']==(16 if nas else 48),'EXACT_QUARANTINE_COUNT_CHANGED')
    scopes={'durable-image','media-variant','reference-sync'} if nas else {'durable-image','media-variant'}
    require({a['boot_id'] for a in before['activities']}=={spec['oldBoot']} and all(a['activity_kind']=='accepted-work' and a['work_scope'] in scopes for a in before['activities']),'UNREVIEWED_ACTIVITY_SCOPE')
    if nas:
        require(sorted(j['id'] for j in before['jobs'])==sorted(spec.get('reviewedJobIds',[])) and
                len(set(spec['reviewedJobIds']))==13,'EXACT_REVIEWED_13_JOB_IDS_REQUIRED')
    changes=[]
    for j in before['jobs']:
        a=next(a for a in before['activities'] if a['work_key']=='generate:'+j['id'])
        require(j['kind']=='generate' and j['lease_token']==a['claim_token'] and not j['billing_settled'],'EXACT_UNSETTLED_CLAIM_REQUIRED')
        if nas:require(j['id'] in spec['reviewedJobHashes'] and spec['reviewedJobHashes'][j['id']]==__import__('hashlib').sha256(json.dumps(j,sort_keys=True,separators=(',',':')).encode()).hexdigest(),'REVIEWED_JOB_ROW_CHANGED')
        changes.append({'id':j['id'],'before':j,'snapshot':quarantined_snapshot(j['snapshot'],spec['releaseId'])})
    tx.save('quarantine-original.private.json',before)
    payload=json.dumps({'changes':changes,'activities':before['activities'],'billing':before['billing']},ensure_ascii=False).replace('$isolation$','')
    # The exact JSONB full-row CAS serializes against claims, heartbeat and settlement.
    statement="""BEGIN; SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='15s';
CREATE TEMP TABLE release_quarantine_input(v jsonb) ON COMMIT DROP;
INSERT INTO release_quarantine_input VALUES($isolation$%s$isolation$::jsonb);
DO $body$ DECLARE item jsonb; n int; BEGIN
FOR item IN SELECT value FROM release_quarantine_input,jsonb_array_elements(v->'changes') LOOP
 UPDATE app_image_jobs j SET snapshot=item->'snapshot',updated_at=now()
 WHERE j.id=item->>'id' AND to_jsonb(j)=item->'before' AND j.lease_until<now();
 GET DIAGNOSTICS n=ROW_COUNT;IF n<>1 THEN RAISE EXCEPTION 'JOB_CAS_OR_LIVE_LEASE_CHANGED';END IF;
END LOOP;
FOR item IN SELECT value FROM release_quarantine_input,jsonb_array_elements(v->'activities') LOOP
 UPDATE app_release_activities a SET state='finished',finished_at=now(),outcome='owner-terminated:quarantined-domain-unresolved'
 WHERE a.id=(item->>'id')::uuid AND to_jsonb(a)=item;
 GET DIAGNOSTICS n=ROW_COUNT;IF n<>1 THEN RAISE EXCEPTION 'ACTIVITY_CAS_CHANGED';END IF;
END LOOP;
FOR item IN SELECT value FROM release_quarantine_input,jsonb_array_elements(v->'billing') LOOP
 IF NOT EXISTS(SELECT 1 FROM app_billing_operations b WHERE b.id=item->>'id' AND to_jsonb(b)=item) THEN RAISE EXCEPTION 'BILLING_CHANGED';END IF;
END LOOP;
END $body$;
COMMIT;SELECT json_build_object('jobs',%d,'processObservations',%d,'paidReplays',0,'billingMutations',0,'taskResult','needs_attention','processOutcome','owner-terminated:quarantined-domain-unresolved');
""" % (payload,spec['expectedJobs'],spec['expectedActivities'])
    # Persist the exact one-shot request before sending. UNKNOWN uses this evidence;
    # never issue a fresh operation or restore pending statuses automatically.
    tx.save('quarantine-REQUEST.private.sql',statement.encode())
    receipt=json.loads(sql(statement));tx.save('quarantine-RECEIPT.json',receipt)
    return receipt
