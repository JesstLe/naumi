/** Process-local binding to the exact supplier call; no URL, key or request body. */
export type ImageResponseFailure={stage:string;status:number;causes:{name:string;code?:string;kind:string}[];observedAt:string};
const writers=new WeakMap<Response,(failure:ImageResponseFailure)=>Promise<void>>();
export function bindResponseDiagnostics(response:Response,write:(failure:ImageResponseFailure)=>Promise<void>){writers.set(response,write);return response;}
export async function recordImageResponseFailure(response:Response,failure:ImageResponseFailure){
 try{await writers.get(response)?.(failure);}catch{/* Evidence failure never replaces the original processing error. */}
}
