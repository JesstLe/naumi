/** DOM byte consumers exclude SharedArrayBuffer. Keep ordinary image/ZIP buffers
 * as zero-copy bounded views; copy only an explicitly shared backing store. */
export function webBytes(value:Uint8Array):Uint8Array<ArrayBuffer>{
  return value.buffer instanceof ArrayBuffer
    ? new Uint8Array(value.buffer,value.byteOffset,value.byteLength)
    : Uint8Array.from(value);
}
