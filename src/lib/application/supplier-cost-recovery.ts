import "server-only";
import {dbEnabled} from "@/platform/db/pool";
import {withBackgroundActivity} from "../release-runtime/background-activity";
import {supplierLedger} from "../supplier-cost/runtime";
import type {createSupplierLedger} from "../supplier-cost/repository";
import {scanSupplierCostJobs} from "../supplier-cost/scan";
import {recoverBillingTaskProjections} from "./billing-task-recovery";
export async function runSupplierCostWorker(ledger:ReturnType<typeof createSupplierLedger>=supplierLedger(),options:{fetcher?:typeof fetch;batch?:number}={}){
 return withBackgroundActivity("supplier-scan","supplier-cost-scan","claim",async()=>{const result=await scanSupplierCostJobs(ledger,options);await recoverBillingTaskProjections(ledger.pool);return result;},()=>({processed:0,claimed:0}));
}
export async function scanSupplierCostsOnce(){if(!dbEnabled)return 0;try{return(await runSupplierCostWorker()).processed;}catch{return 0;}}
