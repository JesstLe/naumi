import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import {WorkbenchError} from "./contract";
import type {PoolClient} from "pg";

let ready:Promise<void>|undefined;
export const WORKBENCH_DDL=`
 CREATE TABLE IF NOT EXISTS app_reference_documents(
  owner text NOT NULL,kind text NOT NULL,id text NOT NULL,payload jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1,deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner,kind,id));
 CREATE INDEX IF NOT EXISTS app_reference_documents_recent ON app_reference_documents(owner,kind,updated_at DESC) WHERE NOT deleted;
 CREATE TABLE IF NOT EXISTS app_reference_operations(
  id uuid PRIMARY KEY,owner text NOT NULL,kind text NOT NULL,request_id text NOT NULL,
  fingerprint text NOT NULL,body jsonb NOT NULL,plans jsonb NOT NULL,
  state text NOT NULL DEFAULT 'preview',result jsonb NOT NULL DEFAULT '{}',
  expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner,kind,request_id));
 CREATE INDEX IF NOT EXISTS app_reference_operations_owner ON app_reference_operations(owner,created_at DESC);
`;
export async function ensureWorkbench(){if(!ready)ready=ensureSchema().then(()=>getPool().query(WORKBENCH_DDL)).then(()=>{}).catch(e=>{ready=undefined;throw e;});await ready;}
export async function document<T>(owner:string,kind:string,id:string,tx?:PoolClient):Promise<T>{
 await ensureWorkbench();const row=(await(tx||getPool()).query("SELECT payload FROM app_reference_documents WHERE owner=$1 AND kind=$2 AND id=$3 AND NOT deleted",[owner,kind,id])).rows[0];
 if(!row)throw new WorkbenchError("记录不存在或无权访问",404);return row.payload;
}
export async function putDocument(owner:string,kind:string,id:string,payload:unknown,tx?:PoolClient){await ensureWorkbench();await(tx||getPool()).query(`INSERT INTO app_reference_documents(owner,kind,id,payload) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(owner,kind,id) DO UPDATE SET payload=excluded.payload,revision=app_reference_documents.revision+1,updated_at=now()`,[owner,kind,id,JSON.stringify(payload)]);}
export async function documents<T>(owner:string,kind:string,limit=100){await ensureWorkbench();return(await getPool().query<{id:string;payload:T;created_at:Date;updated_at:Date}>("SELECT id,payload,created_at,updated_at FROM app_reference_documents WHERE owner=$1 AND kind=$2 AND NOT deleted ORDER BY updated_at DESC LIMIT $3",[owner,kind,limit])).rows;}
export async function transaction<T>(key:string,run:(tx:PoolClient)=>Promise<T>){await ensureWorkbench();const tx=await getPool().connect();try{await tx.query("BEGIN");await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[key]);const result=await run(tx);await tx.query("COMMIT");return result;}catch(e){await tx.query("ROLLBACK");throw e;}finally{tx.release();}}
export type Operation={id:string;owner:string;kind:string;request_id:string;fingerprint:string;body:Record<string,any>;plans:any[];state:string;result:Record<string,any>;expires_at:Date;created_at:Date;updated_at:Date};
export async function operation(owner:string,id:string,tx?:PoolClient):Promise<Operation>{await ensureWorkbench();const row=(await(tx||getPool()).query("SELECT * FROM app_reference_operations WHERE id=$1 AND owner=$2",[id,owner])).rows[0];if(!row)throw new WorkbenchError("任务不存在或无权访问",404);return row;}
export async function operations(owner:string,kind?:string,root?:string){await ensureWorkbench();return(await getPool().query<Operation>("SELECT * FROM app_reference_operations WHERE owner=$1 AND ($2::text IS NULL OR kind=$2) AND ($3::text IS NULL OR body->>'workbench_root'=$3) AND state!='preview' ORDER BY created_at DESC",[owner,kind||null,root||null])).rows;}
