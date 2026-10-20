import { ModelConfigError } from "./types";
/** Wait only for a LOCAL lease before the first supplier attempt. Never retry
 * an HTTP request, disabled configuration, or a possibly accepted paid call. */
export async function waitForUnsubmittedChannel<T>(claim:()=>Promise<T>,signal:AbortSignal,budgetMs=15000):Promise<T>{
 const deadline=Date.now()+Math.max(0,Math.min(15000,budgetMs));let tries=0;
 for(;;){
  signal.throwIfAborted();
  try{return await claim();}catch(error){
   const delay=Math.min(1000+tries++*250,2000,Math.max(0,deadline-Date.now()));
   if(!(error instanceof ModelConfigError)||error.code!=="PROVIDER_BUSY"||error.status!==429||delay<=0||tries>=12)throw error;
   await new Promise<void>((resolve,reject)=>{
    const abort=()=>{clearTimeout(timer);signal.removeEventListener("abort",abort);reject(signal.reason);};
    const timer=setTimeout(()=>{signal.removeEventListener("abort",abort);resolve();},delay);
    signal.addEventListener("abort",abort,{once:true});if(signal.aborted)abort();
   });
  }
 }
}
