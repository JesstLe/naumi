import "server-only";
import {Client} from "pg";
import {getPool} from "@/platform/db/pool";
import {APPLICATION_WORK_CHANNEL} from "../application/work-signal";

/** One dedicated LISTEN connection, not a query-pool checkout or a queue.
 * Search-path schema scopes hints from isolated installations sharing a DB.
 * Disconnects reconnect; missed hints are recovered by the original timer. */
export async function listenForApplicationWork(onWake:()=>void){
 let client:Client|undefined,timer:ReturnType<typeof setTimeout>|undefined,closed=false,connected=false;
 let opening:Promise<void>|undefined;
 const retry=()=>{if(!closed&&!timer){timer=setTimeout(()=>{timer=undefined;void open();},1000);timer.unref();}};
 const open=():Promise<void>=>{
  if(closed)return Promise.resolve();
  if(opening)return opening;
  opening=(async()=>{
   const next=new Client({...getPool().options,application_name:"naumi-worker-wakeup",connectionTimeoutMillis:2000});client=next;
   const failed=()=>{
    if(client!==next)return;connected=false;client=undefined;
    void next.end().catch(()=>{});retry();
   };
   next.on("error",failed);next.on("end",failed);
   try{
    await next.connect();const schema=(await next.query("SELECT current_schema() AS name")).rows[0].name;
    next.on("notification",event=>{if(!closed&&connected&&event.channel===APPLICATION_WORK_CHANNEL&&event.payload===schema)onWake();});
    await next.query("LISTEN "+APPLICATION_WORK_CHANNEL);
    if(closed){await next.end();return;}connected=true;
   }catch{failed();}
  })().finally(()=>{opening=undefined;});return opening;
 };
 await open();
 return {
  connected:()=>connected,
  async close(){closed=true;clearTimeout(timer);await opening;const old=client;client=undefined;connected=false;await old?.end();},
 };
}
