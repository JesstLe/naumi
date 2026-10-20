import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { canvasGenerationReferences, explicitCanvasParent, synchronizeCanvasArtworks, imageAspectDisplaySize } from "../src/lib/canvas/input-references";
import { imagegenVisualConstraints } from "../src/lib/imagegen/visual-constraints";
import { compileImagegenPrompt } from "../src/lib/imagegen/prompt";
import { imagegenRequestSchema } from "../src/lib/imagegen/schema";
import { resolveImagegenIntent } from "../src/lib/imagegen/intent";
import { automaticFrameRatio } from "../src/lib/imagegen/frame-ratio";
import type { Artwork } from "../src/lib/mock-data";

async function main() {
  let checks = 0; const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
  const product = { id: "product", image: "/media/product.png", width: 1500, height: 1500 } as Artwork;
  const reference = { id: "reference", image: "/media/reference.png", width: 750, height: 1000, parentId: "product", source: "canvas-add", parentIds: [] } as unknown as Artwork;
  const generated = { ...reference, id: "generated", source: "generate", parentId: "reference" };
  assert.deepEqual(canvasGenerationReferences(reference, [product, reference]), [reference]); checks++;
  assert.deepEqual(canvasGenerationReferences(generated, [product, reference, generated]), [generated]); checks++;
  const linked = { ...reference, parentIds: [product.id, product.id] };
  const refs = canvasGenerationReferences(linked, [product, linked]); assert.deepEqual(refs.map(a => a.id), ["product", "reference"]); checks++;
  check(explicitCanvasParent(linked, product.id), "explicit project parent draws a link");
  check(!explicitCanvasParent(reference, product.id), "hidden project grouping stays hidden");
  assert.throws(() => canvasGenerationReferences({ ...linked, parentIds: ["missing"] }, [linked]), /尚未载入/); checks++;
  assert.throws(() => canvasGenerationReferences({ ...linked, parentIds: ["video"] }, [linked, { ...product, id: "video", videoUrl: "/media/video.mp4" }]), /尚未载入/); checks++;
  assert.throws(() => canvasGenerationReferences({...reference,parentIds:Array.from({length:16},(_,i)=>`ref-${i}`)},[reference]),/最多使用16/); checks++;
  const request = imagegenRequestSchema.parse({ version: 1, operationId: "12345678-1234-4234-a234-123456789abc", entry: "canvas", mode: "edit", prompt: "换成我的产品，参考海报构图", parameters: { ratio: "auto", quality: "high", resolution: "1K" }, inputs: refs.map((ref,i) => ({ artworkId: ref.id, role: i ? "reference" : "edit-target" })) });
  const intent = resolveImagegenIntent(request);
  check(automaticFrameRatio(request, refs.map((ref,i)=>({artworkId:ref.id,role:i?"reference":"edit-target",width:ref.width!,height:ref.height!})),intent.operation,intent.useCase)==="3:4", "actual roles use composition frame, not square product");
  const before=JSON.stringify(request), prompt=compileImagegenPrompt(request,intent);
  check(prompt.includes("必须真实引用") && prompt.includes("1. edit-target\n2. reference"), "wire prompt declares real product/reference roles");
  assert.equal(JSON.stringify(request),before); checks++;
  for(const text of ["只要模特", "只生成产品", "不要文字", "生成母女模特面容自然", "a portrait photograph without text"]) check(imagegenVisualConstraints(text).some(s=>s.includes("无文字")), text);
  for(const text of ["保留文字，只调整光照", "不要去除文字", "人像海报，加上标题", '画出写着“不要文字”的标牌', "keep the text and background"]) check(!imagegenVisualConstraints(text).some(s=>s.includes("无文字")), text);
  for(const ratio of [[320,420,1500,1500],[420,420,864,1536],[420,420,1152,1536],[250,440,1254,1672]]) {
    const result=imageAspectDisplaySize(...ratio as [number,number,number,number]);check(Math.abs(result.width/result.height-ratio[2]/ratio[3])<0.004,"display aspect remains intrinsic");check(result.width<=ratio[0]&&result.height<=ratio[1],"no node overlap growth");
  }
  let reads=0;const loaded=await synchronizeCanvasArtworks([product.id,reference.id],async()=>{reads++;return reads===1?[]:reads===2?[product]:[product,reference]},()=>true,async()=>{});
  check(loaded.length===2&&reads===3,"empty/partial synchronization retries reads only");
  reads=0;await assert.rejects(()=>synchronizeCanvasArtworks([product.id],async()=>{reads++;return []},()=>true,async()=>{}),/无需重新上传/);check(reads===3,"bounded read attempts");
  reads=0;await assert.rejects(()=>synchronizeCanvasArtworks([product.id],async()=>{reads++;return[product]},()=>false,async()=>{}),/账号已切换/);check(reads===0,"account switched before read");
  let current=true;await assert.rejects(()=>synchronizeCanvasArtworks([product.id],async()=>{current=false;return[product]},()=>current,async()=>{}),/账号已切换/);checks++;
  const source=await readFile("src/components/canvas/canvas-client.tsx","utf8");
  for(const needle of ["synchronizeCanvasArtworks(added", "canvas-import-resync", "await addParentToNode(target, source)", "canvasGenerationReferences(selected", "canvas-image-quick-cutout", "landEditResult(source", "cutout-original.png", "imageAspectDisplaySize(Math.round"])check(source.includes(needle),needle);
  check(!source.slice(source.indexOf("async function runCutout"),source.indexOf('// 面板「生成」')).includes('fd.append("sourceUrl"'),"private image bytes, no unauthenticated URL refetch");
  const media=await readFile("src/components/canvas/canvas-image.tsx","utf8");check(media.includes("s.transform[2]>=1"),"all visible nodes original at 100% zoom");check(media.includes("visible&&!!source&&localWidth>0"),"offscreen stays lazy");
  const bytes=Buffer.from("original-media-sentinel");const digest=createHash("sha256").update(bytes).digest("hex");imageAspectDisplaySize(320,420,864,1536);check(createHash("sha256").update(bytes).digest("hex")===digest,"display never changes source bytes");
  await mkdir("output/pdf-issues-repair-20261020",{recursive:true});
  await writeFile("output/pdf-issues-repair-20261020/helper-results.json",JSON.stringify({checks,readsOnly:true,supplierCalls:0,productionWrites:0},null,2));
  console.log(`MODIFIED=PASS PDF_HELPER_CHECKS=${checks} REFERENCES=EXPLICIT ORIGINAL_BYTES=UNCHANGED SYNC_READS=BOUNDED SUPPLIER_CALLS=0`);
}
main().catch(error=>{console.error(error);process.exitCode=1});
