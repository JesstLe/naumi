import type {Pool,PoolClient} from 'pg';
import {WorkflowError, type Principal} from './contracts';

/** Releases the checkout before worksheet assembly, hashing or filesystem work. */
export async function importRead<T>(pool:Pool,snapshot:boolean,run:(tx:PoolClient)=>Promise<T>,timeout:10000|15000=10000){
 const tx=await pool.connect();let discard=false;
 try{
  await tx.query(snapshot?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');
  await tx.query(`SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='${timeout}ms'`);
  const value=await run(tx);await tx.query('COMMIT');return value;
 }catch(error){try{await tx.query('ROLLBACK');}catch{discard=true;}throw error;}
 finally{tx.release(discard);}
}

export async function requireActiveImportBatch(tx:PoolClient,p:Principal,source:string,lock:boolean){
 const {rowCount}=await tx.query(`SELECT 1 FROM enterprise_workflow.import_batches WHERE enterprise_id=$1 AND source_hash=$2 AND active${lock?' FOR SHARE':''}`,[p.enterpriseId,source]);
 if(rowCount!==1)throw new WorkflowError(404,'SOURCE_NOT_FOUND');
}
