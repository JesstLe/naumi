import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import type {Locator,Page} from "@playwright/test";
import {expect} from "@playwright/test";

/** Real mouse input only. A visible title is not proof that settings have
 * enabled dragging or that deep-link viewport animation has finished. */
export async function dragCanvasNode(page:Page,handle:Locator,delta:{x:number;y:number},evidence:string){
  const node=handle.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," react-flow__node ")][1]');
  const id=await node.getAttribute("data-id");assert.ok(id);
  const initial=await node.evaluate(el=>({className:el.className,rect:el.getBoundingClientRect().toJSON()}));
  await expect(node).toHaveClass(/\bdraggable\b/);
  await handle.click({trial:true});
  const settled=await node.evaluate(async el=>{
    const samples:{x:number;y:number;width:number;height:number;viewport:string}[]=[];
    let previous="",stable=0;
    for(let frame=0;frame<180;frame++){
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      const r=el.getBoundingClientRect(),sample={x:r.x,y:r.y,width:r.width,height:r.height,viewport:document.querySelector<HTMLElement>(".react-flow__viewport")?.style.transform||""};
      samples.push(sample);const key=JSON.stringify(sample);stable=key===previous?stable+1:0;previous=key;
      if(stable>=8&&r.width>0&&r.height>0)return {stable:true,frames:frame+1,samples};
    }
    return {stable:false,frames:samples.length,samples};
  });
  assert.equal(settled.stable,true,"node and viewport must settle before reading mouse coordinates");
  const box=await handle.boundingBox();assert.ok(box);
  const point={x:box.x+Math.min(55,box.width/2),y:box.y+box.height/2};
  const hit=await page.evaluate(p=>{const el=document.elementFromPoint(p.x,p.y);return {tag:el?.tagName,node:el?.closest(".react-flow__node")?.getAttribute("data-id"),className:el?.className};},point);
  assert.equal(hit.node,id,"real pointer must hit the intended node, not a moving viewport or overlay");
  await page.mouse.move(point.x,point.y);await page.mouse.down();
  try{await page.mouse.move(point.x+delta.x,point.y+delta.y,{steps:12});}
  finally{await page.mouse.up();}
  const after=await node.evaluate(el=>({className:el.className,rect:el.getBoundingClientRect().toJSON()}));
  await writeFile(evidence,JSON.stringify({id,initial,settled,point,hit,delta,after,mouseInput:true,handlerInvocation:false,retries:0},null,2)+"\n");
}
