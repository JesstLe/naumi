/* One pinned revision upload and one pinned command per attempt; no automatic write retry. */
const ExcelSaveRecovery={
 locked:ExcelSaveRecoveryModel.locked,
 changed(s){if(['conflict','rejected'].includes(s.saveState)){s.saveAttempt=null;s.saveState='ready';s.recovery=null;}},
 status(s){
  if(!exCurrent(s))return;const root=$('#exWorkbook'),locked=this.locked(s);root.dataset.recoveryLocked=String(locked);
  for(const id of ['exUndo','exRedo','exToggleEdit','exCellInput','exFile']){const e=$('#'+id);if(e)e.disabled=locked||(id==='exUndo'&&!s.undo.length)||(id==='exRedo'&&!s.redo.length);}
  const apply=$('#exCellForm button');if(apply)apply.disabled=locked;
  const save=$('#exSaveCopy');if(save){save.textContent=s.saveState==='unknown'?'核对保存结果':s.saveState==='saved'?'刷新列表':'保存版本';save.disabled=!!s.saving||!!s.recoveryLoading||s.saveState==='conflict'||!s.attachment||(!s.dirty&&!['unknown','saved'].includes(s.saveState));}
  const text=$('#exEditState');if(text&&s.saveState&&s.saveState!=='ready')text.textContent=s.saving?'保存中…':({unknown:'保存结果待确认',saved:'已保存，列表待刷新',conflict:'版本冲突，修改已保留',rejected:'保存未完成，可修正重试'})[s.saveState]||text.textContent;
  if(!root.dataset.recoveryHooks){root.dataset.recoveryHooks='1';root.addEventListener('click',()=>{if(exCurrent(s)&&this.locked(s))this.status(s);});root.addEventListener('beforeinput',e=>{if(this.locked(s)&&e.target.closest('#exCellForm')){e.preventDefault();e.stopImmediatePropagation();}},true);root.addEventListener('paste',e=>{if(this.locked(s)){e.preventDefault();e.stopImmediatePropagation();}},true);}
  this.panel(s);
 },
 panel(s){
  if(!exCurrent(s))return;let panel=$('#exSaveError');if(!s.recovery){panel?.remove();return;}
  if(!panel){panel=document.createElement('div');panel.id='exSaveError';panel.className='sc-alert ex-recovery';panel.setAttribute('role','status');panel.setAttribute('aria-live','polite');$('#exWorkbook').prepend(panel);}
  panel.replaceChildren();const message=document.createElement('p');message.textContent=s.recovery.text;panel.append(message);const actions=document.createElement('div');actions.className='ex-recovery-actions';panel.append(actions);
  const button=(id,text,run)=>{const b=document.createElement('button');b.type='button';b.id=id;b.className='btn sm';b.textContent=text;b.disabled=!!s.saving||!!s.recoveryLoading;b.onclick=run;actions.append(b);};
  if(['unknown','saved'].includes(s.saveState))button('exRecoveryRetry',s.saveState==='saved'?'刷新列表':'按原命令核对',()=>void this.save(s));
  if(s.recovery.retryCompare)button('exRecoveryRetry','重新核对',()=>void this.compare(s));
  if(s.recovery.rebase)button('exRecoveryRebase','基于最新版本重试',()=>{const a=s.saveAttempt;if(!a||this.locked(s))return;a.refs=structuredClone(s.recovery.rebase.refs);a.expectedVersion=s.recovery.version;a.commandId=crypto.randomUUID();a.command=null;s.saveState='ready';s.recovery=null;void this.save(s);});
  button('exRecoveryExport','导出修改清单',()=>void this.exportChanges(s));
 },
 async exportChanges(s){
  if(!exCurrent(s)||s.saving||s.applying||s.recoveryLoading)return;
  if(!this.locked(s)){await exFlushCell(s);if(exHasUnapplied(s))return;}
  if(!exCurrent(s))return;const manifest=s.saveAttempt?.signature===exSignature(s.edits.values())?s.saveAttempt.manifest:ExcelSaveRecoveryModel.manifest(s.ref,[...s.edits.values()],new Date().toISOString());
  const url=URL.createObjectURL(new Blob([JSON.stringify(manifest,null,2)],{type:'application/json'}));s.urls.add(url);const a=document.createElement('a');a.href=url;a.download=s.ref.name.replace(/\.(xlsx|xlsm|xls)$/i,'')+'-修改清单.json';a.click();
 },
 async compare(s){
  if(!exCurrent(s)||!s.saveAttempt||s.recoveryLoading)return;s.recoveryLoading=true;s.recovery={text:'正在核对最新附件，当前修改仍保留…'};exUpdateEditorStatus(s);
  try{const latest=await sgRequest('worksheet',{source:s.source},undefined,s.scope);if(!exCurrent(s))return;const a=s.saveAttempt,plan=ExcelSaveRecoveryModel.rebase(latest.document,s.attachment,a.baseRef,a.nextRef);s.recovery=plan.blocked?{text:plan.blocked}:{text:'其他位置已更新，当前Excel版本未变化。确认后可保留最新附件列表并重试。',rebase:plan,version:latest.version};}
  catch(e){if(exCurrent(s))s.recovery={text:'最新附件读取未完成，当前修改仍保留。',retryCompare:true};}
  finally{s.recoveryLoading=false;if(exCurrent(s))exUpdateEditorStatus(s);}
 },
 async refresh(s){
  const a=s.saveAttempt;try{const latest=await sgRequest('worksheet',{source:s.source},undefined,s.scope);if(!exCurrent(s))return false;sheetGrid.doc=latest.document;sheetGrid.version=latest.version;
   s.ref=structuredClone(a.nextRef);s.refs=s.refs.map(r=>ExcelSaveRecoveryModel.identity(r)===ExcelSaveRecoveryModel.identity(s.ref)?s.ref:r);s.openRefs=structuredClone(a.refs);s.openVersion=a.result.version;s.savedSignature=a.signature;s.saveAttempt=null;s.pendingSave=null;s.saveState='ready';s.recovery=null;s.dirty=false;
   try{s.options.onSaved?.(s.ref);}catch{}toast('Excel副本版本已保存');return true;
  }catch(e){if(exCurrent(s)){s.saveState='saved';s.recovery={text:'Excel副本已保存，但列表刷新未完成。只需刷新列表，无需重新提交修改。'};}return false;}
 },
 async save(s){
  if(!exCurrent(s)||s.saving||s.applying||s.recoveryLoading)return false;
  if(s.saveState==='conflict'){this.panel(s);return false;}
  if(!s.saveAttempt){
   if(exHasUnapplied(s))await exFlushCell(s);if(!exCurrent(s)||exHasUnapplied(s)||!s.dirty)return false;if(!s.attachment){toast('先保存附件关联，再保存Excel副本');return false;}
   const baseRef=structuredClone(s.ref),baseRefs=structuredClone(s.openRefs||[]),manifest=ExcelSaveRecoveryModel.manifest(baseRef,[...s.edits.values()],new Date().toISOString()),bytes=new TextEncoder().encode(JSON.stringify(manifest));
   if(!baseRefs.some(r=>ExcelSaveRecoveryModel.same(r,baseRef))){s.saveState='conflict';s.recovery={text:'打开时的附件关联已变化，当前修改仍保留，请先导出修改清单。'};exUpdateEditorStatus(s);return false;}
   if(bytes.byteLength>2*1024*1024){s.saveState='rejected';s.recovery={text:'修改清单超过2 MiB，请减少修改或导出编辑版。'};exUpdateEditorStatus(s);return false;}
   const commandId=crypto.randomUUID();let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
   s.saveAttempt={signature:exSignature(s.edits.values()),manifest,baseRef,baseRefs,expectedVersion:s.openVersion,commandId,uploadBody:{name:'excel-revision-'+commandId+'.json',data:btoa(binary)},uploaded:null,command:null,result:null};
  }
  const a=s.saveAttempt;s.saving=true;s.recovery=null;exUpdateEditorStatus(s);
  try{
   if(!a.result){
    if(!a.uploaded)a.uploaded=await sgRequest('worksheet-upload',{source:s.source},a.uploadBody,s.scope);if(!exCurrent(s))return false;
    if(!a.nextRef){a.nextRef={kind:a.baseRef.kind,id:a.baseRef.id,name:a.baseRef.name,excelRevision:a.uploaded.id};a.refs=a.baseRefs.map(r=>ExcelSaveRecoveryModel.identity(r)===ExcelSaveRecoveryModel.identity(a.baseRef)?a.nextRef:r);}
    if(!a.command)a.command={commandId:a.commandId,expectedVersion:a.expectedVersion,action:{type:'set-cells',row:s.attachment.row,cells:{[s.attachment.column]:structuredClone(a.refs)}}};
    a.result=await sgRequest('worksheet-command',{source:s.source},a.command,s.scope);if(!exCurrent(s))return false;s.saveState='saved';
   }
   return await this.refresh(s);
  }catch(e){
   if(!exCurrent(s))return false;const outcome=SheetSaveModel.outcome(e);
   if(outcome==='conflict'){s.saveState='conflict';await this.compare(s);}
   else if(outcome==='unknown'){s.saveState='unknown';s.recovery={text:'保存结果尚未确认。当前修改已锁定，请按原命令核对；也可导出修改清单留存。'};}
   else{s.saveState='rejected';s.saveAttempt=null;s.recovery={text:exError(e)};}
   return false;
  }finally{s.saving=false;if(exCurrent(s))exUpdateEditorStatus(s);}
 }
};
