/** Explicit task versions with a durable pre-dispatch checkpoint. Do not
 * assume unknown future versions are replayable. No crypto/config/I/O imports. */
export const hasVersionedVideoSubmission=(parameters:Record<string,unknown>|undefined)=>parameters?.version===2||parameters?.version===3;
