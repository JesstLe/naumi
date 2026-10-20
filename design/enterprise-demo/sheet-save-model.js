/* Save recovery is independent of identity, network and rendering. Server CAS remains authoritative. */
(function(root){
 'use strict';
 const key=v=>JSON.stringify(v&&typeof v==='object'?(Array.isArray(v)?v.map(x=>JSON.parse(key(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]]))):v);
 const equal=(a,b)=>key(a)===key(b);
 function plan(base,latest,action){
  const blocked=reason=>({safe:false,blocked:reason,conflicts:[]});
  if(action.type!=='set-cells')return blocked('结构操作请核对最新工作表后重新打开表单。');
  const before=base.rows.find(r=>r.id===action.row),now=latest.rows.find(r=>r.id===action.row);
  if(!before||!now||before.archived||now.archived)return blocked('该记录已删除或不可编辑，请保留输入后核对记录。');
  const conflicts=[],filePlans={};
  for(const [id,mine]of Object.entries(action.cells)){
   const a=base.columns.find(c=>c.id===id),b=latest.columns.find(c=>c.id===id);
   if(!a||!b||a.archived||b.archived||!equal(a,b))return blocked('字段设置已变化，请保留输入后重新打开编辑。');
   if(['image','files'].includes(b.type)){
    if(!root.SheetAttachmentModel)return blocked('附件请在附件管理中核对后重新保存。');
    try{const p=root.SheetAttachmentModel.plan(before.cells[id]||[],now.cells[id]||[],mine);filePlans[id]=p;for(const c of p.conflicts)conflicts.push({id:'@file:'+id+':'+c.key,kind:'attachment',label:(c.mine||c.current||c.before).name,before:root.SheetAttachmentModel.label(c.before),latest:root.SheetAttachmentModel.label(c.current),mine:root.SheetAttachmentModel.label(c.mine)});if(!p.conflicts.length)root.SheetAttachmentModel.resolve(p);}catch(e){return blocked(e.message);}continue;
   }
   if(typeof mine!=='string')return blocked('单元格类型已变化，请重新核对。');
   const old=before.cells[id]??'',current=now.cells[id]??'';
   if(!equal(old,current)&&!equal(current,mine))conflicts.push({id,label:b.label,before:old,latest:current,mine});
  }
  if(Object.hasOwn(action,'parentId')&&before.parentId!==now.parentId&&now.parentId!==action.parentId)
   conflicts.push({id:'@parent',label:'父任务',before:before.parentId,latest:now.parentId,mine:action.parentId});
  return {safe:conflicts.length===0,blocked:null,conflicts,filePlans};
 }
 function resolve(action,plan,choices){
  if(plan.blocked)throw Error('REOPEN_REQUIRED');
  const result=structuredClone(action);
  for(const c of plan.conflicts){
   if(c.kind==='attachment')continue;
   if(!['mine','latest'].includes(choices[c.id]))throw Error('RESOLUTION_REQUIRED');
   if(c.id==='@parent')result.parentId=choices[c.id]==='mine'?c.mine:c.latest;
   else result.cells[c.id]=choices[c.id]==='mine'?c.mine:c.latest;
  }
  for(const [column,p]of Object.entries(plan.filePlans||{}))result.cells[column]=root.SheetAttachmentModel.resolve(p,Object.fromEntries(p.conflicts.map(c=>[c.key,choices['@file:'+column+':'+c.key]])));
  return result;
 }
 function outcome(e){
  const code=e.code||e.message;
  if(code==='VERSION_CONFLICT')return 'conflict';
  if(code==='IDEMPOTENCY_CONFLICT'||!e.status||e.status===408||e.status>=500)return 'unknown';
  return 'rejected';
 }
 root.SheetSaveModel={key,plan,resolve,outcome};
})(globalThis);
