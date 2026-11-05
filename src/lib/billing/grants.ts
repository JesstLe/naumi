import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import {administrativeGrantInput} from "./entitlements";
import {withTransaction as withBillingTransaction} from "@/platform/db/transaction";
import {BillingError} from "./types";

/** 新建积分批次(充值/赠送/迁移/后台)+ 写 +流水 + 同步余额。 */
export async function addCreditBatch(emailRaw:string,amount:number,opts:{source:"purchase"|"grant"|"migrate"|"admin";reason:string;expiresAt?:Date;orderId?:string|null;ledgerKind?:"purchase"|"grant";id?:string;actor?:string}):Promise<void>{
  await ensureSchema(); if(amount<=0)return;
  const {getBillingRuntime}=await import("@/lib/billing/runtime"), runtime=await getBillingRuntime(),snapshot=await runtime.config.current();
  await withBillingTransaction(getPool(),async tx=>{
    const input=await administrativeGrantInput(tx,{email:emailRaw.toLowerCase(),amount,reason:opts.reason,source:opts.source,actor:opts.actor??"system",id:opts.id,expiresAt:opts.expiresAt?.toISOString(),orderId:opts.orderId??undefined},snapshot);
    await runtime.service.grantTx(tx,input);
  });
}

// 后台手动调积分:正数 = 新建一个赠送批次(获取),有效期可按月设置(opts.months;
// 0 或负 = 永久,缺省 = 24 个月);负数 = FIFO 扣本金 + 记消耗流水(不动在途占位)。
export async function adjustUserCredits(emailRaw:string,delta:number,reason:string,opts:{months?:number;id?:string;actor?:string}={}):Promise<void>{
  await ensureSchema(); if(delta===0)return;
  if(opts.months!==undefined&&(!Number.isSafeInteger(opts.months)||opts.months>1200))throw new BillingError("INVALID_RESULT","积分有效期无效",400);
  const {getBillingRuntime}=await import("@/lib/billing/runtime"),runtime=await getBillingRuntime(),snapshot=await runtime.config.current();
  await withBillingTransaction(getPool(),async tx=>{
    const input=await administrativeGrantInput(tx,{email:emailRaw.toLowerCase(),amount:delta,reason,actor:opts.actor??"local-admin",id:opts.id,
      expiry:opts.months===undefined?undefined:opts.months<=0?{unit:"years",value:100}:{unit:"months",value:opts.months}},snapshot);
    await runtime.service.adjustTx(tx,input);
  });
}
