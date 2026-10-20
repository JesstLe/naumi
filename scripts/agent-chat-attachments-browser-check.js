(async()=>{
 const tab=document.querySelector('#canvas-agent-panel');if(!tab)throw Error('actual CanvasClient panel absent');
 const wait=async(fn)=>{for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('UI check timed out');};
 const state=()=>fetch('/__fixture/state').then(r=>r.json());
 const record=(name,ok)=>{if(!ok)throw Error(name);window.attachChecks.push(name);};
 const file=async(name)=>new File([await fetch('/demos/suite-demo/suppl-src.png').then(r=>r.blob())],name,{type:'image/png'});
 const upload=async(files,eventType='change')=>{const d=new DataTransfer();for(const f of files)d.items.add(f);const input=document.querySelector('[data-testid=canvas-assistant-upload-input]');if(eventType==='change'){input.files=d.files;input.dispatchEvent(new Event('change',{bubbles:true}));}
  else if(eventType==='paste')tab.querySelector('footer').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:d}));
  else tab.querySelector('footer').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:d}));
  await new Promise(r=>setTimeout(r,150));
  await wait(()=>!document.querySelector('button[aria-label="添加图片"]').disabled);
 };
 const refs=()=>[...tab.querySelectorAll('button[aria-label^="移除图片 "]')];
 record('initial-four-contexts',refs().length===4);
 refs().at(-1).click();await wait(()=>refs().length===3);record('single-remove-retains-other-three',refs().length===3);
 await fetch('/__fixture/control?fail=1');const before=(await state()).uploads.length;
 await upload([await file('fail.png'),await file('retained.png')]);
 record('partial-failure-keeps-first-and-success',refs().length===4&&(await state()).uploads.length===before+1);
 record('failure-visible',tab.innerText.includes('部分图片添加失败'));
 await upload([await file('pasted.png')],'paste');record('paste-appends-fifth',refs().length===5);
 const capped=(await state()).uploads.length;await upload([await file('extra.png')]);record('sixth-explicitly-rejected-without-upload',(await state()).uploads.length===capped&&tab.innerText.includes('最多添加 5'));
 refs().at(-1).click();await wait(()=>refs().length===4);await upload([await file('dropped.png')],'drop');record('drop-appends-without-canvas-duplicate',refs().length===5&&(await state()).uploads.length===capped+1);
 const textarea=tab.querySelector('textarea'),set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(textarea,'本地验收：对比全部五张图片，只分析。');textarea.dispatchEvent(new Event('input',{bubbles:true}));
 await wait(()=>!tab.querySelector('button[aria-label="发送消息"]').disabled);tab.querySelector('button[aria-label="发送消息"]').click();
 await wait(async()=>{const s=await state();return s.turns.length===2&&!!tab.querySelector('button[aria-label="添加图片"]:not(:disabled)');});
 const sent=(await state()).turns.at(-1);record('next-turn-sends-all-five-in-order',sent.contextIds.length===5&&sent.contextIds[0]==='attachment-root'&&new Set(sent.contextIds).size===5);
 tab.querySelector('button[aria-label="新建对话"]').click();await wait(()=>!tab.querySelectorAll('button[aria-label^="移除图片 "]').length);record('new-chat-clears-added-attachments',tab.innerText.includes('原始场景'));
 tab.querySelector('button[aria-label="项目对话记录"]').click();await wait(()=>tab.querySelector('[data-testid=canvas-assistant-history-item]'));tab.querySelector('[data-testid=canvas-assistant-history-item]').click();
 await wait(()=>tab.innerText.includes('原始场景')&&!tab.innerText.includes('正在读取'));const refButton=tab.querySelector('button[aria-label="查看参考图片"]');if(refButton?.getAttribute('aria-expanded')!=='true')refButton.click();
 await wait(()=>refs().length===5);record('history-restores-exact-five',refs().length===5);
 return {result:'BROWSER=PASS',checks:attachChecks,state:await state()};
})()
