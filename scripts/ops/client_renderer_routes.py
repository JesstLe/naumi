"""Reviewed, bounded RSC GET ownership snippets for the existing gateway owner.

Pure preparation only: no reload, connection, clock mutation or container action.
The lock/CAS/lifecycle owner installs these in its existing complete config.
"""
import re,json,pathlib

_contract=json.loads((pathlib.Path(__file__).resolve().parents[2]/'src/lib/release-runtime/client-protocol.json').read_text())
assert _contract['schemaVersion']==1
MAX_RENDERER_WINDOW=_contract['maxWindowSeconds']
READ_PATHS=tuple(_contract['readPaths'])

def renderer_routes(*,current,retained,now,host='$host',response_headers=''):
    assert isinstance(now,int) and not isinstance(now,bool) and now>0
    assert host in ('$host','$http_host')
    assert len(retained)<=1,'ONE_RETAINED_RENDERER_ONLY'
    rows=[current,*retained];ids=set()
    for row in rows:
        assert re.fullmatch(r'naumi-[a-f0-9]{40}-[1-9][0-9]{0,11}-(standard|desktop|enterprise|fleet)',row['deploymentId']),'INVALID_DEPLOYMENT_ID'
        assert row['deploymentId'] not in ids,'DUPLICATE_RENDERER';ids.add(row['deploymentId'])
        assert re.fullmatch(r'[a-zA-Z0-9_.-]+:[1-9][0-9]{0,4}',row['endpoint']) and 0<int(row['endpoint'].rsplit(':',1)[1])<=65535,'INVALID_RENDERER_ENDPOINT'
    active=[]
    for row in retained:
        until=row['until'];assert isinstance(until,int) and not isinstance(until,bool),'INVALID_RENDERER_DEADLINE'
        assert until<=now+MAX_RENDERER_WINDOW,'RENDERER_WINDOW_TOO_LONG'
        if until>now:active.append(row)
    groups=[('naumi_renderer_current',current),*[(f'naumi_renderer_retained_{i}',row) for i,row in enumerate(active)]]
    maps=''.join(f'upstream {name}{{server {row["endpoint"]};}}' for name,row in groups)
    maps+='map "$request_method:$http_rsc:$uri:$http_next_action" $naumi_renderer_read{default 0;'+''.join(f'"GET:1:{p}:" 1;' for p in READ_PATHS)+'}'
    maps+='map $http_x_deployment_id $naumi_renderer_backend{default naumi_renderer_current;'+''.join(f'"{row["deploymentId"]}" {name};' for name,row in groups)+'}'
    maps+='map $http_x_deployment_id $naumi_renderer_until{default "";'+''.join(f'"{row["deploymentId"]}" "{row["until"]}";' for row in active)+'}'
    maps+='map $http_x_deployment_id $naumi_renderer_id{default "'+current['deploymentId']+'";'+''.join(f'"{row["deploymentId"]}" "{row["deploymentId"]}";' for row in active)+'}'
    common=f'proxy_http_version 1.1;proxy_set_header Host {host};proxy_set_header X-Forwarded-Proto $scheme;proxy_set_header Connection "";proxy_buffering off;proxy_read_timeout 90s;proxy_next_upstream off;{response_headers}'
    current_proxy='proxy_set_header '+_contract['deadlineHeader']+' "";proxy_set_header '+_contract['readContextHeader']+' "";proxy_pass http://naumi_renderer_current;'
    locations='location /{error_page 418 = @naumi_rsc_owner;if ($naumi_renderer_read){return 418;}'+common+current_proxy+'}'
    locations+='location @naumi_rsc_owner{'+common+'proxy_cache off;add_header Cache-Control "private, no-store" always;add_header Vary X-Deployment-ID always;'+'proxy_intercept_errors on;error_page 409 502 503 504 = @naumi_rsc_current;proxy_set_header '+_contract['deadlineHeader']+' $naumi_renderer_until;proxy_set_header '+_contract['readContextHeader']+' "1";add_header X-Naumi-Renderer-ID $naumi_renderer_id always;proxy_pass http://$naumi_renderer_backend;}'
    locations+='location @naumi_rsc_current{'+common+'proxy_cache off;add_header Cache-Control "private, no-store" always;add_header Vary X-Deployment-ID always;'+current_proxy+'add_header X-Naumi-Renderer-ID "'+current['deploymentId']+'" always;}'
    return {'http':maps,'server':locations,'mapHashBucketSize':_contract['mapHashBucketSize'],'activeRetained':active,'notBeforeRetire':max([now,*[row['until'] for row in active]])}
