import {createHash,createPublicKey,verify,type KeyObject} from 'node:crypto';
import {z} from 'zod';
import {WorkflowError,type Command} from './contracts';
import type {VerifySource} from './store';
const stable=(v:unknown):string=>Array.isArray(v)?'['+v.map(stable).join(',')+']':v&&typeof v==='object'?'{'+Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>JSON.stringify(k)+':'+stable(x)).join(',')+'}':JSON.stringify(v);
export const sourceCommandDigest=(command:Command)=>createHash('sha256').update(stable(command)).digest('hex');
const claims=z.strictObject({iss:z.literal('naumi-workflow-bff'),aud:z.literal('enterprise-workflow-source-evidence'),sourceInstance:z.string(),sourceEnterprise:z.string().uuid(),sourceViewer:z.string(),sourceSubject:z.string().min(1).max(254),teamId:z.string().uuid(),digest:z.string().regex(/^[a-f0-9]{64}$/),iat:z.number().int(),exp:z.number().int()});
/** Separate evidence audience; an identity token alone never validates a browser-supplied reference. */
export function createSourceEvidenceVerifier(publicKeys:Record<string,string|KeyObject>,now=()=>Date.now()):VerifySource{
 const keys=new Map(Object.entries(publicKeys).map(([id,key])=>{const k=typeof key==='string'?createPublicKey(key):key;if(k.type!=='public'||k.asymmetricKeyType!=='ed25519')throw Error('ED25519_PUBLIC_KEY_REQUIRED');return [id,k];}));
 return async(proof,actor,command)=>{try{
  if(proof.length>8192||command.action.type!=='link-source'||!actor.sourceBinding)throw Error();const parts=proof.split('.');if(parts.length!==3||parts.some(p=>!/^[A-Za-z0-9_-]+$/.test(p)))throw Error();
  const h=z.strictObject({alg:z.literal('EdDSA'),typ:z.literal('JWT'),kid:z.string()}).parse(JSON.parse(Buffer.from(parts[0],'base64url').toString()));const key=keys.get(h.kid);if(!key||!verify(null,Buffer.from(parts[0]+'.'+parts[1]),key,Buffer.from(parts[2],'base64url')))throw Error();
  const c=claims.parse(JSON.parse(Buffer.from(parts[1],'base64url').toString())),s=actor.sourceBinding,at=Math.floor(now()/1000),ref=command.action.ref;
  if(c.iat>at||c.exp<=at||c.exp<=c.iat||c.exp-c.iat>45||c.teamId!==actor.teamId||c.sourceInstance!==s.sourceInstance||c.sourceEnterprise!==s.sourceEnterprise||c.sourceViewer!==s.sourceSubject||ref.instanceId!==s.sourceInstance||ref.enterpriseId!==s.sourceEnterprise||c.digest!==sourceCommandDigest(command))throw Error();
  return {sourceSubject:c.sourceSubject};
 }catch{throw new WorkflowError(403,'INVALID_SOURCE_EVIDENCE');}};
}
