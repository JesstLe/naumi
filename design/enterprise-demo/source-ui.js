/* Original enterprise shell, additive source tab only. No admin shell or iframe. */
const ES=globalThis.EnterpriseSource;
const sourceState={tab:'local',kind:'artworks',enterpriseId:'',email:'',page:1,from:'',to:'',datesInitialized:false,identityKey:'',context:null,members:[],data:null,error:'',loading:false,fixture:false,controller:null,epoch:0,urls:[]};
function sourceClear(){sourceState.epoch++;sourceState.controller?.abort();sourceState.controller=null;if(document.querySelector('[data-source-preview]'))closeOverlay();sourceState.urls.forEach(u=>URL.revokeObjectURL(u));sourceState.urls=[];sourceState.data=null;sourceState.members=[];sourceState.context=null;sourceState.fixture=false;sourceState.loading=false;}
function sourceStatus(v){return ({done:'完成',completed:'完成',pending:'处理中',queued:'排队',processing:'执行中',error:'失败',failed:'失败',generate:'生成图片',consume:'创作消费',refund:'积分返还',grant:'积分发放',purchase:'积分购买',expire:'积分过期',adjust:'积分调整'})[v]||v||'未记录';}
function sourceTime(v){const d=new Date(v);return v&&!isNaN(d)?d.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'未记录';}
function sourceCredits(v){return typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('zh-CN'):'未记录';}
function sourcePersonName(account){if(account.person!==undefined)return `真名 ${account.person?.realName||'未记录'} · 花名 ${account.person?.nickname||'未记录'}`;return account.name||account.email||'未记录';}
function sourceMemberLabel(member){const label=sourcePersonName(member);return label===member.email?label:label+' · '+member.email;}
function sourceOwnership(row){return row.ownership==='frozen-tenant'?'冻结企业归属':'历史归属未确认';}
const sourceOriginalAssets=assets;
assets=function(){const tabs=`<div class="source-tabs"><button class="btn ${sourceState.tab==='local'?'primary':''}" data-source-tab="local">交付素材</button><button class="btn ${sourceState.tab==='naumi'?'primary':''}" data-source-tab="naumi">Naumi 创作记录</button></div>`;return sourceState.tab==='local'?sourceOriginalAssets().replace('<div class="info-banner">',tabs+'<div class="info-banner">'):heading('素材与交付','',`<button class="btn" id="sourceRefresh">${icon('refresh')}刷新来源</button>`)+tabs+sourcePanel();};
function sourcePanel(){const s=sourceState,c=s.context,snapshot=c?.preview?.transport==='local-snapshot';
 const filters=`<div class="source-filters"><label>来源企业<select id="sourceEnterprise" ${c?.mode==='dedicated'?'disabled':''}>${c?.enterprises.map(e=>`<option value="${esc(e.id)}" ${e.id===s.enterpriseId?'selected':''}>${esc(e.name)}</option>`).join('')||'<option value="">未连接</option>'}</select></label><label>来源成员<select id="sourceMember"><option value="">当前可见成员</option>${s.members.map(m=>`<option value="${esc(m.email)}" ${m.email===s.email?'selected':''}>${esc(sourceMemberLabel(m))}</option>`).join('')}</select></label><label>开始日期<input id="sourceFrom" type="date" value="${esc(s.from)}"></label><label>结束日期<input id="sourceTo" type="date" value="${esc(s.to)}"></label></div>`;
 const toolbar=`<div class="source-toolbar"><div class="source-kinds">${[['artworks','图片与提示词'],['generations','生成任务'],['ledger','积分明细']].map(([k,label])=>`<button class="btn ${s.kind===k?'source-selected':''}" data-source-kind="${k}">${label}</button>`).join('')}</div><span class="source-caption">${s.fixture?'隔离验收数据 · ':''}${c?(snapshot?'本机项目管理员：':'Naumi 来源账号：')+esc(c.viewer.email):'尚未连接来源'}${snapshot?`<small>快照时间 ${esc(sourceTime(c.preview.observedAt))}</small>`:''}</span></div>`;
 const error=s.error?`<div class="source-error" role="alert">${esc(s.error)}<button class="btn sm" id="sourceRetry">重试连接</button></div>`:'';
 const body=s.loading?'<div class="empty" role="status">正在读取来源记录…</div>':s.data?.rows.length?sourceRows(s.data):`<div class="empty">${s.error?'来源读取失败，已清除旧记录':c&&!c.enterprises.length?'当前来源范围没有可查看的企业':c?'当前范围暂无记录':'点击“刷新来源”连接来源'}</div>`;
 const footer=s.data?`<div class="source-pager"><span>${snapshot?'已采集':'当前范围共'} ${s.data.total} 条 · ${snapshot?'快照分页集合，非全站实时结果':'来源读取 '+esc(sourceTime(s.data.generatedAt))}</span><button class="btn sm" id="sourcePrevious" ${s.page<=1?'disabled':''}>上一页</button><span>${s.data.page}</span><button class="btn sm" id="sourceNext" ${s.data.page*s.data.size>=s.data.total?'disabled':''}>下一页</button></div>`:'';
 return `<section class="panel" id="sourcePanel">${filters}${toolbar}${error}${body}${footer}</section><p class="source-note">${snapshot?'本机项目管理员会话不代表 Naumi 原生登录。快照仅包含已采集记录；历史归属未确认，冻结企业归属也不等于绩效认定。':'来源账号独立于右上角演示角色。历史归属未确认，不作为企业绩效。'}扣费、退款与预估分别展示，缺失金额显示“未记录”。</p>`;
}
function sourceRows(data){const kind=sourceState.kind;return `<div class="table-wrap source-table"><table><thead><tr><th>作品 / 操作</th><th>成员与时间</th><th>${kind==='ledger'?'积分变动':'提示词 / 操作内容'}</th><th>${kind==='generations'?'扣费 / 退款 / 预估':kind==='ledger'?'用途来源':'来源与溯源'}</th><th>归属 / 来源编号</th></tr></thead><tbody>${data.rows.map((r,i)=>`<tr><td>${kind!=='ledger'?(ES.mediaPath(r,sourceState.enterpriseId)?`<button type="button" class="source-image" data-source-image="${i}" aria-label="预览来源图片" disabled>加载图片…</button>`:'<small class="source-no-image">无可预览图片</small>'):''}<b>${esc(r.title||sourceStatus(r.operation||r.ledgerKind))}</b><small>${esc(sourceStatus(r.status))}</small></td><td>${esc(sourcePersonName(r.account))}<small>${esc(r.account.email)}</small><small>${esc(sourceTime(r.createdAt))}</small></td><td>${kind==='ledger'?`<strong class="${typeof r.credits.delta!=='number'?'':r.credits.delta<0?'source-negative':'source-positive'}">${sourceCredits(r.credits.delta)}</strong>`:r.prompt?`<details><summary>${esc(r.prompt.slice(0,100))}${r.prompt.length>100?'…':''}</summary><pre>${esc(r.prompt)}</pre></details>`:'未记录'}</td><td>${kind==='generations'?`<div class="source-credit-lines"><span>扣费 <strong>${sourceCredits(r.credits.charged)}</strong></span><span>退款 <strong>${sourceCredits(r.credits.refunded)}</strong></span><span>预估 <strong>${sourceCredits(r.credits.quoted)}</strong></span></div><small>${r.credits.evidence==='linked-ledger'?'已关联积分流水':'金额证据待核对'}</small>`:esc(kind==='ledger'?r.sourceLabel||'未记录':r.provenance||r.sourceLabel||'未记录')}</td><td><span class="source-ownership ${r.ownership==='frozen-tenant'?'source-frozen':''}">${sourceOwnership(r)}</span><small><code>${esc(r.ref.kind)}</code></small><small>${esc(r.ref.id)}</small></td></tr>`).join('')}</tbody></table></div>`;}
function sourcePaint(){if(view!=='assets'||sourceState.tab!=='naumi')return;const panel=document.getElementById('sourcePanel');if(panel){const wrapper=document.createElement('div');wrapper.innerHTML=sourcePanel();panel.parentNode.querySelector('.source-note')?.remove();panel.replaceWith(...wrapper.childNodes);sourceBindControls();}}
async function sourceLoad(){const s=sourceState;sourceClear();s.error='';s.loading=true;const epoch=s.epoch,controller=s.controller=new AbortController();sourcePaint();
 const client=ES.createClient();try{
   const result=await client.read({action:'context'},controller.signal);if(epoch!==s.epoch)return;
   const c=ES.validateContext(result.data),identityKey=JSON.stringify([c.instanceId,c.viewer.email,c.preview?.transport||'integration']);
   if(s.identityKey!==identityKey){s.email='';s.enterpriseId='';s.page=1;s.datesInitialized=false;}
   s.identityKey=identityKey;
   s.context=c;s.fixture=result.fixture;
   if(!c.enterprises.some(e=>e.id===s.enterpriseId)){s.enterpriseId=c.enterprises[0]?.id||'';s.email='';s.page=1;}
   if(!s.datesInitialized){if(c.preview?.transport==='local-snapshot'){s.from=c.preview.from||'';s.to=c.preview.to||'';}else{const d=new Date(Date.now()+8*3600000);s.to=d.toISOString().slice(0,10);s.from=new Date(d.getTime()-29*86400000).toISOString().slice(0,10);}s.datesInitialized=true;}
   if(!s.enterpriseId){s.loading=false;sourcePaint();return;}
   const members=await client.read({action:'members',enterpriseId:s.enterpriseId},controller.signal);if(epoch!==s.epoch)return;
   s.members=ES.validateMembers(members.data,s.enterpriseId).members;
   if(s.email&&!s.members.some(m=>m.email===s.email)){s.email='';s.page=1;}
   const response=await client.read({action:'records',enterpriseId:s.enterpriseId,kind:s.kind,email:s.email,from:s.from,to:s.to,page:String(s.page)},controller.signal);if(epoch!==s.epoch)return;
   s.data=ES.validatePage(response.data,{enterpriseId:s.enterpriseId,instanceId:c.instanceId,kind:s.kind});s.page=s.data.page;s.loading=false;sourcePaint();await sourceImages(epoch,controller.signal);
 }catch(e){if(epoch!==s.epoch||e.name==='AbortError')return;sourceClear();s.error=e.message||'来源读取失败';sourcePaint();}
}
function sourcePreview(row,url,epoch){const s=sourceState;if(epoch!==s.epoch||!s.urls.includes(url)||!s.data?.rows.includes(row))return;overlay(row.title||'Naumi 来源图片',`<div class="source-preview" data-source-preview><img src="${esc(url)}" alt="${esc(row.title||'Naumi 来源作品')}"></div><p class="source-preview-meta">${esc(sourcePersonName(row.account))} · ${esc(sourceTime(row.createdAt))}<br>${sourceOwnership(row)}</p>`, '<button class="btn" data-close>关闭</button>',true);}
async function sourceImages(epoch,signal){const s=sourceState;if(s.kind==='ledger'||!s.data)return;let index=0;const rows=s.data.rows,enterpriseId=s.enterpriseId;
 const next=async()=>{for(;;){const i=index++;if(i>=rows.length||epoch!==s.epoch)return;const row=rows[i],path=ES.mediaPath(row,enterpriseId);if(!path)continue;
   const target=document.querySelector(`[data-source-image="${i}"]`);if(!target||target.dataset.sourceLoading||target.querySelector('img'))continue;target.dataset.sourceLoading='1';
   try{const response=await fetch(path,{method:'GET',credentials:'same-origin',cache:'no-store',signal});if(epoch!==s.epoch)return;if(response.status===401||response.status===403){sourceClear();s.error='来源媒体授权已失效，请刷新来源';sourcePaint();return;}
     if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw Error();const blob=await response.blob();if(blob.size>32*1024*1024||!blob.size)throw Error();if(epoch!==s.epoch)return;
     if(!target.isConnected)continue;const url=URL.createObjectURL(blob);s.urls.push(url);const img=document.createElement('img');img.alt=row.title||'Naumi 来源作品';
     img.onload=()=>{if(epoch!==s.epoch||!target.isConnected)return;target.disabled=false;target.title='点击查看大图';target.onclick=()=>sourcePreview(row,url,epoch);};
     img.onerror=()=>{URL.revokeObjectURL(url);s.urls=s.urls.filter(u=>u!==url);if(epoch===s.epoch&&target.isConnected){target.disabled=true;target.onclick=null;target.textContent='图片暂不可读取';}};
     img.src=url;target.replaceChildren(img);
   }catch{if(epoch===s.epoch&&target.isConnected){target.disabled=true;target.textContent='图片暂不可读取';}}
 }};await Promise.all([next(),next()]);
}
function sourceBindControls(){const s=sourceState;const on=(id,fn)=>{const el=document.getElementById(id);if(el)el.onclick=fn;};on('sourceRefresh',sourceLoad);on('sourceRetry',sourceLoad);
 document.querySelectorAll('[data-source-kind]').forEach(b=>b.onclick=()=>{s.kind=b.dataset.sourceKind;s.page=1;void sourceLoad();});
 for(const [id,key]of [['sourceEnterprise','enterpriseId'],['sourceMember','email'],['sourceFrom','from'],['sourceTo','to']]){const el=document.getElementById(id);if(el)el.onchange=()=>{s[key]=el.value;s.page=1;if(key==='enterpriseId')s.email='';void sourceLoad();};}
 on('sourcePrevious',()=>{s.page--;void sourceLoad();});on('sourceNext',()=>{s.page++;void sourceLoad();});
}
const sourceOriginalBind=bind;
bind=function(){sourceOriginalBind();if(view!=='assets'||sourceState.tab!=='naumi')sourceClear();
 document.querySelectorAll('[data-source-tab]').forEach(b=>b.onclick=()=>{sourceClear();sourceState.error='';sourceState.tab=b.dataset.sourceTab;shell();});
 if(view==='assets'&&sourceState.tab==='naumi'){sourceBindControls();if(sourceState.data)void sourceImages(sourceState.epoch,sourceState.controller?.signal);else if(!sourceState.loading&&!sourceState.error)void sourceLoad();}
};
window.addEventListener('pagehide',sourceClear);
window.addEventListener('focus',()=>{if(view==='assets'&&sourceState.tab==='naumi')void sourceLoad();});
setInterval(()=>{if(view==='assets'&&sourceState.tab==='naumi'&&!document.hidden&&!sourceState.loading&&!document.querySelector('[data-source-preview]'))void sourceLoad();},30000);
