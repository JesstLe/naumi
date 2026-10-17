/* Original enterprise shell, additive source tab only. No admin shell or iframe. */
const ES=globalThis.EnterpriseSource;
const sourceState={tab:'local',kind:'artworks',enterpriseId:'',email:'',page:1,from:'',to:'',context:null,members:[],data:null,error:'',loading:false,fixture:false,controller:null,epoch:0,urls:[]};
function sourceClear(){sourceState.epoch++;sourceState.controller?.abort();sourceState.controller=null;sourceState.urls.forEach(u=>URL.revokeObjectURL(u));sourceState.urls=[];sourceState.data=null;sourceState.members=[];sourceState.loading=false;}
function sourceStatus(v){return ({done:'完成',completed:'完成',pending:'处理中',queued:'排队',processing:'执行中',error:'失败',failed:'失败',generate:'生成图片',consume:'创作消费',refund:'积分返还',grant:'积分发放',purchase:'积分购买',expire:'积分过期',adjust:'积分调整'})[v]||v||'未记录';}
function sourceTime(v){const d=new Date(v);return v&&!isNaN(d)?d.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'未记录';}
function sourceCredits(v){return v===null||v===undefined?'未记录':Number(v).toLocaleString('zh-CN');}
const sourceOriginalAssets=assets;
assets=function(){const tabs=`<div class="source-tabs"><button class="btn ${sourceState.tab==='local'?'primary':''}" data-source-tab="local">交付素材</button><button class="btn ${sourceState.tab==='naumi'?'primary':''}" data-source-tab="naumi">Naumi 创作记录</button></div>`;return sourceState.tab==='local'?sourceOriginalAssets().replace('<div class="info-banner">',tabs+'<div class="info-banner">'):heading('素材与交付','',`<button class="btn" id="sourceRefresh">${icon('refresh')}刷新来源</button>`)+tabs+sourcePanel();};
function sourcePanel(){const s=sourceState,c=s.context;
 const filters=`<div class="source-filters"><label>来源企业<select id="sourceEnterprise" ${c?.mode==='dedicated'?'disabled':''}>${c?.enterprises.map(e=>`<option value="${esc(e.id)}" ${e.id===s.enterpriseId?'selected':''}>${esc(e.name)}</option>`).join('')||'<option value="">未连接</option>'}</select></label><label>来源成员<select id="sourceMember"><option value="">当前可见成员</option>${s.members.map(m=>`<option value="${esc(m.email)}" ${m.email===s.email?'selected':''}>${esc(m.name||m.email)}</option>`).join('')}</select></label><label>开始日期<input id="sourceFrom" type="date" value="${esc(s.from)}"></label><label>结束日期<input id="sourceTo" type="date" value="${esc(s.to)}"></label></div>`;
 const toolbar=`<div class="source-toolbar"><div class="source-kinds">${[['artworks','图片与提示词'],['generations','生成任务'],['ledger','积分明细']].map(([k,label])=>`<button class="btn ${s.kind===k?'source-selected':''}" data-source-kind="${k}">${label}</button>`).join('')}</div><span class="source-caption">${s.fixture?'隔离验收数据 · ':''}${c?'来源账号：'+esc(c.viewer.email):'尚未连接来源账号'}</span></div>`;
 const error=s.error?`<div class="source-error" role="alert">${esc(s.error)}<button class="btn sm" id="sourceRetry">重试连接</button></div>`:'';
 let body=s.loading?'<div class="empty" role="status">正在读取来源记录…</div>':s.data?.rows.length?sourceRows(s.data):`<div class="empty">${s.error?'来源读取失败，已清除旧记录':c&&!c.enterprises.length?'当前来源账号没有可查看的企业':c?'当前范围暂无记录':'点击“刷新来源”连接已授权账号'}</div>`;
 const footer=s.data?`<div class="source-pager"><span>共 ${s.data.total} 条 · 来源读取 ${esc(sourceTime(s.data.generatedAt))}</span><button class="btn sm" id="sourcePrevious" ${s.page<=1?'disabled':''}>上一页</button><span>${s.page}</span><button class="btn sm" id="sourceNext" ${s.page*s.data.size>=s.data.total?'disabled':''}>下一页</button></div>`:'';
 return `<section class="panel" id="sourcePanel">${filters}${toolbar}${error}${body}${footer}</section><p class="source-note">来源账号独立于右上角演示角色。预估、扣费与退款分别记录；业务任务关联在任务详情中管理。</p>`;
}
function sourceRows(data){const kind=sourceState.kind;return `<div class="table-wrap source-table"><table><thead><tr><th>作品 / 操作</th><th>成员与时间</th><th>${kind==='ledger'?'积分变动':'提示词 / 操作内容'}</th><th>${kind==='generations'?'扣费 / 预估':kind==='ledger'?'用途来源':'来源与溯源'}</th><th>来源编号</th></tr></thead><tbody>${data.rows.map((r,i)=>`<tr><td>${kind==='artworks'&&ES.mediaPath(r,sourceState.enterpriseId)?`<span class="source-image" data-source-image="${i}">加载图片…</span>`:''}<b>${esc(r.title||sourceStatus(r.operation||r.ledgerKind))}</b><small>${esc(sourceStatus(r.status))}</small></td><td>${esc(r.account.name||r.account.email)}<small>${esc(sourceTime(r.createdAt))}</small></td><td>${kind==='ledger'?`<strong class="${r.credits.delta<0?'source-negative':'source-positive'}">${sourceCredits(r.credits.delta)}</strong>`:r.prompt?`<details><summary>${esc(r.prompt.slice(0,100))}${r.prompt.length>100?'…':''}</summary><pre>${esc(r.prompt)}</pre></details>`:'未记录'}</td><td>${kind==='generations'?`${sourceCredits(r.credits.charged)}<small>预估 ${sourceCredits(r.credits.quoted)} · ${r.credits.evidence==='linked-ledger'?'已关联扣费流水':'待核对'}</small>`:esc(kind==='ledger'?r.sourceLabel||'未记录':r.provenance||r.sourceLabel||'未记录')}</td><td><code>${esc(r.ref.kind)}</code><small>${esc(r.ref.id)}</small></td></tr>`).join('')}</tbody></table></div>`;}
function sourcePaint(){if(view!=='assets'||sourceState.tab!=='naumi')return;const panel=document.getElementById('sourcePanel');if(panel){const wrapper=document.createElement('div');wrapper.innerHTML=sourcePanel();panel.parentNode.querySelector('.source-note')?.remove();panel.replaceWith(...wrapper.childNodes);sourceBindControls();}}
async function sourceLoad(){const s=sourceState;sourceClear();s.error='';s.loading=true;const epoch=s.epoch,controller=s.controller=new AbortController();sourcePaint();
 const client=ES.createClient();try{
   const result=await client.read({action:'context'},controller.signal);if(epoch!==s.epoch)return;
   const c=ES.validateContext(result.data),old=s.context;
   if(old&&(old.viewer.email!==c.viewer.email||old.instanceId!==c.instanceId)){s.email='';s.enterpriseId='';s.page=1;}
   s.context=c;s.fixture=result.fixture;
   if(!c.enterprises.some(e=>e.id===s.enterpriseId)){s.enterpriseId=c.enterprises[0]?.id||'';s.email='';s.page=1;}
   if(!s.from){const d=new Date(Date.now()+8*3600000);s.to=d.toISOString().slice(0,10);s.from=new Date(d.getTime()-29*86400000).toISOString().slice(0,10);}
   if(!s.enterpriseId){s.loading=false;sourcePaint();return;}
   const members=await client.read({action:'members',enterpriseId:s.enterpriseId},controller.signal);if(epoch!==s.epoch)return;
   if(members.data.enterprise?.id!==s.enterpriseId||!Array.isArray(members.data.members))throw Error('来源成员范围不一致');
   s.members=members.data.members;
   if(s.email&&!s.members.some(m=>m.email===s.email)){s.email='';s.page=1;}
   const response=await client.read({action:'records',enterpriseId:s.enterpriseId,kind:s.kind,email:s.email,from:s.from,to:s.to,page:String(s.page)},controller.signal);if(epoch!==s.epoch)return;
   s.data=ES.validatePage(response.data,{enterpriseId:s.enterpriseId,instanceId:c.instanceId,kind:s.kind});s.loading=false;sourcePaint();await sourceImages(epoch,controller.signal);
 }catch(e){if(epoch!==s.epoch||e.name==='AbortError')return;sourceClear();s.context=null;s.error=e.message||'来源读取失败';sourcePaint();}
}
async function sourceImages(epoch,signal){const s=sourceState;if(s.kind!=='artworks'||!s.data)return;let index=0;const rows=s.data.rows;
 const next=async()=>{for(;;){const i=index++;if(i>=rows.length||epoch!==s.epoch)return;const path=ES.mediaPath(rows[i],s.enterpriseId);if(!path)continue;
   try{const response=await fetch(path,{credentials:'same-origin',cache:'no-store',signal});if(response.status===401||response.status===403){if(epoch===s.epoch){sourceClear();s.context=null;s.error='来源媒体授权已失效，请刷新来源';sourcePaint();}return;}
     if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw Error();const blob=await response.blob();if(blob.size>32*1024*1024)throw Error();if(epoch!==s.epoch)return;
     const el=document.querySelector(`[data-source-image="${i}"]`);if(!el)continue;const url=URL.createObjectURL(blob);s.urls.push(url);const img=document.createElement('img');img.alt='Naumi 来源作品';img.src=url;el.replaceChildren(img);
   }catch{if(epoch===s.epoch){const el=document.querySelector(`[data-source-image="${i}"]`);if(el)el.textContent='图片暂不可读取';}}
 }};await Promise.all([next(),next()]);
}
function sourceBindControls(){const s=sourceState;const on=(id,fn)=>{const el=document.getElementById(id);if(el)el.onclick=fn;};on('sourceRefresh',sourceLoad);on('sourceRetry',sourceLoad);
 document.querySelectorAll('[data-source-kind]').forEach(b=>b.onclick=()=>{s.kind=b.dataset.sourceKind;s.page=1;void sourceLoad();});
 for(const [id,key]of [['sourceEnterprise','enterpriseId'],['sourceMember','email'],['sourceFrom','from'],['sourceTo','to']]){const el=document.getElementById(id);if(el)el.onchange=()=>{s[key]=el.value;s.page=1;if(key==='enterpriseId')s.email='';void sourceLoad();};}
 on('sourcePrevious',()=>{s.page--;void sourceLoad();});on('sourceNext',()=>{s.page++;void sourceLoad();});
}
const sourceOriginalBind=bind;
bind=function(){sourceOriginalBind();if(view!=='assets'||sourceState.tab!=='naumi'){sourceClear();sourceState.context=null;}
 document.querySelectorAll('[data-source-tab]').forEach(b=>b.onclick=()=>{sourceClear();sourceState.context=null;sourceState.error='';sourceState.tab=b.dataset.sourceTab;shell();});
 if(view==='assets'&&sourceState.tab==='naumi'){sourceBindControls();if(sourceState.data)void sourceImages(sourceState.epoch,sourceState.controller?.signal);else if(!sourceState.loading&&!sourceState.error)void sourceLoad();}
};
window.addEventListener('pagehide',()=>{sourceClear();sourceState.context=null;});
window.addEventListener('focus',()=>{if(view==='assets'&&sourceState.tab==='naumi')void sourceLoad();});
setInterval(()=>{if(view==='assets'&&sourceState.tab==='naumi'&&!document.hidden&&!sourceState.loading)void sourceLoad();},30000);
