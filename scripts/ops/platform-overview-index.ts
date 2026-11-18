import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import type {Pool} from 'pg';

const indexName='app_creation_root_accepted_time';
const migration=resolve(__dirname,'../migrations/20261118-platform-overview-root-time.sql');

export async function ensurePlatformOverviewIndex(db:Pick<Pool,'query'>,apply=false){
  const inspect=async()=>{
    const {rows}=await db.query<{ready:boolean;intended:boolean;definition:string|null}>(`
      SELECT COALESCE(i.indisready AND i.indisvalid AND i.indislive,false) AS ready,
        COALESCE(i.indrelid=to_regclass('app_creation_records') AND am.amname='btree'
          AND NOT i.indisunique AND i.indnkeyatts=1 AND i.indnatts=3
          AND pg_get_indexdef(i.indexrelid,1,false)='accepted_at'
          AND pg_get_indexdef(i.indexrelid,2,false)='tenant_id'
          AND pg_get_indexdef(i.indexrelid,3,false)='status'
          AND pg_get_expr(i.indpred,i.indrelid)='(parent_id IS NULL)',false) AS intended,
        pg_get_indexdef(i.indexrelid) AS definition
      FROM pg_class c LEFT JOIN pg_index i ON i.indexrelid=c.oid LEFT JOIN pg_am am ON am.oid=c.relam
      WHERE c.oid=to_regclass($1)`,[indexName]);
    return rows[0];
  };
  const before=await inspect();
  const verify=(r:Awaited<ReturnType<typeof inspect>>)=>{
    assert.ok(r?.ready&&r.intended,`${indexName} must be valid and match the planned definition; inspect conflicts before retrying`);
    return r.definition!;
  };
  if(before||!apply)return verify(before);
  await db.query(readFileSync(migration,'utf8'));
  return verify(await inspect());
}
