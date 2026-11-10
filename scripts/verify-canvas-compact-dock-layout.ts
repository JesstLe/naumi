import assert from 'node:assert/strict';
import { canvasDockLayout, canvasOverlaySafeArea, type NodeScreen } from '../src/lib/canvas/dock-layout';

type Input = Parameters<typeof canvasDockLayout>[0];
type Rect = { left:number; top:number; width:number; height:number };
let checks = 0;
const intersects = (a:Rect,b:Rect) =>
  a.left < b.left+b.width && a.left+a.width > b.left && a.top < b.top+b.height && a.top+a.height > b.top;
const sample = (overrides:Partial<Input> = {}):Input => ({
  nodeScreen:{left:600,cx:683.5,top:300,bottom:570},
  canvasSize:{width:1440,height:900},
  dockMetrics:{dockHeight:220,toolbarHeight:50,toolbarWidth:620,dockMinimumHeight:178},
  selectedTextId:null,textComposerExpanded:false,mediaComposerExpanded:false,
  readOnly:false,nodeTitleHeight:38,protectNodeTitle:true,compactImage:true,...overrides,
});

function rectangles(input:Input) {
  const output=canvasDockLayout(input),safe=canvasOverlaySafeArea(input.canvasSize);
  assert(output.dock && output.toolbar);
  const dock=output.dock,toolbar=output.toolbar;
  const toolbarWidth=Math.min(input.dockMetrics.toolbarWidth||620,input.canvasSize.width-safe.left-safe.right);
  const fallbackHeight=Math.max(input.dockMetrics.dockMinimumHeight||178,220);
  return {output,safe,dock:{left:dock.left,top:dock.top,width:dock.width,
    height:dock.height??Math.min(input.dockMetrics.dockHeight||fallbackHeight,dock.maxHeight!)},
    toolbar:{left:toolbar.left-toolbarWidth/2,top:toolbar.top,width:toolbarWidth,height:input.dockMetrics.toolbarHeight||50}};
}

function assertClear(input:Input,expectPictureVisible=false) {
  const before=JSON.stringify(input);
  const {output,safe,dock,toolbar}=rectangles(input);
  const node=input.nodeScreen!;
  const title={left:node.left,top:node.top-(input.nodeTitleHeight||0),width:2*(node.cx-node.left),height:input.nodeTitleHeight||0};
  const message=JSON.stringify({input,output});
  assert(dock.width<=620 && dock.left>=safe.left && dock.left+dock.width<=input.canvasSize.width-safe.right+.001,message);
  for(const rect of [dock,toolbar]) {
    assert(rect.top>=safe.top && rect.top+rect.height<=input.canvasSize.height-safe.bottom+.001,message);
    assert(!intersects(rect,title),message);
  }
  assert(!intersects(dock,toolbar),message);
  if(expectPictureVisible)assert(!intersects(dock,{left:node.left,top:node.top,width:title.width,height:node.bottom-node.top}),message);
  assert.equal(JSON.stringify(input),before,'Layout must not mutate node/viewport/metrics');
  checks++;
  return output;
}

// The reported image is only 167 x 270 screen pixels. A 220px composer fits
// directly below it; the old 310px preferred-height heuristic must not win.
const screenshot=assertClear(sample(),true);
assert.equal(screenshot.dock!.width,620);
assert.equal(screenshot.dock!.top,584);
assert.equal(screenshot.dock!.height,undefined);
assert.equal(screenshot.dock!.maxHeight,232);

// Short images retain the same bottom anchor as content height grows. The cap
// does not shrink to yesterday's measured height and prevent prompt expansion.
for(const dockHeight of [180,220,310,360]) {
  const result=assertClear(sample({nodeScreen:{left:600,cx:683.5,top:250,bottom:310},
    dockMetrics:{dockHeight,toolbarHeight:50,toolbarWidth:620,dockMinimumHeight:178}}),true);
  assert.equal(result.dock!.top,324);
  assert.equal(result.dock!.maxHeight,360);
}

const upperInput=sample({nodeScreen:{left:600,cx:683.5,top:600,bottom:800}});
const upper=assertClear(upperInput,true);
assert.equal(upper.dock!.top,268);
assert.equal(upper.dock!.maxHeight,360);
assert(upper.dock!.top+220+12<=upper.toolbar!.top);

