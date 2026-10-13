import {metadataResolutionSchema} from "./resolution-defaults";
import {metadataQualitySchema} from "./quality-defaults";
import {z} from "zod";
import {videoDefinitionSchema} from "../video/capability-schema";
export const CAPABILITY_STATES=["unknown","configured","documented","verified"] as const;
export const PRICE_BASES=["request","image","token","second","frame"] as const;
const text=z.string().trim().max(1000),amount=z.string().regex(/^(0|[1-9][0-9]{0,29})$/).nullable();
const list=z.array(z.string().trim().min(1).max(100)).max(50).nullable();
const tri=z.boolean().nullable();
const date=z.union([z.literal(""),z.iso.date()]);
const sourceUrl=z.string().max(1500).refine(v=>{if(!v)return true;try{return ["http:","https:"].includes(new URL(v).protocol);}catch{return false;}},"请填写有效文档URL");
function hasCredentialFields(v:unknown):boolean{return !!v && typeof v==="object" && Object.entries(v).some(([k,x])=>/^(api_?key|authorization|password|secret|credential(_?ref)?|access_?token|token)$/i.test(k) || hasCredentialFields(x));}
const parameterMetadata=z.record(z.string().min(1).max(100),z.json()).refine(v=>JSON.stringify(v).length<=50000,"参数元信息过大").refine(v=>!hasCredentialFields(v),"参数元信息不保存密钥或认证字段");
export const supplierCapabilitiesSchema=z.strictObject({
  generate:tri,edit:tri,mask:tri,vision:tri,streaming:tri,
  qualities:list,resolutions:list,ratios:list,
  maxReferences:z.number().int().min(0).max(100000).nullable(),
  contextTokens:z.number().int().min(1).max(2147483647).nullable(),
});
export const supplierPriceSchema=z.strictObject({
  id:z.uuid(),quality:z.string().trim().max(100),resolution:z.string().trim().max(100),
  basis:z.enum(PRICE_BASES),currency:z.enum(["CNY","USD"]),
  amountMicros:amount,inputMicrosPerMillion:amount,outputMicrosPerMillion:amount,
  cachedInputMicrosPerMillion:amount,imageInputMicrosPerMillion:amount,
  source:text,sourceUrl:sourceUrl.default(""),
  checkedAt:date,status:z.enum(["unknown","estimate","documented","verified"]),
}).superRefine((p,ctx)=>{
 if(p.basis==="token" && p.amountMicros!==null)ctx.addIssue({code:"custom",message:"按token计费请填写输入输出价格，不叠加按次单价"});
 if(p.basis!=="token" && [p.inputMicrosPerMillion,p.outputMicrosPerMillion,p.cachedInputMicrosPerMillion,p.imageInputMicrosPerMillion].some(v=>v!==null))ctx.addIssue({code:"custom",message:"按次/张/秒/帧计费请使用单价，token价格另建一行"});
 if(p.status!=="unknown" && (!p.source || !p.checkedAt || p.basis==="token" && (p.inputMicrosPerMillion===null || p.outputMicrosPerMillion===null) || p.basis!=="token" && p.amountMicros===null))ctx.addIssue({code:"custom",message:"声明价格来源时需填写完整价格、来源和核对日期；未知不能按零价保存"});
});
export const supplierMetadataSchema=z.strictObject({
  family:z.string().trim().max(120),brand:z.string().trim().max(120),
  modality:z.enum(["unknown","image","text","video","audio","embedding","other"]),
  notes:text,capabilityState:z.enum(CAPABILITY_STATES),capabilities:supplierCapabilitiesSchema,
  parameterMetadata:parameterMetadata.default({}),
  capabilitySource:text,capabilityUrl:sourceUrl,
  checkedAt:date,
  prices:z.array(supplierPriceSchema).max(50),
}).superRefine((m,ctx)=>{
 if(m.parameterMetadata.video!==undefined&&!videoDefinitionSchema.safeParse(m.parameterMetadata.video).success)ctx.addIssue({code:"custom",message:"视频能力资料格式无效"});
 if(m.parameterMetadata.resolutionDefaults!==undefined && !metadataResolutionSchema.safeParse(m.parameterMetadata.resolutionDefaults).success)ctx.addIssue({code:"custom",message:"分辨率默认映射格式无效，请填写参数名与合法实际值"});
 if(m.parameterMetadata.qualityDefaults!==undefined && !metadataQualitySchema.safeParse(m.parameterMetadata.qualityDefaults).success)ctx.addIssue({code:"custom",message:"quality 默认映射格式无效，请逐档填写合法参数值"});
 if(["documented","verified"].includes(m.capabilityState)&&(!m.capabilitySource || !m.checkedAt))ctx.addIssue({code:"custom",message:"文档声明或已验证状态需要来源和核对日期"});
 if(new Set(m.prices.map(p=>p.id)).size!==m.prices.length)ctx.addIssue({code:"custom",message:"价格行编号重复"});
});
export type SupplierMetadata=z.infer<typeof supplierMetadataSchema>;
export type SupplierPrice=z.infer<typeof supplierPriceSchema>;
export type SupplierModelRecord=SupplierMetadata & {id:string;providerId:string;providerName:string;modelId:string;label:string;catalogOwner:string;revision:number;lastSeenAt:string;updatedAt:string};
export function unknownSupplierMetadata():SupplierMetadata{return {family:"",brand:"",modality:"unknown",notes:"",capabilityState:"unknown",parameterMetadata:{},capabilities:{generate:null,edit:null,mask:null,vision:null,streaming:null,qualities:null,resolutions:null,ratios:null,maxReferences:null,contextTokens:null},capabilitySource:"",capabilityUrl:"",checkedAt:"",prices:[]};}
