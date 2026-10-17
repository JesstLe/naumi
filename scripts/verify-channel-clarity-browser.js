window.runChannelChecks=async function(mode='modified'){
 let checks=0;
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const assert=(v,label)=>{if(!v)throw Error(label);checks++;};
 const until=async test=>{for(let n=0;n<150;n++){if(test())return;await wait(25)}throw Error('UI wait timed out: '+test)};
 const b=(name,root=document)=>[...root.querySelectorAll('button')].find(x=>x.textContent.trim()===name||x.getAttribute('aria-label')===name);
 const click=async(name,root)=>{const button=b(name,root);if(!button)throw Error('missing button '+name);button.click();await wait(60)};
 const card=()=>document.querySelector('[data-testid="managed-model-gpt-image"]');
 await until(()=>card());await click('配置',card());
 if(mode!=='baseline'){
  const list=card().querySelector('ul');assert(list.textContent.indexOf('Geeknow')<list.textContent.indexOf('现行主生图通道'),'summary shows configured priority order');assert(!list.textContent.includes('权重'),'priority summary no irrelevant weight');
 }
 await click('供应通道',card());await until(()=>document.querySelector('dialog[open]'));
 const d=()=>document.querySelector('dialog[open]');
 if(mode==='baseline'){
  assert(!!d().querySelector('[aria-label="通道权重 gpt-primary"]'),'old weight visible');assert(d().querySelector('[aria-label="通道权重 gpt-primary"]').disabled,'old weight disabled');assert(!!d().querySelector('[data-testid="supplier-channel-gpt-old"]'),'old disabled channel inline');
  return{RESULT:'BASELINE_REPRODUCED',CHECKS:checks,WEIGHT:'VISIBLE_DISABLED',INACTIVE:'INLINE',SUPPLIER_CALLS:0};
 }
 const ids=()=>[...d().querySelectorAll('[data-testid^="supplier-channel-"]')].map(n=>n.dataset.testid);
 assert(ids()[0]==='supplier-channel-gpt-backup','editor priority order');assert(!d().querySelector('[aria-label^="通道权重"]'),'priority hides weights');
 const inactive=[...d().querySelectorAll('details')].find(n=>n.querySelector('summary')?.textContent.startsWith('停用通道'));assert(inactive&&!inactive.open,'inactive collapsed');
 const runtime=[...d().querySelectorAll('details')].find(n=>n.querySelector('summary')?.textContent==='运行信息');assert(runtime&&!runtime.open,'runtime collapsed');
 runtime.open=true;assert(runtime.innerText.includes('运行占用未取得'),'unknown occupancy not fabricated zero');runtime.open=false;
 const before=await(await fetch('/__fixture/state')).json();assert(before.posts.length===0,'inspection no writes');
 const select=d().querySelector('[aria-label="调度方式"]');select.value='balanced';select.dispatchEvent(new Event('change',{bubbles:true}));await wait(80);
 assert(d().querySelector('[aria-label="通道权重 gpt-primary"]').value==='3','switch mode preserves weight');assert(d().querySelector('[aria-label="通道权重 gpt-backup"]').value==='7','backup preserved');
 const weight=d().querySelector('[aria-label="通道权重 gpt-primary"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(weight,'8');weight.dispatchEvent(new Event('input',{bubbles:true}));await wait(60);
 assert(d().querySelector('[aria-label="通道权重 gpt-primary"]').value==='8','edit weight');
 const first=d().querySelector('[data-testid="supplier-channel-gpt-primary"]');first.querySelector('input[type=checkbox]').click();await wait(60);assert(d().querySelector('[data-testid="supplier-channel-gpt-primary"]').dataset.enabled==='false','disable retains channel');
 inactive.open=true;d().querySelector('[data-testid="supplier-channel-gpt-primary"] input[type=checkbox]').click();await wait(60);
 await click('保存通道并生效',d());await until(()=>!d());
 const after=await(await fetch('/__fixture/state')).json(),op=after.posts[0];
 assert(after.posts.length===1&&op.action==='channels','one explicit save');assert(op.expectedVersion===117&&op.rowId==='gpt-image'&&!!op.id,'publication identity retained');
 assert(op.policy.mode==='balanced','mode submitted');assert(op.policy.channels.map(c=>c.upstreamId).join(',')===before.state.rows[0].supplierRouting.channels.map(c=>c.upstreamId).join(','),'visual sort never rewrites tie order');
 assert(op.policy.channels.find(c=>c.upstreamId==='gpt-primary').weight===8,'edited weight submitted');assert(op.policy.channels.find(c=>c.upstreamId==='gpt-old').enabled===false,'inactive retained in payload');
 assert(JSON.stringify(after.state.rows[0].pricing)===JSON.stringify(before.state.rows[0].pricing),'price unchanged');
 await click('供应通道',card());await until(()=>d());assert(d().querySelector('[aria-label="通道权重 gpt-primary"]').value==='8','saved value reopened');await click('取消',d());
 assert(document.documentElement.scrollWidth<=innerWidth,'no page overflow');
 return{RESULT:'MODIFIED_PASS',CHECKS:checks,PRIORITY_WEIGHT:'HIDDEN',BALANCED_WEIGHT:'EDITABLE',ORDER:'DISPLAY_ONLY',SAVE:'ORIGINAL_PAYLOAD',EXPLICIT_SAVES:1,SUPPLIER_CALLS:0};
};

window.runChannelDraftChecks=async function(){
 const wait=ms=>new Promise(r=>setTimeout(r,ms));let checks=0;
 const assert=(v,label)=>{if(!v)throw Error(label);checks++;};
 const card=document.querySelector('[data-testid="managed-model-gpt-image"]');
 const button=(name,root=document)=>[...root.querySelectorAll('button')].find(b=>b.textContent.trim()===name);
 if(card.querySelector('[aria-expanded]').getAttribute('aria-expanded')==='false'){button('配置',card).click();await wait(60)}
 button('供应通道',card).click();await wait(80);
 let dialog=document.querySelector('dialog[open]');
 for(const id of ['gpt-primary','gpt-backup']){dialog.querySelector(`[aria-label="启用通道 ${id}"]`).click();await wait(60)}
 assert(button('保存通道并生效',dialog).disabled,'all off cannot save');assert(dialog.innerText.includes('至少启用一条'),'all off validation message');
 const stopped=[...dialog.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent.startsWith('停用通道'));stopped.open=true;
 dialog.querySelector('[aria-label="启用通道 gpt-primary"]').click();await wait(60);assert(!button('保存通道并生效',dialog).disabled,'re-enable valid');
 const select=dialog.querySelector('[aria-label="添加供应通道"]');const option=[...select.options].find(o=>o.value==='banana-pro');assert(!!option,'compatible candidate remains');
 select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));await wait(60);button('添加通道',dialog).click();await wait(60);
 assert(!!dialog.querySelector('[data-testid="supplier-channel-banana-pro"]'),'add draft');
 button('移除通道',dialog.querySelector('[data-testid="supplier-channel-banana-pro"]')).click();await wait(60);assert(!dialog.querySelector('[data-testid="supplier-channel-banana-pro"]'),'remove draft');
 button('取消',dialog).click();await wait(60);button('供应通道',card).click();await wait(60);dialog=document.querySelector('dialog[open]');
 assert(dialog.querySelector('[aria-label="启用通道 gpt-primary"]').checked&&dialog.querySelector('[aria-label="启用通道 gpt-backup"]').checked,'cancel restores enabled state');
 assert(dialog.querySelectorAll('[data-testid^="supplier-channel-"]').length===3,'cancel preserves all original entries');
 const s=await(await fetch('/__fixture/state')).json();assert(s.posts.length===0,'drafts not submitted');button('取消',dialog).click();
 return{RESULT:'DRAFT_PASS',CHECKS:checks,ADD_REMOVE:'LOCAL_ONLY',ALL_DISABLED:'SAVE_BLOCKED',CANCEL:'RESTORED',WRITES:0,SUPPLIER_CALLS:0};
};
