import "server-only";
import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,timingSafeEqual} from "node:crypto";
import {BlockList,isIP} from "node:net";
import {settingsSecret} from "../settings-secret";
import {mediaExtension} from "./media-formats";

const PURPOSE="naumi:video-reference-media:v1";
export const VIDEO_REFERENCE_MEDIA_PATH="/video-reference-media/";
export const VIDEO_REFERENCE_MEDIA_MAX_AGE_SECONDS=900;
export const VIDEO_REFERENCE_MEDIA_MAX_BYTES=250*1024*1024;
export type VideoReferenceMediaAsset={key:string;sha256:string;bytes:number|string;content_type:string;owner:string|null;public:boolean};
export type VideoReferenceMediaClaims={v:1;key:string;sha256:string;bytes:number;contentType:string;ownerHash:string;issuedAt:number;expiresAt:number};
type TokenOptions={secret?:string;now?:number;expiresInSeconds?:number};
type TokenSource={key:string;sha256:string;bytes:number;contentType:string;owner:string|null;public:boolean};
function encryptionKey(secret?:string){
  const value=secret??settingsSecret();
  if(value.trim().length<32)throw new Error("视频素材签名密钥未配置");
  return createHash("sha256").update(PURPOSE+"\0").update(value).digest();
}
function safeKey(value:unknown):value is string{
  return typeof value==="string"&&value.length>0&&Buffer.byteLength(value,"utf8")<=1000&&!/^[\/]/.test(value)&&!/[\\?#\u0000-\u001f\u007f]/.test(value)&&!value.split("/").some(p=>!p||p==="."||p==="..");
}
function validIdentity(value:{key?:unknown;sha256?:unknown;bytes?:unknown;contentType?:unknown}){
  return safeKey(value.key)&&typeof value.sha256==="string"&&/^[a-f0-9]{64}$/.test(value.sha256)&&Number.isSafeInteger(value.bytes)&&Number(value.bytes)>0&&Number(value.bytes)<=VIDEO_REFERENCE_MEDIA_MAX_BYTES&&
    typeof value.contentType==="string"&&value.contentType.length<=100&&/^(?:image|video|audio)\/[a-z0-9.+-]+$/i.test(value.contentType);
}
function ownerHash(owner:string|null,publicAsset:boolean,key:Buffer){
  return createHmac("sha256",key).update("owner\0").update(JSON.stringify([owner?.toLowerCase()??null,publicAsset])).digest("hex");
}
function nowSeconds(now?:number){const value=Math.floor((now??Date.now())/1000);if(!Number.isSafeInteger(value)||value<0)throw new Error("视频素材签名时间无效");return value;}
export function issueVideoReferenceToken(source:TokenSource,options:TokenOptions={}):string{
  if(!validIdentity(source)||typeof source.public!=="boolean"||source.owner!==null&&typeof source.owner!=="string")throw new Error("视频素材签名身份无效");
  const ttl=options.expiresInSeconds??VIDEO_REFERENCE_MEDIA_MAX_AGE_SECONDS;
  if(!Number.isInteger(ttl)||ttl<1||ttl>VIDEO_REFERENCE_MEDIA_MAX_AGE_SECONDS)throw new Error("视频素材签名有效期无效");
  const key=encryptionKey(options.secret),issuedAt=nowSeconds(options.now),iv=randomBytes(12);
  const claims:VideoReferenceMediaClaims={v:1,key:source.key,sha256:source.sha256,bytes:source.bytes,contentType:source.contentType,
    ownerHash:ownerHash(source.owner,source.public,key),issuedAt,expiresAt:issuedAt+ttl};
  const cipher=createCipheriv("aes-256-gcm",key,iv);cipher.setAAD(Buffer.from(PURPOSE));
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(claims),"utf8"),cipher.final()]);
  return ["vr1",iv.toString("base64url"),encrypted.toString("base64url"),cipher.getAuthTag().toString("base64url")].join(".");
}
export function verifyVideoReferenceToken(token:string,options:Pick<TokenOptions,"secret"|"now">={}):VideoReferenceMediaClaims|null{
  try{
    if(typeof token!=="string"||token.length>4096)return null;
    const parts=token.split(".");if(parts.length!==4||parts[0]!=="vr1"||parts.slice(1).some(p=>!p||!/^[A-Za-z0-9_-]+$/.test(p)))return null;
    const iv=Buffer.from(parts[1],"base64url"),encrypted=Buffer.from(parts[2],"base64url"),tag=Buffer.from(parts[3],"base64url");
    if(iv.length!==12||tag.length!==16||encrypted.length>3000)return null;
    const decipher=createDecipheriv("aes-256-gcm",encryptionKey(options.secret),iv);decipher.setAAD(Buffer.from(PURPOSE));decipher.setAuthTag(tag);
    const claims=JSON.parse(Buffer.concat([decipher.update(encrypted),decipher.final()]).toString("utf8")) as VideoReferenceMediaClaims;
    if(!claims||typeof claims!=="object"||claims.v!==1||!validIdentity(claims)||typeof claims.ownerHash!=="string"||!/^[a-f0-9]{64}$/.test(claims.ownerHash))return null;
    const now=nowSeconds(options.now);
    if(!Number.isSafeInteger(claims.issuedAt)||!Number.isSafeInteger(claims.expiresAt)||claims.issuedAt>now+30||claims.expiresAt<=now||claims.expiresAt<=claims.issuedAt||claims.expiresAt-claims.issuedAt>VIDEO_REFERENCE_MEDIA_MAX_AGE_SECONDS)return null;
    return claims;
  }catch{return null;}
}
/** A public filename may expose only the canonical extension of its signed MIME.
 * Bare tokens remain valid for already issued references. */
