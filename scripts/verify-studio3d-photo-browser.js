/* T3 preview_evaluate: load this source; runPhotoAudit('prepare'); upload fixture via preview_upload;
 * runPhotoAudit('trace'), runPhotoAudit('model'), runPhotoAudit('export'). Browser-only, no collector/upload. */
(() => {
  const audit={checks:[],requests:[],workers:[],exports:[],errors:[]};window.photoAudit=audit;
  const check=(value,name)=>{if(!value)throw Error(name);audit.checks.push(name);};
  const wait=async fn=>{for(let i=0;i<160;i++){if(fn())return;await new Promise(r=>setTimeout(r,80));}throw Error('bounded wait timeout');};
  const idle=async()=>{await new Promise(r=>setTimeout(r,180));await wait(()=>!document.querySelector('.s3-stage-loading')&&!document.querySelector('.s3-busy'));};
  const click=async text=>{const b=[...document.querySelectorAll('.s3 button')].find(b=>b.textContent.trim()===text&&b.getClientRects().length);check(b&&!b.disabled,'button ready '+text);b.click();await idle();};
  const set=(name,value)=>{const e=document.querySelector(`[aria-label="${name}"]`);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));};
  const nativeClick=HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click=function(){if(this.download&&this.href.startsWith('blob:')){const f={name:this.download,pending:true};audit.exports.push(f);fetch(this.href).then(r=>r.blob()).then(blob=>{f.blob=blob;f.size=blob.size;f.pending=false;});return;}return nativeClick.call(this);};
  window.photoDownload=(index)=>{const f=audit.exports[index],a=document.createElement('a'),url=URL.createObjectURL(f.blob);a.href=url;a.download=f.name;nativeClick.call(a);setTimeout(()=>URL.revokeObjectURL(url),30000);return f.name;};
  window.addEventListener('error',e=>audit.errors.push(e.message));
  window.runPhotoAudit=async phase=>{
    if(phase==='prepare'){
      const fetchNative=window.fetch;window.fetch=function(...args){if(!String(args[0]).startsWith('blob:'))audit.requests.push({type:'fetch',url:String(args[0]),method:args[1]?.method||'GET'});return fetchNative.apply(this,args);};
      const open=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(method,url,...args){audit.requests.push({type:'xhr',url:String(url),method});return open.call(this,method,url,...args);};
      const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{constructor(url,...args){audit.workers.push(String(url));super(url,...args);}};
      await click('上传照片建模');
    }
    if(phase==='trace'){
      await wait(()=>document.querySelector('.s3-photo-image img')?.naturalWidth>0);
      // ROI selected from the visible user's bottle; these are fixture input, not algorithm constants.
      set('选区x',37);set('选区y',32.7);set('选区width',27);set('选区height',50);
      await click('提取轮廓');await wait(()=>document.querySelector('.s3-photo-result'));
      audit.timing=document.querySelector('.s3-photo-result').innerText;
      check(audit.workers.length===1,'dedicated browser Worker');
      check(audit.requests.filter(r=>r.method!=='GET').length===0,'no image upload');
      check(!!document.querySelector('.s3-photo-image polygon'),'outline visible before confirmation');
      await click('打开三维模型');await wait(()=>document.querySelector('[data-studio-renderer]')&&!document.querySelector('.s3-stage-loading'));
    }
    if(phase==='model'){
      set('项目名称','NexFort · 本机照片试验');await idle();
      check(document.querySelector('.s3-editor').innerText.includes('非实测'),'assumed scale visible');
      await click('保存工程');await click('导出工程');await wait(()=>audit.exports.length>0&&audit.exports.every(e=>!e.pending));
      const data=JSON.parse(await audit.exports[0].blob.text());audit.project=data;
      check(data.version===2&&data.template==='photo-lathe','version2 photo engineering');
      check(data.photo.profile.length===192&&data.photo.sourceHash.length===64,'source hash and actual silhouette');
      check(data.photo.scaleSource==='assumed'&&data.photo.assumption==='axisymmetric','approximation provenance');
      const canvas=document.querySelector('[data-studio-renderer]');audit.front=canvas.toDataURL();
      await click('侧面');check(audit.front!==canvas.toDataURL(),'side view differs from flat front');
      await click('背面');check(audit.front!==canvas.toDataURL(),'unobserved back not copied front');
      await click('材质');await click('检查白模');await click('45°');
      check(audit.front!==canvas.toDataURL(),'real shaded geometry visible');
      await click('导出图片');await wait(()=>audit.exports.every(e=>!e.pending));
      await click('原图外观');await click('正面');await click('导出图片');await wait(()=>audit.exports.every(e=>!e.pending));
      await click('导出 GLB');await wait(()=>audit.exports.every(e=>!e.pending));
      const glb=audit.exports.at(-1),buf=await glb.blob.arrayBuffer(),view=new DataView(buf),doc=JSON.parse(new TextDecoder().decode(new Uint8Array(buf,20,view.getUint32(12,true))));
      check(view.getUint32(0,true)===0x46546c67,'binary GLB');check(doc.meshes.length===4&&doc.images.length===1,'four real meshes and embedded original photo');
      check(doc.nodes.some(n=>n.name==='背面待补充'),'unknown back named in GLB');
      for(const f of audit.exports.filter(f=>f.name.endsWith('.png'))){const b=await createImageBitmap(f.blob);check(b.width===2048&&b.height===2048,'PNG exact output dimensions');b.close();}
      await click('保存工程');document.querySelector('[aria-label="返回项目"]').click();await idle();document.querySelector('.s3-project-open').click();await idle();
      check(document.querySelector('.s3-editor').innerText.includes('照片轮廓')&&!document.querySelector('.s3-scene-error'),'saved v2 reopen renders');
    }
    if(phase==='export'){
      check(audit.requests.filter(r=>r.method!=='GET').length===0,'complete flow zero upload POST');
      check(audit.requests.every(r=>!/^https?:/.test(r.url)||new URL(r.url).origin===location.origin),'no third-party API');
      check(audit.errors.length===0,'no runtime errors');
      const result={status:'PASS',checks:audit.checks,timing:audit.timing,requests:audit.requests,workers:audit.workers,exports:audit.exports.map(e=>({name:e.name,bytes:e.size})),runtimeErrors:audit.errors};
      window.photoAuditResult=result;return result;
    }
    return {phase,checks:audit.checks,timing:audit.timing,errors:audit.errors};
  };
  return 'PHOTO_BROWSER_AUDIT_READY';
})()
