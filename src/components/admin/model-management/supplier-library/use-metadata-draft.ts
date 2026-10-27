"use client";
import {useRef,useState} from "react";
import {browserRandomUUID} from "@/lib/browser-crypto";
import type {SupplierMetadata,SupplierModelRecord,SupplierPrice} from "@/lib/supplier-models/types";
import {metadataQualityDefaults,metadataQualitySchema} from "@/lib/supplier-models/quality-defaults";
import {metadataResolutionSchema} from "@/lib/supplier-models/resolution-defaults";
import {moneyFields} from "./contracts";
import {metadataDraft,metadataPayload,priceTexts} from "./draft-values";
export function useMetadataDraft(model:SupplierModelRecord,onSave:(metadata:SupplierMetadata,id:string)=>Promise<void>){
 const operation=useRef<{body:string;id:string}|undefined>(undefined),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [draft,setDraft]=useState<SupplierMetadata>(()=>metadataDraft(model));
 const [texts,setTexts]=useState<Record<string,Record<string,string>>>(()=>priceTexts(model.prices));
 const [parameterText,setParameterText]=useState(JSON.stringify(Object.fromEntries(Object.entries(model.parameterMetadata).filter(([k])=>k!=="upstreamImport")),null,2));
 const imported=model.parameterMetadata.upstreamImport as {accessibleWithCurrentKey?:boolean|null;observedAt?:string;publicUrl?:string;publicModel?:unknown}|undefined;
 const change=<K extends keyof SupplierMetadata>(key:K,value:SupplierMetadata[K])=>setDraft(old=>({...old,[key]:value}));
 const editPrice=(id:string,fields:Partial<SupplierPrice>)=>change("prices",draft.prices.map(p=>p.id===id?{...p,...fields}:p));
 const addPrice=()=>{const id=browserRandomUUID(),p:SupplierPrice={id,quality:"",resolution:"",basis:"request",currency:"USD",amountMicros:null,inputMicrosPerMillion:null,outputMicrosPerMillion:null,cachedInputMicrosPerMillion:null,imageInputMicrosPerMillion:null,source:"",sourceUrl:"",checkedAt:"",status:"unknown"};change("prices",[...draft.prices,p]);setTexts(old=>({...old,[id]:Object.fromEntries(moneyFields.map(k=>[k,""]))}));};
 let parameterObject:Record<string,unknown>|null=null;try{const parsed=JSON.parse(parameterText || "{}");if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed))parameterObject=parsed;}catch{}
 const parsedDefaults=metadataQualitySchema.safeParse(parameterObject?.qualityDefaults);
 const editQualityDefault=(mode:string,id?:string,value?:string)=>{if(!parameterObject || Array.isArray(parameterObject)){setError("请先修正参数元信息 JSON");return;}const next={...parameterObject};if(mode==="auto")delete next.qualityDefaults;else if(mode==="omit")next.qualityDefaults={mode:"omit"};else{const fallback=metadataQualityDefaults({...model,...draft,parameterMetadata:parameterObject as SupplierMetadata["parameterMetadata"]}),values={...(parsedDefaults.success&&parsedDefaults.data.mode==="map"?parsedDefaults.data.values:fallback.values)};if(id){if(value?.trim())values[id as keyof typeof values]=value;else delete values[id as keyof typeof values];}next.qualityDefaults={mode:"map",values};}setParameterText(JSON.stringify(next,null,2));};
 const resolutionDefaults=metadataResolutionSchema.safeParse(parameterObject?.resolutionDefaults);
 const editResolutionDefault=(mode:string,field?:string,id?:string,value?:string,ratioField?:string)=>{if(!parameterObject)return;const next=structuredClone(parameterObject);if(mode==="auto")delete next.resolutionDefaults;else {const old=resolutionDefaults.success?resolutionDefaults.data:undefined;const values:Record<string,string>={...old?.values};if(id){if(value?.trim())values[id]=value;else delete values[id];}const mappedField=field||old?.field||"size";const mappedRatio=ratioField!==undefined?ratioField:field&&field!==old?.field?undefined:old?.ratioField;next.resolutionDefaults={mode,field:mappedField,...(mappedRatio?{ratioField:mappedRatio}:{}),values};}setParameterText(JSON.stringify(next,null,2));};
 const submit=async()=>{setError("");setBusy(true);try{
  const metadata=metadataPayload(model,draft,parameterText,texts);
  const body=JSON.stringify(metadata);if(!operation.current || operation.current.body!==body)operation.current={body,id:browserRandomUUID()};await onSave(metadata,operation.current.id);
 }catch(e){setError(e instanceof Error?e.message:"保存失败");}finally{setBusy(false);}};
 return {draft,busy,error,setError,change,editPrice,addPrice,texts,setTexts,parameterText,setParameterText,parameterObject,parsedDefaults,resolutionDefaults,editResolutionDefault,editQualityDefault,submit,imported};
}
export type MetadataDraft=ReturnType<typeof useMetadataDraft>;
