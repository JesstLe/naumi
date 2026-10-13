import { imagegenUseCase } from "./catalog";
import type { ImagegenRequest,Intent } from "./types";
/** Preserve the original request verbatim; input order is also the transport order. */
export function compileImagegenPrompt(request:ImagegenRequest,intent:Intent,skillInstructions?:string):string {
  const sections=[`用户本次原始要求：\n${request.prompt}`];
  const workflow=imagegenUseCase(intent.useCase);
  if(workflow)sections.push(`用途：${workflow.label}\n${workflow.instructions}`);
  if(request.inputs.length)sections.push(`输入图角色（按实际顺序）：\n${request.inputs.filter(i=>i.role!=="mask").map((i,n)=>`${n+1}. ${i.role}`).join("\n")}`);
  if(request.inputs.some(i=>i.role==="mask"))sections.push("已提供用户蒙版（mask独立字段，对应第一张编辑目标）：透明区域为重绘区，未指定区域保持不变。");
  if(intent.background==="transparent")sections.push("输出必须包含真实透明像素；不要绘制棋盘格、白底或模拟透明效果。");
  else if(intent.background==="opaque")sections.push("保留本次明确要求的不透明背景，不执行透明抠图。");
  if(skillInstructions)sections.push(`已选择的技能说明：\n${skillInstructions}`);
  if(request.augment)sections.push("在不改变原要求、主体、品牌、文案和事实的前提下，补足必要的构图与视觉描述；不新增卖点、人物或故事。");
  if(intent.operation!=="generate")sections.push("仅修改明确要求的部分，保留其余结构、身份、文字与材质。");
  return sections.join("\n\n");
}
