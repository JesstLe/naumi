"use client";
import { IMAGEGEN_CAPABILITY_KEYS,IMAGEGEN_WIRE_FIELDS,IMAGEGEN_FIELDS_BY_CAPABILITY,imagegenMetadataSchema } from "@/lib/imagegen/capabilities";
import { specificationImagegen } from "@/lib/supplier-models/specifications";
import type { CapabilityKey,CapabilityEvidence } from "@/lib/imagegen/types";
const names:Record<CapabilityKey,string>={edit:"参考图编辑",mask:"用户蒙版",transparent:"真实透明背景",inputFidelity:"输入保真度",outputFormat:"原生输出格式",outputCompression:"原生压缩参数",moderation:"上游审核参数",pixelSize:"原生像素尺寸"};
export function ImagegenMetadataEditor({parameters,onChange,disabled}:{parameters:Record<string,unknown>|null;onChange:(value:Record<string,unknown>)=>void;disabled:boolean}){
  const parsed=imagegenMetadataSchema.safeParse(parameters?.imagegen);
  const manual=parsed.success?parsed.data:{capabilities:{},wireMap:{}};
  const supplier=specificationImagegen(parameters?.supplierSpecification);
  const change=(key:CapabilityKey,patch:Partial<CapabilityEvidence>|null,field?:string)=>{
    if(!parameters)return;
    const next=structuredClone(manual),old=next.capabilities[key]??{state:"unknown" as const,source:"",checkedAt:""};
    if(patch===null){delete next.capabilities[key];delete next.wireMap[key];}
    else if(Object.keys(patch).length||next.capabilities[key])next.capabilities[key]={...old,...patch};
    if(field!==undefined){if(field)next.wireMap[key]=field as typeof IMAGEGEN_WIRE_FIELDS[number];else delete next.wireMap[key];}
    onChange({...parameters,imagegen:next});
  };
  return <fieldset disabled={disabled||!parameters}><legend>图像高级能力与参数依据</legend>
    <p>人工维护优先；没有人工记录时使用有来源的供应商资料。保存此库不会改变既有执行映射，发布配置时固定引用。</p>
    {IMAGEGEN_CAPABILITY_KEYS.map(key=>{const own=manual.capabilities[key],fallback=supplier.capabilities[key];return <fieldset key={key}><legend>{names[key]}</legend>
      <label>支持情况<select aria-label={`${names[key]}支持情况`} value={own?.state??"inherit"} onChange={e=>change(key,e.target.value==="inherit"?null:{state:e.target.value as CapabilityEvidence["state"]})}>
        <option value="inherit">使用供应商资料兜底{fallback?`（${fallback.state==="supported"?"文档支持":"未知"}）`:"（未知）"}</option>
        <option value="unknown">人工标记未知</option><option value="unsupported">明确不支持</option><option value="supported">人工确认支持</option>
      </select></label>
      {own&&<><label>依据<input aria-label={`${names[key]}依据`} value={own.source} maxLength={1000} onChange={e=>change(key,{source:e.target.value})}/></label>
      <label>核对日期<input type="date" aria-label={`${names[key]}核对日期`} value={own.checkedAt} onChange={e=>change(key,{checkedAt:e.target.value})}/></label>
      <label>合法实际值（逗号分隔；只填写已核实值）<input aria-label={`${names[key]}合法值`} value={own.values?.join(", ")??""} onChange={e=>change(key,{values:e.target.value?e.target.value.split(/[,，]/).map(v=>v.trim()).filter(Boolean):undefined})}/></label></>}
      {!["edit","mask"].includes(key)&&<label>原生参数名<select aria-label={`${names[key]}参数名`} value={manual.wireMap[key]??""} onChange={e=>change(key,{},e.target.value)}>
        <option value="">未维护{supplier.wireMap[key]?`；文档建议 ${supplier.wireMap[key]}`:"，不猜测"}</option>
        {IMAGEGEN_FIELDS_BY_CAPABILITY[key].map(field=><option key={field} value={field}>{field==="omit"?"明确不发送":field}</option>)}
      </select></label>}
      <small>{own?"人工设置":fallback?`来源兜底：${fallback.source}；${fallback.checkedAt}`:"供应商没有提供已确认资料，状态未知"}</small>
    </fieldset>;})}
  </fieldset>;
}
