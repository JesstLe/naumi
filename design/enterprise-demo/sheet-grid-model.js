(function(root){
 'use strict';
 const text=v=>Array.isArray(v)?v.map(x=>x.name).join(' '):String(v??'');
 function compare(a,b,type,direction){
  const x=text(a).trim(),y=text(b).trim();if(!x||!y)return x? -1:y?1:0;
  const n=type==='number'?Number(x)-Number(y):x.localeCompare(y,'zh-CN',{numeric:true});return (Number.isFinite(n)?n:0)*(direction==='desc'?-1:1);
 }
 function matches(row,doc,state){
  if(row.archived)return false;
  if(state.query&&!Object.values(row.cells).some(v=>text(v).toLocaleLowerCase().includes(state.query.toLocaleLowerCase())))return false;
  for(const [id,f]of Object.entries(state.filters||{})){const x=text(row.cells[id]);if(f.op==='empty'?!!x:f.op==='filled'?!x:f.op==='eq'?x!==f.value:!x.toLocaleLowerCase().includes(String(f.value||'').toLocaleLowerCase()))return false;}
  return true;
 }
 function project(doc,state){
  const active=doc.rows.filter(r=>!r.archived),byId=new Map(active.map(r=>[r.id,r])),filtered=active.filter(r=>matches(r,doc,state)),selected=new Set(filtered.map(r=>r.id));
  const parents=new Set(active.map(r=>r.parentId).filter(Boolean)),positions=new Map(doc.rows.map((r,i)=>[r.id,i]));
  const col=doc.columns.find(c=>c.id===state.sort?.column),cmp=(a,b)=>(col?compare(a.cells[col.id],b.cells[col.id],col.type,state.sort.direction):Number(a.originRow!==null&&a.originRow!==undefined)-Number(b.originRow!==null&&b.originRow!==undefined)||Number(!text(a.cells.title))-Number(!text(b.cells.title))||Number(!parents.has(a.id))-Number(!parents.has(b.id)))||positions.get(a.id)-positions.get(b.id);
  if(state.mode==='designer'||state.mode==='owner')return {matching:filtered,entries:filtered.sort((a,b)=>compare(a.cells[state.mode],b.cells[state.mode],'text','asc')||cmp(a,b)).map(row=>({row,depth:0,context:false}))};
  if(state.mode==='board')return {matching:filtered,entries:filtered.sort(cmp).map(row=>({row,depth:0,context:false}))};
  const included=new Set(selected);for(const r of filtered){let p=r.parentId;const seen=new Set([r.id]);while(p&&byId.has(p)&&!seen.has(p)){seen.add(p);included.add(p);p=byId.get(p).parentId;}}
  const children=new Map();for(const r of active.filter(r=>included.has(r.id))){const p=r.parentId&&included.has(r.parentId)?r.parentId:null;if(!children.has(p))children.set(p,[]);children.get(p).push(r);}
  const entries=[],visited=new Set();function walk(p,depth){for(const r of (children.get(p)||[]).sort(cmp)){if(visited.has(r.id))continue;visited.add(r.id);entries.push({row:r,depth,context:!selected.has(r.id),children:(children.get(r.id)||[]).length});if(!(state.collapsed||new Set()).has(r.id))walk(r.id,depth+1);}}
  walk(null,0);return {matching:filtered,entries};
 }
 root.SheetGridModel={text,compare,matches,project};
})(globalThis);
