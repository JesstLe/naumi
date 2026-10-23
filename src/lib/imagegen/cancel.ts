import "server-only";
import {imageCoordinationPool} from "./coordination-pool";
import {getImageJob} from "../image-job-repository";
import {assertImagegenCreationScope} from "./creation-scope";
export class ImagegenStopped extends Error{}
/** Same advisory lock orders cancellation and the durable child submission receipt. */
export async function imagegenSubmission<T>(id:string,run:()=>Promise<T>,alreadyStarting=false){
 const tx=await imageCoordinationPool().connect();try{await tx.query("BEGIN");await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`imagegen-submit:${id}`]);
 const row=await getImageJob(id,"imagegen");if(row?.payload.cancelRequested&&!alreadyStarting)throw new ImagegenStopped("后续步骤已停止");
 const result=await run();await tx.query("COMMIT");return result;
 }catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
}
export async function cancelImagegenOperation(operationId:string,owner:string){
 const id=`imagegen-${operationId}`,tx=await imageCoordinationPool().connect();
 try{await tx.query("BEGIN");await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`imagegen-submit:${id}`]);
 const original=(await tx.query("SELECT payload FROM app_image_jobs WHERE id=$1 AND email=$2 AND kind='imagegen' FOR UPDATE",[id,owner.toLowerCase()])).rows[0];
 if(!original)throw new Error("任务不存在或无权访问");
 assertImagegenCreationScope(original.payload?.creationScope,owner);
 const result=await tx.query("UPDATE app_image_jobs SET payload=jsonb_set(payload,'{cancelRequested}','true'::jsonb),updated_at=now() WHERE id=$1 AND email=$2 AND kind='imagegen' RETURNING id",[id,owner.toLowerCase()]);if(!result.rowCount)throw new Error("任务不存在或无权访问");await tx.query("COMMIT");
 }catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
}
