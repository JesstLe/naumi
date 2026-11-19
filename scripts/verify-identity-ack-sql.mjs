/** Explicit read-only PostgreSQL parser regression. PREPARE only, never EXECUTE. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pg from 'pg';
assert.equal(process.env.NAUMI_VERIFY_PG_READONLY,'1','Explicit read-only PG verification required');
const source=fs.readFileSync('src/app/api/enterprise/identity/ack/route.ts','utf8');
const sql=source.match(/`(INSERT INTO app_identity_consumer_acks[\s\S]*?)`/)[1];
assert.equal((sql.match(/\$6::text/g)||[]).length,2);
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
const client=await pool.connect();
try {
 for(const [name,input,expected] of [['baseline',sql.replaceAll('$6::text','$6'),'42P08'],['modified',sql,null]]) {
  await client.query('BEGIN READ ONLY');let error;
  try {await client.query('PREPARE identity_ack_'+name+' AS '+input);} catch(e){error=e.code;}
  finally {await client.query('ROLLBACK');}
  assert.equal(error??null,expected);
  console.log(name==='baseline'?'BASELINE=42P08':'MODIFIED=PARSE_OK_NO_EXECUTION');
 }
} finally {client.release();await pool.end();}
