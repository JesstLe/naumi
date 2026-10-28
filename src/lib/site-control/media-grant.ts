import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { settingsSecret } from '@/lib/settings-secret';

const schema = z.object({ purpose:z.literal('fleet-enterprise-media'), enterpriseId:z.string().uuid(), instanceId:z.string().uuid(), commandId:z.string().uuid(), creationId:z.string().regex(/^cr-[a-f0-9-]{36}$/i), assetId:z.string().min(1).max(200), original:z.boolean(), expiresAt:z.number().int() }).strict();
export type SiteMediaGrant = z.infer<typeof schema>;
function mac(value:string) { return createHmac('sha256',settingsSecret()).update('fleet-media:'+value).digest(); }
export function siteMediaLink(input: Omit<SiteMediaGrant,'purpose'|'expiresAt'>) {
  const origin = new URL(process.env.NAUMI_FLEET_MEDIA_ORIGIN || '');
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash) throw new Error('FLEET_MEDIA_ORIGIN_INVALID');
  const grant = schema.parse({...input,purpose:'fleet-enterprise-media',expiresAt:Date.now()+120000});
  const payload = Buffer.from(JSON.stringify(grant)).toString('base64url');
  return origin.origin+'/api/fleet/media?grant='+payload+'.'+mac(payload).toString('hex');
}
export function readSiteMediaGrant(value:string):SiteMediaGrant|null {
  try {
    if(value.length>1800)return null;
    const parts=value.split('.');if(parts.length!==2||!/^[A-Za-z0-9_-]+$/.test(parts[0])||!/^[a-f0-9]{64}$/.test(parts[1]))return null;
    if(!timingSafeEqual(mac(parts[0]),Buffer.from(parts[1],'hex')))return null;
    const grant=schema.parse(JSON.parse(Buffer.from(parts[0],'base64url').toString()));
    return grant.expiresAt>Date.now()&&grant.expiresAt<=Date.now()+120000?grant:null;
  } catch { return null; }
}
