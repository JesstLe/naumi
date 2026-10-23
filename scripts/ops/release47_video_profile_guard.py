"""Read-only rollback barrier for the six verified video-family wire profiles.

The active model configuration is deliberately not consulted: accepted tasks and
encrypted workflow stages retain their original model version after a config
rollback. No task, incident, credential, or billing record is changed here.
"""
import datetime as dt
import json

from release47_host import environment, require


PROFILES = (
    'apimart-apib-seedance', 'apimart-apib-kling', 'apimart-apib-wan',
    'apimart-apib-h3', 'geek-kling', 'geek-wan3',
)
TABLES = {
    'tasks': 'app_video_tasks', 'versions': 'app_model_config_versions',
    'defaults': 'app_video_model_defaults', 'runs': 'app_video_workflow_runs',
    'nodes': 'app_video_workflow_run_nodes',
}


def schema_sql():
    fields = ','.join("'%s',to_regclass('public.%s') IS NOT NULL" % item
                      for item in TABLES.items())
    return "BEGIN READ ONLY;SET LOCAL statement_timeout='5s';SELECT json_build_object(" + fields + ');COMMIT;'


def build_readonly_sql(tables):
    require(set(tables) == set(TABLES) and all(type(v) is bool for v in tables.values()),
            'VIDEO_PROFILE_SCHEMA_OBSERVATION_INVALID')
    require(tables['tasks'] and tables['versions'] and tables['runs'] == tables['nodes'],
            'VIDEO_PROFILE_SCHEMA_INCOMPLETE')
    profiles = ','.join("'%s'" % p for p in PROFILES)
    defaults = """
      UNION ALL SELECT 'frozen',d.model_version,d.upstream_id,d.value->>'profile',
        c.u->>'model',c.config,d.model_digest=c.digest
      FROM app_video_model_defaults d LEFT JOIN cfg c
        ON c.version=d.model_version AND c.u->>'id'=d.upstream_id
      WHERE d.value->>'profile' IN (%s)
    """ % profiles if tables['defaults'] else ''
    workflows = """
      SELECT jsonb_build_object('id',n.run_id::text||':'||n.node_id,'status',n.status,
        'profiles','[]'::jsonb,'versions',jsonb_build_array(r.public_frozen_nodes->n.node_id->'modelVersion'),
        'publicModelIds',jsonb_build_array(p.node#>'{request,modelId}'),
        'upstreamIds','[]'::jsonb,'wireModelIds','[]'::jsonb,
        'planMatches',p.matches) AS row
      FROM app_video_workflow_run_nodes n JOIN app_video_workflow_runs r ON r.id=n.run_id
      LEFT JOIN LATERAL (SELECT count(*) AS matches,(jsonb_agg(x.node)->0) AS node
        FROM jsonb_array_elements(r.plan->'nodes') x(node) WHERE x.node->>'id'=n.node_id) p ON true
      WHERE COALESCE(n.status,'') NOT IN ('completed','failed','blocked','cancelled')
    """ if tables['runs'] else "SELECT NULL::jsonb AS row WHERE false"
    return """BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='5s';
WITH cfg AS (
  SELECT v.version,v.digest,v.config,u.u,p.p,
    COALESCE(u.u#>>'{parameterMap,videoProfile}',p.p#>>'{options,videoProfile}') AS profile
  FROM app_model_config_versions v
  CROSS JOIN LATERAL jsonb_array_elements(v.config->'upstreamModels') u(u)
  LEFT JOIN LATERAL (SELECT x.p FROM jsonb_array_elements(v.config->'providers') x(p)
    WHERE x.p->>'id'=u.u->>'providerId') p ON true
), raw_bindings(source,version,upstream_id,profile,wire_model,config,digest_matches) AS (
  SELECT 'config',version,u->>'id',profile,u->>'model',config,true FROM cfg
    WHERE profile IN (%s)
  %s
), bindings AS (
  SELECT jsonb_build_object('source',b.source,'modelVersion',b.version,'upstreamId',b.upstream_id,
    'profile',b.profile,'wireModelId',b.wire_model,'digestMatches',b.digest_matches,
    'knownUpstreamIds',COALESCE((SELECT jsonb_agg(u.u->'id') FROM jsonb_array_elements(
      COALESCE(b.config->'upstreamModels','[]'::jsonb)) u(u) WHERE u.u->>'modality'='video'),'[]'::jsonb),
    'knownWireModelIds',COALESCE((SELECT jsonb_agg(u.u->'model') FROM jsonb_array_elements(
      COALESCE(b.config->'upstreamModels','[]'::jsonb)) u(u) WHERE u.u->>'modality'='video'),'[]'::jsonb),
    'knownPublicModelIds',COALESCE((SELECT jsonb_agg(m.m->'id') FROM jsonb_array_elements(
      COALESCE(b.config->'publicModels','[]'::jsonb)) m(m) WHERE m.m->>'modality'='video'),'[]'::jsonb),
    'publicModelIds',COALESCE((SELECT jsonb_agg(m.m->'id')
      FROM jsonb_array_elements(COALESCE(b.config->'publicModels','[]'::jsonb)) m(m)
      WHERE m.m->>'modality'='video' AND
        ((m.m#>>'{target,type}'='upstream' AND m.m#>>'{target,id}'=b.upstream_id)
          OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(m.m#>'{supplierRouting,channels}','[]'::jsonb)) ch(c)
            WHERE ch.c->>'upstreamId'=b.upstream_id))),'[]'::jsonb)) AS row
  FROM raw_bindings b
), tasks AS (
  SELECT jsonb_build_object('id',v.id,'status',v.status,
    'profiles',jsonb_build_array(v.provider_snapshot->'videoProfile',
      v.parameters#>'{providerSnapshot,videoProfile}',v.parameters#>'{modelExecutions,video,video,profile}'),
    'versions',jsonb_build_array(v.parameters#>'{modelExecutions,modelVersion}',
      v.parameters#>'{modelExecutions,video,modelVersion}'),
    'publicModelIds',jsonb_build_array(v.parameters->'publicModelId',
      v.parameters#>'{modelExecutions,video,publicModelId}'),
    'upstreamIds',jsonb_build_array(CASE WHEN v.parameters#>>'{modelExecutions,video,target,type}'='upstream'
      THEN v.parameters#>'{modelExecutions,video,target,id}' END),
    'wireModelIds',jsonb_build_array(v.model)) AS row
  FROM app_video_tasks v WHERE COALESCE(v.status,'') NOT IN ('completed','failed','cancelled')
), workflows AS (%s)
SELECT jsonb_build_object('schemaVersion',1,'complete',true,
  'observedAt',clock_timestamp(),'readOnly',current_setting('transaction_read_only'),
  'bindings',COALESCE((SELECT jsonb_agg(row) FROM bindings),'[]'::jsonb),
  'taskCount',(SELECT count(*) FROM tasks),'taskRows',COALESCE((SELECT jsonb_agg(row) FROM tasks),'[]'::jsonb),
  'workflowCount',(SELECT count(*) FROM workflows),'workflowRows',COALESCE((SELECT jsonb_agg(row) FROM workflows),'[]'::jsonb));
COMMIT;""" % (profiles, defaults, workflows)