export function verifyVideoReferenceMediaPathSegment(segment:string,options:Pick<TokenOptions,"secret"|"now">&{verifyToken?:(token:string)=>VideoReferenceMediaClaims|null}={}):VideoReferenceMediaClaims|null{
  try{
    if(typeof segment!=="string"||segment.length>4112)return null;
    const match=/^(vr1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)(?:\.([a-z0-9]{1,10}))?$/.exec(segment);
    if(!match)return null;
    const claims=options.verifyToken?options.verifyToken(match[1]):verifyVideoReferenceToken(match[1],options);
    if(!claims||match[2]!==undefined&&match[2]!==mediaExtension(claims.contentType))return null;
    return claims;
  }catch{return null;}
}
export function matchesVideoReferenceMediaAsset(claims:VideoReferenceMediaClaims,asset:VideoReferenceMediaAsset,options:Pick<TokenOptions,"secret">={}){
  if(asset.key!==claims.key||asset.sha256!==claims.sha256||Number(asset.bytes)!==claims.bytes||asset.content_type!==claims.contentType||typeof asset.public!=="boolean")return false;
  const expected=Buffer.from(ownerHash(asset.owner,asset.public,encryptionKey(options.secret)),"hex"),actual=Buffer.from(claims.ownerHash,"hex");
  return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
const privateAddresses=new BlockList();
for(const [ip,prefix] of [["0.0.0.0",8],["10.0.0.0",8],["127.0.0.0",8],["169.254.0.0",16],["172.16.0.0",12],["192.168.0.0",16],["224.0.0.0",4],["240.0.0.0",4]] as const)privateAddresses.addSubnet(ip,prefix,"ipv4");
for(const [ip,prefix] of [["::",128],["::1",128],["fc00::",7],["fe80::",10]] as const)privateAddresses.addSubnet(ip,prefix,"ipv6");
export function createVideoReferenceMediaUrl(asset:TokenSource,options:TokenOptions&{baseUrl?:string}={}):string{
  let base:URL;
  try{base=new URL(options.baseUrl??process.env.VIDEO_REFERENCE_PUBLIC_BASE_URL??"");}catch{throw new Error("VIDEO_REFERENCE_PUBLIC_BASE_URL 未配置为外部媒体访问入口");}
  const hostname=base.hostname.replace(/^\[|\]$/g,"").toLowerCase(),family=isIP(hostname);
  if(!["http:","https:"].includes(base.protocol)||base.username||base.password||base.search||base.hash||base.pathname!=="/"||hostname==="localhost"||hostname.startsWith("::ffff:")||/\.(?:localhost|local|internal)$/.test(hostname)||family&&privateAddresses.check(hostname,family===4?"ipv4":"ipv6"))
    throw new Error("VIDEO_REFERENCE_PUBLIC_BASE_URL 必须是无认证信息的公网源站");
  const filename=issueVideoReferenceToken(asset,options)+"."+mediaExtension(asset.contentType);
  return new URL(VIDEO_REFERENCE_MEDIA_PATH+filename,base.origin).href;
}
