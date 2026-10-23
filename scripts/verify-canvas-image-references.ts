import assert from "node:assert/strict";
import { resolveCanvasImageReferences, changeImageReferenceRole, imageReferenceManifest, insertImageReference, inheritableImagePrompt } from "../src/lib/canvas/image-references";
import { compileReferenceInstructions, referenceManifestError } from "../src/lib/imagegen/reference-labels";
import { ImageNodeDraftStore, imageDraftKey, imageDraftScope } from "../src/lib/canvas/image-node-drafts";
import { imagegenRequestSchema } from "../src/lib/imagegen/schema";
import { compileImagegenPrompt } from "../src/lib/imagegen/prompt";
import { resolveImagegenIntent } from "../src/lib/imagegen/intent";
import { frameCandidates, automaticFrameRatio } from "../src/lib/imagegen/frame-ratio";

const node = (id: string, title = id) => ({ key: `node:${id}`, sourceNodeId: id, title, url: `/media/${id}.png` });
const a = node("product", "产品原图"), b = node("scene", "场景图"), c = node("style", "风格图");
const initial = resolveCanvasImageReferences([a, b]);
assert.deepEqual(initial.references.map(ref => [ref.number, ref.role]), [[1, "edit-target"], [2, "reference"]]);
const reordered = resolveCanvasImageReferences([b, a], initial.bindings);
assert.deepEqual(reordered.references, initial.references, "reordering graph links must not renumber references");
const removed = resolveCanvasImageReferences([a, c], initial.bindings);
assert.deepEqual(removed.references.map(ref => ref.number), [1, 3]);
assert.match(referenceManifestError("保留【图1】，参考【图2】", imageReferenceManifest(removed.references))!, /图2已移除/);
assert.equal(referenceManifestError("保留【图1】，参考【图3】", imageReferenceManifest(removed.references)), null);
const changed = resolveCanvasImageReferences([a, b, c], changeImageReferenceRole(removed.bindings, b.key, "edit-target"));
assert.deepEqual(changed.references.map(ref => [ref.number, ref.role]), [[2, "edit-target"], [1, "reference"], [3, "reference"]]);
const roles = changeImageReferenceRole(changeImageReferenceRole(changed.bindings, a.key, "insert"), c.key, "style");
const final = resolveCanvasImageReferences([a, b, c], roles);
const manifest = imageReferenceManifest(final.references);
const original = "把【图1】的产品放到【图2】，采用【图3】的光线";
const compiled = compileReferenceInstructions(original, manifest);
assert.match(compiled, /把第2张输入图（图1）的产品放到第1张输入图（图2）/);
assert.match(compiled, /第3张输入图 = 图3；用途：风格参考/);
assert.match(compiled, /用户明确指定某张图的使用方式时，以本次要求为准/);
assert.match(referenceManifestError("继续编辑", Array.from({length:17},(_,index)=>({number:index+1,title:"图片",role:index?"reference":"edit-target"})))!, /最多可引用16张/);
assert.match(referenceManifestError(original, imageReferenceManifest(resolveCanvasImageReferences([a,c], roles).references))!, /图2/);
assert.equal(referenceManifestError("参考图生成", imageReferenceManifest(resolveCanvasImageReferences([a,c], roles).references)), null);
assert.deepEqual(insertImageReference("使用@场景做背景", 2, 5), { prompt: "使用【图2】做背景", caret: 6 });
assert.equal(inheritableImagePrompt("保留【图1】，参考【图2】"), "", "new-node and empty pending prompts must not reuse another task's labels");
assert.equal(inheritableImagePrompt(" 保留产品文字 "), "保留产品文字");
assert.equal(inheritableImagePrompt(undefined), "");

