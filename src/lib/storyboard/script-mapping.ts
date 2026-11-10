import {z} from "zod";

export const scriptRangeSchema=z.strictObject({start:z.number().int().nonnegative(),end:z.number().int().positive()}).refine(value=>value.end>value.start,"原文范围无效");
export const cinematicMappingSchema=z.strictObject({
  ranges:z.array(scriptRangeSchema).max(100),supplement:z.string().max(2000).optional(),
  dialogue:z.array(scriptRangeSchema.safeExtend({speaker:z.string().trim().min(1).max(100)})).max(100).default([]),
}).superRefine((mapping,ctx)=>{if(!mapping.ranges.length&&!mapping.supplement?.trim())ctx.addIssue({code:"custom",message:"无原文的镜头需注明创作补充"});});
export type CinematicMapping=z.infer<typeof cinematicMappingSchema>;
export const storyboardSourceSchema=z.strictObject({nodeId:z.string().min(1).max(160),sha256:z.string().regex(/^[a-f0-9]{64}$/),mapping:cinematicMappingSchema});
export type StoryboardSource=z.infer<typeof storyboardSourceSchema>;
function splitsCharacter(text:string,index:number){return index>0&&index<text.length&&/[\uD800-\uDBFF]/.test(text[index-1])&&/[\uDC00-\uDFFF]/.test(text[index]);}

/** Original coverage is set union, independent of shot order. Dialogue has one owner. */
export function validateCinematicMappings(text:string,shots:readonly {mapping?:CinematicMapping}[],start=0,end=text.length){
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>text.length||end<=start)throw new Error("原稿制作范围无效");
  const bounds=(range:{start:number;end:number})=>{
    scriptRangeSchema.parse({start:range.start,end:range.end});
    if(range.start<start||range.end>end||splitsCharacter(text,range.start)||splitsCharacter(text,range.end))throw new Error("镜头原文超出制作范围或截断字符");
  };
  bounds({start,end});
  const mappings=shots.map(shot=>cinematicMappingSchema.parse(shot.mapping)),ranges=mappings.flatMap(mapping=>mapping.ranges).sort((a,b)=>a.start-b.start||a.end-b.end);
  let covered=start;
  for(const range of ranges){bounds(range);if(range.start>covered)throw new Error("镜头关联尚未覆盖全部要求制作的原稿");covered=Math.max(covered,range.end);}
  if(covered!==end)throw new Error("镜头关联尚未覆盖全部要求制作的原稿");
  const spoken: Array<{start:number;end:number}>=[];
  for(const mapping of mappings)for(const line of mapping.dialogue){
    bounds(line);
    if(!mapping.ranges.some(range=>range.start<=line.start&&range.end>=line.end))throw new Error("对白必须来自本镜关联的原文");
    if(spoken.some(prior=>line.start<prior.end&&line.end>prior.start))throw new Error("同一句对白只能分配给一个发声镜头");
    spoken.push(line);
  }
  return mappings;
}
export function cinematicShotPrompt(prompt:string,text:string,mapping:CinematicMapping){
  const context=mapping.ranges.map(range=>text.slice(range.start,range.end)).join("\n");
  const dialogue=mapping.dialogue.map(line=>`${line.speaker}：${text.slice(line.start,line.end)}`).join("\n");
  return [prompt,mapping.supplement?`[创作补充]\n${mapping.supplement}`:"",context?`[原文依据，仅作画面语境，不作为朗读台词]\n${context}`:"",
    dialogue?`[本镜唯一对白，按原文只说一次]\n${dialogue}`:"[本镜无新增对白；不要朗读原文依据]"] .filter(Boolean).join("\n\n");
}
