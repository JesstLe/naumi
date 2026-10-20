/* Preserve attachment drafts without recreating the dialog after every upload/removal. */
const SheetAttachmentUI={open(row,col){
 if(!row||!col)return;
 let refs=structuredClone(Array.isArray(row.cells[col.id])?row.cells[col.id]:[]);
 const source=sheetGrid.source,scope=sgScope();
 dialog('管理'+col.label,`<form id="sgAttachmentsForm"><div class="sg-attachment-list"></div><label class="sg-upload">＋ 上传${col.type==='image'?'图片':'文件'}<input id="sgUpload" type="file" ${col.type==='image'?'accept="image/png,image/jpeg"':''} multiple></label><button class="btn" type="button" id="sgChooseSource" aria-expanded="false" aria-controls="sgSourcePicker">从来源附件选择</button><div id="sgSourcePicker" class="sg-source-picker" hidden><input id="sgSourceSearch" placeholder="搜索文件名" aria-label="搜索来源附件"><div class="sg-source-list"></div></div><small class="sc-sub">单文件最大4 MiB，每格最多50个附件。保存后生效，移除仅解除关联。</small><p class="sc-form-error" id="sgFileError" hidden></p></form>`,`<button class="btn" data-close>取消</button><button class="btn primary" form="sgAttachmentsForm">保存附件</button>`);
 const form=$('#sgAttachmentsForm');if(!form)return;form.closest('[role="dialog"]').classList.add('sg-attachments-dialog');
 form.sgValues=()=>JSON.stringify(refs.map(SheetAttachmentModel.signature));
 const current=()=>form.isConnected&&sgCurrent(scope)&&sheetGrid.source===source;
 const editable=()=>current()&&!form.sgBusy&&!['saving','loading','unknown','saved'].includes(sgEditSession?.state);
 const error=message=>{if(current()){$('#sgFileError').hidden=false;$('#sgFileError').textContent=message;}};
 const changed=()=>{form.dispatchEvent(new Event('input',{bubbles:true}));$('#sgFileError').hidden=true;};
 const render=()=>{
  if(!current())return;
  form.querySelector('.sg-attachment-list').innerHTML=refs.map((ref,i)=>`<div>${sgImage(ref)?`<img src="${esc(sgFileUrl(ref))}" alt="${esc(ref.name)}">`:icon('file')}<span>${esc(ref.name)}${ref.excelRevision?'<small class="sc-sub">已保存编辑副本</small>':''}</span>${sgExcel(ref)?`<button type="button" class="ex-attachment-preview" data-ex-attachment="${i}">预览</button>`:''}<a class="ex-attachment-download" href="${esc(sgFileUrl(ref,true))}">${ref.excelRevision?'原文件':'下载'}</a><button type="button" data-sg-unlink="${i}" data-sg-unlink-key="${esc(SheetAttachmentModel.id(ref))}" aria-label="移除${esc(ref.name)}">移除</button></div>`).join('')||'<div class="sg-attachment-empty">暂无附件</div>';
  form.querySelectorAll('[data-sg-unlink]').forEach(b=>b.onclick=()=>{if(!editable())return;refs.splice(Number(b.dataset.sgUnlink),1);changed();render();});
  form.querySelectorAll('[data-ex-attachment]').forEach(b=>b.onclick=()=>{if(!editable())return;if(sgEditChanged(sgEditSession))return error('请先保存附件变更，再打开Excel预览或编辑。');void sgExcelPreview(refs[Number(b.dataset.exAttachment)],{refs:refs.filter(sgExcel),attachment:{row:row.id,column:col.id},returnTo:()=>{const latest=sheetGrid.doc?.rows.find(r=>r.id===row.id&&!r.archived),field=sgCols().find(c=>c.id===col.id);if(latest&&field)sgAttachments(latest,field);}});});
  for(const input of form.querySelectorAll('[data-sg-source-id]'))input.checked=refs.some(r=>r.kind==='source'&&r.id===input.dataset.sgSourceId);
 };
 render();form.sgOnResolved=action=>{refs=structuredClone(action.cells[col.id]);render();};
 sgSubmit(form,()=>({type:'set-cells',row:row.id,cells:{[col.id]:structuredClone(refs)}}));
 $('#sgChooseSource').onclick=()=>{
  if(!editable())return;const picker=$('#sgSourcePicker');picker.hidden=!picker.hidden;$('#sgChooseSource').setAttribute('aria-expanded',String(!picker.hidden));
  if(!picker.dataset.loaded){picker.dataset.loaded='true';const files=imported.assets.filter(a=>col.type!=='image'||/\.(png|jpe?g)$/i.test(a.name));picker.querySelector('.sg-source-list').innerHTML=files.map(a=>`<label data-sg-file-name="${esc(a.name.toLowerCase())}"><input type="checkbox" data-sg-source-id="${a.id}" ${refs.some(r=>r.kind==='source'&&r.id===a.id)?'checked':''}>${esc(a.name)}</label>`).join('');
   picker.querySelectorAll('[data-sg-source-id]').forEach(input=>input.onchange=()=>{if(!editable())return;if(input.checked){if(refs.length>=50){input.checked=false;return error('每个单元格最多50个附件');}const a=files.find(a=>a.id===input.dataset.sgSourceId);if(!refs.some(r=>r.kind==='source'&&r.id===a.id))refs.push({kind:'source',id:a.id,name:a.name});}else refs=refs.filter(r=>r.kind!=='source'||r.id!==input.dataset.sgSourceId);changed();render();});
  }
  if(!picker.hidden)requestAnimationFrame(()=>{if(current()&&!picker.hidden){picker.scrollIntoView({block:'nearest'});$('#sgSourceSearch').focus({preventScroll:true});}});
 };
 $('#sgSourceSearch').oninput=e=>form.querySelectorAll('[data-sg-file-name]').forEach(label=>label.hidden=!label.dataset.sgFileName.includes(e.target.value.toLowerCase()));
 $('#sgUpload').onchange=async e=>{
  if(!editable())return;const files=[...e.target.files];if(!files.length)return;
  form.sgBusy=true;sgEditLock(sgEditSession,true);$('#sgFileError').hidden=true;
  try{for(const file of files){if(!current())return;if(file.size>4*1024*1024)throw Error('单文件最大4 MiB');if(refs.length>=50)throw Error('每个单元格最多50个附件');const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('读取文件失败'));reader.readAsDataURL(file);});const uploaded=await sgRequest('worksheet-upload',{source},{name:file.name,data},scope);if(!current())return;const ref={kind:uploaded.kind,id:uploaded.id,name:uploaded.name};if(!refs.some(r=>SheetAttachmentModel.id(r)===SheetAttachmentModel.id(ref)))refs.push(ref);changed();render();}}
  catch(e){if(current())error(!e.status&&['TypeError','TimeoutError','AbortError'].includes(e.name)?'上传结果待确认，可重新选择同一文件，系统按内容去重；附件关联尚未保存。':sgError(e));}
  finally{form.sgBusy=false;if(current()){e.target.value='';sgEditLock(sgEditSession,false);}}
 };
}};
