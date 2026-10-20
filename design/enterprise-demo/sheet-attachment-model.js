/* A file is identified by kind+content ID, not its mutable display name. */
(function(root){
 'use strict';
 const id=r=>r.kind+':'+r.id;
 const signature=r=>r?JSON.stringify([r.kind,r.id,r.name,r.excelRevision||null]):'null';
 const same=(a,b)=>signature(a)===signature(b);
 const label=r=>r?r.name+(r.excelRevision?'（副本 '+r.excelRevision.slice(0,10)+'）':'（原始附件）'):'（未关联）';
 function map(refs){
  if(!Array.isArray(refs)||refs.length>50)throw Error('附件列表无效或超过50个');
  const result=new Map();for(const r of refs){if(!r||!['source','worksheet'].includes(r.kind)||typeof r.id!=='string'||typeof r.name!=='string'||result.has(id(r)))throw Error('附件列表包含无效或重复引用');result.set(id(r),structuredClone(r));}return result;
 }
 function plan(base,latest,mine){
  const a=map(base),b=map(latest),c=map(mine),keys=[...new Set([...b.keys(),...c.keys(),...a.keys()])],conflicts=[],entries=[];
  for(const key of keys){const before=a.get(key)||null,current=b.get(key)||null,desired=c.get(key)||null;
   if(same(before,desired))entries.push({key,value:current});
   else if(same(before,current)||same(current,desired))entries.push({key,value:desired});
   else {conflicts.push({key,before,current,mine:desired});entries.push({key,conflict:true});}
  }
  return {entries,conflicts};
 }
 function resolve(plan,choices={}){
  const refs=[];for(const e of plan.entries){let value=e.value;if(e.conflict){const c=plan.conflicts.find(c=>c.key===e.key);if(!['mine','latest'].includes(choices[e.key]))throw Error('请先选择每个冲突附件保留的版本');value=choices[e.key]==='mine'?c.mine:c.current;}if(value)refs.push(structuredClone(value));}
  if(refs.length>50)throw Error('合并后超过50个附件，请减少关联数量后重试');return refs;
 }
 root.SheetAttachmentModel={id,signature,label,plan,resolve};
})(globalThis);
