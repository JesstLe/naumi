import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const sha=value=>createHash('sha256').update(value).digest('hex');
const zero=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value===0;

/** Pure configuration renderer. It does not install, reload or bypass release locks. */
export function renderEnterpriseProxy(input){
 assert(input&&Object.keys(input).every(k=>['publicOrigin','listenPort','slot','webPort','revision'].includes(k)),'PROXY_FIELDS');
 const url=new URL(input.publicOrigin);assert(!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/'&&(url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','[::1]'].includes(url.hostname)),'PROXY_ORIGIN');
 for(const port of [input.listenPort,input.webPort])assert(Number.isSafeInteger(port)&&port>=1024&&port<=65535,'PROXY_PORT');
 assert(input.listenPort!==input.webPort&&/^[a-z][a-z0-9-]{0,63}$/.test(input.slot)&&Number.isSafeInteger(input.revision)&&input.revision>=1,'PROXY_TARGET');
 assert(/^[a-zA-Z0-9.[\]:-]+$/.test(url.host),'PROXY_HOST');
 const plan={publicOrigin:url.origin,listenPort:input.listenPort,slot:input.slot,webPort:input.webPort,revision:input.revision},planSha256=sha(JSON.stringify(plan));
 const text=`# enterprise workflow proxy; plan ${planSha256}
worker_processes 1;
pid /tmp/enterprise-nginx.pid;
error_log /dev/stderr notice;
events { worker_connections 512; }
http {
  include /etc/nginx/mime.types;
  default_type application/octet-stream;
  log_format enterprise escape=json '{"requestId":"$request_id","uri":"$uri","upstream":"$upstream_addr","status":$status}';
  access_log /dev/stdout enterprise;
  client_body_temp_path /tmp/enterprise-client;
  proxy_temp_path /tmp/enterprise-proxy;
  fastcgi_temp_path /tmp/enterprise-fastcgi;
  uwsgi_temp_path /tmp/enterprise-uwsgi;
  scgi_temp_path /tmp/enterprise-scgi;
  map $http_upgrade $enterprise_connection { default upgrade; '' ''; }
  upstream enterprise_web { server 127.0.0.1:${plan.webPort}; keepalive 16; }
  server {
    listen 127.0.0.1:${plan.listenPort};
    server_name ${url.hostname};
    if ($http_host != "${url.host}") { return 421; }
    client_max_body_size 310m;
    proxy_http_version 1.1;
    proxy_request_buffering off;
    proxy_buffering off;
    proxy_cache off;
    proxy_next_upstream off;
    proxy_redirect http://127.0.0.1:${plan.webPort}/ ${url.origin}/;
    proxy_redirect http://localhost:${plan.webPort}/ ${url.origin}/;
    proxy_redirect https://127.0.0.1:${plan.webPort}/ ${url.origin}/;
    proxy_redirect https://localhost:${plan.webPort}/ ${url.origin}/;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    proxy_set_header Host "${url.host}";
    proxy_set_header X-Forwarded-Host "${url.host}";
    proxy_set_header X-Forwarded-Proto "${url.protocol.slice(0,-1)}";
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $enterprise_connection;
    proxy_set_header X-Release-Control-Secret "";
    proxy_set_header X-Naumi-Release-Secret "";
    proxy_hide_header X-Enterprise-Proxy-Slot;
    proxy_hide_header X-Enterprise-Proxy-Revision;
    add_header X-Enterprise-Proxy-Slot "${plan.slot}" always;
    add_header X-Enterprise-Proxy-Revision "${plan.revision}" always;
    add_header X-Enterprise-Request-ID $request_id always;
    location ^~ /api/internal/release/ { return 404; }
    location ^~ /internal/lifecycle/ { return 404; }
    location ^~ /_next/static/ {
      alias /etc/enterprise-proxy/assets/;
      add_header Cache-Control "public, max-age=31536000, immutable" always;
      add_header X-Content-Type-Options nosniff always;
    }
    location = /preview.html { proxy_pass http://enterprise_web/enterprise/workflow; }
    location / { proxy_pass http://enterprise_web; }
  }
}
`;
 return {plan,planSha256,configSha256:sha(text),text};
}

/** Observation adapter only. Unknowns stay unknown for the existing outer lifecycle. */
export function judgeEnterpriseRetirement({web,runtime,expected,receivedAt},now=Date.now()){
 const reasons=[];const add=(ok,reason)=>{if(!ok)reasons.push(reason);};
 const age=now-Date.parse(receivedAt);add(Number.isFinite(age)&&age>=-5000&&age<=120000,'OBSERVATION_STALE');
 const webAge=now-Date.parse(web?.observedAt);add(Number.isFinite(webAge)&&webAge>=-5000&&webAge<=120000,'WEB_OBSERVATION_STALE');
 add(typeof expected?.web?.instanceId==='string'&&typeof expected?.web?.bootId==='string'&&/^[a-f0-9]{40}$/.test(expected?.web?.commit||'')&&web?.identity?.instanceId===expected.web.instanceId&&web?.identity?.bootId===expected.web.bootId&&web?.identity?.commit===expected.web.commit,'WEB_IDENTITY_CHANGED');
 add(typeof expected?.runtime?.installationId==='string'&&typeof expected?.runtime?.bootId==='string'&&/^[a-f0-9]{64}$/.test(expected?.runtime?.releaseId||'')&&runtime?.installationId===expected.runtime.installationId&&runtime?.slot===expected.runtime.slot&&runtime?.bootId===expected.runtime.bootId&&runtime?.releaseId===expected.runtime.releaseId,'RUNTIME_IDENTITY_CHANGED');
 add(web?.transport?.verified===true&&web?.coverage?.allApplicationRequests===true,'WEB_HTTP_COVERAGE_UNKNOWN');
 add(zero(web?.observations?.activeRequests),'WEB_HTTP_NOT_DRAINED');
 add(web?.coverage?.allBackgroundAcceptedWork===true&&zero(web?.observations?.acceptedTasks),'WEB_ACCEPTED_TASKS_UNKNOWN_OR_ACTIVE');
 add(web?.coverage?.allAgentExecutions===true&&zero(web?.observations?.agentSessions),'WEB_AGENT_SESSIONS_UNKNOWN_OR_ACTIVE');
 add(zero(web?.observations?.workerLeases),'WEB_WORKER_LEASES_UNKNOWN_OR_ACTIVE');
 add(web?.coverage?.allApplicationAdmissions===true&&web?.admission?.mode==='draining','WEB_ADMISSIONS_PARTIAL_OR_OPEN');
 add(zero(web?.observations?.unknownLeases),'WEB_UNKNOWN_LEASES');
 add(runtime?.status==='drained'&&runtime?.acceptingWork===false&&zero(runtime?.activeRequests)&&zero(runtime?.activeWork),'WORKFLOW_NOT_DRAINED');
 return {schemaVersion:1,disposition:reasons.length?'HOLD':'READY_FOR_OUTER_REVIEW',mayRetire:reasons.length===0,reasons,
  observations:{web:{activeRequests:web?.observations?.activeRequests??null,acceptedTasks:web?.observations?.acceptedTasks??null,agentSessions:web?.observations?.agentSessions??null,workerLeases:web?.observations?.workerLeases??null},workflow:{activeRequests:runtime?.activeRequests??null,activeWork:runtime?.activeWork??null}},
  authority:'existing release lifecycle and site locks; this adapter never advances or stops a live release'};
}
