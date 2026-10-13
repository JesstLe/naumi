import { numberVideoInputs, type OrderedInput } from "./references";

export function compileVideoPrompt(prompt:string,inputs:readonly OrderedInput[],cameraPrompt="") {
  const numbered=numberVideoInputs(inputs),bindings:Record<string,OrderedInput>={};
  for(const input of numbered.all)bindings[`ref ${input.index}`]=input;
  for(const [kind,label] of [["image","图片"],["video","视频"],["audio","音频"]] as const){
    for(const input of numbered.byKind[kind])bindings[`${label}${input.index}`]=input;
  }
  for(const match of prompt.matchAll(/\{\{\s*ref\s+(\d+)\s*\}\}/g))if(!bindings[`ref ${Number(match[1])}`])throw new Error(`引用标记不存在：ref ${match[1]}`);
  for(const match of prompt.matchAll(/(?:图片|视频|音频)([1-9]\d*)/g))if(!bindings[match[0]])throw new Error(`引用标记不存在：${match[0]}`);
  const labels={text:"参考文字",image:"图片",video:"视频",audio:"音频"};
  const compiled=prompt.replace(/\{\{\s*ref\s+(\d+)\s*\}\}/g,(_match,index)=>{
    const input=numbered.all[Number(index)-1];return `${labels[input.kind]}${input.kindIndex}`;
  });
  const text=numbered.byKind.text.filter(input=>input.role==="context").map(input=>`参考文字${input.kindIndex}：\n${input.value}`);
  return {originalPrompt:prompt,prompt:[compiled,...text,cameraPrompt].filter(v=>v.trim()).join("\n\n"),bindings,
    authorNodeIds:numbered.byKind.text.filter(input=>input.role==="author").map(input=>input.nodeId)};
}
