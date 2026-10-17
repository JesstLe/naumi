/* Presentation projection only: never creates a source relationship or workflow event. */
(function(root){
 'use strict';
 function tree(all,matching){
  const byId=new Map(all.map(r=>[r.excelRow,r])),selected=new Set(matching.map(r=>r.excelRow)),groups=new Map();
  for(const r of matching){
   const parentId=r.resolution?.parentRow||(r.parentLabel&&r.parentCandidates.length===1?r.parentCandidates[0]:null),parent=byId.get(parentId);
   const linked=parent&&parent.excelRow!==r.excelRow&&!parent.parentLabel;
   const key=linked?parent.excelRow:r.excelRow;
   if(!groups.has(key))groups.set(key,{root:linked?parent:r,context:linked&&!selected.has(parent.excelRow),children:[],pending:!linked&&!!r.parentLabel});
   if(linked)groups.get(key).children.push({row:r,confirmed:!!r.resolution});
  }
  return [...groups.values()].map(g=>({...g,children:g.children.sort((a,b)=>a.row.excelRow-b.row.excelRow)})).sort((a,b)=>Number(a.pending)-Number(b.pending)||Number(!a.root.title)-Number(!b.root.title)||Number(!a.children.length)-Number(!b.children.length)||a.root.excelRow-b.root.excelRow);
 }
 root.ImportViewModel={tree};
})(globalThis);
