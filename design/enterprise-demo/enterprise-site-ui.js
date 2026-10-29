/* Dedicated production shell. Business modules retain their own role/record checks. */
if (document.documentElement.dataset.workspaceMode === 'enterprise') {
 const site = globalThis.__NAUMI_SITE__;
 const moduleFor = value => ({team:'people',rules:'routing',imports:'schedule'})[value] || value;
 const allowed = value => !!site?.workspaceModules.includes(moduleFor(value));
 const previousRender = renderPage;
 renderPage = function () {
  if (!allowed(view)) {
   const first = ['dashboard','requirements','tasks','schedule','assets','performance','team','rules'].find(allowed);
   if (!first) {view='__closed__';return workspacePanel()+'<div class="empty">当前未开放协作模块</div>';}
   view = first;
  }
  if (view === 'rules') return workspacePanel()+heading('归属规则','',
   (requirementCan('manage')?'<button class="btn" id="companyRoutingRules">需求归属规则</button><button class="btn" id="companyRoutingConnections">团队承接设置</button>':'')+
   (requirementCan('manage')||requirementCan('dispatch')?'<button class="btn" id="companyRoutingQueue">待确认归属</button><button class="btn" id="companyRoutingAudit">操作记录</button>':''));
  return previousRender();
 };
 const previousBind = bind;
 bind = function () {
  previousBind();
  const brand = $('.logo > div');
  if (brand) { brand.textContent = site.brand; brand.style.fontSize = '19px'; brand.style.letterSpacing = '0'; }
  $$('.sidebar [data-view]').forEach(button => { if (!allowed(button.dataset.view)) button.remove(); });
  const peopleLink=$('.sidebar [data-view="team"]');
  if(peopleLink) { if(!requirementCan('manage'))peopleLink.remove();else peopleLink.innerHTML=icon('users')+'人员资料'; }
  const rulesLink=$('.sidebar [data-view="rules"]');
  if(rulesLink&&!requirementCan('manage')&&!requirementCan('dispatch'))rulesLink.remove();
  if(view==='team'){const title=$('.page-heading h1');if(title)title.textContent='人员资料';}
  [['#companyRoutingRules',roRules],['#companyRoutingConnections',roConnections],['#companyRoutingQueue',()=>roQueue()],['#companyRoutingAudit',()=>roAudit()]].forEach(([selector,fn])=>{const button=$(selector);if(button)button.onclick=fn;});
  if(!allowed('routing'))$$('#roRules,#roConnections,#roQueue,#roAudit,#roPreview').forEach(node=>node.remove());
  if(!allowed('people'))$$('#formalSourcePeople').forEach(node=>node.remove());
  $$('.preview-badge,.preview-footer,.demo-footer,.footer-caption,#workspaceExit,.role-select,.org-switch,.eyebrow,.sc-statusline').forEach(node => { node.hidden = true; node.style.display='none'; });
  const breadcrumb = $('.breadcrumb');
  if (breadcrumb?.firstChild) breadcrumb.firstChild.textContent = '协作交付 ';
  const note = $('.content > .source-note'); if (note) note.remove();
  const bottom = $('.sidebar-bottom');
  if (bottom && !bottom.querySelector('[data-company-home]')) {
   const link = document.createElement('a');link.className='nav-item';link.href='/dashboard';link.textContent='创作工作台';link.dataset.companyHome='1';bottom.append(link);
  }
  const notification = $('[data-action="notifications"]'); if (notification && !allowed('notifications')) notification.remove();
 };
 const previousOverlay = overlay;
 overlay = function (...args) {
  const result = previousOverlay(...args);
  $$('#overlay .eyebrow').forEach(node => node.remove());
  return result;
 };
 document.title = site.brand + ' · 协作交付';
 async function refreshSitePolicy(){try{const response=await fetch('/api/site-profile',{cache:'no-store'});if(!response.ok)return;const data=await response.json();if(data.mode!=='enterprise'||data.policy.revision<=site.revision)return;Object.assign(site,{brand:data.policy.brand,revision:data.policy.revision,workspaceModules:data.policy.enabledFeatures.includes('team')?data.policy.workspaceModules:[]});document.title=site.brand+' · 协作交付';if(!$('#overlay')?.children.length)shell();}catch{}}
 window.addEventListener('focus',refreshSitePolicy);setInterval(refreshSitePolicy,60000);
}
