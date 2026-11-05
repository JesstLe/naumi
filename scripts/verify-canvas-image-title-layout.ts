import assert from 'node:assert/strict';
import {canvasDockLayout,canvasImageTitleInset,canvasOverlaySafeArea} from '../src/lib/canvas/dock-layout';

let checks=0;
for(const width of [390,768,1438])for(const height of [400,614,659,900])for(const zoom of [.5,.75,1,1.5,2])
for(const toolbarHeight of [49.5,50,70])for(const top of [130,300,403,600]){
 const canvasSize={width,height},safe=canvasOverlaySafeArea(canvasSize),title=canvasImageTitleInset(zoom);
 // Cases with a visible heading and at least one physical side able to fit
 // the toolbar plus a scrollable composer. Offscreen nodes are pan gestures,
 // not a promise to fit three surfaces into zero available pixels.
 if(top<=safe.top||top-title>=height-safe.bottom)continue;
 const upper=Math.max(0,top-title-12-safe.top),lower=Math.max(0,height-safe.bottom-top-12);
 if(Math.max(upper,lower)<toolbarHeight+13&&!(upper>=toolbarHeight&&lower>=120)&&!(lower>=toolbarHeight&&upper>=120))continue;
 const out=canvasDockLayout({nodeScreen:{left:30,cx:170,top,bottom:top+200*zoom},canvasSize,
   dockMetrics:{dockHeight:310,toolbarHeight,toolbarWidth:1380},selectedTextId:null,textComposerExpanded:false,
   readOnly:false,nodeTitleHeight:title,protectNodeTitle:true});
 assert(out.dock&&out.toolbar);
 const overlaps=(y:number,h:number)=>y<top&&y+h>top-title;
 assert.equal(overlaps(out.toolbar.top,toolbarHeight),false,JSON.stringify({width,height,zoom,top,out}));
 assert.equal(overlaps(out.dock.top,Math.min(310,out.dock.maxHeight!)),false,JSON.stringify({width,height,zoom,top,out}));
 assert(out.toolbar.top>=safe.top&&out.toolbar.top+toolbarHeight<=height-safe.bottom+.01);
 assert(out.dock.top>=safe.top&&out.dock.top+Math.min(310,out.dock.maxHeight!)<=height-safe.bottom+.01);
 checks++;
}
const sample=canvasDockLayout({nodeScreen:{left:480,cx:660,top:403,bottom:641},canvasSize:{width:1438,height:659},
 dockMetrics:{dockHeight:310,toolbarHeight:49.5,toolbarWidth:1384},selectedTextId:null,textComposerExpanded:false,readOnly:false,
 nodeTitleHeight:canvasImageTitleInset(1),protectNodeTitle:true});
assert(sample.toolbar!.top+49.5<=365-12);
assert.equal(canvasImageTitleInset(.5),19);assert.equal(canvasImageTitleInset(2),76);
// The real 390px composer can fill its allowed height. Feed each rendered
// height back as the next ResizeObserver sample; both zoom states must settle
// without reopening a maxHeight that covers the label or action bar.
for(const [top,zoom] of [[520,1],[471,.5]]){
 let measured=360,previous:string|undefined;
 for(let frame=0;frame<8;frame++){
  const out=canvasDockLayout({nodeScreen:{left:120,cx:195,top,bottom:top+84*zoom},canvasSize:{width:390,height:844},
   dockMetrics:{dockHeight:measured,toolbarHeight:49.5,toolbarWidth:374,dockMinimumHeight:224},
   selectedTextId:null,textComposerExpanded:false,readOnly:false,nodeTitleHeight:canvasImageTitleInset(zoom),protectNodeTitle:true});
  assert(out.dock&&out.toolbar);const rendered=out.dock.maxHeight!;
  assert(out.dock.top+rendered<=top-canvasImageTitleInset(zoom)-12||out.dock.top>=top+12);
  assert(out.dock.top+rendered+12<=out.toolbar.top||out.toolbar.top+49.5+12<=out.dock.top);
  const current=JSON.stringify(out);if(previous)assert.equal(current,previous,'narrow ResizeObserver feedback cannot alternate allowed heights');
  measured=rendered;previous=current;
 }
}
console.log('NARROW_MEASUREMENT_FEEDBACK=PASS ZOOMS=2 FRAMES=16 TITLE_AND_TOOLBAR_CLEAR=1');
console.log(`IMAGE_TITLE_LAYOUT=PASS CASES=${checks} SCREEN_SPACE_ZOOM=PASS TOOLBAR_MEASURED=PASS FINAL_TITLE_COLLISION=0`);
