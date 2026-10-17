window.runFrameChecks=async function(mode='modified'){
 let checks=0;const wait=ms=>new Promise(r=>setTimeout(r,ms));const assert=(v,label)=>{if(!v)throw Error(label);checks++;};
 const until=async test=>{for(let n=0;n<150;n++){if(test())return;await wait(25)}throw Error('UI wait timed out: '+test)};
 const b=name=>[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===name||x.getAttribute('aria-label')===name);
 const fill=async(el,v)=>{Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));await wait(60)};
 const select=async(label,v)=>{const el=document.querySelector(`[aria-label="${label}"]`);el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}));await wait(80)};
 await until(()=>document.querySelector('dialog[open]'));await until(()=>[...document.images].every(i=>i.complete&&i.naturalWidth));
 await fill(document.querySelector('[aria-label="节点提示词"]'),'替换产品，保持海报画幅和文案');
 if(mode==='baseline'){assert(document.querySelector('[aria-label="比例"]').value==='1:1','old square default');assert(!document.querySelector('[name="imagegen-frame-source"]'),'no explicit source');return{RESULT:'BASELINE_REPRODUCED',CHECKS:checks,DEFAULT:'1:1',FRAME_SOURCE:'ABSENT',SUPPLIER_CALLS:0}}
 assert(document.querySelector('[aria-label="比例"]').value==='source','material default');
 assert(document.querySelector('[aria-label="沿用素材2的画幅"]').checked,'reference selected automatically');
 assert(document.body.innerText.includes('生成画幅 3:4'),'reference frame automatic without click');
 let state=await(await fetch('/__fixture/state')).json();assert(state.plans.length===0&&state.posts.length===0,'no automatic billable submission');
 await select('图像用途','style-transfer');assert(document.querySelector('[aria-label="沿用素材1的画幅"]').checked,'style transfer keeps target canvas');
 await select('图像用途','');assert(document.querySelector('[aria-label="沿用素材2的画幅"]').checked,'replacement default restores reference');
 b('上移素材2').click();await wait(100);assert(document.querySelector('[aria-label="沿用素材1的画幅"]').checked,'reorder preserves identity');
 b('预览步骤与积分').click();await until(()=>[...document.querySelectorAll('button')].some(x=>x.textContent.includes('确认并执行')));
 state=await(await fetch('/__fixture/state')).json();assert(state.plans.at(-1).parameters.ratio==='3:4','resolved layout posted');assert(state.plans.at(-1).inputs[0].role==='reference','roles not silently rewritten');
 assert(document.querySelector('[role="status"]').innerText.includes('生成画幅 3:4'),'confirmation visible');
 await select('生图模型','square-only');assert(document.body.innerText.includes('当前模型不支持 3:4'),'unsupported preserved and explained');assert(![...document.querySelectorAll('button')].some(x=>x.textContent.includes('确认并执行')),'stale preview cleared');
 b('预览步骤与积分').click();await wait(80);state=await(await fetch('/__fixture/state')).json();assert(state.plans.length===1,'unsupported blocked before plan');
 await select('生图模型','image');await select('比例','9:16');b('预览步骤与积分').click();await until(()=>[...document.querySelectorAll('button')].some(x=>x.textContent.includes('确认并执行')));
 state=await(await fetch('/__fixture/state')).json();assert(state.plans.at(-1).parameters.ratio==='9:16','manual fixed ratio');
 await select('比例','source');assert(![...document.querySelectorAll('button')].some(x=>x.textContent.includes('确认并执行')),'ratio change invalidates plan');
 b('预览步骤与积分').click();await until(()=>[...document.querySelectorAll('button')].some(x=>x.textContent.includes('确认并执行')));
 [...document.querySelectorAll('button')].find(x=>x.textContent.includes('确认并执行')).click();await until(()=>document.body.innerText.includes('已完成'));
 state=await(await fetch('/__fixture/state')).json();assert(state.posts.length===1&&state.posts[0].parameters.ratio==='3:4','one confirmed post');assert(state.posts[0].confirmation.confirmed&&state.posts[0].operationId===state.plans.at(-1).operationId,'idempotency and confirmation unchanged');
 document.querySelector('[aria-label="沿用素材2的画幅"]').click();await wait(80);document.querySelector('[aria-label="沿用素材1的画幅"]').click();await wait(80);b('移除素材1').click();await wait(80);b('预览步骤与积分').click();await wait(80);assert(document.querySelector('[role="alert"]')?.textContent.includes('所选画幅素材已移除'),'removed source never falls back to product');
 assert(document.documentElement.scrollWidth<=innerWidth,'no page overflow');
 return{RESULT:'MODIFIED_PASS',CHECKS:checks,SUBJECT_REPLACEMENT:'AUTO_REFERENCE',MULTI_REFERENCE:'EXPLICIT',SELECTED_LAYOUT:'3:4',REORDER:'STABLE',MODEL_CHANGE:'NO_RESET',CONFIRMED_POSTS:1,ROLE_REWRITE:0,SUPPLIER_CALLS:0};
};

