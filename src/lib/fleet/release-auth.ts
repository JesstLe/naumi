import 'server-only';
import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import {getPool} from "@/platform/db/pool";
import {rateLimit} from '@/lib/rate-limit';
import {clientIp} from '@/lib/ip';
import {ensureFleetSchema,limitedJson,FleetError} from './server';
import {digest} from './contracts';
import {releaseResultSchema} from './release-wire';
const schema=z.object({nonce:z.string().uuid(),timestamp:z.number().int(),result:releaseResultSchema.optional()}).strict();
export async function authenticateRelease(request:Request){
  if(process.env.FLEET_CONTROL_ENABLED!=='1')throw new FleetError('实例连接未启用',404);
  if(!(await rateLimit('fleet-release-ip:'+(clientIp(request)||'local'),120,60000)))throw new FleetError('连接过于频繁',429);
  const url=new URL(request.url);if(url.protocol!=='https:'&&request.headers.get('x-forwarded-proto')!=='https'&&!(process.env.FLEET_ISOLATED_TEST==='1'&&['127.0.0.1','localhost'].includes(url.hostname)))throw new FleetError('需要HTTPS');
  const instanceId=z.string().uuid().parse(request.headers.get('x-naumi-instance')),token=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];if(!token)throw new FleetError('实例认证失败',401);
  await ensureFleetSchema();const tx=await getPool().connect();
  try{await tx.query('BEGIN');const instance=(await tx.query('SELECT token_hash,enabled FROM app_fleet_instances WHERE id=$1 FOR UPDATE',[instanceId])).rows[0];if(!instance?.enabled||!timingSafeEqual(Buffer.from(digest(token)),Buffer.from(instance.token_hash)))throw new FleetError('实例认证失败',401);
    const body=schema.parse(await limitedJson(request,2000));if(Math.abs(Date.now()-body.timestamp)>120000)throw new FleetError('连接时间失效',409);
    if(!(await tx.query('INSERT INTO app_fleet_nonces(instance_id,nonce) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING nonce',[instanceId,body.nonce])).rowCount)throw new FleetError('重复连接请求',409);await tx.query("DELETE FROM app_fleet_nonces WHERE instance_id=$1 AND created_at<now()-interval '10 minutes'",[instanceId]);await tx.query('COMMIT');return {instanceId,tokenHash:digest(token),body};
  }catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
}
