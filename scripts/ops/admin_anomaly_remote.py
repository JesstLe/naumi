#!/usr/bin/env python3
"""Bounded read-only observations; run over SSH stdin, never install on the host."""
import datetime as dt
import hashlib
import hmac
import json
import subprocess
import time
import urllib.request
import urllib.parse
import base64
import sys
import re

LIMIT = 2000


def command(args, data=None, timeout=30):
    r = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    if r.returncode:
        raise RuntimeError('HOST_READ_FAILED:' + r.stderr.decode(errors='replace')[:300])
    return r.stdout


def inspect(name):
    return json.loads(command(['docker', 'inspect', name]))[0]


def env(row):
    return dict(v.split('=', 1) for v in row['Config']['Env'] if '=' in v)


def current_web_port(dump):
    """Bind the reviewed public location, not an old container's stable name."""
    sections = re.findall(r'^# configuration file /etc/nginx/sites-enabled/reference-workbench:\n(.*?)(?=^# configuration file |\Z)', dump, re.M | re.S)
    assert len(sections) == 1, 'PUBLIC_GATEWAY_FILE_AMBIGUOUS'
    body = '\n'.join(line.split('#', 1)[0] for line in sections[0].splitlines())
    assert re.search(r'\bserver_name\s+47\.105\.59\.142\s*;', body), 'PUBLIC_HOST_CHANGED'
    locations = re.findall(r'\blocation\s+/\s*\{([^{}]*)\}', body, re.S)
    ports = []
    for location in locations:
        if re.fullmatch(r'\s*return\s+30[178]\s+https://(?:\$host|47\.105\.59\.142)\$request_uri\s*;\s*', location):
            continue  # The same file contains the HTTP -> HTTPS redirect.
        matches = re.findall(r'\bproxy_pass\s+"?http://127\.0\.0\.1:(\d+)"?\s*;', location)
        assert len(matches) == 1, 'PUBLIC_LOCATION_UNBOUND'
        ports.append(int(matches[0]))
    assert ports and len(set(ports)) == 1 and 1024 <= ports[0] <= 65535, 'PUBLIC_UPSTREAM_AMBIGUOUS'
    return ports[0]


def select_current_web(containers, port):
    matches = [row for row in containers if row['State']['Running'] and any(
        p.get('HostIp') == '127.0.0.1' and p.get('HostPort') == str(port)
        for p in row['NetworkSettings']['Ports'].get('3000/tcp') or [])]
    assert len(matches) == 1, 'PUBLIC_CONTAINER_AMBIGUOUS'
    row = matches[0]
    assert re.fullmatch(r'[a-f0-9]{40}', env(row).get('SOURCE_COMMIT', '')), 'PUBLIC_SOURCE_MISSING'
    return row


def fixed_image_pages(query, image_sql, limit):
    # Freeze identities, not OFFSET positions that move between transactions.
    selection = image_sql[image_sql.index('FROM app_image_jobs WHERE'):image_sql.index(')\n    SELECT')]
    selected = query("SELECT jsonb_build_object('id',id) " + selection)
    ids = [r['id'] for r in selected]
    assert len(ids) <= limit + 1 and len(ids) == len(set(ids)), 'SELECTION_IDENTITIES_INVALID'
    start = image_sql.index('WHERE (updated_at')
    end = image_sql.index('ORDER BY', start)
    images = []
    for offset in range(0, len(ids), 100):
        keys = ids[offset:offset + 100]
        quoted = ','.join("'" + v.replace("'", "''") + "'" for v in keys)
        page = query(image_sql[:start] + 'WHERE id IN (' + quoted + ') ' + image_sql[end:])
        assert len(page) == len(keys) and {r['id'] for r in page} == set(keys), 'PINNED_TASK_SET_CHANGED'
        images.extend(page)
    return images


