'use strict';
const assert=require('node:assert/strict'),{planPlacement}=require('./completed-canvas-placement.cjs');
let count=0;const art=(id,parent_id=null,x=null,y=null)=>({id,email:'owner',group_id:'root',parent_id,parent_ids:[],canvas_x:x,canvas_y:y,status:'completed',deleted_at:null,image_url:'/media/'+id+'.png',image_width:1024,image_height:1024});
const target=id=>({artworkId:id,owner:'owner',createdAt:'2026-10-26',sourceNodeId:null});
const original=[art('root',null,0,0),art('first','root'),art('second','root'),art('saved','root',777,15)];const before=JSON.stringify(original);
const p=planPlacement({artworks:original,targets:[target('first'),target('second'),target('saved')]});assert.equal(p.changes.length,2);assert.equal(p.skipped.length,0);assert.equal(p.changes[0].after.canvas_x,516);assert(p.changes[1].after.canvas_y>p.changes[0].after.canvas_y);assert.equal(JSON.stringify(original),before);count+=5;
const applied=original.map(a=>({...a,...p.changes.find(v=>v.id===a.id)?.after}));assert.equal(planPlacement({artworks:applied,targets:[target('first'),target('second')]}).changes.length,0);count++;
for(const [name,arts,expect]of[
 ['foreign',[{...art('root',null,0,0),email:'foreign'},art('result','root')],0],
 ['cross project',[{...art('root',null,0,0),group_id:'different'},art('result','root')],0],
 ['deleted result',[art('root',null,0,0),{...art('result','root'),deleted_at:'deleted'}],0],
 ['deleted parent uses ancestor',[art('root',null,0,0),{...art('middle','root',100,0),deleted_at:'deleted'},art('result','middle')],1],
 ['missing ancestor',[art('result','absent')],0],
 ['cycle',[art('result','middle'),art('middle','result')],0],
 ['real zero position',[art('root',null,0,0),art('result','root',0,0)],0],
]){const r=planPlacement({artworks:arts,targets:[target('result')]});assert.equal(r.changes.length,expect,name);count++;}
const chain=planPlacement({artworks:[art('root',null,0,0),art('a','root'),art('b','a')],targets:[target('b'),target('a')]});assert.equal(chain.changes.length,2);assert.equal(chain.changes[1].anchorId,'a');assert(chain.changes[1].after.canvas_x>chain.changes[0].after.canvas_x);count+=3;
const blocked=planPlacement({artworks:[art('root',null,0,0),art('result','root')],textNodes:[{id:'text',email:'owner',project_key:'tree:root',canvas_x:516,canvas_y:0,canvas_width:420,canvas_height:200}],targets:[target('result')]});assert(blocked.changes[0].after.canvas_y>=248);count++;
const roots=planPlacement({artworks:[art('root'),art('result','root')],targets:[{...target('root'),seedRoot:true},target('result')]});assert.equal(roots.changes.length,2);assert.equal(roots.changes[0].after.canvas_x,0);assert.equal(roots.changes[1].after.canvas_x,516);count+=3;
const ghost=planPlacement({artworks:[{...art('root',null,150,50),deleted_at:'old'},art('result','root')],targets:[{...target('result'),historicalAnchor:true}]});assert.equal(ghost.changes.length,1);assert.equal(ghost.changes[0].after.canvas_x,666);assert.equal(ghost.changes[0].historicalAnchor,true);count+=3;
console.log('COMPLETED_CANVAS_PLACEMENT=PASS CHECKS='+count+' EXISTING_COORDINATES=UNCHANGED LINEAGE_RIGHT_SIDE=1 OVERLAP_AVOIDANCE=1 IDEMPOTENT=1');
