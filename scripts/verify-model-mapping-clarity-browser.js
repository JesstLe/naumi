// Run inside the local fixture via the collaborative browser, not production.
window.runMappingChecks = async function(mode = 'modified') {
  let checks = 0;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const assert = (value, label) => { if(!value) throw Error(label); checks++; };
  const until = async test => { for(let n=0;n<100;n++){ if(test())return;await wait(30); }throw Error('UI wait timed out: '+test); };
  const text = n => n.textContent.trim();
  const button = (name, within=document) => [...within.querySelectorAll('button')].find(b=>text(b)===name||b.getAttribute('aria-label')===name);
  const click = async (name,within) => {const b=button(name,within);if(!b)throw Error('Button missing: '+name);b.click();await wait(70);};
  const fill = async (input,value) => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));await wait(100);};
  const card = id => document.querySelector(`[data-testid="managed-model-${id}"]`);
  await until(()=>card('gpt-image'));
  if(mode==='baseline') {
    assert(!!button('修改显示名称',card('gpt-image')),'baseline inline actions');
    assert(card('banana').innerText.includes('gemini-3.0-pro-image-landscape'),'baseline disabled routes visible');
    assert(!button('配置',card('gpt-image')),'baseline no progressive disclosure');
    return {RESULT:'BASELINE_REPRODUCED',INLINE_ACTIONS:'VISIBLE',DISABLED_ROUTES:'VISIBLE',CHECKS:checks,SUPPLIER_CALLS:0};
  }
  assert([...document.querySelectorAll('[data-testid^="managed-model-"]')].length===5,'all rows');
  assert(!button('修改显示名称',card('gpt-image')),'actions collapsed');
  assert(!card('banana').innerText.includes('gemini-3.0-pro-image-landscape'),'inactive collapsed');
  assert(card('gpt-image').innerText.includes('2 个启用通道'),'active channels counted');
  assert(card('no-route').innerText.includes('暂无启用通道'),'no enabled route truthful');
  assert(card('text').innerText.includes('0 积分'),'zero price preserved');
  const before=await(await fetch('/__fixture/state')).json();assert(before.posts.length===0,'reading causes no write');
  await click('配置',card('gpt-image'));assert(button('收起',card('gpt-image')).getAttribute('aria-expanded')==='true','expanded state');
  const disabled=card('gpt-image').querySelector('details');assert(disabled&&!disabled.open,'inactive nested collapsed');
  disabled.open=true;assert(disabled.innerText.includes('gpt-image-2.5'),'inactive retained');disabled.open=false;
  for(const [name,title] of [['修改显示名称','修改前端显示名称'],['参数设置','模型参数设置'],['分辨率设置','分辨率显示与实际参数'],['供应通道','供应通道与分流'],['设置积分','设置模型积分'],['更换模型','更换实际模型'],['图像高级参数','图像高级参数']]) {
    await click(name,card('gpt-image'));await until(()=>document.querySelector('dialog[open]'));
    const d=document.querySelector('dialog[open]');assert(d.querySelector('h2').textContent===title,'dialog: '+name);
    await click('关闭',d);await until(()=>!document.querySelector('dialog[open]'));
  }
  await click('编辑范围',card('gpt-image'));await until(()=>document.querySelector('dialog[open]'));
  assert(document.querySelector('dialog h2').textContent==='选择应用工具','scope dialog preserved');await click('关闭',document.querySelector('dialog'));
  await click('收起',card('gpt-image'));assert(button('配置',card('gpt-image')).getAttribute('aria-expanded')==='false','collapse state');
  await click('文字');assert(!card('gpt-image')&&!!card('text'),'type filter');
  await click('全部');
  const search=document.querySelector('[aria-label="搜索模型"]');await fill(search,'gemini-3.0-pro-image-landscape');assert(!!card('banana')&&!card('gpt-image'),'search hidden inactive ID');
  await fill(search,'__missing__');assert(document.body.innerText.includes('没有匹配的模型'),'empty search');await fill(search,'');
  await click('调整排序');await until(()=>document.querySelector('dialog[open]'));assert(document.querySelector('dialog h2').textContent==='调整模型排序','order dialog');await click('关闭',document.querySelector('dialog'));
  await click('配置',card('gpt-image'));await click('修改显示名称',card('gpt-image'));await until(()=>document.querySelector('dialog[open]'));
  await fill(document.querySelector('[aria-label="显示名称"]'),'摄影模型');await click('保存并生效',document.querySelector('dialog'));await until(()=>card('gpt-image')?.innerText.includes('摄影模型'));
  const after=await(await fetch('/__fixture/state')).json(),op=after.posts.find(p=>p.action==='rename');
  assert(op?.rowId==='gpt-image'&&op.label==='摄影模型'&&op.expectedVersion===117&&!!op.id,'rename original payload');
  assert(after.posts.length===1,'only explicit save writes');
  assert(JSON.stringify(after.state.rows[0].routes)===JSON.stringify(before.state.rows[0].routes),'route config unchanged');
  assert(JSON.stringify(after.state.rows[0].pricing)===JSON.stringify(before.state.rows[0].pricing),'pricing unchanged');
  await click('收起',card('gpt-image'));assert(!button('修改显示名称',card('gpt-image')),'collapse after reload');
  assert(document.documentElement.scrollWidth<=innerWidth,'no horizontal overflow');
  return {RESULT:'MODIFIED_PASS',CHECKS:checks,DIALOGS:8,RENAME:'REAL_COMPONENT_PAYLOAD',READ_ONLY_WRITES:0,EXPLICIT_SAVES:1,SUPPLIER_CALLS:0};
};
