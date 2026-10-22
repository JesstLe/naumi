import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { insertImageMention, remapImageMentions } from "../src/lib/canvas/image-mentions";
const source = readFileSync(process.env.CANVAS_MENTION_SOURCE || "src/components/canvas/canvas-client.tsx", "utf8");
if (process.env.CANVAS_MENTION_LEGACY === "1") {
  const dock = source.slice(source.indexOf("{visibleDockRefs.map"), source.indexOf("{/* 提示词:短内容"));
  assert.match(dock, /setLightbox/); assert.doesNotMatch(dock, /insertReferenceMention|ImageReferenceThumbnail/);
  console.log("BASELINE=PASS CLICK=PREVIEW_ONLY IMAGE_NUMBER=ABSENT");
} else {
  assert.deepEqual(insertImageMention("颜色参考，纹理", 4, 4, 2), {value:"颜色参考@图片2 ，纹理",caret:9});
  assert.deepEqual(insertImageMention("abcdef", 1, 4, 12), {value:"a@图片12 ef",caret:7});
  assert.deepEqual(insertImageMention("", 0, 0, 1, true), {value:"@Image1 ",caret:8});
  assert.equal(remapImageMentions("参考@图片1 @图片2 @图片3 @Image3 @图片10", ["a","b","c"], ["c","a"]), "参考@图片2  @图片1 @Image1 @图片10");
  assert.equal(remapImageMentions("@图片1 @图片2", ["a","b"], ["b","a","c"]), "@图片2 @图片1");
  assert.equal(remapImageMentions("@图片1 @图片2 @图片3", ["a","b","c"], ["a","c","d"]), "@图片1  @图片2");
  assert.equal(remapImageMentions("普通内容@其他人", ["a"], []), "普通内容@其他人");
  assert.equal(remapImageMentions("@图片10", Array.from({length:16},(_,i)=>String(i)), ["9"]), "@图片1");
  assert.match(source,/area\.selectionStart, area\.selectionEnd/); assert.match(source,/previousMentionOrder\.current\.get\(imageDraft\.key\)/);
  assert.match(source,/number=\{visibleDockRefs\.length \+ index \+ 1\}/);
  assert.match(source,/pendInputArts\.map\(\(art, index\)/);
  assert.match(source,/if \(!next\.has\(url\)\) URL\.revokeObjectURL/);
  console.log("MODIFIED=PASS CARET=PASS REPLACE_SELECTION=PASS NUMBER_ORDER=PASS REMAP=PASS REMOVED_REFERENCE=PASS ENGLISH=PASS NODE_DRAFT_SCOPE=PASS");
}