// Below and above cannot fit, but a 620px side panel leaves image pixels clear.
const rightInput=sample({canvasSize:{width:1440,height:614},nodeScreen:{left:300,cx:383.5,top:200,bottom:470}});
const right=assertClear(rightInput,true);
assert.equal(right.dock!.left,481);
const leftInput=sample({canvasSize:{width:1440,height:614},nodeScreen:{left:1000,cx:1083.5,top:200,bottom:470}});
const left=assertClear(leftInput,true);
assert.equal(left.dock!.left,366);
// A side may give up at most 20px of width; no skinny 300px faux side panel.
const narrowSide=assertClear(sample({canvasSize:{width:1440,height:614},nodeScreen:{left:641,cx:724.5,top:200,bottom:470}}),true);
assert.equal(narrowSide.dock!.width,610);

const expandedInput=sample({canvasSize:{width:1920,height:1080}});
const expanded=assertClear({...expandedInput,mediaComposerExpanded:true},true);
assert.equal(expanded.dock!.left,781);
assert.equal(expanded.dock!.height,420);
assert.equal(expanded.dock!.maxHeight,420);
assert(expanded.dock!.height!<expandedInput.canvasSize.height/2);
for(const minimum of [178,450,510]) {
  const out=assertClear({...expandedInput,mediaComposerExpanded:true,
    dockMetrics:{dockHeight:900,toolbarHeight:50,toolbarWidth:620,dockMinimumHeight:minimum}},true);
  assert.equal(out.dock!.height,Math.min(480,Math.max(420,minimum)));
}

// Phone: prioritize a title-free, toolbar-free bounded composer when the image
// and composer genuinely cannot coexist. The image itself is not relocated.
const phone=sample({canvasSize:{width:390,height:659},nodeScreen:{left:100,cx:183.5,top:260,bottom:530},
  dockMetrics:{dockHeight:300,toolbarHeight:50,toolbarWidth:1380,dockMinimumHeight:280}});
const phoneLayout=assertClear(phone);
assert.equal(phoneLayout.dock!.width,374);
assert(phoneLayout.dock!.top>=272);
assert(phoneLayout.dock!.maxHeight!<280);
assert.equal(phone.nodeScreen!.top,260);
// An upper-edge title moves only the toolbar, not the node. Both overlays still
// stay below that title without colliding with each other.
assertClear(sample({canvasSize:{width:390,height:844},nodeScreen:{left:100,cx:183.5,top:150,bottom:420},
  dockMetrics:{dockHeight:220,toolbarHeight:50,toolbarWidth:1380,dockMinimumHeight:220}}));

// Zero metrics are a real first render, not a 0px toolbar or an 820px Dock.
const unmeasured=assertClear(sample({dockMetrics:{dockHeight:0,toolbarHeight:0,toolbarWidth:0,dockMinimumHeight:0}}),true);
assert.equal(unmeasured.dock!.top,584);
assert.equal(unmeasured.dock!.width,620);
assert.deepEqual(canvasDockLayout(sample({nodeScreen:undefined})),{dock:undefined,toolbar:undefined});

// Long prompt / geometry matrix; the below/above/side/degraded paths all use
// the same independent height ceiling, with title and toolbar exclusion.
for(const width of [390,1440,1920])for(const height of [400,614,900,1080])
for(const nodeHeight of [60,270,600])for(const dockHeight of [178,220,360,900])
for(const mediaComposerExpanded of [false,true]) {
  const safe=canvasOverlaySafeArea({width,height});
  const top=safe.top+50+12+38+8;
  const node:NodeScreen={left:width/2-83.5,cx:width/2,top,bottom:top+nodeHeight};
  assertClear(sample({canvasSize:{width,height},nodeScreen:node,mediaComposerExpanded,
    dockMetrics:{dockHeight,toolbarHeight:50,toolbarWidth:1380,dockMinimumHeight:width<480?280:178}}));
}

// Expanded positioning is byte-for-byte independent of observed Dock height.
// Returning to an earlier viewport also restores the exact earlier layout.
const priorByViewport=new Map<string,string>();
for(const width of [390,1440,1920,1440,390,1920])for(const height of [614,900,1080,900]) {
  const viewport=`${width}:${height}`;
  const base=sample({canvasSize:{width,height},nodeScreen:{left:width/2-83.5,cx:width/2,top:260,bottom:530},mediaComposerExpanded:true});
  const expected=JSON.stringify(canvasDockLayout(base));
  if(priorByViewport.has(viewport))assert.equal(expected,priorByViewport.get(viewport));
  priorByViewport.set(viewport,expected);
  for(const dockHeight of [0,178,220,420,480,1200,310,420]) {
    assert.equal(JSON.stringify(canvasDockLayout({...base,dockMetrics:{...base.dockMetrics,dockHeight}})),expected);
    checks++;
  }
}

