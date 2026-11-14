/** Explicit task versions with a durable pre-dispatch checkpoint. Do not
 * assume unknown future versions are replayable. No crypto/config/I/O imports. */
export const hasVersionedVideoSubmission=(parameters:Record<string,unknown>|undefined)=>parameters?.version===2||parameters?.version===3;

/** Recovery admission is about the operation, not just the queued UI status.
 * A versioned non-prepared intent may already have reached the supplier. Its
 * recovery can only classify uncertainty (or poll an existing receipt), never
 * admit another paid create. Keep the orphan's release observation untouched. */
export function videoRecoveryAdmission(task:{status:string;upstreamId?:string;parameters?:Record<string,unknown>}):"claim"|"continuation"{
 if(!task.upstreamId&&hasVersionedVideoSubmission(task.parameters)&&task.parameters?.submissionState!=="prepared")return "continuation";
 return task.status==="queued"||!task.upstreamId?"claim":"continuation";
}
