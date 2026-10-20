/* Recoverable, in-memory edits. Never persist employee task inputs in browser storage. */
let sgEditSession=null;
function sgEditCurrent(s){return sgEditSession===s&&s.form.isConnected&&sgCurrent(s.scope)&&sheetGrid.source===s.source;}
function sgEditValues(form){return JSON.stringify([...new FormData(form)]);}
function sgEditChanged(s){return s&&(s.initial!==sgEditValues(s.form)||['unknown','saved'].includes(s.state));}
function sgEditLock(s,locked){for(const [control,disabled]of s.controls)control.disabled=locked||disabled;s.button.disabled=locked;}
function sgEditRelease(s){if(sgEditSession===s)sgEditSession=null;}
function sgEditLeave(){
 const s=sgEditSession;if(!s)return true;
 if(!sgEditCurrent(s)){sgEditRelease(s);return true;}
 if(s.state==='saving'||s.state==='loading'){toast('正在核对保存结果，请稍候');return false;}
 if(sgEditChanged(s)&&!confirm(s.state==='unknown'?'上次保存结果尚未确认。建议先按原命令重试核对；现在离开会丢失本窗口的重试信息。确定离开？':s.state==='saved'?'内容已保存，列表尚未刷新。确定离开编辑？':'当前输入尚未保存，确定放弃并离开？'))return false;
 sgEditRelease(s);return true;
}
const sgSaveCloseOriginal=closeOverlay;closeOverlay=function(){if(sgEditLeave())return sgSaveCloseOriginal();};
const sgSaveOverlayOriginal=overlay;overlay=function(...args){if(sgEditLeave())return sgSaveOverlayOriginal(...args);};
const sgSaveWorkspaceOriginal=workspaceClear;workspaceClear=function(){sgEditSession=null;return sgSaveWorkspaceOriginal();};
window.addEventListener('beforeunload',e=>{if(sgEditSession&&sgEditCurrent(sgEditSession)&&(sgEditChanged(sgEditSession)||['saving','loading'].includes(sgEditSession.state))){e.preventDefault();e.returnValue='';}});
function sgSaveMessage(s,text,buttonText,handler){
 s.panel.replaceChildren();const message=document.createElement('p');message.textContent=text;s.panel.append(message);s.panel.hidden=false;
 if(buttonText){const button=document.createElement('button');button.type='button';button.className='btn sm';button.dataset.sgSaveRetry='';button.textContent=buttonText;button.onclick=handler;s.panel.append(button);}
}
function sgSaveFinish(s){if(!sgEditCurrent(s))return;sgEditRelease(s);closeOverlay();shell();s.done?.();toast('已保存');}
async function sgSaveRefresh(s){
 if(!sgEditCurrent(s)||s.refreshing)return;s.refreshing=true;s.state='loading';sgEditLock(s,true);sgSaveMessage(s,'内容已保存，正在刷新列表…');
 try{await sgReload(s.source,s.scope);if(sgEditCurrent(s))sgSaveFinish(s);}catch(e){if(sgEditCurrent(s)){s.state='saved';sgSaveMessage(s,'内容已保存，但列表刷新失败。无需再次提交修改。','刷新列表',()=>void sgSaveRefresh(s));}}
 finally{s.refreshing=false;}
}
async function sgSaveCompare(s,action){
 if(!sgEditCurrent(s)||s.comparing)return;s.comparing=true;s.state='loading';sgEditLock(s,true);sgSaveMessage(s,'正在读取最新版本，当前输入仍保留…');
 try{
  const latest=await sgRequest('worksheet',{source:s.source},undefined,s.scope);if(!sgEditCurrent(s))return;
  const plan=SheetSaveModel.plan(s.base,latest.document,action);s.state='conflict';sgEditLock(s,false);s.button.disabled=true;s.panel.replaceChildren();s.panel.hidden=false;
  const heading=document.createElement('p');heading.textContent=plan.blocked||(!plan.conflicts.length?'其他位置已更新，本次编辑字段未冲突。确认后可基于最新版本重试。':'以下字段同时被修改，请逐项选择保留的内容。');s.panel.append(heading);
  if(plan.blocked)return;
  const choices={};
  if(plan.conflicts.length){
   const table=document.createElement('table');table.className='sg-conflict-table';
   const head=document.createElement('thead');head.innerHTML='<tr><th>字段</th><th>打开时</th><th>最新内容</th><th>我的输入</th><th>保留</th></tr>';table.append(head);const body=document.createElement('tbody');table.append(body);
   const show=(value,c)=>c.id==='@parent'?(latest.document.rows.find(r=>r.id===value)?.cells.title||value||'顶层记录'):value||'（空白）';
   for(const c of plan.conflicts){const tr=document.createElement('tr');for(const value of [c.label,show(c.before,c),show(c.latest,c),show(c.mine,c)]){const td=document.createElement('td');td.textContent=value;tr.append(td);}const td=document.createElement('td'),select=document.createElement('select');select.setAttribute('aria-label',c.label+'保留内容');select.dataset.sgConflict=c.id;for(const [value,text]of [['','请选择'],['latest','最新内容'],['mine','我的输入']]){const o=document.createElement('option');o.value=value;o.textContent=text;select.append(o);}select.onchange=()=>{choices[c.id]=select.value;retry.disabled=plan.conflicts.some(x=>!choices[x.id]);};td.append(select);tr.append(td);body.append(tr);}
   const scroll=document.createElement('div');scroll.className='sg-conflict-scroll';scroll.append(table);s.panel.append(scroll);
  }
  const retry=document.createElement('button');retry.type='button';retry.className='btn primary sm';retry.id='sgMergeSave';retry.disabled=plan.conflicts.length>0;retry.textContent=plan.conflicts.length?'按选择合并保存':'基于最新版本重试';
  retry.onclick=()=>{if(!sgEditCurrent(s)||s.state!=='conflict')return;const resolved=SheetSaveModel.resolve(action,plan,choices);for(const [id,value]of Object.entries(resolved.cells)){const input=s.form.elements.namedItem(id)||(s.form.id==='sgCellForm'?s.form.elements.namedItem('value'):null);if(input)input.value=value;}if(Object.hasOwn(resolved,'parentId')&&s.form.elements.namedItem('sgParent'))s.form.elements.namedItem('sgParent').value=resolved.parentId||'';s.base=structuredClone(latest.document);s.version=latest.version;s.attempt=null;void sgSaveSend(s,resolved);};s.panel.append(retry);
 }catch(e){if(sgEditCurrent(s)){s.state='rejected';sgEditLock(s,false);sgSaveMessage(s,'最新版本读取失败，当前输入仍保留。','重新核对',()=>void sgSaveCompare(s,action));}}
 finally{s.comparing=false;}
}
async function sgSaveSend(s,override){
 if(!sgEditCurrent(s)||['saving','loading','saved'].includes(s.state))return;
 if(!s.attempt){let action;try{action=override||s.build(new FormData(s.form));}catch(e){sgSaveMessage(s,sgError(e));return;}s.attempt={commandId:crypto.randomUUID(),expectedVersion:s.version,action:structuredClone(action)};}
 s.state='saving';sgEditLock(s,true);sgSaveMessage(s,'正在保存…');
 try{
  await sgRequest('worksheet-command',{source:s.source},s.attempt,s.scope);if(!sgEditCurrent(s))return;s.state='saved';await sgSaveRefresh(s);
 }catch(e){
  if(!sgEditCurrent(s))return;const outcome=SheetSaveModel.outcome(e);
  if(outcome==='unknown'){s.state='unknown';sgSaveMessage(s,'保存结果尚未确认，当前输入已锁定。请按原命令重试核对，避免重复提交。','按原命令重试',()=>void sgSaveSend(s));}
  else {const action=s.attempt.action;s.attempt=null;s.state='rejected';sgEditLock(s,false);if(outcome==='conflict')await sgSaveCompare(s,action);else sgSaveMessage(s,sgError(e));}
 }
}
sgSubmit=function(form,build,done){
 if(!form||!document.querySelector(`[form="${form.id}"]`)||(sgEditSession?.form===form&&sgEditCurrent(sgEditSession)))return;
 const s={form,build,done,source:sheetGrid.source,scope:sgScope(),version:sheetGrid.version,base:structuredClone(sheetGrid.doc),initial:sgEditValues(form),controls:[...form.elements].map(x=>[x,x.disabled]),button:document.querySelector(`[form="${form.id}"]`),state:'ready',attempt:null};
 s.panel=document.createElement('div');s.panel.className='sg-save-recovery';s.panel.setAttribute('role','status');s.panel.setAttribute('aria-live','polite');s.panel.hidden=true;form.append(s.panel);sgEditSession=s;
 form.addEventListener('input',e=>{if(e.target.closest('.sg-save-recovery'))return;if(['conflict','rejected'].includes(s.state)){s.panel.hidden=true;s.panel.replaceChildren();s.state='ready';s.attempt=null;s.button.disabled=false;}});
 form.onsubmit=e=>{e.preventDefault();void sgSaveSend(s);};
};
