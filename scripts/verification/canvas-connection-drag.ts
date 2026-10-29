import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import type {Locator,Page} from "@playwright/test";

/** Observe the actual fit/resize result before one native drag. Actionability
 * auto-scroll on a moving offscreen handle can itself interrupt the fit. No
 * forced pointer events, direct onConnect invocation or gesture retry here. */
export async function dragCanvasConnection(page:Page,source:Locator,target:Locator,evidence:string){
  const sourceNode=await source.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," react-flow__node ")][1]').getAttribute('data-id');
  const targetNode=await target.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," react-flow__node ")][1]').getAttribute('data-id');
  assert.ok(sourceNode&&targetNode);
  const result=await page.evaluate(async({sourceNode,targetNode})=>{
    const samples:unknown[]=[];let previous='',stable=0;
    for(let frame=0;frame<240;frame++){
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      const pane=document.querySelector('.react-flow')!.getBoundingClientRect();
      const handles=[['source',sourceNode],['target',targetNode]].map(([kind,id])=>{
        const el=document.querySelector(`.react-flow__node[data-id="${id}"] .react-flow__handle.${kind}`),box=el?.getBoundingClientRect();
        if(!el||!box)return null;const x=box.x+box.width/2,y=box.y+box.height/2,hit=document.elementFromPoint(x,y);
        return {x,y,width:box.width,height:box.height,visible:box.width>0&&box.height>0&&x>pane.left&&x<pane.right&&y>pane.top&&y<pane.bottom,hittable:hit===el||!!hit&&el.contains(hit)};
      });
      const sample={viewport:document.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform,handles};samples.push(sample);
      const key=JSON.stringify(sample);stable=key===previous?stable+1:0;previous=key;
      if(stable>=8&&handles.every(handle=>handle?.visible&&handle.hittable))return {stable:true,samples};
    }
    return {stable:false,samples};
  },{sourceNode,targetNode});
  await writeFile(evidence,JSON.stringify(result,null,2));assert.equal(result.stable,true,'both native handles must be visible, hit-testable and geometry-stable before one drag');
  await source.dragTo(target);
}
