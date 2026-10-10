import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { generationPlaceholderSize, generationWaitingHint, placeGenerationPreview } from "../src/lib/canvas/generation-feedback";
const source = readFileSync("src/components/canvas/canvas-client.tsx", "utf8");
if (process.argv.includes("--baseline")) {
  assert.match(source, /setSelectedTextId\(node.id\);\s*setCtxMenu\(null\);\s*return;/);
  assert.match(source, /canvas-ui-node-card flex h-\[110px\]/);
  console.log("BASELINE=CONFIRMED TEXT_CONTEXT=SELECTION_ONLY IMAGE_PLACEHOLDER=110px");
} else {
  for (const ratio of ["1:1", "2:3", "3:2", "3:4", "4:3", "16:9", "9:16"]) {
    const size = generationPlaceholderSize(ratio);
    const [w,h] = ratio.split(":").map(Number);
    assert.ok(size.width >= 200 && size.height >= 200);
    assert.ok(size.width <= 384 && size.height <= 512);
    assert.ok(Math.abs(size.width / size.height - w / h) < .005);
  }
  assert.deepEqual(generationPlaceholderSize("invalid"), generationPlaceholderSize("1:1"));
  assert.deepEqual(generationPlaceholderSize("auto"), generationPlaceholderSize("1:1"));
  assert.deepEqual(placeGenerationPreview({x:400,y:100},{width:384,height:384},[{x:500,y:100,width:380,height:260}]),{x:400,y:408});
  const occupied=Array.from({length:400},(_,i)=>({x:400,y:i*420,width:384,height:384}));
  const free=placeGenerationPreview({x:400,y:0},{width:384,height:384},occupied);
  assert.ok(free.y > occupied.at(-1)!.y + 384);
  assert.notEqual(generationWaitingHint("generating", 1), generationWaitingHint("generating", 35));
  assert.notEqual(generationWaitingHint("generating", 35), generationWaitingHint("generating", 90));
  for (const stage of ["preparing", "generating", "saving"] as const) for (const elapsed of [0,35,90,3600]) {
    assert.doesNotMatch(generationWaitingHint(stage, elapsed), /%|马上|即将|已完成/);
    assert.ok(generationWaitingHint(stage, elapsed, true));
  }
  assert.match(source, /<ContextMenuSurface/);
  assert.match(source, /textNode \? \(/);
  assert.match(source, /<GenerationPlaceholder/);
  assert.match(source, /n.data.generationStage/);
  assert.doesNotMatch(source, /canvas-ui-node-card flex h-\[110px\]/);
  const baseline=execFileSync("git",["show","804f820755c23390d45387b3757c737fb472f105:src/components/canvas/canvas-client.tsx"],{encoding:"utf8"});
  const payloads=(code:string)=>{
    const sf=ts.createSourceFile("canvas.tsx",code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),values:string[]=[];
    const visit=(node:ts.Node)=>{
      if(ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && ["fd","form"].includes(node.expression.expression.getText(sf)) && ["append","set"].includes(node.expression.name.text)) values.push(node.getText(sf).replace(/\r\n/g,"\n"));
      ts.forEachChild(node,visit);
    };visit(sf);return values;
  };
  assert.deepEqual(payloads(source),payloads(baseline),"provider FormData fields must not change in this UI task");
  console.log("MODIFIED=PASS RATIOS=7 PREVIEW_COLLISIONS=400 TRUTHFUL_STAGES=PASS TEXT_IMAGE_CONTEXT=PASS PROVIDER_FIELDS=UNCHANGED");
}
