/* Same-origin Naumi session adapter. Display names and Demo roles never authorize. */
const workspace={active:false,loading:false,error:'',status:0,epoch:0,directory:null,enterpriseId:'',context:null,teamId:''};
function workspaceTeam(){return workspace.context?.workspace.teams.find(t=>t.teamId===workspace.teamId)||null;}
function requirementScope(){return {epoch:workspace.epoch,active:workspace.active,enterpriseId:workspace.enterpriseId,teamId:workspace.teamId,email:workspace.directory?.viewer.email||''};}
function scopeCurrent(s){return JSON.stringify(s)===JSON.stringify(requirementScope());}
function requirementCan(permission,order){if(!workspace.active)return true;const t=workspaceTeam();return !!t?.permissions.includes(permission)&&(!order||permission!=='request'||order.requester===workspace.context?.workspace.subject||t.permissions.includes('manage'));}
function requirementViewer(){return workspace.active?workspace.directory?.viewer.name||workspace.directory?.viewer.email||'未登录':'本机项目管理员';}
function workspaceError(e){return ({ENTERPRISE_INTEGRATION_NOT_CONFIGURED:'企业来源实例尚未配置。',WORKFLOW_LOGIN_NOT_CONFIGURED:'本机尚未连接Naumi员工登录。来源准备仍可使用。',WORKFLOW_BRIDGE_NOT_CONFIGURED:'Naumi与协作服务的连接尚未配置。',WORKFLOW_IDENTITY_NOT_BOUND_OR_REVOKED:'当前账号尚未绑定工作流身份，或绑定已停用。',ACCOUNT_CHANGED:'登录账号已变化，请重新选择工作区。',WORKSPACE_CHANGED:'工作区已切换，请在当前工作区重新打开记录。',WORKFLOW_SERVICE_UNAVAILABLE:'工作流服务暂未就绪，请重试。',WORKFLOW_RESPONSE_INVALID:'工作区响应格式异常，请重试。'})[e.message]||e.message;}
function workspaceClear(){workspace.epoch++;workspace.context=null;workspace.teamId='';intake.epoch++;intake.orders=[];intake.total=0;intake.query='';intake.status='';intake.page=1;intake.viewer=null;intake.error='';intake.loading=false;imported.epoch++;imported.active=false;imported.rows=[];imported.assets=[];imported.batch=null;peopleMapping.epoch++;peopleMapping.active=false;peopleMapping.profiles=[];peopleMapping.occurrences=[];peopleMapping.selected.clear();sourceClear();sourceState.context=null;sourceState.tab='local';closeOverlay();}
async function workspaceFetch(action,params={},body,scope){
 const epoch=workspace.epoch;
 if(scope&&!scopeCurrent(scope))throw Error('WORKSPACE_CHANGED');
 const r=await fetch('/api/enterprise/workflow?'+new URLSearchParams({action,...params}),{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...(scope?.email?{'x-workflow-viewer':scope.email}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 if(epoch!==workspace.epoch)throw Error('WORKSPACE_CHANGED');
 if(!r.headers.get('content-type')?.includes('application/json'))throw Error('WORKFLOW_RESPONSE_INVALID');
 const data=await r.json();if(epoch!==workspace.epoch)throw Error('WORKSPACE_CHANGED');
 if(!r.ok){const e=Error(typeof data.error==='string'?data.error:data.error?.code||'WORKFLOW_SERVICE_UNAVAILABLE');e.status=r.status;
  if(scope&&([401,403].includes(r.status)||e.message==='ACCOUNT_CHANGED')){workspaceClear();workspace.directory=null;workspace.enterpriseId='';workspace.error=workspaceError(e);workspace.status=r.status;workspace.loading=false;shell();}
  throw e;
 }return data;
}
async function requirementRequest(action,params={},body,scope=requirementScope()){
 if(!scopeCurrent(scope))throw Error('WORKSPACE_CHANGED');
 if(!scope.active){const r=await importRequest(action,params,body);if(!scopeCurrent(scope))throw Error('WORKSPACE_CHANGED');return r;}
 if(!workspaceTeam())throw Error('请先选择企业和团队');
 if(action==='session')return {csrf:''};
 if(!['orders','order','command','intake','tasks','assignees','facts','schedule','personal','schedule-audit','schedule-command','week','batch-preview','batch-receipts','batch-plan','batch-run','batch-close','batch-list','batch-get','history'].includes(action))throw Error('员工工作区暂未接通此操作');
 return workspaceFetch(action,{...params,enterpriseId:scope.enterpriseId,teamId:scope.teamId},body,scope);
}
async function workspaceDiscover(){workspaceClear();workspace.active=true;intake.active=true;view='requirements';workspace.directory=null;workspace.enterpriseId='';workspace.error='';workspace.status=0;workspace.loading=true;const epoch=workspace.epoch;shell();
 try{const d=await workspaceFetch('discovery');if(epoch!==workspace.epoch)return;if(d.version!==1||!d.viewer?.email||!Array.isArray(d.enterprises)||!['shared','dedicated'].includes(d.mode))throw Error('WORKFLOW_RESPONSE_INVALID');workspace.directory=d;}catch(e){if(epoch!==workspace.epoch)return;workspace.error=workspaceError(e);workspace.status=e.status||0;}finally{if(epoch===workspace.epoch){workspace.loading=false;shell();}}
}
async function workspaceChooseEnterprise(id){const directory=workspace.directory;workspaceClear();workspace.directory=directory;workspace.enterpriseId=id;workspace.error='';workspace.loading=true;const epoch=workspace.epoch;shell();
 try{if(!directory?.enterprises.some(e=>e.id===id))throw Error('请选择当前账号所属企业');const c=await workspaceFetch('context',{enterpriseId:id},undefined,requirementScope());if(epoch!==workspace.epoch)return;if(c.source?.sourceSubject!==directory.viewer.email||c.source?.sourceEnterprise!==id||!Array.isArray(c.workspace?.teams))throw Error('WORKFLOW_RESPONSE_INVALID');workspace.context=c;}catch(e){if(epoch!==workspace.epoch)return;workspace.error=workspaceError(e);}finally{if(epoch===workspace.epoch){workspace.loading=false;shell();}}
}
async function workspaceChooseTeam(id){const context=workspace.context;if(!context?.workspace.teams.some(t=>t.teamId===id))return;workspaceClear();workspace.context=context;workspace.teamId=id;workspace.error='';await intakeLoad();}
function workspaceExit(){workspaceClear();workspace.active=false;workspace.directory=null;workspace.enterpriseId='';workspace.error='';workspace.loading=false;intake.active=false;view='requirements';shell();}
function workspacePanel(){const s=workspace,d=s.directory;return `<section class="workspace-panel"><div class="workspace-title"><div><b>员工工作区</b><small>${d?`${esc(d.viewer.name)} · ${esc(d.viewer.email)}`:'使用Naumi现有账号'}</small></div><button class="btn" id="workspaceRefresh">刷新身份</button><button class="btn" id="workspaceExit">返回预览</button></div>${s.error?`<div class="sc-alert" role="alert">${esc(s.error)}${s.status===401?'<a class="btn" href="/sign-in?redirect=%2Fenterprise%2Fworkflow">登录Naumi</a>':''}</div>`:''}<div class="workspace-selects"><label class="field">企业<select id="workspaceEnterprise" ${s.loading?'disabled':''}><option value="">请选择企业</option>${(d?.enterprises||[]).map(e=>`<option value="${e.id}" ${e.id===s.enterpriseId?'selected':''}>${esc(e.name)}</option>`).join('')}</select></label><label class="field">团队<select id="workspaceTeam" ${s.loading||!s.context?'disabled':''}><option value="">请选择团队</option>${(s.context?.workspace.teams||[]).map(t=>`<option value="${t.teamId}" ${t.teamId===s.teamId?'selected':''}>${esc(t.name||'未命名团队')} · ${t.teamId.slice(0,8)}</option>`).join('')}</select></label></div>${s.loading?'<p class="source-note">正在核验当前身份…</p>':d&&!d.enterprises.length?'<p class="source-note">当前账号没有已授权的企业工作区。</p>':s.context&&!s.context.workspace.teams.length?'<p class="source-note">账号已关联企业，尚无有效团队成员资格。</p>':''}</section>`;}
const workspaceOriginalRequirements=requirements;
requirements=function(){if(!workspace.active)return `<div class="workspace-entry"><button class="btn" id="workspaceOpen">${icon('building')}员工工作区</button></div>`+workspaceOriginalRequirements();return workspacePanel()+(workspaceTeam()?workspaceOriginalRequirements():heading('需求中心','')+'<div class="empty">选择企业与团队后查看需求</div>');};
const workspaceOriginalRender=renderPage;
renderPage=function(){if(workspace.active&&!['requirements','tasks','performance','schedule'].includes(view))return workspacePanel()+heading((navs.find(n=>n[0]===view)||['','','当前模块'])[2],'')+'<div class="empty">此模块的员工工作区正在接入；需求中心已可使用。</div>';return workspaceOriginalRender();};
const workspaceOriginalBind=bind;
bind=function(){
 // Other local-mode handlers expect their own controls. Render and bind only the current mode.
 if(workspace.active&&view!=='requirements'){const originalView=view;view='__workspace__';workspaceOriginalBind();view=originalView;}else workspaceOriginalBind();
 const open=$('#workspaceOpen');if(open)open.onclick=workspaceDiscover;if(!workspace.active)return;
 const refresh=$('#workspaceRefresh');if(refresh)refresh.onclick=workspaceDiscover;const exit=$('#workspaceExit');if(exit)exit.onclick=workspaceExit;
 const enterprise=$('#workspaceEnterprise');if(enterprise)enterprise.onchange=e=>void workspaceChooseEnterprise(e.target.value);const team=$('#workspaceTeam');if(team)team.onchange=e=>void workspaceChooseTeam(e.target.value);
 $$('#app [data-intake-mode]').forEach(b=>b.closest('.source-tabs')?.remove());
 const roleSelect=$('#roleSelect');roleSelect.innerHTML='<option>当前账号权限</option>';roleSelect.disabled=true;$('.preview-badge').textContent='员工工作区 · 服务端权限';const org=$('.org-switch span:nth-child(2)');if(org)org.innerHTML=`${esc(workspace.directory?.enterprises.find(e=>e.id===workspace.enterpriseId)?.name||'选择工作区')}<small>${esc(workspaceTeam()?.name||workspace.teamId.slice(0,8)||'尚未选择团队')}</small>`;
 const orgButton=$('.org-switch');if(orgButton)orgButton.onclick=e=>{e.stopPropagation();view='requirements';shell();};const profile=$('.profile-text');if(profile)profile.innerHTML=`<b>${esc(requirementViewer())}</b><small>${esc(workspace.directory?.viewer.email||'尚未登录')}</small>`;const avatar=$('.profile .avatar');if(avatar)avatar.textContent=requirementViewer().slice(0,1);
 const date=$('.date-button');if(date)date.remove();const searchBox=$('.search-box');if(searchBox)searchBox.remove();const create=$('#intakeCreate');if(create&&!requirementCan('request'))create.remove();const source=$('#intakeSource');if(source)source.remove();const status=$('.sc-statusline .sc-prototype');if(status)status.textContent=workspaceTeam()?.name||workspace.teamId.slice(0,8);const note=$('.content > .source-note');if(note&&view==='requirements')note.textContent='权限来自当前企业与团队；原表身份映射不改变登录权限。';
 $$('.sidebar .count').forEach(e=>e.remove());$$('.sidebar [data-action="reset"],.sidebar [data-action="help"]').forEach(e=>e.remove());
};
if(location.pathname==='/enterprise/workflow')queueMicrotask(()=>void workspaceDiscover());
async function workspaceRevalidate(){if(!workspace.active||workspace.loading||!workspaceTeam())return;const s=requirementScope();try{const c=await workspaceFetch('context',{enterpriseId:s.enterpriseId},undefined,s);if(!scopeCurrent(s))return;if(!c.workspace?.teams.some(t=>t.teamId===s.teamId)){workspaceClear();workspace.error='团队成员资格已变更，请重新选择工作区。';shell();return;}workspace.context=c;if(!$('#overlay').children.length)await intakeLoad();}catch(e){if(scopeCurrent(s)){workspaceClear();workspace.error=workspaceError(e);shell();}}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void workspaceRevalidate();});
