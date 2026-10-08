/* Deliberately standalone: no Naumi wallet, provider keys or generation endpoint. */
let token = '', state = null, lastQuoteRequest = null;
const $ = id => document.getElementById(id);
const qualities = ['low','medium','high','xhigh','max'];
const rates = ['text_input_uncached','text_input_cached','image_input_uncached','image_input_cached','image_output'];
const rateLabels = ['非缓存文本输入','缓存文本输入','非缓存图片输入','缓存图片输入','图片输出'];
const nativeRatios = ['1:1','3:2','2:3','4:3','3:4','5:4','4:5','16:9','9:16','2:1','1:2','21:9','9:21','3:1','1:3'];
const extRatios = ['1:1','16:9','9:16','4:3','3:4','3:2','2:3','5:4','4:5','21:9'];
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const display = value => value == null ? '待确认' : Number(value).toFixed(4); // presentation only; all calculation is server-side BigInt
function notify(text, error=false) { $('notice').hidden=false; $('notice').className=error?'error':''; $('notice').textContent=text; }
async function api(path, method='GET', body, extra={}) {
  const r=await fetch(path,{method,headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json',...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const d=await r.json(); if(!r.ok) { if(r.status===401) { $('workspace').hidden=true; $('login').hidden=false; } throw new Error(d.message||d.error); } return d;
}
async function action(fn) { const buttons=document.querySelectorAll('button'); buttons.forEach(b=>b.disabled=true); try{await fn();}catch(e){notify(e.message,true);}finally{buttons.forEach(b=>b.disabled=false);} }
function changeTab(tab) { for(const p of ['quick','matrix','config','quote','history'])$('panel-'+p).hidden=p!==tab;document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab)); $('page-title').textContent={quick:'快速配置',matrix:'售价矩阵',config:'定价配置',quote:'报价试算',history:'版本记录'}[tab]; }
function option(id,label,selected){return `<option value="${esc(id)}" ${selected?'selected':''}>${esc(label)}</option>`;}
function fillModels() {
  const enabled=state.current.config.aliases.filter(a=>a.enabled);
  for(const name of ['matrix-model','quote-model']) { const old=$(name).value; $(name).innerHTML=enabled.map(a=>option(a.publicId,a.label+' · '+a.publicId,a.publicId===old)).join(''); }
  quoteRatios();
}
function quoteRatios() { const a=state.current.config.aliases.find(a=>a.publicId===$('quote-model').value);const old=$('quote-ratio').value; $('quote-ratio').innerHTML=(a?.model==='gpt-image-2.5-ext'?extRatios:nativeRatios).map(r=>option(r,r,r===old)).join(''); }
function renderMatrixRows(rows) { return rows.map(r=>`<tr><td>${esc(r.ratio)} <span class="muted">/ ${esc(r.resolution)}</span></td><td>${esc(r.pixels||'未公布')}</td>${qualities.map(q=>`<td class="${r.cells[q].pricingMode==='fixed-unit'?'is-fixed':''}" title="${esc(r.cells[q].warnings.join('；'))}">${esc(display(r.cells[q][$('matrix-view').value]))}</td>`).join('')}</tr>`).join(''); }
async function renderMatrix() { const data=await api('/v1/matrix?publicId='+encodeURIComponent($('matrix-model').value)+'&resolution='+encodeURIComponent($('matrix-resolution').value)); $('matrix-body').innerHTML=renderMatrixRows(data.rows);$('matrix-count').textContent=`${data.rows.length}个规格 · ${data.rows.length*5}项金额 · v${data.version}`; const a=state.current.config.aliases.find(a=>a.publicId===$('matrix-model').value);$('model-info').textContent=`实际模型：${a.model}${a.version?' / version='+a.version:''} · ${a.model.endsWith('-ext')?'质量参数不下发，参考图不另计费；账号升级待核实':'原生按token；本表未含输入费用'}`; }
function renderAliases() {
  $('alias-body').innerHTML=state.draft.config.aliases.map((a,i)=>`<tr data-index="${i}"><td><input data-field="publicId" aria-label="公开ID ${i+1}" value="${esc(a.publicId)}"></td><td><input data-field="label" aria-label="展示名称 ${i+1}" value="${esc(a.label)}"></td><td><select data-field="model" aria-label="实际模型 ${i+1}">${['gpt-image-2.5-flare','gpt-image-2.5-sunburst','gpt-image-2.5-ext'].map(m=>option(m,m,m===a.model)).join('')}</select></td><td><select data-field="version" aria-label="EXT版本 ${i+1}">${['','flare','sunburst'].map(v=>option(v,v||'不传',v===(a.version||''))).join('')}</select></td><td><input class="alias-multiplier" data-field="multiplier" aria-label="独立倍率 ${i+1}" value="${esc(a.multiplier||'')}" placeholder="默认"></td><td><input data-field="enabled" aria-label="启用模型 ${i+1}" type="checkbox" ${a.enabled?'checked':''}></td><td><button data-remove="${i}" class="text-button">删除</button></td></tr>`).join('');
}
function renderCosts() { const c=state.draft.config,t=$('tier').value; $('native-rates').innerHTML=rates.map((k,i)=>`<label>${rateLabels[i]}<input data-native="${k}" aria-label="${rateLabels[i]}单价" value="${esc(c.nativeRates[t][k])}"></label>`).join('');$('ext-rates').innerHTML=['1K','2K','4K'].map(r=>`<label>${r} 每张包价<input data-ext="${r}" aria-label="EXT ${r}单价" value="${esc(c.extPrices[t][r])}"></label>`).join(''); }
function collectCosts() { const t=state.draft.config.tier;for(const el of document.querySelectorAll('[data-native]'))state.draft.config.nativeRates[t][el.dataset.native]=el.value.trim();for(const el of document.querySelectorAll('[data-ext]'))state.draft.config.extPrices[t][el.dataset.ext]=el.value.trim(); }
function renderConfig() { const c=state.draft.config;$('tier').value=c.tier;$('multiplier').value=c.multiplier;$('fx').value=c.fx.usdToCny;$('fx-basis').value=c.fx.basis;$('fx-evidence').value=c.fx.evidence;$('quality-policy').value=c.qualityPolicy;$('points').value=c.creditConversion?.creditsPerCny||'';$('rounding').value=c.creditConversion?.rounding||'ceil';$('config-note').value=c.note;$('fixed-sales').value=JSON.stringify(c.fixedSales,null,2);$('draft-revision').textContent=`草稿 r${state.draft.revision}`;$('config-status').textContent=`草稿 r${state.draft.revision} · 当前生效 v${state.current.version} · Naumi生产未接入`;renderAliases();renderCosts(); }
function collectConfig() { collectCosts(); const c=structuredClone(state.draft.config);c.tier=$('tier').value;c.multiplier=$('multiplier').value.trim();c.fx={usdToCny:$('fx').value.trim(),basis:$('fx-basis').value,evidence:$('fx-evidence').value.trim()};c.qualityPolicy=$('quality-policy').value;c.creditConversion=$('points').value.trim()?{creditsPerCny:$('points').value.trim(),rounding:$('rounding').value}:null;c.note=$('config-note').value;c.fixedSales=JSON.parse($('fixed-sales').value||'{}');c.aliases=Array.from(document.querySelectorAll('#alias-body tr')).map(row=>{const get=k=>row.querySelector(`[data-field="${k}"]`);const old=state.draft.config.aliases[Number(row.dataset.index)];const a={publicId:get('publicId').value.trim(),label:get('label').value.trim(),model:get('model').value,enabled:get('enabled').checked};if(old?.supplier)a.supplier=old.supplier;if(old?.quickSpec&&old.model===a.model&&(old.version||'')===get('version').value)a.quickSpec=old.quickSpec;if(get('version').value)a.version=get('version').value;if(get('multiplier').value.trim())a.multiplier=get('multiplier').value.trim();return a});return c; }
function renderHistory() { $('history-body').innerHTML=state.history.map(h=>`<tr><td>v${h.version}${h.version===state.current.version?' · 当前':''}</td><td>${esc(new Date(h.createdAt).toLocaleString('zh-CN'))}</td><td>${esc(h.actor)}</td><td>${esc(h.reason)}</td><td class="mono">${esc(h.digest.slice(0,12))}</td><td>${h.version===state.current.version?'':`<button class="secondary" data-rollback="${h.version}">回滚至此</button>`}</td></tr>`).join(''); }
async function load() { state=await api('/v1/state');$('current-version').textContent='v'+state.current.version;$('metric-multiplier').textContent=state.current.config.multiplier+'×';$('metric-fx').textContent=state.current.config.fx.usdToCny;$('metric-fx-basis').textContent={budget:'预算汇率 · 折算估计','admin-rate':'管理员维护',recharge:'充值成本依据'}[state.current.config.fx.basis];$('catalog-date').textContent=state.catalogDate;fillModels();renderConfig();renderHistory();await renderMatrix();await loadQuick(); }
$('login-form').addEventListener('submit',async e=>{e.preventDefault();token=$('token').value;try{await load();$('login').hidden=true;$('workspace').hidden=false;$('token').value='';$('login-error').textContent='';}catch(err){$('login-error').textContent=err.message;token='';}});
$('logout').onclick=()=>{token='';$('workspace').hidden=true;$('login').hidden=false;};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>changeTab(b.dataset.tab));
for(const id of ['matrix-model','matrix-resolution','matrix-view'])$(id).onchange=()=>action(renderMatrix);
$('quote-model').onchange=quoteRatios;
$('tier').onchange=()=>{collectCosts();state.draft.config.tier=$('tier').value;renderCosts();};
$('alias-body').addEventListener('click',e=>{const b=e.target.closest('[data-remove]');if(!b)return;try{state.draft.config=collectConfig();state.draft.config.aliases.splice(Number(b.dataset.remove),1);renderAliases();}catch(err){notify(err.message,true);}});
$('alias-body').addEventListener('change',e=>{if(e.target.dataset.field==='model'){const row=e.target.closest('tr');row.querySelector('[data-field="version"]').value=e.target.value==='gpt-image-2.5-ext'?'flare':'';}});
$('add-alias').onclick=()=>{try{state.draft.config=collectConfig();state.draft.config.aliases.push({publicId:'image25-option-'+(state.draft.config.aliases.length+1),label:'新展示模型',model:'gpt-image-2.5-flare',enabled:true});renderAliases();}catch(err){notify(err.message,true);}};
$('save').onclick=()=>action(async()=>{state.draft=await api('/v1/draft','POST',{expectedRevision:state.draft.revision,config:collectConfig()});renderConfig();$('config-status').textContent=`草稿 r${state.draft.revision} 已持久化；当前生效仍为 v${state.current.version}`;notify('草稿已保存，尚未应用。');});
$('apply').onclick=()=>action(async()=>{const reason=$('reason').value.trim();if(!reason)throw Error('请填写发布原因');state.draft=await api('/v1/draft','POST',{expectedRevision:state.draft.revision,config:collectConfig()});const result=await api('/v1/apply','POST',{expectedVersion:state.current.version,expectedRevision:state.draft.revision,reason});await load();$('draft-preview').hidden=true;notify(`v${result.version} 已应用到本服务；Naumi生产未修改。`);});
$('reload').onclick=()=>action(load);
$('preview').onclick=()=>action(async()=>{const config=collectConfig(),a=config.aliases.find(a=>a.enabled);if(!a)throw Error('至少启用一个模型');const d=await api('/v1/preview','POST',{config,publicId:a.publicId,resolution:'4K'});$('draft-preview').hidden=false;$('draft-preview').innerHTML=`<div class="preview-caption">未保存草稿预览 · ${esc(a.label)} · 4K · 元/张</div><div class="table-wrap"><table><thead><tr><th>比例</th><th>像素</th>${qualities.map(q=>`<th>${q}</th>`).join('')}</tr></thead><tbody>${renderMatrixRows(d.rows)}</tbody></table></div>`;});
$('history-body').addEventListener('click',e=>{const b=e.target.closest('[data-rollback]');if(!b)return;action(async()=>{const reason=$('rollback-reason').value.trim();if(!reason)throw Error('请填写回滚原因');const d=await api('/v1/rollback','POST',{expectedVersion:state.current.version,targetVersion:Number(b.dataset.rollback),reason});await load();notify(`已创建回滚版本 v${d.version}，生产未修改。`);});});
$('export').onclick=()=>action(async()=>{const d=await api('/v1/export');const u=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download=`naumi-pricing-review-v${d.version}.json`;a.click();URL.revokeObjectURL(u);notify('已导出审阅包；不包含供应商密钥。');});
$('use-usage').onchange=()=>{$('usage-fields').hidden=!$('use-usage').checked;};
$('new-key').onclick=()=>{$('quote-key').value=crypto.randomUUID();lastQuoteRequest=null;};$('quote-key').value=crypto.randomUUID();
function showQuote(q) { const lines=[['冻结版本','v'+q.configVersion],['实际模型',q.actualModel+(q.upstreamVersion?' / '+q.upstreamVersion:'')],['有效质量',q.effective.quality||'参数不下发'],['成本口径',q.costScope],['API成本（元）',display(q.costCny)],['售价（元）',display(q.saleCny)],['售价减API成本',display(q.profitCny)+' · 暂估'],['积分',q.credits===null?'兑换未配置':q.credits],['重放',q.replayed?'是（原报价）':'否']];$('quote-summary').className='';$('quote-summary').innerHTML=`<div class="quote-lines">${lines.map(([k,v])=>`<div><span>${esc(k)}</span><b class="${k==='售价（元）'?'price':''}">${esc(v)}</b></div>`).join('')}</div>${q.warnings.map(w=>`<div class="warning">${esc(w)}</div>`).join('')}`;$('quote-json').textContent=JSON.stringify(q,null,2); }
function requestQuote(){const r={publicId:$('quote-model').value,resolution:$('quote-resolution').value,ratio:$('quote-ratio').value,quality:$('quote-quality').value,quantity:Number($('quantity').value)};if($('reported').value.trim()!=='')r.reportedTotalUsd=$('reported').value.trim();if($('use-usage').checked)r.usage={textInput:Number($('text-input').value),cachedTextInput:Number($('cached-text').value),imageInput:Number($('image-input').value),cachedImageInput:Number($('cached-image').value),imageOutput:Number($('image-output').value)};return r;}
$('quote-create').onclick=()=>action(async()=>{const r=requestQuote(),key=$('quote-key').value.trim();const q=await api('/v1/quote','POST',r,{'Idempotency-Key':key});lastQuoteRequest={r,key};showQuote(q);});
$('quote-replay').onclick=()=>action(async()=>{if(!lastQuoteRequest)throw Error('请先冻结一次报价');showQuote(await api('/v1/quote','POST',lastQuoteRequest.r,{'Idempotency-Key':lastQuoteRequest.key}));});

