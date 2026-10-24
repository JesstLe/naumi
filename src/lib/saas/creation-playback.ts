import 'server-only';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {settingsSecret} from '@/lib/settings-secret';
import {adminPasswordState,ADMIN_PW_HASH_SETTING,resolveUserEmail} from '@/lib/admin-auth';
import {getSetting} from "@/lib/settings/repository";
import {getPool} from "@/platform/db/pool";
import {supabaseEnabled} from '@/lib/auth-mode';
const common={record:z.string().max(1600),asset:z.string().max(200),expires:z.number().int()};
const grant=z.discriminatedUnion('mode',[
 z.object({...common,mode:z.literal('tenant'),email:z.string().min(1).max(254),tenantId:z.string().uuid()}),
 z.object({...common,mode:z.literal('platform'),kind:z.enum(['password','native','supabase']),email:z.string().nullable(),revision:z.string()})
]);
const sign=(value:string)=>createHmac('sha256',settingsSecret()).update(`creation-playback:${value}`).digest('hex');
const encode=(value:unknown)=>{const encoded=Buffer.from(JSON.stringify(value)).toString('base64url');return `${encoded}.${sign(encoded)}`;};
const adminRevision=async()=>createHmac('sha256',settingsSecret()).update(`playback-admin:${await getSetting(ADMIN_PW_HASH_SETTING)||'unset'}`).digest('hex');
/** Short-lived media-only capability; membership and object scope are still
 * revalidated on every range request. Never contains a supplier/user bearer. */
export function creationPlaybackToken(email:string,tenantId:string,record:string,asset:string,now=Date.now()){
 return encode({mode:'tenant',email,tenantId,record,asset,expires:now+10*60_000});
}
/** Only called after the ordinary full platform authorization and asset check. */
export async function platformPlaybackToken(request:Request,record:string,asset:string,now=Date.now()){
 const state=await adminPasswordState(request),email=await resolveUserEmail(request);
 return encode({mode:'platform',kind:state.authenticated?'password':supabaseEnabled?'supabase':'native',email,revision:await adminRevision(),record,asset,expires:now+10*60_000});
}
export async function platformPlaybackAllowed(g:Extract<z.infer<typeof grant>,{mode:'platform'}>){
 if(process.env.FLEET_PORTAL_ONLY==='1'||process.env.NAUMI_AUTH_LOGIN_ONLY==='1'||g.revision!==await adminRevision())return false;
 if(g.kind==='password')return true;
 if(await getSetting(ADMIN_PW_HASH_SETTING)||!g.email)return false;
 if(g.kind==='supabase')return supabaseEnabled&&g.email===(process.env.ADMIN_EMAIL||'').trim().toLowerCase();
 return !supabaseEnabled&&!!(await getPool().query("SELECT 1 FROM app_users WHERE email=$1 AND role='admin' AND NOT banned AND (account_expires_at IS NULL OR account_expires_at>now())",[g.email])).rowCount;
}
export function readCreationPlaybackToken(token:string,record:string,asset:string,tenantId:string|null,now=Date.now()){
 if(token.length>4096)return null;const [value,mac,...extra]=token.split('.');
 if(extra.length||!value||!/^[a-f0-9]{64}$/.test(mac||'')||!timingSafeEqual(Buffer.from(mac),Buffer.from(sign(value))))return null;
 try{const result=grant.safeParse(JSON.parse(Buffer.from(value,'base64url').toString()));if(!result.success)return null;const g=result.data;return g.record===record&&g.asset===asset&&(g.mode==='platform'||g.tenantId===tenantId)&&g.expires>now&&g.expires<=now+10*60_000?g:null;}catch{return null;}
}
