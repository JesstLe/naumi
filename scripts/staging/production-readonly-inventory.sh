#!/usr/bin/env bash
# Read-only inventory. No dump, file copying, container start, or service restart.
set -Eeuo pipefail
echo 'PRODUCTION_INVENTORY_BEGIN'
date -u '+UTC=%Y-%m-%dT%H:%M:%SZ'
readlink -f /opt/naumi/current
cat /opt/naumi/current/DEPLOYED_COMMIT /opt/naumi/current/IMAGE_ID
docker inspect naumi-app-1 --format 'APP_IMAGE={{.Config.Image}} IMAGE_ID={{.Image}} STARTED={{.State.StartedAt}}'
dbu=$(docker exec naumi-db-1 printenv POSTGRES_USER)
dbn=$(docker exec naumi-db-1 printenv POSTGRES_DB)
docker exec -i naumi-db-1 psql -X -v ON_ERROR_STOP=1 -U "$dbu" -d "$dbn" -At <<'SQL'
BEGIN READ ONLY;
SELECT 'DATABASE_BYTES=' || pg_database_size(current_database());
SELECT 'USERS=' || count(*) FROM app_users;
SELECT 'ARTWORKS=' || count(*) FROM app_artworks;
SELECT 'LEDGER=' || count(*) FROM app_ledger;
SELECT 'IMAGE_JOBS=' || count(*) FROM app_image_jobs;
SELECT 'VIDEO_TASKS=' || count(*) FROM app_video_tasks;
SELECT 'IMAGE_UNSETTLED=' || count(*) FROM app_image_jobs WHERE billing_settled=false;
SELECT 'VIDEO_PENDING=' || count(*) FROM app_video_tasks WHERE status IN ('queued','processing','needs_attention');
COMMIT;
SQL
docker exec -i naumi-app-1 node <<'NODE'
const crypto = require('node:crypto');
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const hmac = (k,x) => crypto.createHmac('sha256',k).update(x).digest();
const enc = x => encodeURIComponent(x).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
async function list(token) {
  const e=process.env;
  if(!e.S3_ENDPOINT || !e.S3_BUCKET || !e.S3_ACCESS_KEY_ID || !e.S3_SECRET_ACCESS_KEY) throw new Error('StorageConfigMissing');
  const u=new URL(e.S3_ENDPOINT);
  u.pathname=u.pathname.replace(/\/$/,'')+'/'+enc(e.S3_BUCKET);
  const entries=[['list-type','2'],['max-keys','1000']];
  if(token) entries.push(['continuation-token',token]);
  entries.sort(([a],[b])=>a.localeCompare(b));
  u.search=entries.map(([k,v])=>enc(k)+'='+enc(v)).join('&');
  const time=new Date().toISOString().replace(/[:-]|\.\d{3}/g,'');
  const day=time.slice(0,8), region=e.S3_REGION || 'us-east-1';
  const payload=sha(''), headers=`host:${u.host}\nx-amz-content-sha256:${payload}\nx-amz-date:${time}\n`;
  const names='host;x-amz-content-sha256;x-amz-date';
  const canonical=['GET',u.pathname,u.search.slice(1),headers,names,payload].join('\n');
  const scope=`${day}/${region}/s3/aws4_request`;
  const str=`AWS4-HMAC-SHA256\n${time}\n${scope}\n${sha(canonical)}`;
  const k=hmac(hmac(hmac(hmac('AWS4'+e.S3_SECRET_ACCESS_KEY,day),region),'s3'),'aws4_request');
  const signature=crypto.createHmac('sha256',k).update(str).digest('hex');
  const r=await fetch(u,{headers:{'x-amz-date':time,'x-amz-content-sha256':payload,Authorization:`AWS4-HMAC-SHA256 Credential=${e.S3_ACCESS_KEY_ID}/${scope}, SignedHeaders=${names}, Signature=${signature}`},signal:AbortSignal.timeout(15000)});
  if(!r.ok) throw new Error('S3ListHTTP'+r.status);
  return r.text();
}
(async()=>{
  let token='',count=0,bytes=0,pages=0;
  do {
    const xml=await list(token); pages++;
    for(const m of xml.matchAll(/<Contents>[\s\S]*?<Size>(\d+)<\/Size>[\s\S]*?<\/Contents>/g)){ count++; bytes+=Number(m[1]); }
    const truncated=/<IsTruncated>true<\/IsTruncated>/.test(xml);
    const match=xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/);
    if(truncated && !match) throw new Error('S3PaginationTokenMissing');
    token=truncated?match[1].replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'"):'';
    if(pages>=100 && token) throw new Error('S3InventoryPageLimit');
  } while(token);
  console.log(`S3_OBJECTS=${count} S3_BYTES=${bytes} S3_PAGES=${pages}`);
})().catch(e=>{console.error('S3_INVENTORY_ERROR='+String(e.message).replace(/[^A-Za-z0-9_-]/g,'').slice(0,80));process.exitCode=1;});
NODE
free -m
df -hT /
curl -fsS --max-time 10 http://127.0.0.1:3012/api/health
echo
echo 'PRODUCTION_INVENTORY_RESULT=PASS SERVICES_CHANGED=0'
