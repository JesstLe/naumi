'use strict';
const crypto=require('node:crypto');
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const placed=a=>finite(a.canvas_x)&&finite(a.canvas_y);
const fingerprint=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function size(a){
 let w=Number(a.image_width),h=Number(a.image_height);
 if(a.canvas_width>0&&a.canvas_height>0){const f=w>0&&h>0?Math.min(a.canvas_width/w,a.canvas_height/h):0;return {width:f?Math.round(w*f):a.canvas_width,height:(f?Math.round(h*f):a.canvas_height)+36};}
 if(!(w>0&&h>0))return {width:320,height:236};
 const f=Math.min(720/Math.max(w,h),Math.max(420/Math.max(w,h),120/Math.min(w,h)));return {width:Math.max(1,Math.round(w*f)),height:Math.max(1,Math.round(h*f))+36};
}
/** Allocate ONLY missing coordinates, to the right of proven same-owner lineage.
 * Existing saved positions and deleted records never move. No generation, ledger
 * or task writes are part of this planner or its CAS application. */
function planPlacement({artworks,textNodes=[],videoNodes=[],targets}){
 const byId=new Map(artworks.map(a=>[a.id,a])),planned=new Map(),changes=[],skipped=[],visiting=new Set();
 const occupied=new Map();
 const group=(owner,id)=>JSON.stringify([owner,id]);
 for(const a of artworks)if(!a.deleted_at&&placed(a)){
  const k=group(a.email,a.group_id);if(!occupied.has(k))occupied.set(k,[]);occupied.get(k).push({...size(a),x:a.canvas_x,y:a.canvas_y,id:a.id});
 }
 for(const a of [...textNodes,...videoNodes])if(!a.deleted_at){const project=a.project_key||'';if(!project.startsWith('tree:'))continue;const k=group(a.email,project.slice(5));if(!occupied.has(k))occupied.set(k,[]);occupied.get(k).push({id:a.id,x:a.canvas_x??a.x,y:a.canvas_y??a.y,width:a.canvas_width??a.width,height:a.canvas_height??a.height});}
 const targetById=new Map(targets.map(t=>[t.artworkId,t]));
 function allocate(id){
  if(planned.has(id))return planned.get(id);
  const a=byId.get(id),target=targetById.get(id);
  if(!a||!target||target.locked||a.email!==target.owner||a.deleted_at||a.status!=='completed')return null;
  if(placed(a))return {x:a.canvas_x,y:a.canvas_y};
  if(visiting.has(id))return null;visiting.add(id);
  const ids=[a.parent_id,...(a.parent_ids||[]),target.sourceNodeId].filter(v=>v&&v!==id);
  let anchor=null,point=null;
  for(let candidate of ids){
   const seen=new Set();
   while(candidate&&!seen.has(candidate)){
    seen.add(candidate);const p=byId.get(candidate);if(!p||p.email!==a.email||p.group_id!==a.group_id)break;
    if(!p.deleted_at){const loc=placed(p)?{x:p.canvas_x,y:p.canvas_y}:allocate(p.id);if(loc){anchor=p;point=loc;break;}}
    candidate=p.parent_id;
   }
   if(anchor)break;
  }
  if(!anchor&&target.historicalAnchor){const old=byId.get(a.parent_id);if(old&&old.email===a.email&&old.group_id===a.group_id&&old.deleted_at&&placed(old)){anchor=old;point={x:old.canvas_x,y:old.canvas_y};}}
  const rootAllowed=target.seedRoot&&a.id===a.group_id&&!a.parent_id;
  if(!anchor&&!rootAllowed){visiting.delete(id);return null;}
  const k=group(a.email,a.group_id),rects=occupied.get(k)||[],dimensions=size(a),position=anchor?{x:Math.round(point.x+size(anchor).width+96),y:Math.round(point.y)}:{x:0,y:0};
  // Keep the lineage column on the right; siblings flow down, never to its left.
  for(let i=0;i<=rects.length;i++){
   const hits=rects.filter(r=>position.x<r.x+r.width+32&&position.x+dimensions.width+32>r.x&&position.y<r.y+r.height+48&&position.y+dimensions.height+48>r.y);
   if(!hits.length)break;position.y=Math.round(Math.max(...hits.map(r=>r.y+r.height+48)));
  }
  if(!finite(position.x)||!finite(position.y)||Math.abs(position.x)>1e7||Math.abs(position.y)>1e7){visiting.delete(id);return null;}
  const before={id:a.id,email:a.email,group_id:a.group_id,parent_id:a.parent_id,parent_ids:a.parent_ids,canvas_x:a.canvas_x,canvas_y:a.canvas_y,image_url:a.image_url,status:a.status,deleted_at:a.deleted_at};
  changes.push({id:a.id,owner:a.email,anchorId:anchor?.id||null,historicalAnchor:!!anchor?.deleted_at,rootSeed:!anchor,before,after:{canvas_x:position.x,canvas_y:position.y}});
  planned.set(id,position);rects.push({...dimensions,...position,id});occupied.set(k,rects);visiting.delete(id);return position;
 }
 for(const t of [...targets].sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))||a.artworkId.localeCompare(b.artworkId))){
  const a=byId.get(t.artworkId);if(a&&placed(a))continue;
  if(!allocate(t.artworkId))skipped.push({id:t.artworkId,reason:'NO_UNAMBIGUOUS_LIVE_LINEAGE_ANCHOR'});
 }
 return {changes,skipped};
}
module.exports={size,placed,fingerprint,planPlacement};