window.runSingleFrameChecks=async function(){
 const wait=ms=>new Promise(r=>setTimeout(r,ms));for(let n=0;n<100&&!document.querySelector('[name="imagegen-frame-source"]');n++)await wait(30);
 for(let n=0;n<100&&!document.body.innerText.includes('生成画幅 3:4');n++)await wait(30);
 if(!document.querySelector('[name="imagegen-frame-source"]:checked')||!document.body.innerText.includes('生成画幅 3:4'))throw Error('single image default');
 const t=document.querySelector('[aria-label="节点提示词"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'保留主体，调整背景');t.dispatchEvent(new Event('input',{bubbles:true}));await wait(60);
 [...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='预览步骤与积分').click();await wait(100);
 const state=await(await fetch('/__fixture/state')).json();if(state.plans.at(-1)?.parameters.ratio!=='3:4')throw Error('single request square');
 return{RESULT:'SINGLE_PASS',DEFAULT:'ORIGINAL_3:4',FRAME_SOURCE:'SINGLE_AUTOMATIC',PAID_POSTS:state.posts.length,SUPPLIER_CALLS:0};
};

window.runLocalFrameChecks=async function(){
 const wait=ms=>new Promise(r=>setTimeout(r,ms));const local=[...document.querySelectorAll('label')].find(l=>l.textContent.includes('仅处理原图格式和尺寸'));local.querySelector('input').click();await wait(80);
 if(document.querySelector('[name="imagegen-frame-source"]'))throw Error('local postprocess requires generation ratio');
 const t=document.querySelector('[aria-label="节点提示词"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'仅调整输出格式');t.dispatchEvent(new Event('input',{bubbles:true}));await wait(60);
 [...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='预览步骤与积分').click();await wait(150);
 const state=await(await fetch('/__fixture/state')).json(),last=state.plans.at(-1);if(last?.mode!=='postprocess'||last.parameters.ratio!=='auto')throw Error(JSON.stringify(last));
 return{RESULT:'LOCAL_POSTPROCESS_PASS',MULTI_SOURCE:'NOT_REQUIRED',MODE:last.mode,PAID_POSTS:state.posts.length,SUPPLIER_CALLS:0};
};

window.runMultiReferenceChecks=async function(){
 const wait=ms=>new Promise(r=>setTimeout(r,ms));for(let n=0;n<100&&document.images.length<3;n++)await wait(30);
 for(let n=0;n<100&&![...document.images].every(i=>i.complete&&i.naturalWidth);n++)await wait(30);
 if(document.querySelector('[name="imagegen-frame-source"]:checked'))throw Error('multiple references guessed');
 const t=document.querySelector('[aria-label="节点提示词"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'替换参考海报主体');t.dispatchEvent(new Event('input',{bubbles:true}));await wait(60);
 [...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='预览步骤与积分').click();await wait(100);
 let state=await(await fetch('/__fixture/state')).json();if(state.plans.length||state.posts.length)throw Error('ambiguous references submitted');
 document.querySelector('[aria-label="沿用素材2的画幅"]').click();await wait(80);
 [...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='预览步骤与积分').click();await wait(150);
 state=await(await fetch('/__fixture/state')).json();if(state.plans.at(-1)?.parameters.ratio!=='3:4')throw Error('explicit reference missing');
 return{RESULT:'MULTI_REFERENCE_PASS',AMBIGUITY:'BLOCKED',EXPLICIT_RATIO:'3:4',SUPPLIER_CALLS:0};
};
