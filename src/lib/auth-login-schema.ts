import "server-only";
import {databaseSchemaReadiness} from "@/platform/db/schema-readiness";
import type {Pool} from "pg";

export async function ensureLoginGuardSchema(pool:Pool){
 const state=databaseSchemaReadiness(pool,"login");
 let ready=state.pending;
 if(!ready){ready=(async()=>{const tx=await pool.connect();try{await tx.query('BEGIN');await tx.query("SET LOCAL lock_timeout='3s'");await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('auth-login-schema-v1',0))");await tx.query(LOGIN_GUARD_SQL);await tx.query('COMMIT');}catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}})().catch(e=>{state.pending=undefined;throw e;});state.pending=ready;}
 await ready;
}

export const LOGIN_GUARD_SQL=`
CREATE TABLE IF NOT EXISTS app_auth_login_attempts(
 id uuid PRIMARY KEY,account_hash text NOT NULL,network_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 outcome text NOT NULL CHECK(outcome IN ('pending','failure','success','ignored'))
);
CREATE INDEX IF NOT EXISTS app_auth_login_account_time ON app_auth_login_attempts(account_hash,created_at);
CREATE INDEX IF NOT EXISTS app_auth_login_network_time ON app_auth_login_attempts(network_hash,created_at);
CREATE INDEX IF NOT EXISTS app_auth_login_cleanup ON app_auth_login_attempts(created_at);`;
