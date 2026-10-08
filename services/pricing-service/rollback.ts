import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PricingStore } from "./store";
const dir=dirname(fileURLToPath(import.meta.url));
const target=Number(process.argv[2]);
if (!Number.isSafeInteger(target)||target<1) throw Error("用法：tsx rollback.ts 目标版本 [SQLite路径]");
const path=process.argv[3] ? resolve(process.argv[3]) : resolve(process.env.PRICING_DATA_DIR || resolve(dir,".data"),"pricing.sqlite");
const store=new PricingStore(path,resolve(dir,"catalog.json"));
try { const before=store.snapshot(),restored=store.rollback(target,before.version,"CLI restore requested version","local-admin");console.log(JSON.stringify({result:"ROLLBACK_PASS",from:before.version,to:restored.version,target,multiplier:restored.config.multiplier,productionApplied:false})); } finally { store.close(); }
