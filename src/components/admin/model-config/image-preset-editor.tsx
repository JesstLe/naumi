"use client";
import { useEffect, useState } from "react";
import type { ModelConfig } from "@/lib/model-config/types";
import type { ConfigSnapshot } from "@/lib/billing/types";
import { imagePresetSchema, initializeImagePreset, type ImagePreset } from "@/lib/model-config/image-preset";
import { decimalMicros, fixed } from "@/lib/supplier-cost/money";
import { Choice, TextField, Toggle, buttonClass, inputClass } from "./fields";
import { procurementCost,apiCostCredits } from "@/lib/billing/api-cost";
import { rounded } from "@/lib/billing/money";

function JsonField({label,value,onChange}:{label:string;value:unknown;onChange:(v:any)=>void}) {
  const [text,setText]=useState(JSON.stringify(value,null,2)),[error,setError]=useState("");
  const serialized=JSON.stringify(value);
  useEffect(()=>{setText(JSON.stringify(JSON.parse(serialized||"null"),null,2));setError("");},[serialized]);
  return <label className="block space-y-2 text-sm">{label}<textarea aria-label={label} className={`${inputClass} min-h-40 font-mono text-xs`} value={text} onChange={e=>{setText(e.target.value);try{onChange(JSON.parse(e.target.value));setError("");}catch{setError("JSON 尚未有效，未更新配置；请修正后再保存。");}}}/>{error&&<span role="alert" className="block text-xs text-red-700">{error}</span>}</label>;
}
export function ImagePresetEditor({config,billing,onChange}:{config:ModelConfig;billing?:ConfigSnapshot;onChange:(c:ModelConfig)=>void}) {
  const p=config.defaultImagePreset, [error,setError]=useState("");
  const update=(changes:Partial<ImagePreset>)=>{if(!p)return;const parsed=imagePresetSchema.safeParse({...p,...changes});if(!parsed.success){setError("字段格式无效："+parsed.error.issues.map(i=>i.path.join(".")).slice(0,4).join("、"));return;}setError("");onChange({...config,defaultImagePreset:parsed.data});};
  if(!p)return <section className="border border-c-border bg-white p-6"><h2 className="mb-4 font-semibold">APIMart 默认生图预设</h2><p className="mb-4 text-sm text-c-muted">先建立关闭的草稿；实际模型 ID、成本、汇率未核实前不启用。</p><button className={buttonClass} onClick={()=>onChange({...config,defaultImagePreset:initializeImagePreset(config,billing)})}>建立默认预设（倍率 1.5）</button></section>;
  const models=config.upstreamModels.filter(u=>u.modality==="image"&&config.providers.find(v=>v.id===u.providerId)?.protocol==="apimart-images");
  const target=models.find(u=>u.id===p.upstreamId), now=()=>new Date().toISOString();
  const evidence=p.evidence||{actualModel:target?.model||"",source:"",checkedAt:now(),confirmed:false};
  const money=(label:string,field:"authorizationCnyMicros"|"creditsPerCnyMicros")=><TextField label={label} value={fixed(p[field])} onChange={v=>{const m=decimalMicros(v);if(m!==null)update({[field]:m});else setError("请输入非负十进制数");}}/>;
  return <section data-testid="apimart-default-preset" className="space-y-6 border border-c-border bg-white p-5">
    <header className="flex flex-wrap justify-between gap-4 border-b border-c-border pb-4"><h2 className="font-semibold">APIMart 默认生图预设</h2><Toggle label="启用（应用后新请求生效）" value={p.enabled} onChange={enabled=>update({enabled})}/></header>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="grid gap-4 md:grid-cols-2"><Choice label="实际 APIMart 模型" value={p.upstreamId||""} options={[{value:"",label:"请选择已核验的当前实际模型"},...models.map(u=>({value:u.id,label:`${config.providers.find(v=>v.id===u.providerId)?.name} / ${u.model}`}))]} onChange={upstreamId=>update({upstreamId:upstreamId||undefined,evidence:undefined})}/><TextField label="售价倍率（1.5 = 加价 50%）" value={String(p.factorBps/10000)} onChange={v=>{const m=decimalMicros(v);if(m!==null && BigInt(m)%BigInt(100)===BigInt(0))update({factorBps:Number(BigInt(m)/BigInt(100))});}}/>
    <Choice label="上游质量参数" value={p.qualityParameter} options={[{value:"quality",label:"传 quality：low / medium"},{value:"omit",label:"上游不支持 quality，过滤参数"}]} onChange={v=>update({qualityParameter:v as ImagePreset["qualityParameter"]})}/><TextField label="上游 version（仅已核验 EXT 等需要）" value={p.versionParameter||""} onChange={v=>update({versionParameter:v||undefined})}/>
    {money("每张用户授权售价上限（人民币）","authorizationCnyMicros")}{money("每人民币兑换积分（沿用现有规则；0 表示待核实）","creditsPerCnyMicros")}
    <Choice label="最终积分舍入" value={p.rounding} options={[{value:"ceil",label:"向上取整"},{value:"nearest",label:"四舍五入"},{value:"floor",label:"向下取整"}]} onChange={v=>update({rounding:v as ImagePreset["rounding"]})}/><Toggle label="实际模型支持蒙版（须核实）" value={p.supportsMask} onChange={supportsMask=>update({supportsMask})}/></div>
    <p className="text-xs text-c-muted">low 按 low；其余质量档按 medium 执行与计价，前端选项保持原样。完整任务费用优先，不重复叠加 token。售价减 API 成本不代表净利润；倍率 1.5 的 API 毛利率约 33.33%。</p>
    <div className="grid gap-4 md:grid-cols-2"><JsonField label="公开模型 ID 与展示名称" value={p.aliases} onChange={aliases=>update({aliases})}/><JsonField label="接入本预设的历史默认模型 ID" value={p.defaultModelIds} onChange={defaultModelIds=>update({defaultModelIds})}/></div>
    <section className="space-y-4 border-y border-c-border py-4"><h3 className="text-sm font-semibold">实际模型核验</h3><p className="text-xs">实际模型：{target?.model||"待确认"}；供应商凭据只在服务端使用。</p><TextField label="核验来源（生产配置与官方能力文档）" value={evidence.source} onChange={source=>update({evidence:{...evidence,actualModel:target?.model||"",source,checkedAt:now()}})}/><Toggle label="已核实当前默认模型准确 ID 与参数能力" value={evidence.confirmed} onChange={confirmed=>update({evidence:{...evidence,actualModel:target?.model||"",confirmed,checkedAt:now()}})}/></section>
    <div className="grid gap-4 md:grid-cols-2"><JsonField label="原生支持分辨率（1K / 2K / 4K）" value={p.resolutions} onChange={resolutions=>update({resolutions})}/><JsonField label="原生支持比例" value={p.ratios} onChange={ratios=>update({ratios})}/><JsonField label="分辨率上游格式映射" value={p.resolutionMap} onChange={resolutionMap=>update({resolutionMap})}/><JsonField label="比例上游 size 映射" value={p.ratioMap} onChange={ratioMap=>update({ratioMap})}/><JsonField label="原生输出像素矩阵（规格:比例）" value={p.outputDimensions||{}} onChange={outputDimensions=>update({outputDimensions})}/><JsonField label="人民币折算快照（USD 汇率与凭据）" value={p.fx||null} onChange={fx=>update({fx:fx||undefined})}/></div>
    <p className="text-xs text-c-muted">未列为原生支持的分辨率／比例只传提示词约束，不保证原生像素。4K 档位以模型文档像素为准，不等同 4096 边长。</p>
    <JsonField label="有效规格完整 API 成本／用量估算（low、medium × 1K、2K、4K）" value={p.prices} onChange={prices=>update({prices})}/>
    <button className={buttonClass} disabled={!target?.procurement} onClick={()=>target?.procurement&&update({prices:(["low","medium"] as const).flatMap(quality=>(["1K","2K","4K"] as const).map(resolution=>({quality,resolution,procurement:structuredClone(target.procurement!)})))})}>从当前模型已有成本导入（随后核对各规格）</button>
    <section className="space-y-3 border-t border-c-border pt-4"><h3 className="text-sm font-semibold">报价预览（单张估算）</h3><div className="overflow-x-auto"><table className="w-full min-w-[540px] text-left text-xs"><thead><tr className="border-b border-c-border text-c-muted"><th className="py-2">有效规格</th><th>完整 API 成本</th><th>售价</th><th>售价减 API 成本</th><th>最终积分</th></tr></thead><tbody>{p.prices.map(v=>{
      const cost=procurementCost(v.procurement,v.estimatedUsage,1,p.fx?.rateMicros);
      const sale=cost?{numerator:cost.numerator*BigInt(p.factorBps),denominator:cost.denominator*BigInt(10000)}:null;
      const format=(value:{numerator:bigint;denominator:bigint}|null)=>value?`¥${fixed(rounded(value.numerator,value.denominator,"nearest").toString())}`:"待核账";
      let credits:string="待核实";if(cost&&BigInt(p.creditsPerCnyMicros)>BigInt(0))try{credits=String(apiCostCredits(cost.numerator,cost.denominator,{mode:"api-cost-plus",...p,estimateCnyMicros:"0"}));}catch{credits="超出范围";}
      return <tr key={`${v.quality}:${v.resolution}`} className="border-b border-c-border"><td className="py-3">{v.resolution} · {v.quality}</td><td>{format(cost)}</td><td>{format(sale)}</td><td>{format(cost?{numerator:cost.numerator*BigInt(p.factorBps-10000),denominator:cost.denominator*BigInt(10000)}:null)}</td><td>{credits}</td></tr>;
    })}</tbody></table></div><p className="text-xs text-c-muted">预览使用已维护的完整费用或用量估算。实际结算优先取单任务总费用；预算汇率仅代表折算估计。未决成本不代表确定利润。</p></section>
    <p className="text-xs text-c-muted">成本来源：单任务实际总费用优先，其次真实 usage × 冻结价格；缺失待核账。按张／按次包价不能同时填写 token 价。先保存草稿，再验证并应用；发布记录支持回滚，在途请求沿用原版本。</p>
  </section>;
}
