/** Existing local-edit receipt identity, shared by creation and read-only
 * continuation. The artwork repository still authorizes every result read. */
export function canvasLocalImageEditResultId(operationId:string){return `art-local-${operationId}`;}
