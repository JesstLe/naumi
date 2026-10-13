import "server-only";
import type {Pool,PoolClient} from "pg";
/** Runtime bundles share one database namespace; serialize compatibility DDL before taking table locks. */
export async function withSchemaInitialization<T>(pool:Pool,apply:(client:PoolClient)=>Promise<T>):Promise<T>{
 const client=await pool.connect();
 try{await client.query("BEGIN");await client.query("SELECT pg_advisory_xact_lock(hashtextextended(current_database()||':'||current_schema()||':naumi-core-ddl',0))");const result=await apply(client);await client.query("COMMIT");return result;}
 catch(error){await client.query("ROLLBACK").catch(()=>{});throw error;}
 finally{client.release();}
}