const memory = new Map<string,string>();
const storage = { getItem: (key:string) => memory.get(key)||null, setItem: (key:string,value:string) => {memory.set(key,value);} };
const key=imageDraftKey(imageDraftScope("owner",null,"project"),"node-a");
const store=new ImageNodeDraftStore(()=>storage);store.write(key,{prompt:original,referenceBindings:final.bindings});
assert.deepEqual(new ImageNodeDraftStore(()=>storage).read(key),{prompt:original,referenceBindings:final.bindings});
assert.deepEqual(store.read(imageDraftKey(imageDraftScope("other",null,"project"),"node-a")),{});
assert.deepEqual(store.read(imageDraftKey(imageDraftScope("owner",null,"project2"),"node-a")),{});
assert.deepEqual(store.read(imageDraftKey(imageDraftScope("owner",null,"project"),"node-b")),{});

const base = {version:1,operationId:"db30247a-2d89-4e63-b1e5-7e72bdcfd87a",entry:"canvas",mode:"edit",prompt:original,
  inputs:manifest.map(({role,...reference},index)=>({artworkId:`asset-${index}`,role,reference}))};
const request=imagegenRequestSchema.parse(base);
assert.equal(request.inputs[0].reference!.sourceNodeId,"scene");
assert.equal(compileImagegenPrompt(request,resolveImagegenIntent(request)).includes(compiled),true);
assert.equal(request.prompt,original,"compile must preserve the frozen user prompt");
assert.equal(frameCandidates(request.inputs).every(ref=>ref.role!=="style"&&ref.role!=="insert"),true);
for(const inputs of [request.inputs.slice(1),[request.inputs[1],request.inputs[0]],request.inputs.map((i,n)=>({...i,reference:{...i.reference!,number:n===2?1:i.reference!.number}})),request.inputs.map((i,n)=>n===1?{...i,reference:undefined}:i)]) {
  assert.equal(imagegenRequestSchema.safeParse({...base,inputs}).success,false);
}
assert.equal(imagegenRequestSchema.safeParse({...base,prompt:"参考【图9】"}).success,false);
const legacy=imagegenRequestSchema.parse({...base,prompt:"保留产品文字",inputs:[{artworkId:"old-target",role:"edit-target"},{artworkId:"old-ref",role:"reference"}]});
assert.match(compileImagegenPrompt(legacy,resolveImagegenIntent(legacy)),/用户本次原始要求/);
assert.equal(imagegenRequestSchema.safeParse({...base,mode:"generate",inputs:[],prompt:"一只鹈鹕"}).success,true);
const single = resolveCanvasImageReferences([a]);
for (const role of ["reference", "insert", "style"] as const) {
  const only = resolveCanvasImageReferences([a], changeImageReferenceRole(single.bindings, a.key, role));
  assert.equal(only.references[0].role, role);
  const refs = imageReferenceManifest(only.references);
  assert.equal(referenceManifestError("参考【图1】生成全身图", refs), null);
  const request = imagegenRequestSchema.parse({...base,mode:"generate",prompt:"参考【图1】生成全身图",inputs:refs.map(({role,...reference})=>({artworkId:"asset-single",role,reference}))});
  assert.equal(resolveImagegenIntent(request).operation,"generate");
  assert.match(compileImagegenPrompt(request,resolveImagegenIntent(request)),/均为参考素材/);
  assert.equal(imagegenRequestSchema.safeParse({...request,mode:"edit"}).success,false);
  assert.ok(resolveImagegenIntent({...request,prompt:"抠图"}).conflicts.length);
}
const allReferences = [
  {artworkId:"subject",role:"insert" as const,width:800,height:1200},
  {artworkId:"style",role:"style" as const,width:800,height:1200},
];
assert.equal(frameCandidates(allReferences,"",undefined,"all-inputs").length,2);
const referenceRequest = imagegenRequestSchema.parse({...base,mode:"generate",prompt:"参考图片生成全身图",inputs:allReferences.map(({width,height,...input})=>input),parameters:{ratio:"auto"},framePolicy:"all-inputs"});
assert.equal(automaticFrameRatio(referenceRequest,allReferences,"generate"),"2:3");
console.log("PASS canvas image references: stable identity, target order, roles, deleted references, scoped drafts, frozen prompt, server validation, legacy compatibility; supplier calls=0");
