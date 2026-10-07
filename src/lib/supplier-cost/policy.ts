import { z } from "zod";
const integerMoney = z.string().regex(/^(0|[1-9]\d{0,20})$/);
export const fxSchema = z.strictObject({ currency: z.enum(["USD","CNY"]), rateMicros: integerMoney.refine(v=>BigInt(v)>BigInt(0)), basis: z.enum(["recharge","admin-rate","budget"]), evidence: z.string().trim().min(3).max(500), updatedAt: z.iso.datetime() });
export const policySchema = z.strictObject({
  intervalSeconds: z.number().int().min(60).max(86400).default(3600), keyQueriesPerMinute: z.number().int().min(1).max(60).default(1),
  lookbackDays: z.number().int().min(1).max(31).default(7), delaySeconds: z.number().int().min(120).max(86400).default(180),
  timezone: z.string().max(100).refine(v=>{try{new Intl.DateTimeFormat('en',{timeZone:v});return true}catch{return false}}).default("Asia/Shanghai"),
  amountToleranceMicros: integerMoney.default("10"), creditsToleranceMicros: integerMoney.default("100"),
  taskRecheckDays: z.number().int().min(1).max(31).default(7), taskRetrySeconds: z.number().int().min(60).max(86400).default(300),
});
export const costPolicy = (raw: unknown) => policySchema.parse(raw || {});
