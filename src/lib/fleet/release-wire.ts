import { z } from 'zod';
import { sign, verify, createPrivateKey, createPublicKey } from 'node:crypto';
import { releaseManifestSchema } from "./release-contracts";
export const releaseJobSchema=z.object({id:z.string().uuid(),instanceId:z.string().uuid(),leaseId:z.string().uuid(),expiresAt:z.number().int(),baseSource:z.string().regex(/^[a-f0-9]{40}$/),baseVersion:z.string().regex(/^[0-9]+$/),manifest:releaseManifestSchema}).strict();
export type ReleaseJob=z.infer<typeof releaseJobSchema>;
export const releaseResultSchema=z.object({planId:z.string().uuid(),leaseId:z.string().uuid(),state:z.enum(['accepted','failed','blocked']),code:z.enum(['OK','BASELINE_CHANGED','GATE_MISSING','LOCK_BUSY','CHECK_FAILED','ROLLBACK_FAILED','UNKNOWN']),source:z.string().regex(/^[a-f0-9]{40}$/).optional(),version:z.string().max(40).optional(),evidenceSha:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict();
export function signRelease(job:ReleaseJob,privateKey:string){const key=createPrivateKey(privateKey);if(key.asymmetricKeyType!=='ed25519')throw Error('FLEET_RELEASE_KEY_TYPE');const payload=JSON.stringify(releaseJobSchema.parse(job));return {payload,signature:sign(null,Buffer.from(payload),key).toString('hex')};}
export function verifyRelease(envelope:{payload:string;signature:string},publicKey:string,instanceId:string,now=Date.now()){
  if(typeof envelope.payload!=='string'||Buffer.byteLength(envelope.payload)>16000||!/^[a-f0-9]{128}$/.test(envelope.signature))throw Error('FLEET_RELEASE_SIGNATURE');
  const key=createPublicKey(publicKey);if(key.asymmetricKeyType!=='ed25519'||!verify(null,Buffer.from(envelope.payload),key,Buffer.from(envelope.signature,'hex')))throw Error('FLEET_RELEASE_SIGNATURE');
  const job=releaseJobSchema.parse(JSON.parse(envelope.payload));if(job.instanceId!==instanceId||job.expiresAt<now||job.expiresAt>now+360000)throw Error('FLEET_RELEASE_SCOPE');return job;
}
