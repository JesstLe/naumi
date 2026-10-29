import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {canvasDockLayout,canvasOverlaySafeArea,canvasDockWidth} from '../src/lib/canvas/dock-layout';
import {separateCanvasDocks} from '../src/lib/canvas/dock-placement';
import {canvasZoomState} from '../src/lib/canvas/viewport-state';
const old=readFileSync(process.env.CANVAS_PERF_LEGACY_DOCK || "scripts/fixtures/canvas-dock-layout-legacy.txt",'utf8');
function body(marker:string){const a=old.indexOf(marker),start=old.indexOf('=> {',a)+4;const end=old.indexOf('\n  }, [',start);return old.slice(start,end);}

// The original source is compiled only to compare the old closure's geometry, not to render a substitute UI.
const anchor=body('const anchorCenterX'),dock=body('const preferredDockStyle');
const fn=ts.transpileModule(`function legacy(nodeScreen:any,canvasSize:any,dockMetrics:any,selectedTextId:any,textComposerExpanded:any,readOnly:any,separateCanvasDocks:any){
 const overlaySafeArea={left:8,right:8,top:canvasSize.width>0&&canvasSize.width<768?108:64,bottom:canvasSize.width>0&&canvasSize.width<1000?128:84};
 const dockWidth=canvasSize.width?Math.max(1,Math.min(820,canvasSize.width-overlaySafeArea.left-overlaySafeArea.right)):820;
 const anchorCenterX=(()=>{${anchor}})(); const preferredDockStyle=(()=>{if(!nodeScreen||anchorCenterX==null)return undefined;${dock}})();
 if(!nodeScreen)return {dock:undefined,toolbar:undefined};
 const cw=canvasSize.width,half=Math.min(dockMetrics.toolbarWidth||1088,Math.max(1,cw-overlaySafeArea.left-overlaySafeArea.right))/2;
 const preferredTopbarStyle={left:cw?Math.max(overlaySafeArea.left+half,Math.min(nodeScreen.cx,cw-overlaySafeArea.right-half)):nodeScreen.cx,top:Math.max(overlaySafeArea.top,nodeScreen.top-46-12)};
 if(!preferredDockStyle||!canvasSize.height||readOnly)return {dock:preferredDockStyle,toolbar:preferredTopbarStyle};
 return separateCanvasDocks({dock:textComposerExpanded&&selectedTextId?{...preferredDockStyle,top:overlaySafeArea.top,maxHeight:canvasSize.height-overlaySafeArea.bottom-overlaySafeArea.top}:preferredDockStyle,toolbar:preferredTopbarStyle,dockHeight:textComposerExpanded&&selectedTextId?canvasSize.height-overlaySafeArea.bottom-overlaySafeArea.top:dockMetrics.dockHeight||(selectedTextId?360:310),toolbarHeight:dockMetrics.toolbarHeight,safeTop:overlaySafeArea.top,safeBottom:canvasSize.height-overlaySafeArea.bottom});
}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const legacy=new Function(fn+';return legacy;')();let cases=0,legacyExact=0,narrowImage=0;
for(const width of [0,320,390,479,480,767,768,999,1000,1093,1440])for(const height of [0,400,614,679,680,900])for(const text of [null,'text'])for(const expanded of [false,true])for(const readOnly of [false,true])for(const position of [-500,0,100,450,1500]){
 const input={nodeScreen:{left:position,top:position,bottom:position+200,cx:position+150},canvasSize:{width,height},dockMetrics:{dockHeight:330,toolbarHeight:50,toolbarWidth:1077},selectedTextId:text,textComposerExpanded:expanded,readOnly};
 const current=canvasDockLayout(input),previous=legacy(input.nodeScreen,input.canvasSize,input.dockMetrics,text,expanded,readOnly,separateCanvasDocks);
 if(width>0&&width<480&&height>0&&!text&&!readOnly){
  narrowImage++;const safe=canvasOverlaySafeArea(input.canvasSize),maxHeight=height-safe.bottom-safe.top-50-12;
  assert.equal(current.dock!.width,previous.dock.width);assert.equal(current.dock!.left,previous.dock.left);
  assert.ok(current.dock!.top>=safe.top);assert.ok(current.dock!.maxHeight!>0);
  assert.ok(current.dock!.maxHeight!<=Math.max(1,maxHeight));
  const actualHeight=Math.min(input.dockMetrics.dockHeight,current.dock!.maxHeight!);assert.ok(current.dock!.top+actualHeight<=height-safe.bottom+1);
  assert.ok(current.dock!.top+actualHeight+12<=current.toolbar!.top+1||current.toolbar!.top+50+12<=current.dock!.top+1);
 }else{assert.deepEqual(current,previous);legacyExact++;}cases++;
}
assert.deepEqual(canvasDockLayout({nodeScreen:undefined,canvasSize:{width:390,height:614},dockMetrics:{dockHeight:0,toolbarHeight:0,toolbarWidth:0},selectedTextId:null,textComposerExpanded:false,readOnly:false}),{dock:undefined,toolbar:undefined});
const client=readFileSync('src/components/canvas/canvas-client.tsx','utf8');assert.match(client,/updateLiveViewport\(vp\)/);assert.doesNotMatch(client,/selectedTextId\) setViewport\(vp\)/);
assert.match(client,/onMoveEnd=\{[\s\S]*?viewportRef.current = vp;[\s\S]*?updateLiveViewport\(vp\);[\s\S]*?setViewport\(previous => canvasZoomState\(previous, vp\)\)/);
const original={x:0,y:0,zoom:1};for(let step=0;step<100;step++)assert.equal(canvasZoomState(original,{x:step,y:step,zoom:1}),original,'pure pan does not rerender root on gesture end');
const zoomed={x:100,y:100,zoom:2};assert.equal(canvasZoomState(original,zoomed),zoomed);assert.equal(canvasZoomState(zoomed,{x:200,y:200,zoom:2}),zoomed);
assert.match(client,/canvasTool === "hand" \|\| ev.buttons \|\| edge.selectable === false/);
console.log('DOCK_GEOMETRY=PASS LEGACY_EXACT='+legacyExact+' NARROW_IMAGE_UPDATED='+narrowImage+' CASES='+cases+' IMAGE_TEXT_EXPANDED_READONLY_NARROW_SHORT=PASS LIVE_TRANSFORM=EVERY_MOVE END_STATE=SYNCED');
