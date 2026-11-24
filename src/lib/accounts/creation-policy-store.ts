import {TeamError} from "../teams/errors";
import "server-only";
import type {PoolClient} from "pg";
import {dbEnabled,getPool} from "@/platform/db/pool";
import {ensureSchema} from "../persistence/schema";
import {accountCreationPolicySchema,type AccountCreationPolicy} from "./creation-policy";
export async function readAccountCreationPolicy(email:string,tx?:Pick<PoolClient,"query">):Promise<AccountCreationPolicy|null>{
  if(!dbEnabled)return null;
  if(!tx)await ensureSchema();
  const row=(await(tx||getPool()).query("SELECT policy FROM app_account_creation_policies WHERE email=$1",[email.toLowerCase()])).rows[0];
  return row?accountCreationPolicySchema.parse(row.policy):null;
}
/** Membership writers take the same account row lock as policy management. */
export async function assertAccountCanJoinEnterprise(tx:Pick<PoolClient,"query">,email:string){
  await tx.query("SELECT email FROM app_users WHERE email=$1 FOR UPDATE",[email.toLowerCase()]);
  if((await readAccountCreationPolicy(email,tx))?.personalOnly)throw new TeamError("该账号仅使用个人空间",403);
}
export async function writeAccountCreationPolicyTx(tx:PoolClient,email:string,policy:AccountCreationPolicy,actor:string){
  policy=accountCreationPolicySchema.parse(policy);email=email.toLowerCase();
  await tx.query("SELECT email FROM app_users WHERE email=$1 FOR UPDATE",[email]);
  if(policy.personalOnly){
    const tables=[['app_account_teams','owner_email'],['app_account_team_members','email'],['app_enterprise_members','email']] as const;
    for(const [table,column] of tables){
      if(!(await tx.query("SELECT to_regclass($1) AS present",[table])).rows[0].present)continue;
      if((await tx.query(`SELECT 1 FROM ${table} WHERE ${column}=$1 LIMIT 1`,[email])).rowCount)throw new TeamError("账号已有企业归属，请先按原企业流程处理",409);
    }
  }
  await tx.query(`INSERT INTO app_account_creation_policies(email,policy,updated_by) VALUES($1,$2::jsonb,$3)
    ON CONFLICT(email) DO UPDATE SET policy=excluded.policy,updated_by=excluded.updated_by,updated_at=now()`,[email,JSON.stringify(policy),actor]);
}