// Simulate ResizeObserver: intrinsic content gets clipped by the returned cap.
// No alternating position/cap cycle is allowed after a measurement settles.
for(const base of [sample(),upperInput,rightInput,leftInput,phone])for(const intrinsic of [180,310,900]) {
  let input=base,previous='',stable=false;
  for(let frame=0;frame<5;frame++) {
    const out=canvasDockLayout(input),serialized=JSON.stringify(out);
    if(serialized===previous){stable=true;break;}
    previous=serialized;
    input={...input,dockMetrics:{...input.dockMetrics,dockHeight:Math.min(intrinsic,out.dock!.maxHeight!)}};
  }
  assert(stable,JSON.stringify({base,intrinsic}));
  checks++;
}

// Frozen numeric legacy results from af877f15. Explicit false, omitted opt-in,
// text, and video retain existing 820px / full-height expansion behavior.
const legacyInput=sample({compactImage:false});
const normalLegacy={dock:{left:273.5,top:584,width:820,maxHeight:232},toolbar:{left:683.5,top:200}};
assert.deepEqual(canvasDockLayout(legacyInput),normalLegacy);
const {compactImage:ignored,...omitted}=legacyInput;
assert.deepEqual(canvasDockLayout(omitted),normalLegacy);
assert.deepEqual(canvasDockLayout({...legacyInput,mediaComposerExpanded:true}),{
  dock:{left:273.5,top:312,width:820,maxHeight:504,height:504},toolbar:{left:683.5,top:200},
});
assert.deepEqual(canvasDockLayout({...legacyInput,protectNodeTitle:false,mediaComposerExpanded:true}),{
  dock:{left:273.5,top:126,width:820,maxHeight:690,height:690},toolbar:{left:683.5,top:64},
});
assert.deepEqual(canvasDockLayout({...legacyInput,selectedTextId:'text',protectNodeTitle:false,nodeTitleHeight:0,textComposerExpanded:true}),{
  dock:{left:273.5,top:126,width:820,maxHeight:690},toolbar:{left:683.5,top:64},
});
for(const width of [390,1440,1920])for(const selectedTextId of [null,'text'])
for(const expanded of [false,true])for(const readOnly of [false,true]) {
  const base=sample({compactImage:false,selectedTextId,readOnly,textComposerExpanded:expanded,mediaComposerExpanded:expanded,canvasSize:{width,height:900}});
  const {compactImage,...without}=base;
  assert.equal(JSON.stringify(canvasDockLayout(base)),JSON.stringify(canvasDockLayout(without)));
  if(selectedTextId)assert.deepEqual(canvasDockLayout({...base,compactImage:true}),canvasDockLayout(without));
  checks++;
}

// A previous clipped/expanded measurement must not change normal placement
// once the actual compact content height is known.
for(const natural of [175,226,340])for(const previous of [1,175,226,360,420,738]){
 const fixed=sample({dockMetrics:{dockHeight:natural,dockNaturalHeight:natural,toolbarHeight:50,toolbarWidth:620,dockMinimumHeight:144}});
 assert.deepEqual(canvasDockLayout({...fixed,dockMetrics:{...fixed.dockMetrics,dockHeight:previous}}),canvasDockLayout(fixed));checks++;
}
console.log(`COMPACT_IMAGE_DOCK_LAYOUT=PASS CHECKS=${checks} WIDTH_MAX=620 NORMAL_MAX_HEIGHT=360 EXPANDED_HEIGHT=420 EXPANDED_MAX_HEIGHT=480 TITLE_TOOLBAR_COLLISIONS=0 RESIZE_STABLE=PASS LEGACY=UNCHANGED`);

// Keyboard-height windows may cover image pixels/title, but must use the space
// left by the toolbar rather than degenerate to a header-only 34px sliver.
for(const height of [300,340,360])for(const expanded of [false,true]){
 const input=sample({canvasSize:{width:1000,height},nodeScreen:{left:450,cx:500,top:110,bottom:168},mediaComposerExpanded:expanded,
  dockMetrics:{dockHeight:220,dockNaturalHeight:278,toolbarHeight:50,toolbarWidth:714,dockMinimumHeight:224}});
 const {dock,toolbar,safe}=rectangles(input),available=height-safe.top-safe.bottom-toolbar.height-12;
 assert(dock.height>=Math.min(80,available));assert(!intersects(dock,toolbar));
 assert(dock.top>=safe.top&&dock.top+dock.height<=height-safe.bottom);
 const output=canvasDockLayout(input);
 assert.deepEqual(canvasDockLayout({...input,dockMetrics:{...input.dockMetrics,dockHeight:34}}),output);
}
console.log('COMPACT_SHORT_VIEWPORT=PASS CASES=6 TOOLBAR_CLEAR=1 HEIGHT_STABLE=1');
