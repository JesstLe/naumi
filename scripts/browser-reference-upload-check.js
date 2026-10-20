/* Run in the T3 preview against our isolated actual-handler fixture. */
window.runUploadAcceptance=async function(){
 const f=UploadFixture,rows=[];
 const check=(value,name)=>{if(!value)throw Error(name);rows.push(name);};
 const file=async(path,name,type)=>new File([await(await fetch(path)).blob()],name,{type});
 const large=await file('/large.png','large.png','image/png'),wide=await file('/wide.png','wide.png','image/png');
 const prepared=await f.prepareReferenceImage(large,16);
 check(large.size>12*1024*1024,'large input over12MiB');
 check(prepared.file.size<4*1024*1024&&prepared.width*prepared.height<=5e6,'per-batch reference budgets');
 check(prepared.sourceWidth===2304&&prepared.sourceHeight===2048,'original source dimensions retained');
 const items=await f.prepareImageUploads([large],3,{preserveOriginal:true});
 check(!items[0].error&&items[0].file===large,'archive original File identity');
 const form=new FormData();form.set('image',items[0].file);form.set('title','Original fixture');
 const uploaded=await f.uploadFormData('/api/artworks/add',form);
 check(uploaded.ok&&uploaded.width===2304&&uploaded.height===2048,'actual large archive handler');
 const events=await(await fetch('/results')).json(),archive=events.filter(e=>e.kind==='archive').at(-1);
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await large.arrayBuffer()))).map(v=>v.toString(16).padStart(2,'0')).join('');
 check(archive.sha256===sha&&archive.thumbnail&&archive.preview,'canonical SHA and browser previews posted');
 const alpha=await f.prepareReferenceImage(wide,16),bitmap=await createImageBitmap(alpha.file),c=document.createElement('canvas');
 c.width=c.height=1;c.getContext('2d').drawImage(bitmap,0,0,1,1);const a=c.getContext('2d').getImageData(0,0,1,1).data[3];bitmap.close();
 check(a>0&&a<255,'alpha survives reference adaptation');
 check(alpha.sourceWidth===4001&&alpha.sourceHeight===2501&&Math.abs(alpha.width/alpha.height-4001/2501)<0.002,'coprime frame no crop/stretch');
 const exif=await file('/exif.jpg','exif.jpg','image/jpeg'),head=await f.browserImageHeader(exif);
 check(head.width===80&&head.height===120,'EXIF displayed dimensions');
 const exifArchive=await f.prepareOriginalImage(exif);check(exifArchive.width===80&&exifArchive.height===120,'EXIF browser previews agree');
 const noMime=await f.prepareImageUploads([new File([large],'mime-empty.png')],3,{preserveOriginal:true});
 check(!noMime[0].error&&noMime[0].file.type==='image/png'&&noMime[0].file.size===large.size,'missing MIME inferred without reencoding');
 const native=createImageBitmap;window.createImageBitmap=undefined;
 try{const fallback=await f.prepareOriginalImage(exif);check(fallback.width===80&&fallback.height===120,'DOM decoder fallback');}finally{window.createImageBitmap=native;}
 const gen=new FormData();gen.set('image',wide);gen.set('prompt','保留完整主体');gen.set('model','image-a');gen.set('ratio','auto');gen.set('imagegenNodeId','acceptance-'+Date.now());
 const before=(await(await fetch('/results')).json()).filter(e=>e.kind==='generation-fixture').length;
 await f.submitCanvasImagegen(gen,undefined,undefined,{owner:'browser-upload@example.test',project:'browser-fixture'});
 await f.submitCanvasImagegen(gen,undefined,undefined,{owner:'browser-upload@example.test',project:'browser-fixture'});
 const latest=await(await fetch('/results')).json(),plan=latest.filter(e=>e.kind==='plan').at(-1);
 check(plan.request.parameters.ratio==='4001:2501','plan uses original not derivative ratio');
 check(latest.filter(e=>e.kind==='generation-fixture').length===before+1,'same receipt no second generation POST');
 const multi=new FormData();multi.set('image',exif);multi.append('image',wide);multi.set('prompt','用产品替换参考图主体');multi.set('ratio','auto');multi.set('imagegenNodeId','multi-'+Date.now());
 await f.submitCanvasImagegen(multi,undefined,undefined,{owner:'browser-upload@example.test',project:'browser-fixture'});
 const multiPlan=(await(await fetch('/results')).json()).filter(e=>e.kind==='plan').at(-1);
 check(multiPlan.request.parameters.ratio==='4001:2501','unique reference controls frame not product');
 const explicit=new FormData();explicit.set('image',wide);explicit.set('prompt','保留完整主体');explicit.set('ratio','3:4');explicit.set('imagegenNodeId','explicit-'+Date.now());
 await f.submitCanvasImagegen(explicit,undefined,undefined,{owner:'browser-upload@example.test',project:'browser-fixture'});
 check((await(await fetch('/results')).json()).filter(e=>e.kind==='plan').at(-1).request.parameters.ratio==='3:4','explicit user ratio preserved');
 const countBefore=(await(await fetch('/results')).json()).filter(e=>e.kind==='reference').length;
 let currentCalls=0,cancelled=false;const switching=new FormData();switching.set('image',large);switching.set('prompt','fixture');switching.set('imagegenNodeId','switch-'+Date.now());
 try{await f.submitCanvasImagegen(switching,undefined,undefined,{owner:'browser-upload@example.test',project:'browser-fixture',isCurrent:()=>++currentCalls<3});}catch{cancelled=true;}
 check(cancelled&&(await(await fetch('/results')).json()).filter(e=>e.kind==='reference').length===countBefore,'account switch during browser processing cancels before upload');
 let failed=false;try{await f.prepareReferenceImage(new File(['bad'],'bad.png',{type:'image/png'}));}catch{failed=true;}
 check(failed,'bad header rejected before decode');
 const partial=await f.prepareImageUploads([new File(['invalid'],'bad.png'),exif],3,{preserveOriginal:true});
 check(!!partial[0].error&&!partial[1].error,'one invalid import does not discard other files');
 const result={status:'PASS',checks:rows.length,rows,largeBytes:large.size,sha,referenceBytes:prepared.file.size,referenceSize:[prepared.width,prepared.height],originalResult:uploaded,realSupplierCalls:0};
 window.uploadResult=result;document.querySelector('#result').textContent=JSON.stringify(result,null,2);
 await fetch('/save-results',{method:'POST',body:JSON.stringify(result,null,2)});return result;
};
