import "server-only";
import type {Pool} from 'pg';
import {z} from 'zod';
import {checkReadClientSocket,withOwnedReportClient} from '@/platform/db/owned-read-client';
import {validTableConversion} from './image25-price-table';

const fxFields=z.object({
  rate_micros:z.string(),basis:z.enum(['recharge','admin-rate','budget']),
  evidence:z.string().min(1).max(300),updated_at:z.iso.datetime(),
  credits_per_cny_micros:z.unknown(),rounding:z.unknown(),
});

/** Price references use only the active immutable rate, never the model registry. */
export async function readImage25PublishedConversion(pool:Pool,signal:AbortSignal){
  const row=await withOwnedReportClient(pool,async tx=>{
    await tx.query("BEGIN READ ONLY");
    await tx.query("SET LOCAL statement_timeout='3s'; SET LOCAL lock_timeout='1s'"+checkReadClientSocket);
    const {rows}=await tx.query(`SELECT v.version,
      v.config #> '{defaultImagePreset,fx,rateMicros}' AS rate_micros,
      v.config #> '{defaultImagePreset,fx,basis}' AS basis,
      v.config #> '{defaultImagePreset,fx,evidence}' AS evidence,
      v.config #> '{defaultImagePreset,fx,updatedAt}' AS updated_at,
      v.config #> '{defaultImagePreset,creditsPerCnyMicros}' AS credits_per_cny_micros,
      v.config #> '{defaultImagePreset,rounding}' AS rounding
      FROM app_model_config_state s JOIN app_model_config_versions v ON v.version=s.active_version WHERE s.singleton=true`);
    await tx.query("COMMIT");
    return rows[0];
  },signal);
  if(!row)throw new Error("Published model conversion unavailable");
  const fx=fxFields.safeParse(row);
  if(!fx.success)return null;
  const {rate_micros,basis,evidence,updated_at,credits_per_cny_micros,rounding}=fx.data;
  return validTableConversion({rateMicros:rate_micros,basis,evidence,updatedAt:updated_at,modelVersion:Number(row.version),
    ...(typeof credits_per_cny_micros==='string'?{creditsPerCnyMicros:credits_per_cny_micros}:{}),
    ...(rounding==='ceil'||rounding==='floor'||rounding==='nearest'?{rounding}:{}),
  });
}
