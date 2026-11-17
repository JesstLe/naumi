import "server-only";
import {createHash} from "node:crypto";
import {createReadStream} from "node:fs";
import {stat} from "node:fs/promises";
import path from "node:path";
import {safeStorageKey as safeKey} from "./adapter";

/** Verifies bytes only; callers still authorize the canonical media. */
type MirrorIdentity={bytes:number|string;sha256:string};
export function createStoredMirrorVerifier(MEDIA_DIR:string,deferredNasDelivery:boolean){
const verifiedMirrors=new Map<string,string>();
return async function hasVerifiedStoredMirror(key:string,asset:MirrorIdentity|null|undefined,signal?:AbortSignal){
  signal?.throwIfAborted();
  if(!deferredNasDelivery||!asset)return false;
  const file=path.join(MEDIA_DIR,safeKey(key));
  try{
    const info=await stat(file);signal?.throwIfAborted();if(!info.isFile()||info.size!==Number(asset.bytes))return false;
    const version=`${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}:${asset.sha256}`;
    if(verifiedMirrors.get(file)===version)return true;
    const hash=createHash('sha256');for await(const chunk of createReadStream(file,{signal}))hash.update(chunk);
    const after=await stat(file);
    signal?.throwIfAborted();
    if(after.ino!==info.ino||after.mtimeMs!==info.mtimeMs||after.ctimeMs!==info.ctimeMs||after.size!==info.size||hash.digest('hex')!==asset.sha256)return false;
    if(verifiedMirrors.size>=1024)verifiedMirrors.delete(verifiedMirrors.keys().next().value!);
    verifiedMirrors.set(file,version);return true;
  }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}
}

}