def _strings(values):
    require(isinstance(values, list) and all(v is None or isinstance(v, str) for v in values),
            'VIDEO_PROFILE_MARKER_TYPE_UNKNOWN')
    return {v for v in values if v}


def _versions(values):
    require(isinstance(values, list) and all(v is None or type(v) is int and v > 0 for v in values),
            'VIDEO_PROFILE_VERSION_TYPE_UNKNOWN')
    return {v for v in values if v is not None}


def evaluate(snapshot, additional_scope=None, *, now=None):
    """Pure assessment. Unknown/incomplete relevant observations never mean zero."""
    require(isinstance(snapshot, dict) and snapshot.get('schemaVersion') == 1 and
            snapshot.get('complete') is True and snapshot.get('readOnly') == 'on',
            'VIDEO_PROFILE_SCAN_INCOMPLETE')
    try:
        observed = dt.datetime.fromisoformat(snapshot['observedAt'].replace('Z', '+00:00'))
        age = ((now or dt.datetime.now(dt.timezone.utc)) - observed).total_seconds()
        require(0 <= age <= 30, 'VIDEO_PROFILE_SCAN_STALE')
    except (KeyError, TypeError, ValueError):
        require(False, 'VIDEO_PROFILE_SCAN_TIME_UNKNOWN')
    bindings = snapshot.get('bindings')
    require(isinstance(bindings, list), 'VIDEO_PROFILE_BINDINGS_UNKNOWN')
    scopes = []
    for binding in bindings:
        require(isinstance(binding, dict) and binding.get('profile') in PROFILES and
                binding.get('digestMatches') is True and
                isinstance(binding.get('upstreamId'), str) and bool(binding['upstreamId']) and
                isinstance(binding.get('wireModelId'), str) and bool(binding['wireModelId']),
                'VIDEO_PROFILE_FROZEN_BINDING_UNKNOWN')
        scopes.append({'versions': _versions([binding.get('modelVersion')]),
                       'publicModelIds': _strings(binding.get('publicModelIds')),
                       'upstreamIds': {binding['upstreamId']}, 'wireModelIds': {binding['wireModelId']},
                       **{key: _strings(binding.get(key)) for key in
                          ['knownPublicModelIds', 'knownUpstreamIds', 'knownWireModelIds']}})
        require(scopes[-1]['versions'], 'VIDEO_PROFILE_FROZEN_VERSION_UNKNOWN')
    if additional_scope:
        require(isinstance(additional_scope, dict), 'VIDEO_PROFILE_CONFIG_SCOPE_UNKNOWN')
        extra = {'versions': _versions(additional_scope.get('modelVersions')),
                 **{key: _strings(additional_scope.get(key)) for key in
                    ['publicModelIds', 'upstreamIds', 'wireModelIds']},
                 **{'known' + key[0].upper() + key[1:]: _strings(additional_scope.get(key)) for key in
                    ['publicModelIds', 'upstreamIds', 'wireModelIds']}}
        for scope in scopes:
            if scope['versions'].intersection(extra['versions']):
                for key in ['knownPublicModelIds', 'knownUpstreamIds', 'knownWireModelIds']:
                    extra[key].update(scope[key])
        scopes.append(extra)
    blocked, ignored = [], 0
    for kind, field, count, terminal in [
        ('video-task', 'taskRows', 'taskCount', {'completed', 'failed', 'cancelled'}),
        ('workflow-stage', 'workflowRows', 'workflowCount', {'completed', 'failed', 'blocked', 'cancelled'}),
    ]:
        rows = snapshot.get(field)
        require(isinstance(rows, list) and type(snapshot.get(count)) is int and
                len(rows) == snapshot[count], 'VIDEO_PROFILE_SCAN_TRUNCATED')
        seen = set()
        for row in rows:
            require(isinstance(row, dict) and isinstance(row.get('id'), str) and bool(row['id']) and
                    row['id'] not in seen and isinstance(row.get('status'), str),
                    'VIDEO_PROFILE_ROW_UNKNOWN')
            seen.add(row['id'])
            profiles = _strings(row.get('profiles'))
            versions = _versions(row.get('versions'))
            models = {key: _strings(row.get(key)) for key in ['publicModelIds', 'upstreamIds', 'wireModelIds']}
            if row['status'] in terminal:
                continue
            reason = 'unfinished-new-wire-profile' if profiles.intersection(PROFILES) else None
            if not reason:
                for scope in scopes:
                    if not versions.intersection(scope['versions']):
                        continue
                    if kind == 'workflow-stage' and row.get('planMatches') != 1:
                        reason = 'workflow-frozen-model-identity-unknown'
                        break
                    if len(versions) != 1:
                        reason = 'frozen-model-version-conflict'
                        break
                    # A frozen exact upstream is more specific than a shared public alias or wire name.
                    for key in ['upstreamIds', 'publicModelIds', 'wireModelIds']:
                        if models[key]:
                            if models[key].intersection(scope[key]):
                                reason = 'unfinished-frozen-execution-requires-compatible-profile'
                            elif not models[key].issubset(scope['known' + key[0].upper() + key[1:]]):
                                reason = 'frozen-model-identity-unknown'
                            break
                    else:
                        reason = 'unfinished-frozen-execution-requires-compatible-profile'
                    if reason:
                        break
            if reason:
                blocked.append({'kind': kind, 'id': row['id'], 'status': row['status'], 'reason': reason})
            else:
                ignored += 1
    return {'safe': not blocked, 'kind': 'video-profile-program-rollback-compatibility',
            'observedAt': snapshot['observedAt'], 'profiles': list(PROFILES), 'bindingCount': len(bindings),
            'modelVersions': sorted(set().union(*(scope['versions'] for scope in scopes))) if scopes else [],
            'scannedTasks': snapshot['taskCount'], 'scannedWorkflowStages': snapshot['workflowCount'],
            'unrelatedNonterminalRows': ignored, 'blockers': blocked, 'historicalRowsChanged': False,
            'acceptedTasksReplayed': False}


def check_live(tx, config):
    """Collect only non-secret markers under the caller's existing three locks."""
    db = tx.inspect('naumi-staging-db-1')
    env = environment(db)
    command = ['docker', 'exec', '-i', db['Id'], 'psql', '-XqAt', '-v', 'ON_ERROR_STOP=1',
               '-U', env['POSTGRES_USER'], '-d', env['POSTGRES_DB']]
    tables = json.loads(tx.run(command, stdin=schema_sql().encode()))
    snapshot = json.loads(tx.run(command, stdin=build_readonly_sql(tables).encode(), timeout=30))
    proof = evaluate(snapshot, config.get('videoProfileRollbackScope'))
    return proof


def enforce(proof, restore_compatible_executor=None):
    require(isinstance(proof, dict) and type(proof.get('safe')) is bool, 'VIDEO_PROFILE_GUARD_RESULT_UNKNOWN')
    if proof['safe']:
        return proof
    if restore_compatible_executor is not None:
        restore_compatible_executor()
    require(False, 'NEW_VIDEO_PROFILE_REQUIRES_COMPATIBLE_EXECUTOR_NOT_OLD_WORKER')