let quickCatalog=null, quickSequence=0, quickPreviewSignature='', quickSimulateKey='';
const precise=v=>v==null?'待确认':Number(v).toFixed(6);
function quickModel() { return quickCatalog.suppliers.find(s=>s.id===$('quick-supplier').value).models[Number($('quick-model').value)]; }
function quickInput() {
  const m=quickModel(),r={publicId:$('quick-public').value.trim(),label:$('quick-label').value.trim(),supplier:$('quick-supplier').value,actualModel:m.model,
    ...(m.version?{upstreamVersion:m.version}:{}),spec:{resolution:$('quick-resolution').value,ratio:$('quick-ratio').value,quality:$('quick-quality').value}};
  if($('quick-sale').value.trim()!=='')r.saleCny=$('quick-sale').value.trim();r.creditsPerCny=$('quick-credits').value.trim();r.rounding=$('quick-rounding').value;return r;
}
function quickSpecs(preferred) {
  const m=quickModel(),oldResolution=preferred?.resolution||$('quick-resolution').value,oldRatio=preferred?.ratio||$('quick-ratio').value;
  $('quick-resolution').innerHTML=[...new Set(m.specs.map(s=>s.resolution))].map(r=>option(r,r,r===oldResolution)).join('');
  $('quick-ratio').innerHTML=m.specs.filter(s=>s.resolution===$('quick-resolution').value).map(s=>option(s.ratio,s.ratio,s.ratio===oldRatio)).join('');
  const oldQuality=preferred?.quality||$('quick-quality').value;
  $('quick-quality').innerHTML=m.qualities.map(q=>option(q,q,q===oldQuality)).join('');
}
function renderQuickUpstream() {
  const u=state.upstream;$('quick-upstream').textContent=`模拟配置已确认 v${u.version} · ${u.digest.slice(0,12)} · ${new Date(u.acknowledgedAt).toLocaleString('zh-CN')}。真实供应商 / Naumi 生产未修改。`;
}
async function selectQuickAlias() {
  const alias=state.current.config.aliases.find(a=>a.publicId===$('quick-existing').value);
  $('quick-public').value=alias?.publicId||'';$('quick-label').value=alias?.label||'';
  const models=quickCatalog.suppliers[0].models;
  const i=alias?models.findIndex(m=>m.model===alias.model&&(m.version||'')===(alias.version||'')):0;
  $('quick-model').value=String(Math.max(i,0));quickSpecs(alias?.quickSpec||{resolution:'4K',ratio:'1:1',quality:'medium'});
  const c=state.current.config,spec=alias?.quickSpec;
  let effectiveQuality=$('quick-quality').value;
  if(alias?.model!=='gpt-image-2.5-ext'&&c.qualityPolicy==='cap-medium')effectiveQuality=effectiveQuality==='low'?'low':'medium';
  $('quick-sale').value=spec?(c.fixedSales[`${alias.publicId}|${spec.resolution}|${spec.ratio}|${effectiveQuality}`]||''):'';
  $('quick-credits').value=c.creditConversion?.creditsPerCny||'10';$('quick-rounding').value=c.creditConversion?.rounding||'ceil';
  quickSimulateKey='';$('quick-result').hidden=true;$('quick-json').textContent='';await previewQuick();
}
async function loadQuick() {
  if(!quickCatalog)quickCatalog=await api('/v1/mvp/catalog');
  const selected=$('quick-existing').value||state.current.config.aliases[0].publicId;
  $('quick-existing').innerHTML=option('','新增展示模型',selected==='')+state.current.config.aliases.map(a=>option(a.publicId,`${a.label} · ${a.publicId}`,a.publicId===selected)).join('');
  $('quick-model').innerHTML=quickCatalog.suppliers[0].models.map((m,i)=>option(String(i),m.label,false)).join('');
  renderQuickUpstream();await selectQuickAlias();
}
async function previewQuick() {
  const seq=++quickSequence;quickPreviewSignature='';
  try {
    const input=quickInput(),signature=JSON.stringify(input);
    if(!input.publicId||!input.label){$('quick-preview').className='empty';$('quick-preview').textContent='填写显示 ID 和名称后自动加载';return;}
    const q=await api('/v1/mvp/preview','POST',input);
    if(seq!==quickSequence)return;quickPreviewSignature=signature;
    $('quick-preview').className='';
    const rows=[['输出成本（人民币 / 张）',precise(q.costCny)+' · 估计'],['3倍建议售价',precise(q.suggestedSaleCny)],['将应用的售价',precise(q.saleCny)],['换算前积分',precise(q.creditsUnrounded)],['预计扣积分',q.credits===null?'待配置':`${q.credits} 积分 · ${{ceil:'向上取整',floor:'向下取整',nearest:'四舍五入'}[q.creditConversion?.rounding]||''}`],['售价减API成本',precise(q.profitCny)+' · 暂估'],['有效参数',`${q.effective.resolution} / ${q.effective.size} / ${q.effective.quality||'不传 quality'}`]];
    $('quick-credit-info').textContent=q.creditConversion?`1 元 = ${q.creditConversion.creditsPerCny} 积分；1 积分 ≈ ${precise(q.cnyPerCredit)} 元。此兑换规则对本服务全部模型生效；应用后更新，新报价使用新规则。`:'积分兑换尚未配置';
    $('quick-preview').innerHTML=`<div class="quote-lines">${rows.map(([k,v])=>`<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>`;
    $('quick-source').textContent=`来源：已核查 APIMart 目录（${q.catalogDate}）及当前已发布采购配置 · ${q.tier}档 · 1 USD = ${q.fx.usdToCny} CNY。${q.costScope==='output-only'?'原生只含输出参考成本，不含输入；非完整调用报价。':'EXT按交付张包价，账户可用性尚未核验。'}${q.fx.basis==='budget'?'人民币为预算折算估计。':''}修改采购价 / 汇率请使用「定价配置」。`;
  } catch(e) { if(seq!==quickSequence)return;$('quick-preview').className='warning';$('quick-preview').textContent=e.message; }
}
$('quick-existing').onchange=()=>action(selectQuickAlias);
for(const name of ['quick-model','quick-resolution','quick-quality','quick-ratio'])$(name).onchange=()=>{if(name==='quick-model'||name==='quick-resolution')quickSpecs();$('quick-sale').value='';$('quick-result').hidden=true;previewQuick();};
for(const name of ['quick-public','quick-label','quick-sale','quick-credits'])$(name).oninput=()=>{quickPreviewSignature='';previewQuick();};$('quick-rounding').onchange=()=>{quickPreviewSignature='';previewQuick();};
$('quick-refresh').onclick=()=>action(previewQuick);
$('quick-apply').onclick=()=>action(async()=>{
  const preset=quickInput();if(quickPreviewSignature!==JSON.stringify(preset))throw Error('请等待成本加载成功后再应用');
  const d=await api('/v1/mvp/apply','POST',{expectedVersion:state.current.version,expectedRevision:state.draft.revision,preset});
  // Render from the database response, not from an optimistic browser-only change.
  $('quick-existing').innerHTML=option(preset.publicId,preset.publicId,true);await load();
  notify(`v${d.current.version} 已持久化；模拟上游确认 v${d.upstream.version}。真实上游未调用。`);
});
$('quick-simulate').onclick=()=>action(async()=>{
  const input=quickInput(),alias=state.current.config.aliases.find(a=>a.publicId===input.publicId);
  if(!alias?.quickSpec)throw Error('请先应用该展示模型的快速配置');
  const applied={publicId:alias.publicId,label:alias.label,supplier:alias.supplier||'apimart',actualModel:alias.model,...(alias.version?{upstreamVersion:alias.version}:{}),spec:alias.quickSpec};
  const effectiveQuality=alias.model==='gpt-image-2.5-ext'||state.current.config.qualityPolicy!=='cap-medium'?alias.quickSpec.quality:alias.quickSpec.quality==='low'?'low':'medium';
  const fixed=state.current.config.fixedSales[`${alias.publicId}|${alias.quickSpec.resolution}|${alias.quickSpec.ratio}|${effectiveQuality}`];if(fixed!==undefined)applied.saleCny=fixed;
  if(state.current.config.creditConversion){applied.creditsPerCny=state.current.config.creditConversion.creditsPerCny;applied.rounding=state.current.config.creditConversion.rounding;}
  if(JSON.stringify(input)!==JSON.stringify(applied))throw Error('当前编辑尚未应用，请先应用再验证');
  if(!quickSimulateKey)quickSimulateKey=crypto.randomUUID();
  const r=await api('/v1/mvp/simulate','POST',{publicId:alias.publicId,expectedVersion:state.current.version},{'Idempotency-Key':quickSimulateKey});
  $('quick-result').hidden=false;$('quick-result').textContent=`模拟执行：${r.quote.publicId} → APIMart / ${r.payload.model}${r.payload.version?' / '+r.payload.version:''} · 冻结 v${r.quote.configVersion} · 售价 ${precise(r.quote.saleCny)} 元 / ${r.quote.credits??'待配置'} 积分 · 未产生费用。`;
  $('quick-json').textContent=JSON.stringify(r,null,2);
});
