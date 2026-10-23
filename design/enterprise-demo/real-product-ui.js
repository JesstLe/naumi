/* Product-only presentation of the persistent worksheet. No synthetic orders, identities or acceptance facts. */
if(REAL_PRODUCT){
 const RPM=globalThis.EnterpriseRealModel;
 const rp={loading:false,loaded:false,error:'',peopleError:'',epoch:0,peopleSource:'',views:{requirements:{query:'',status:null,designer:null,page:1,mode:'list'},tasks:{query:'',status:null,designer:null,page:1,mode:'list'}}};
 imported.active=true;peopleMapping.active=true;intake.active=false;
 sourceState.tab='naumi';
 const rpModel=()=>RPM.project(sheetGrid.doc||{rows:[],columns:[]});
 const rpView=()=>rp.views[view]||rp.views.requirements;
 const rpOptions=(values,current,all)=>`<option value="all" ${current===null?'selected':''}>${all}</option>${values.map((value,index)=>`<option value="item:${index}" ${value===current?'selected':''}>${esc(value||'未填写')}</option>`).join('')}`;
 function rpNames(row,field){
  const raw=field==='designer'?row.designer:row.owner;
  if(rp.peopleSource!==sheetGrid.source||peopleMapping.source?.sourceHash!==sheetGrid.source||!row.originRow)return esc(raw||'未填写');
  const occurrence=peopleMapping.occurrences.find(o=>o.row===row.originRow&&o.field===(field==='designer'?'设计师':'需求方'));
  // Mapping applies only to the exact unchanged source field, never name matching.
  if(!occurrence||occurrence.sourceChanged||occurrence.sourceName!==raw)return esc(raw||'未填写');
  const ids=occurrence.personIds||(occurrence.personId?[occurrence.personId]:[]),profiles=ids.map(id=>peopleMapping.profiles.find(p=>p.id===id&&p.enabled));
  if(!profiles.length||profiles.some(p=>!p))return esc(raw||'未填写');
  return profiles.map(p=>`<span class="rp-person">${esc(p.realName)}${p.nickname?`<small>${esc(p.nickname)}</small>`:''}</span>`).join('');
 }
 function rpThumb(row){const image=row.images[0];return image?`<button class="rp-image" data-rp-image="${esc(row.id)}" aria-label="查看产品图"><img src="${esc(sgFileUrl(image))}" loading="lazy" decoding="async" alt="产品图"></button>`:'<span class="rp-no-image">—</span>';}
 function rpTable(rows,compact=false){return `<div class="table-wrap rp-table"><table><thead><tr><th>需求 / 制作内容</th>${compact?'':'<th>产品图</th>'}<th>需求方</th><th>设计人员</th><th>来源状态</th><th>排期标签</th>${compact?'':'<th>开始 / 完成日期</th><th>数量 / 附件</th>'}<th></th></tr></thead><tbody>${rows.map(row=>`<tr><td><button class="task-main" data-rp-row="${esc(row.id)}">${esc(row.title||'未填写名称')}</button><small>${row.originRow?'源第 '+row.originRow+' 行':'新增记录'}${row.parentConfirmed&&row.parentTitle?' · '+esc(row.parentTitle):row.hasUnconfirmedParent?' · 父关系待确认':''}</small></td>${compact?'':`<td>${rpThumb(row)}</td>`}<td>${rpNames(row,'owner')}</td><td>${rpNames(row,'designer')}</td><td>${importStatusBadge(row.status)}</td><td>${importScheduleBadge(row.schedule)}</td>${compact?'':`<td><span>${esc(row.started||'—')}</span><small>${esc(row.finished||'—')}</small></td><td>${esc(row.quantity||'—')}<small>${row.files.length+row.images.length} 个附件</small></td>`}<td><button class="btn sm" data-rp-row="${esc(row.id)}">详情</button></td></tr>`).join('')||`<tr><td colspan="${compact?6:9}" class="empty">${rp.loading?'正在读取真实记录…':'当前筛选没有记录'}</td></tr>`}</tbody></table></div>`;}
 function rpError(){return rp.error?`<div class="source-error" role="alert">${esc(rp.error)}<button class="btn sm" data-rp-refresh>重试</button></div>`:rp.peopleError?'<p class="source-note" role="status">花名资料暂未读取，当前显示原表姓名；记录编辑不受影响。</p>':'';}
 function rpActions(create=true){return `<button class="btn" data-rp-refresh ${rp.loading?'disabled':''}>${icon('refresh')}刷新</button>${create?'<button class="btn primary" data-rp-create>'+icon('plus')+'新建需求记录</button>':''}`;}
 function rpList(){const s=rpView(),m=rpModel(),rows=RPM.filter(m.rows,{query:s.query,...(s.status===null?{}:{status:s.status}),...(s.designer===null?{}:{designer:s.designer})}).sort((a,b)=>Number(!a.title.trim())-Number(!b.title.trim())),page=RPM.page(rows,s.page,30);s.page=page.page;
  const tabs=[['全部',null,m.counts.records],['进行中','进行中',m.counts.inProgress],['未开始','未开始',m.counts.notStarted],['已完成','已完成',m.counts.completed],['未填写','',m.rows.filter(r=>r.status==='').length]];
  const board=s.mode==='board'?`<div class="rp-board">${[...new Set(page.rows.map(r=>r.status))].map(status=>`<section class="rp-lane"><h3>${esc(status||'状态未填写')}</h3>${page.rows.filter(r=>r.status===status).map(row=>`<article class="rp-card">${rpThumb(row)}<button class="task-main" data-rp-row="${esc(row.id)}">${esc(row.title||'未填写名称')}</button><p>${rpNames(row,'designer')}</p>${importScheduleBadge(row.schedule)}<small>${row.originRow?'源第 '+row.originRow+' 行':'新增记录'}</small></article>`).join('')}</section>`).join('')||'<div class="empty">当前筛选没有记录</div>'}</div>`:rpTable(page.rows);
  return heading(view==='tasks'?'任务中心':'需求中心','',rpActions())+rpError()+`<section class="panel task-center-panel rp-records"><div class="task-center-tabs" role="tablist" aria-label="来源状态">${tabs.map(([label,status,count],i)=>`<button class="task-center-tab ${s.status===status?'active':''}" data-rp-status="${i}" role="tab" id="rp-tab-${i}" aria-controls="rp-results" aria-selected="${s.status===status}" tabindex="${s.status===status?0:-1}">${label}<span>${count}</span></button>`).join('')}</div><form id="rpSearch" class="sc-toolbar rp-toolbar"><label class="sc-search">${icon('search')}<input name="query" maxlength="120" aria-label="搜索真实记录" placeholder="搜索需求、人员、数量或排期" value="${esc(s.query)}"></label><select name="designer" aria-label="按设计人员筛选">${rpOptions([...new Set(m.rows.map(r=>r.designer))],s.designer,'全部设计人员')}</select><button class="btn">筛选</button>${s.query||s.designer!==null?'<button class="sc-link" type="button" id="rpClear">清除</button>':''}<button class="btn rp-mode" type="button" id="rpMode">${icon(s.mode==='list'?'grid':'file')}${s.mode==='list'?'看板':'列表'}</button></form><div id="rp-results" role="tabpanel" aria-labelledby="rp-tab-${Math.max(0,tabs.findIndex(t=>t[1]===s.status))}">${board}</div><div class="source-pager"><span>共 ${page.total} 条工作表记录 · 每页 ${page.size} 条</span><button class="btn sm" id="rpPrevious" ${page.page<=1?'disabled':''}>上一页</button><span>${page.page} / ${page.pages}</span><button class="btn sm" id="rpNext" ${page.page>=page.pages?'disabled':''}>下一页</button></div></section><p class="source-note">需求、任务与排期共用一份工作表；来源“已完成”保留原义，不代表系统验收。</p>`;
 }
 function rpHome(){const m=rpModel(),c=m.counts,ready=rp.loaded&&!rp.loading;
  const cards=[['真实记录',c.records,'file',null],['来源进行中',c.inProgress,'clock','进行中'],['来源已完成',c.completed,'check','已完成'],['状态未填写',m.rows.filter(r=>r.status==='').length,'task','']];
  const recent=m.rows.slice().sort((a,b)=>Number(b.status==='进行中')-Number(a.status==='进行中')||Number(!a.title.trim())-Number(!b.title.trim())).slice(0,8);
  return heading('工作台','',rpActions())+rpError()+`<section class="stats rp-stats">${cards.map(([label,value,i,status],index)=>`<button class="stat" data-rp-summary="${index}"><span class="stat-top">${label}<span class="stat-icon">${icon(i)}</span></span><span class="stat-number">${ready?value:'—'}<small>条</small></span></button>`).join('')}</section><div class="rp-home-grid"><section class="panel"><div class="panel-head"><span class="panel-title">制作记录 <small>优先展示来源进行中</small></span><button class="sc-link" data-rp-nav="tasks">任务中心 ${icon('chevron')}</button></div>${rpTable(recent,true)}</section><section class="panel"><div class="panel-head"><span class="panel-title">设计人员分布</span></div><div class="rp-designers">${m.designerCounts.slice().sort((a,b)=>b.count-a.count).slice(0,8).map(d=>`<div><span>${esc(d.name||'未填写')}<small>来源进行中 ${d.inProgress} · 来源已完成 ${d.completed}</small></span><b>${d.count}</b></div>`).join('')||'<div class="empty">暂无人员记录</div>'}</div></section></div><section class="panel rp-overview"><div class="panel-head"><span class="panel-title">当前工作表</span><button class="btn" data-rp-nav="schedule">打开团队排期</button></div><div class="rp-overview-grid"><div><small>来源表</small><b>${esc(imported.batch?.sheet||'正在读取')}</b></div><div><small>有名称记录</small><b>${ready?c.named:'—'}</b></div><div><small>已填写设计人员</small><b>${ready?c.assigned:'—'}</b></div><div><small>工作表附件引用</small><b>${ready?c.attachments:'—'}</b></div></div></section>`;
 }
 function rpEmpty(title,description){return heading(title,'',`<button class="btn" data-rp-nav="schedule">查看真实工作表</button>`)+`<section class="panel"><div class="empty">${description}</div></section>`;}
 async function rpLoad(){if(rp.loading)return;if($('#overlay')?.children.length){closeOverlay();if($('#overlay').children.length)return;}const epoch=++rp.epoch;rp.loading=true;rp.loaded=false;rp.error='';rp.peopleError='';rp.peopleSource='';peopleMapping.profiles=[];peopleMapping.occurrences=[];shell();
  try{await importLoad();if(epoch!==rp.epoch)return;if(!sheetGrid.doc||sheetGrid.source!==imported.batch?.sourceHash)throw Error(sheetGrid.error||imported.error||'尚无真实工作表');
   const source=sheetGrid.source;rp.loaded=true;
   try{const people=await importRequest('people',{source});if(epoch!==rp.epoch||source!==sheetGrid.source)return;if(people.sourceHash!==source||!Array.isArray(people.profiles)||!Array.isArray(people.occurrences))throw Error('人员资料来源不一致，请重新读取');peopleMapping.profiles=people.profiles;peopleMapping.occurrences=people.occurrences;peopleMapping.source=imported.batch;peopleMapping.multiPersonEnabled=people.multiPersonEnabled===true;rp.peopleSource=source;}
   catch(e){if(epoch===rp.epoch){rp.peopleError=e.message||'人员资料读取失败';rp.peopleSource='';}}
  }catch(e){if(epoch===rp.epoch){rp.error=e.message||'真实数据读取失败';sheetGrid.doc=null;sheetGrid.source='';}}
  finally{if(epoch===rp.epoch){rp.loading=false;shell();}}
 }
 function rpNavigate(target){if(!['dashboard','requirements','tasks','schedule','imports','assets','performance','team','rules'].includes(target))return;closeOverlay();if($('#overlay')?.children.length)return;view=target;search='';if(target==='assets')sourceState.tab='naumi';shell();window.scrollTo(0,0);if(!rp.loaded&&!rp.loading&&['dashboard','requirements','tasks','schedule','imports','team'].includes(target))void rpLoad();}
 function rpOpen(id){if(!sheetGrid.doc)return;const row=sheetGrid.doc.rows.find(r=>r.id===id&&!r.archived);if(row)sgRowMenu(id);}
 function rpCreate(){if(!sheetGrid.doc||rp.loading){toast('请先读取真实工作表');return;}sgRowForm();}
 const rpRender=renderPage;
 renderPage=function(){if(!REAL_PRODUCT||workspace.active)return rpRender();let html;
  if(view==='dashboard')html=rpHome();else if(['requirements','tasks'].includes(view))html=rpList();else if(['schedule','imports'].includes(view))html=importPage();
  else if(view==='team')html=heading('成员与团队','',`<button class="btn" id="peopleRefresh">刷新</button><button class="btn primary" id="peopleCreate">新增人员资料</button>`)+peoplePage();
  else if(view==='assets'){sourceState.tab='naumi';html=heading('素材与交付','',`<button class="btn" id="sourceRefresh">${icon('refresh')}刷新来源</button>`)+sourcePanel();}
  else if(view==='performance')html=rpEmpty('贡献与绩效','当前没有经过独立验收的绩效事实。来源完成记录可在任务中心查看。');
  else html=rpEmpty('归属规则','当前按真实工作表中的需求方、设计人员和排期标签管理。');
  return html+`<footer class="footer-caption"><span>真实业务工作区${sheetGrid.doc?' · 工作表 v'+sheetGrid.version:''}</span><span>原始来源保留</span></footer>`;
 };
 // Keep original source/worksheet handlers only on pages that render their controls.
 const rpBind=bind;
 bind=function(){if(workspace.active)return rpBind();const current=view,pass=['schedule','imports','team','assets'].includes(current);if(!pass)view='__real_product__';try{rpBind();}finally{view=current;}
  const roleSelect=$('#roleSelect');if(roleSelect){roleSelect.replaceChildren(new Option('本机项目管理员','local-owner'));roleSelect.disabled=true;roleSelect.setAttribute('aria-label','当前工作区身份');roleSelect.onchange=null;}
  const profile=$('.profile-text');if(profile)profile.innerHTML='<b>本机项目管理员</b><small>真实业务工作区</small>';const avatar=$('.profile .avatar');if(avatar)avatar.textContent='管';
  const org=$('.org-switch span:nth-child(2)');if(org)org.innerHTML='电商设计中心<small>真实业务工作区</small>';
  const badge=$('.preview-badge');if(badge)badge.textContent='真实数据 · 本机数据库';
  $$('.sidebar [data-action="reset"],.sidebar [data-action="help"],.date-button,.search-box,.notification-button,[data-import-mode],[data-intake-mode],[data-people-mode],[data-source-tab="local"]').forEach(e=>e.remove());
  const counts=rpModel().counts;for(const target of ['requirements','tasks']){const count=$(`[data-view="${target}"] .count`);if(count){count.textContent=rp.loaded?counts.records:'—';count.hidden=false;}}
  $$('[data-view]').forEach(b=>b.onclick=()=>rpNavigate(b.dataset.view));$$('[data-rp-nav]').forEach(b=>b.onclick=()=>rpNavigate(b.dataset.rpNav));$$('[data-rp-refresh]').forEach(b=>b.onclick=rpLoad);$$('[data-rp-create]').forEach(b=>b.onclick=rpCreate);
  $$('[data-rp-row]').forEach(b=>b.onclick=()=>rpOpen(b.dataset.rpRow));$$('[data-rp-image]').forEach(b=>b.onclick=()=>sgPreview(b.dataset.rpImage,'image'));
  if($('.org-switch'))$('.org-switch').onclick=()=>rpNavigate('team');
  if(['requirements','tasks'].includes(view)){
   const s=rpView(),statuses=[null,'进行中','未开始','已完成',''],select=index=>{s.status=statuses[index];s.page=1;shell();};
   $$('[data-rp-status]').forEach(b=>b.onclick=()=>select(Number(b.dataset.rpStatus)));bindTaskScopeKeyboard('[data-rp-status]','rpStatus',index=>select(Number(index)));
   $('#rpSearch').onsubmit=e=>{e.preventDefault();const form=new FormData(e.target),designers=[...new Set(rpModel().rows.map(r=>r.designer))],selected=String(form.get('designer'));s.query=String(form.get('query')||'').slice(0,120);s.designer=selected==='all'?null:designers[Number(selected.slice(5))]??null;s.page=1;shell();};
   if($('#rpClear'))$('#rpClear').onclick=()=>{s.query='';s.designer=null;s.page=1;shell();};$('#rpMode').onclick=()=>{s.mode=s.mode==='list'?'board':'list';shell();};$('#rpPrevious').onclick=()=>{s.page--;shell();};$('#rpNext').onclick=()=>{s.page++;shell();};
  }
  $$('[data-rp-summary]').forEach(b=>b.onclick=()=>{rp.views.tasks.status=[null,'进行中','已完成',''][Number(b.dataset.rpSummary)];rp.views.tasks.page=1;rpNavigate('tasks');});
  if($('#importRefresh'))$('#importRefresh').onclick=rpLoad;
 };
 const rpReload=sgReload;sgReload=async function(...args){const result=await rpReload(...args);rp.loaded=true;return result;};
 const rpOriginalDetail=importDetail;importDetail=function(...args){rpOriginalDetail(...args);$('#intakeFromRow')?.remove();};
 newRequirement=rpCreate;reqDetail=rpOpen;taskDetail=rpOpen;activity=()=>{};switchRole=()=>{};
 action=function(name){if(name==='menu')$('.sidebar')?.classList.toggle('open');else if(name==='new')rpCreate();else if(name==='calendar')rpNavigate('schedule');else if(name==='org')rpNavigate('team');};
 planReq=()=>rpNavigate('schedule');routeTest=()=>rpNavigate('rules');assetDetail=()=>rpNavigate('assets');downloadAsset=()=>rpNavigate('assets');uploadDemo=()=>rpNavigate('assets');exportFacts=()=>rpNavigate('performance');
 document.title='Naumi · 企业协作';
 globalThis.EnterpriseRealProduct={refresh:rpLoad,get loaded(){return rp.loaded;},get loading(){return rp.loading;},get error(){return rp.error;},counts:()=>rpModel().counts};
 queueMicrotask(()=>void rpLoad());
}
