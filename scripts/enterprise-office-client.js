// Native ONLYOFFICE Save/Ctrl+S -> signed status 6/2 callback -> atomic worksheet version.
let dirty=false,editorPending=false,generation=0,savedCount=0;
const send=(type,data={})=>{if(parent!==window)parent.postMessage({type,ticket:S.ticket,...data},S.parentOrigin);};
const setStatus=t=>document.querySelector('#status').textContent=t;
const tag=document.createElement('script');tag.src=S.origin+'/web-apps/apps/api/documents/api.js';
tag.onload=()=>{S.config.events={onDocumentReady:()=>{setStatus('已打开');send('office-ready');},onDocumentStateChange:e=>{editorPending=!!e.data;if(e.data){generation++;dirty=true;setStatus('有未保存修改');send('office-dirty');}},onRequestClose:()=>send('office-close'),onError:e=>{setStatus('编辑器错误：'+e.data.errorCode);send('office-error');}};window.officeEditor=new DocsAPI.DocEditor('editor',S.config);};
tag.onerror=()=>setStatus('编辑服务暂未就绪');document.head.append(tag);
const timer=setInterval(async()=>{try{const r=await fetch('/office/status/'+S.ticket);if(!r.ok)return;const d=await r.json();if(d.error){setStatus(d.error==='VERSION_CONFLICT'?'保存冲突，请下载当前副本':'保存失败，请下载当前副本');document.querySelector('#recovery').hidden=false;send('office-save-error',{error:d.error});}else if(d.savedCount>savedCount){savedCount=d.savedCount;if(!editorPending){dirty=false;setStatus('已保存到系统');send('office-saved',{version:d.version,ref:d.ref});}else setStatus('已保存一个版本，仍有新修改');}}catch{}},1000);
addEventListener('pagehide',()=>{clearInterval(timer);void fetch('/office/close/'+S.ticket,{method:'POST',headers:{'x-office-csrf':S.csrf},keepalive:true});});
addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