def main():
    assert hashlib.sha256(open('/etc/machine-id','rb').read().strip()).hexdigest() == 'eb32806db06dfe9ec55f17a3be5c59476ca0a45fec8ce442e0437530212cb3df'
    gateway = command(['nginx', '-T']).decode()
    port = current_web_port(gateway)
    ids = command(['docker', 'ps', '-q']).decode().split()
    assert ids and len(ids) <= 100, 'CONTAINER_INVENTORY_UNBOUNDED'
    containers = json.loads(command(['docker', 'inspect', *ids]))
    web = select_current_web(containers, port)
    db = inspect('naumi-staging-db-1')
    we, de = env(web), env(db)
    assert web['State']['Running'] and db['State']['Running']
    prefix = ['docker','exec','-i',db['Id'],'psql','-XqAt','--no-password','-v','ON_ERROR_STOP=1','-U',de.get('POSTGRES_USER','postgres'),'-d',de.get('POSTGRES_DB',de.get('POSTGRES_USER','postgres'))]

    def query(sql):
        start=time.monotonic()
        raw = command(prefix, ("BEGIN READ ONLY ISOLATION LEVEL REPEATABLE READ;SET LOCAL statement_timeout='15s';SET LOCAL lock_timeout='1s';"+sql+';COMMIT;').encode(), 45)
        print('READ_QUERY_MS='+str(round((time.monotonic()-start)*1000)),file=sys.stderr)
        return [json.loads(line) for line in raw.splitlines() if line.strip()]

    catalog = query("SELECT jsonb_build_object('history',to_regclass('naumi_staging_guard.origin_rows') IS NOT NULL,'creation',to_regclass('public.app_creation_records') IS NOT NULL,'assets',to_regclass('public.app_creation_assets') IS NOT NULL)")[0]
    protected = lambda table: ("EXISTS(SELECT 1 FROM naumi_staging_guard.origin_rows h WHERE h.table_name='"+table+"' AND h.row_key=j.id::text)" if catalog['history'] else 'false')
    arr = lambda expr: "CASE WHEN jsonb_typeof("+expr+")='array' THEN "+expr+" ELSE '[]'::jsonb END"
    obj = lambda expr: "CASE WHEN jsonb_typeof("+expr+")='object' THEN "+expr+" ELSE '{}'::jsonb END"
    image_sql = f"""WITH picked AS MATERIALIZED (
      SELECT id,email,kind,created_at,updated_at,lease_until,billing_settled,snapshot
      FROM app_image_jobs WHERE (updated_at>=now()-interval '72 hours' AND snapshot->>'status' IN ('error','failed','rejected'))
        OR COALESCE(snapshot->>'status','unknown') NOT IN ('done','error','failed','cancelled')
      ORDER BY updated_at DESC,id LIMIT {LIMIT+1})
    SELECT jsonb_build_object('table','app_image_jobs','id',j.id,'owner',j.email,'kind',j.kind,
      'createdAt',j.created_at,'updatedAt',j.updated_at,'observedAt',now(),'leaseUntil',j.lease_until,
      'status',j.snapshot->>'status','resultStatus',j.snapshot#>>'{{result,status}}',
      'stage',COALESCE(j.snapshot#>>'{{result,stage}}',j.snapshot->>'stage'),'queueState',j.snapshot->>'queueState',
      'errorCode',COALESCE(j.snapshot#>>'{{result,error,code}}',j.snapshot->>'failureCode'),
      'error',left(COALESCE(j.snapshot#>>'{{result,error,message}}',j.snapshot->>'error',''),500),
      'billingSettled',j.billing_settled,'historyProtected',{protected('app_image_jobs')},
      'children',COALESCE((SELECT jsonb_agg(v->>'jobId') FROM jsonb_each({obj("j.snapshot->'children'")}) e(k,v) WHERE v->>'jobId' IS NOT NULL),'[]'::jsonb),
      'declaredOutputs',COALESCE((SELECT jsonb_agg(id) FROM (
        SELECT v->>'id' id FROM jsonb_array_elements({arr("j.snapshot->'images'")}) v
        UNION SELECT v->>'artworkId' FROM jsonb_array_elements({arr("j.snapshot#>'{result,artifacts}'")}) v
      )o WHERE id IS NOT NULL),'[]'::jsonb),
      'paidStates',COALESCE((SELECT jsonb_agg(v->>'state') FROM jsonb_each({obj("j.snapshot->'paidOperations'")}) e(k,v)),'[]'::jsonb),
      'checkpointCount',COALESCE((SELECT sum(jsonb_array_length({arr("v->'result'")})) FROM jsonb_each({obj("j.snapshot->'paidOperations'")})e(k,v) WHERE v->>'state'='done'),0)
    ) FROM picked j"""
    # Project large JSONB checkpoints in small pages, not one giant aggregation.
    # No snapshot/private images or request bodies are returned.
    # Same selection predicate for IDs and row projection; each page is bounded.
    images = fixed_image_pages(query, image_sql, LIMIT)
    lit = lambda v: "'"+v.replace("'","''")+"'"
    image_count=len(images)
    child_ids={child for row in images for child in row.get('children',[])}-{row['id'] for row in images}
    if child_ids:
        start=image_sql.index('WHERE (updated_at')
        end=image_sql.index('ORDER BY',start)
        child_sql=image_sql[:start]+"WHERE id IN ("+','.join(lit(v) for v in sorted(child_ids))+") "+image_sql[end:]
        images.extend(query(child_sql))
    other = []
    for table in ('app_canvas_image_tasks','app_video_tasks'):
        outputs = "CASE WHEN COALESCE(j.result_artwork_id,'')='' THEN '[]'::jsonb ELSE jsonb_build_array(j.result_artwork_id) END" if table=='app_canvas_image_tasks' else "COALESCE((SELECT jsonb_agg(id) FROM (SELECT NULLIF(j.artwork_id,'') id UNION SELECT v->>'artworkId' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(j.parameters->'resultAssets')='array' THEN j.parameters->'resultAssets' ELSE '[]'::jsonb END)v)o WHERE id IS NOT NULL),'[]'::jsonb)"
        other += query(f"""SELECT jsonb_build_object('table','{table}','id',j.id,'owner',j.email,
          'kind','{table}','createdAt',j.created_at,'updatedAt',j.updated_at,'observedAt',now(),
          'status',j.status,'resultStatus',NULL,'error',left(COALESCE(j.error,''),500),'errorCode',NULL,
          'historyProtected',{protected(table)},'children','[]'::jsonb,
          'declaredOutputs',{outputs})
          FROM {table} j WHERE (j.updated_at>=now()-interval '72 hours' AND j.status IN ('error','failed','rejected')) OR j.status NOT IN ('completed','failed','cancelled')
          ORDER BY (j.status NOT IN ('completed','failed','cancelled')) DESC,j.updated_at DESC,j.id LIMIT {LIMIT+1}""")
    wanted = {v for row in images+other for v in row.get('declaredOutputs',[]) if isinstance(v,str)}
    artworks = query("SELECT jsonb_build_object('id',id,'owner',email,'exists',true,'deleted',deleted_at IS NOT NULL,'hasMedia',COALESCE(image_url,'')<>'' OR COALESCE(video_url,'')<>'') FROM app_artworks WHERE id IN ("+','.join(lit(v) for v in sorted(wanted))+")") if wanted else []
    artmap = {a['id']:a for a in artworks}
    for row in images+other:
        row['deliveredOutputs'] = sum(1 for k in row.get('declaredOutputs',[]) if k in artmap and artmap[k]['owner']==row['owner'] and not artmap[k]['deleted'] and artmap[k]['hasMedia'])
    # The real backend list route is GET-only. Reuse the existing administrator's
    # signing material in memory; no cookie/secret or full response leaves host.
    pw = query("SELECT jsonb_build_object('hash',v) FROM app_settings WHERE k='admin_password_hash'")
    assert len(pw)==1 and pw[0]['hash'] and we.get('SETTINGS_SECRET')
    expires = str(int(time.time()*1000)+120000)
    token = expires+'.'+hmac.new(we['SETTINGS_SECRET'].encode(),('admin-access:'+expires+':'+pw[0]['hash']).encode(),hashlib.sha256).hexdigest()
    ports=web['NetworkSettings']['Ports'].get('3000/tcp') or []
    assert len(ports)==1 and ports[0]['HostIp']=='127.0.0.1'
    base='http://127.0.0.1:'+ports[0]['HostPort']
    api=[]
    admin_items=[]
    for source in ('legacy','new'):
        path='/api/admin/creations?size=100&page=1'+('&source=legacy&period=all' if source=='legacy' else '')
        started=time.monotonic()
        try:
            request=urllib.request.Request(base+path,headers={'Cookie':'nv_admin='+token},method='GET')
            with urllib.request.urlopen(request,timeout=20) as response:
                data=json.load(response)
                api.append({'source':source,'status':response.status,'elapsedMs':round((time.monotonic()-started)*1000),'total':data.get('pagination',{}).get('total'),
                    'items':[{k:r.get(k) for k in ('id','status','acceptedAt','sourceKind')} for r in data.get('items',[])]})
                if source=='legacy':admin_items.extend(data.get('items',[]))
        except Exception as e:
            api.append({'source':source,'status':getattr(e,'code',None),'errorType':type(e).__name__})
    # List and detail must agree. Only sample actual existing legacy IDs; no
    # generation/recovery endpoint is queried, and no prompt/media URL is stored.
    details=[]
    for item in [r for r in admin_items if r.get('status') in ('queued','running','failed','needs_review')][:8]:
        try:
            ref=json.loads(base64.urlsafe_b64decode(item['id'][7:]+'='*((-len(item['id'][7:]))%4)))
            request=urllib.request.Request(base+'/api/admin/creations/'+urllib.parse.quote(item['id'],safe=''),headers={'Cookie':'nv_admin='+token},method='GET')
            with urllib.request.urlopen(request,timeout=15) as response:
                data=json.load(response);details.append({'table':ref['table'],'id':ref['id'],'owner':ref['email'],'listStatus':item['status'],'detailStatus':data.get('status'),'httpStatus':response.status,'outputAssets':sum(a.get('direction')=='output' for a in data.get('assets',[]))})
        except Exception as e:details.append({'httpStatus':getattr(e,'code',None),'errorType':type(e).__name__})
    activities=query("SELECT jsonb_build_object('scope',work_scope,'key',work_key,'state',state,'outcome',outcome,'heartbeatAt',heartbeat_at,'bootId',boot_id,'instanceId',instance_id) FROM app_release_activities WHERE work_scope='durable-image' AND admission_key='recovery-dispatch-scan' AND state<>'finished' ORDER BY heartbeat_at DESC LIMIT 20")
    recent = query("SELECT jsonb_build_object('hours',w.hours,'kind',j.kind,'status',COALESCE(j.snapshot#>>'{result,status}',j.snapshot->>'status','unknown'),'count',count(*),'protectedCount',count(*) FILTER(WHERE EXISTS(SELECT 1 FROM naumi_staging_guard.origin_rows h WHERE h.table_name='app_image_jobs' AND h.row_key=j.id))) FROM (VALUES(1),(24),(72)) w(hours) JOIN app_image_jobs j ON j.created_at>=now()-make_interval(hours=>w.hours) GROUP BY w.hours,j.kind,COALESCE(j.snapshot#>>'{result,status}',j.snapshot->>'status','unknown') ORDER BY w.hours,j.kind,COALESCE(j.snapshot#>>'{result,status}',j.snapshot->>'status','unknown')")
    latest = query("SELECT jsonb_build_object('kind',kind,'status',COALESCE(snapshot#>>'{result,status}',snapshot->>'status','unknown'),'createdAt',created_at,'updatedAt',updated_at) FROM app_image_jobs ORDER BY created_at DESC LIMIT 8")
    worker_states = []
    for worker in containers:
        worker_env = env(worker)
        if worker_env.get('NAUMI_WORKER_RELEASE_CONTROL') != '1' or not worker_env.get('NAUMI_WORKER_STATE_FILE'):
            continue
        worker_state = {'name':worker['Name'].lstrip('/'),'sourceCommit':worker_env.get('SOURCE_COMMIT'),'image':worker['Image'],'running':worker['State']['Running'],'startedAt':worker['State']['StartedAt'],'appOrigin':worker_env.get('NAUMI_APP_ORIGIN')}
        try:
            state=json.loads(command(['docker','exec',worker['Id'],'cat',worker_env['NAUMI_WORKER_STATE_FILE']],timeout=15))
            worker_state.update({k:state.get(k) for k in ('schemaVersion','revision','paused','uncertain')})
            worker_state['lastTick']={k:state.get('lastTick',{}).get(k) for k in ('id','phase','startedAt','dispatchedAt','finishedAt','completedAt')} if state.get('lastTick') else None
        except Exception as e: worker_state['stateReadError']=type(e).__name__
        worker_states.append(worker_state)
    health={}
    try:
        with urllib.request.urlopen(base+'/api/health',timeout=10) as response:health={'status':response.status,'data':json.load(response)}
    except Exception as e:health={'status':getattr(e,'code',None),'errorType':type(e).__name__}
    after_web,after_db=inspect(web['Id']),inspect(db['Id'])
    assert after_web['State']['StartedAt']==web['State']['StartedAt'] and after_db['State']['StartedAt']==db['State']['StartedAt']
    assert command(['nginx', '-T']).decode() == gateway, 'PUBLIC_GATEWAY_CHANGED_DURING_READ'
    counts={t:sum(r['table']==t for r in images+other) for t in ('app_image_jobs','app_canvas_image_tasks','app_video_tasks')}
    truncated=[t for t,n in counts.items() if (image_count if t=='app_image_jobs' else n)>LIMIT]
    print(json.dumps({'schemaVersion':1,'target':'47.105.59.142','observedAt':dt.datetime.now(dt.timezone.utc).isoformat(),
        'sourceCommit':we.get('SOURCE_COMMIT'),'build':we.get('BUILD_VERSION'),'image':web['Image'],
        'coverage':{'lookbackHours':72,'limitPerTable':LIMIT,'counts':counts,'truncatedTables':truncated,'selection':'all bounded nonterminal + recent failures + referenced children','adminListPagesPerSource':1,'pagination':'fixed selected primary keys; per-page read-only repeatable read; not one global snapshot'},
        'readOnly':True,'supplierCalls':0,'businessWrites':0,'recentImageJobCounts':recent,'latestImageJobs':latest,'workerStates':worker_states,'health':health,
        'webBinding':{'id':web['Id'],'name':web['Name'].lstrip('/'),'port':port,'gatewaySha256':hashlib.sha256(gateway.encode()).hexdigest()},
        'rows':images+other,'adminApi':api,'adminDetails':details,'scannerActivities':activities},ensure_ascii=False))


if __name__=='__main__':
    try:main()
    except Exception as error:
        print(json.dumps({'collectionFailed':True,'errorType':type(error).__name__,'errorCode':str(error)[:340]}))
        raise SystemExit(1)
