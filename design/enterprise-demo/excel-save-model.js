/* References, not workbook cell values, determine whether an explicit save rebase is valid. */
(function(root){
 'use strict';
 const identity=r=>r.kind+':'+r.id;
 const same=(a,b)=>!!a&&!!b&&JSON.stringify([a.kind,a.id,a.name,a.excelRevision||null])===JSON.stringify([b.kind,b.id,b.name,b.excelRevision||null]);
 const locked=s=>!!s.saving||!!s.recoveryLoading||['unknown','saved'].includes(s.saveState);
 function rebase(document,attachment,base,next){
  const row=document.rows.find(r=>r.id===attachment.row&&!r.archived),column=document.columns.find(c=>c.id===attachment.column&&!c.archived&&c.type==='files');
  if(!row||!column||!Array.isArray(row.cells[column.id]))return {blocked:'记录或附件字段已变化，当前修改仍保留，可先导出。'};
  const refs=row.cells[column.id],current=refs.filter(r=>identity(r)===identity(base));
  if(current.length!==1||!same(current[0],base))return {blocked:'该Excel已在其他窗口更新或被移除。当前修改仍保留，请先导出后核对最新版本。'};
  return {refs:structuredClone(refs.map(r=>identity(r)===identity(base)?next:r)),blocked:null};
 }
 function manifest(ref,patches,createdAt){return {schema:1,kind:'excel-cell-revision',base:{kind:ref.kind,id:ref.id,name:ref.name},parentRevision:ref.excelRevision||null,createdAt,patches:structuredClone(patches)};}
 root.ExcelSaveRecoveryModel={same,identity,locked,rebase,manifest};
})(globalThis);
