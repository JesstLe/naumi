import assert from 'node:assert/strict';
import { randomUUID,createHash } from 'node:crypto';
async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(new URL(process.env.DATABASE_URL!).hostname,'127.0.0.1');
 process.env.SETTINGS_SECRET='analytics-fixture-01234567890123456789';process.env.NAUMI_MULTI_USER='1';
 const db=await import('../src/lib/db'),server=await import('../src/lib/enterprise/server'),analytics=await import('../src/lib/enterprise/analytics'),native=await import('../src/lib/native-auth'),api=await import('../src/app/api/enterprise/analytics/route');
 await server.ensureEnterpriseSchema();const pool=db.getPool();
 const owner='boss@analytics.fixture',director='director@analytics.fixture',lead='lead@analytics.fixture',employee='employee@analytics.fixture',intern='intern@analytics.fixture',other='outside@analytics.fixture';
 const root=randomUUID(),sub=randomUUID(),cap=new Date(Date.now()+30*86400000).toISOString();
 for(const e of [owner,director,lead,employee,intern,other])await db.getOrCreateUser(e,e);
 await pool.query("UPDATE app_users SET name='=FORMULA()' WHERE email=$1",[intern]);
 for(const e of [owner,lead])await pool.query("INSERT INTO app_team_access_grants(email,scope,starts_at,created_by,updated_by)VALUES($1,'owned',now()-interval '1 day','fixture','fixture')",[e]);
 for(const [id,email]of [[root,owner],[sub,lead]])await pool.query("INSERT INTO app_account_teams(id,name,owner_email,authorized_until)VALUES($1,'Analytics fixture',$2,$3)",[id,email,cap]);
 for(const e of [director,lead,employee])await pool.query('INSERT INTO app_account_team_members(email,team_id)VALUES($1,$2)',[e,root]);
 await pool.query('INSERT INTO app_account_team_members(email,team_id)VALUES($1,$2)',[intern,sub]);await pool.query('UPDATE app_users SET account_expires_at=now()+interval \'3 days\' WHERE email=$1',[intern]);
 await server.activateEnterprise({email:'site-admin',admin:true,consoleAdmin:true},root,director,[sub]);
 await pool.query('DELETE FROM app_ledger');await pool.query('DELETE FROM app_credit_batches');
 const at='2026-10-13T01:00:00Z';
 const ledger=async(id:string,email:string,delta:number,kind:string,reason:string,created=at)=>pool.query('INSERT INTO app_ledger(id,email,delta,kind,reason,created_at)VALUES($1,$2,$3,$4,$5,$6)',[id,email,delta,kind,reason,created]);
 const op=async(id:string,email:string,feature:string,ledgerId:string,state='settled',result='succeeded')=>pool.query(`INSERT INTO app_billing_operations(id,email,feature,quote,request_fingerprint,state,ledger_id,created_at,settlement_result)VALUES($1,$2,$3,'{"model":"SECRET_MODEL","supplier":"SECRET_PROVIDER"}','fixture',$4,$5,$6,$7::jsonb)`,[id,email,feature,state,ledgerId,at,JSON.stringify({state:result})]);
 await ledger('before',owner,-999,'consume','生成 1 张图','2026-10-12T15:59:59Z');
 await ledger('led-start',owner,-100,'consume','SECRET_MODEL','2026-10-12T16:00:00Z');await op('image-start',owner,'image.generate','led-start');
 await ledger('lead-charge',lead,-50,'consume','SECRET_PROVIDER');await op('replicate-job',lead,'tool.replicate','lead-charge');
 await ledger('intern-charge',intern,-20,'consume','画布扩图');
 await ledger('employee-charge',employee,-30,'consume','SECRET_MODEL_UNKNOWN');
 await ledger('director-charge',director,-7,'consume','A+ 详情页 1 张');
 await ledger('refund',lead,10,'refund','SECRET_PROVIDER_REFUND');
 await ledger('led-api-refund-test',owner,5,'grant','供应商费用修订返还');
 await pool.query("INSERT INTO app_credit_batches(id,email,amount,remaining,source,expires_at)VALUES('bat-api-refund-test',$1,5,5,'refund',now()+interval '90 days')",[owner]);
 await pool.query("INSERT INTO app_billing_api_cost_reviews(id,operation_id,after_result,status,refund_credits)VALUES('test','image-start','{}','refunded',5)");
 await ledger('adjust',owner,-40,'consume','自定义后台扣减');await op('adjust-op',owner,'credits.adjust','adjust');
 await ledger('adjust-positive',owner,10,'grant','管理员调整积分');
 await ledger('grant',owner,500,'grant','开户积分');
 await ledger('end',owner,-3,'consume','生成 1 张图','2026-10-13T15:59:59Z');
 await ledger('next',owner,-888,'consume','生成 1 张图','2026-10-13T16:00:00Z');
 await ledger('outsider',other,-9999,'consume','SECRET_OTHER_ENTERPRISE');
 for(let i=0;i<28;i++)await ledger('page-'+String(i).padStart(2,'0'),intern,0,'grant','无变动');
 await pool.query(`INSERT INTO app_credit_batches(id,email,amount,remaining,source,expires_at)VALUES('wallet',$1,1000,1000,'grant',now()+interval '10 days')`,[lead]);await pool.query('UPDATE app_users SET credits_used=25 WHERE email=$1',[lead]);
 for(const [id,email,status]of [['image-start',owner,'done'],['failed-job',intern,'error'],['pending-job',lead,'pending']])await pool.query("INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered,created_at)VALUES($1,$2,'generate',$3::jsonb,'{}',false,$4)",[id,email,JSON.stringify({status}),at]);
 await pool.query("INSERT INTO app_canvas_image_tasks(id,email,kind,source_artwork_id,status,created_at)VALUES('canvas-job',$1,'expand','','completed',$2)",[intern,at]);
 await op('sync-unknown',intern,'canvas.ocr','no-ledger','hold','unknown');
 for(const [id,deleted]of [['visible',null],['deleted',at]])await pool.query("INSERT INTO app_artworks(id,email,title,category,prompt,image_url,gradient,created_at,deleted_at)VALUES($1,$2,'fixture','generate','SECRET_PROMPT','','',$3,$4)",[id,lead,at,deleted]);
 const parsed=analytics.analyticsQuerySchema.parse({enterpriseId:root,from:'2026-10-13',to:'2026-10-13'});
 const q={...parsed},actor={email:owner,admin:false};
 const fingerprint=async()=>{const result=[];for(const table of ['app_users','app_ledger','app_credit_batches','app_billing_operations','app_enterprise_members','app_enterprise_roles'])result.push((await pool.query(`SELECT row_to_json(s) AS r FROM (SELECT * FROM ${table})s ORDER BY row_to_json(s)::text`)).rows);return createHash('sha256').update(JSON.stringify(result)).digest('hex')};
 const before=await fingerprint();
 const data=await analytics.enterpriseAnalytics(actor,q);
 assert.equal(data.summary.consumed,210);assert.equal(data.summary.refunded,15);assert.equal(data.summary.net,195);assert.equal(data.summary.adjustment,-30);assert.equal(data.summary.issued,500);assert.equal(data.summary.unclassified,2);assert.equal(data.summary.scopeMembers,5);assert.equal(data.summary.activeMembers,5);
 assert.equal(data.summary.tasks,6);assert.equal(data.summary.succeeded,3);assert.equal(data.summary.failed,1);assert.equal(data.summary.pending,1);assert.equal(data.summary.unknown,1);assert.equal(data.summary.successRate,75);assert.equal(data.summary.artworks,1);
 assert.equal(data.summary.reserved,25);assert.equal(data.summary.available,980);assert.equal(data.summary.expiring,1000);
 assert.equal(data.trend.length,1);assert.equal(data.trend[0].net,195);assert.equal(data.summary.previousNet,999);
 assert.equal(data.details.total,39);assert.equal(data.details.rows.length,25);
 assert(data.details.rows.every(row=>/^\d{4}-\d{2}-\d{2}T.*Z$/.test(row.createdAt)));
 const page=await analytics.enterpriseAnalytics(actor,{...q,page:2});assert.equal(page.details.rows.length,14);assert.equal(new Set([...data.details.rows,...page.details.rows].map(r=>r.id)).size,39);
 const leadData=await analytics.enterpriseAnalytics({email:lead,admin:false},q);assert.equal(leadData.summary.scopeMembers,2);assert.equal(leadData.summary.net,60);assert(!JSON.stringify(leadData).includes(employee));assert(!JSON.stringify(leadData).includes(owner));
 const branch=await analytics.enterpriseAnalytics(actor,{...q,team:lead});assert.equal(branch.summary.net,60);assert.equal(branch.members.length,2);
 const generate=await analytics.enterpriseAnalytics(actor,{...q,purpose:'image.generate'});assert.equal(generate.summary.net,98);assert.equal(generate.summary.artworks,0);assert.equal(generate.summary.creditsPerArtwork,null);
 const refund=await analytics.enterpriseAnalytics(actor,{...q,kind:'refund'});assert.equal(refund.details.total,2);assert.equal(refund.summary.net,195);
 assert.equal(refund.details.rows.find(row=>row.id==='led-api-refund-test')?.operationId,'image-start');
 const week=await analytics.enterpriseAnalytics(actor,{...q,group:'week'});assert.equal(week.trend[0].date,'2026-10-12');const month=await analytics.enterpriseAnalytics(actor,{...q,group:'month'});assert.equal(month.trend[0].date,'2026-10-01');
 const empty=await analytics.enterpriseAnalytics(actor,{...q,from:'2020-01-01',to:'2020-01-02',page:2});assert.equal(empty.details.total,0);assert.equal(empty.summary.net,0);assert.equal(empty.trend.length,2);assert.equal(empty.summary.successRate,null);
 assert(data.risks.find(r=>r.code==='intern-expiry')?.count===1);assert.equal(data.risks.find(r=>r.code==='settlement-review')?.count,1);
 for(const bad of [{from:'2026-02-30'},{from:'2026-10-14'},{to:'2040-01-01'},{purpose:'__proto__'},{purpose:'constructor'},{group:'year'},{page:'1x'}])assert.equal(analytics.analyticsQuerySchema.safeParse({...q,...bad}).success,false);
 const contracts=await import('../src/lib/enterprise/analytics-contracts');assert.deepEqual(contracts.presetDates('week','2026-10-13'),{from:'2026-10-12',to:'2026-10-13'});assert.equal(contracts.shanghaiToday(new Date('2026-10-12T16:00:00Z')),'2026-10-13');
 const request=(who:string,patch:Record<string,string>={})=>new Request('http://fixture.test/api/enterprise/analytics?'+new URLSearchParams({...q,page:String(q.page),...patch}),{headers:{cookie:who?'nv_user='+native.signUserSession(who,Date.now()):''}});
 assert.equal((await api.GET(request(''))).status,401);assert.equal((await api.GET(request(other))).status,403);assert.equal((await api.GET(request(employee))).status,403);assert.equal((await api.GET(request(lead,{email:employee}))).status,403);assert.equal((await api.GET(request(lead,{team:director}))).status,403);assert.equal((await api.GET(request(owner,{from:'bad'}))).status,400);
 const r=await api.GET(request(owner));assert.equal(r.status,200);assert.match(r.headers.get('cache-control')||'',/no-store/);const serialized=JSON.stringify(await r.json());for(const secret of ['SECRET_MODEL','SECRET_PROVIDER','SECRET_PROMPT','SECRET_OTHER','request_fingerprint','quote','password'])assert(!serialized.includes(secret));
 const csvResponse=await api.GET(request(owner,{format:'csv'}));assert.equal(csvResponse.status,200);const csv=await csvResponse.text();assert.equal(csv.split('\r\n').length,40);assert(csv.includes("'"+'=FORMULA()'));assert(!csv.includes('SECRET_'));assert.equal(analytics.csvCell(' \t=SUM(A1)'),`"' \t=SUM(A1)"`);assert.equal(analytics.csvCell('a"b'),`"a""b"`);assert.equal(analytics.csvCell(-50),'"-50"');assert.equal(analytics.csvCell('-CMD()'),`"'-CMD()"`);
 await pool.query('UPDATE app_team_access_grants SET enabled=false WHERE email=$1',[owner]);assert.equal((await api.GET(request(director))).status,403);await pool.query('UPDATE app_team_access_grants SET enabled=true WHERE email=$1',[owner]);
 const roles=(await server.enterpriseSnapshot(actor,root)).roles;const directRole=roles.find(r=>r.name==='设计美工总监')!;await pool.query('UPDATE app_enterprise_roles SET view_records=false WHERE id=$1',[directRole.id]);assert.equal((await api.GET(request(director))).status,403);await pool.query('UPDATE app_enterprise_roles SET view_records=true WHERE id=$1',[directRole.id]);
 assert.equal(await fingerprint(),before);
 // Ledger IDs may be reused by multiple operations. Keep the original first-by-time/id
 // tie break, and never join another member's operation to this member's ledger entry.
 await pool.query(`INSERT INTO app_billing_operations(id,email,feature,quote,request_fingerprint,state,ledger_id,created_at) VALUES
   ('later-op',$1,'canvas.ocr','{}','fixture','settled','dedup-ledger','2026-10-15T01:00:00Z'),
   ('b-same-time',$1,'canvas.ocr','{}','fixture','settled','dedup-ledger','2026-10-14T01:00:00Z'),
   ('a-same-time',$1,'image.generate','{}','fixture','settled','dedup-ledger','2026-10-14T01:00:00Z'),
   ('foreign-earlier',$2,'canvas.ocr','{}','fixture','settled','dedup-ledger','2026-10-13T01:00:00Z')`,[owner,other]);
 await ledger('dedup-ledger',owner,-6,'consume','fixture','2026-10-15T01:00:00Z');
 const dedup=await analytics.enterpriseAnalytics(actor,{...q,from:'2026-10-15',to:'2026-10-15',purpose:'image.generate'});
 assert.equal(dedup.details.total,1);assert.equal(dedup.summary.net,6);assert.equal(dedup.details.rows[0]?.operationId,'a-same-time');
 const single=await server.enterpriseRead(actor,root,tx=>analytics.creationLedger(tx,[owner],{
  start:'2026-10-13T00:00:00+08:00',end:'2026-10-14T00:00:00+08:00',email:'',page:1,size:25,recordId:'dedup-ledger',
 }));
 assert.equal(single.total,1);assert.equal(single.rows[0]?.operationId,'a-same-time');
 console.log('ANALYTICS=PASS CONSUMED=210 REFUNDED=15 NET=195 ADJUSTMENT=-30 ISSUED=500 UNKNOWN_USAGE=2');
 console.log('DATES=PASS SHANGHAI_START_END_INCLUSIVE=PASS DAILY_WEEKLY_MONTHLY_ZERO_FILL=PASS PREVIOUS=999 INVALID_RANGE=400');
 console.log('SCOPE=PASS BOSS=5 LEAD=2 SUBTEAM=2 CROSS_MEMBER=403 CROSS_TEAM=403 ROLE_REVOKE=403 ROOT_GRANT_PAUSE=403 ANONYMOUS=401');
 console.log('PRODUCTIVITY=PASS TASKS=6 SUCCESS=3 FAILED=1 PENDING=1 UNKNOWN=1 SUCCESS_RATE=75 ARTWORKS=1 ASYNC_BILLING_DEDUP=PASS');
 console.log('LEDGER=PASS TOTAL=39 PAGE1=25 PAGE2=14 CSV_ROWS=39 FORMULA_ESCAPE=PASS SENSITIVE_FIELDS=ABSENT FIRST_OPERATION_AND_EMAIL_BINDING=PASS');
 console.log('WALLET=PASS AVAILABLE=980 RESERVED=25 EXPIRING=1000 RISK=PASS DATABASE_FINGERPRINT=UNCHANGED PROVIDER_CALLS=0');
 await pool.end();
}
main().catch(e=>{console.error(e);process.exitCode=1});
