(async()=>{
 const checks=[],ok=(v,n)=>{if(!v)throw Error(n);checks.push(n)},q=s=>document.querySelector(s),click=s=>{const e=q(s);if(!e)throw Error('missing '+s);e.click()},change=(s,value)=>{q(s).value=value;q(s).dispatchEvent(new Event('change',{bubbles:true}))},wait=async f=>{for(let i=0;i<100;i++){if(f())return;await new Promise(r=>setTimeout(r,100));}throw Error('wait timeout')};
 view='schedule';imported.active=true;await importLoad();await wait(()=>imported.rows.length===364&&!imported.loading);
 const sourceBefore=JSON.stringify(imported.rows),business=[KEY,SCHED_KEY,LEGACY_SCHED_KEY].map(k=>localStorage.getItem(k)),layoutKey=importLayoutKey(),oldLayout=localStorage.getItem(layoutKey);
 try{
  importDisplay.columns=SM.clone(importColumnDefaults);importDisplay.density='normal';importDisplay.collapsed.clear();importDisplay.editing=false;imported.mode='table';imported.page=1;imported.query='';imported.designer='';imported.status='';imported.issuesOnly=false;shell();
  const tree=ImportViewModel.tree(imported.rows,imported.rows),ids=tree.flatMap(g=>[g.root.excelRow,...g.children.map(x=>x.row.excelRow)]);
  ok(ids.length===364&&new Set(ids).size===364,'every source row projected exactly once');ok(tree.filter(g=>g.pending).length===23,'23 ambiguous rows remain separate');
  ok(q('.sc-sheet .sc-table')&&q('.sc-parent')&&q('.import-child'),'original scheduling table and parent-child styling');
  ok(document.querySelectorAll('.import-table .person .avatar').length>0,'real member avatars');ok(q('.import-table .sc-tint-blue')&&q('.import-table .sc-tint-yellow'),'original column tints');
  ok(q('.import-candidate')&&!q('.import-confirmed'),'candidate does not pretend confirmed');
  const before=document.querySelectorAll('[data-import-record]').length;click('[data-import-collapse]');ok(document.querySelectorAll('[data-import-record]').length<before,'collapse hides display only');click('[data-import-collapse]');ok(document.querySelectorAll('[data-import-record]').length===before,'expand restores rows');
  click('#importCollapseAll');ok(!q('.import-child'),'collapse all');click('#importCollapseAll');ok(!!q('.import-child'),'expand all');
  const child=imported.rows.find(r=>r.parentCandidates.length===1&&r.title&&imported.rows.filter(x=>x.title===r.title).length===1);
  imported.query=child.title;shell();ok(!!q('[data-import-context]'),'filtered child retains parent context');click('#importClear');
  click('[data-import-view="designer"]');ok(!!q('.import-group'),'designer grouping preserved');click('[data-import-view="owner"]');ok(!!q('.import-group'),'requester grouping preserved');
  click('[data-import-view="board"]');ok(document.querySelectorAll('.wb-card').length===364&&!!q('.import-card-owner .avatar'),'board cards and real avatars');click('[data-import-view="table"]');
  click('#importDesign');ok(!!q('.sc-designer'),'matching layout editor');change('#importDensity','compact');ok(!!q('.sc-table.sc-compact'),'density preview');
  click('[data-import-column="owner"]');change('#importColumnLabel','需求负责人');change('#importWidth','155');change('#importTint','green');ok(importDisplay.columns.find(c=>c.id==='owner').label==='需求负责人'&&importDisplay.columns.find(c=>c.id==='owner').width===155,'column alias width tint');
  click('[data-import-move="owner"][data-delta="-1"]');ok(importDisplay.columns[2].id==='owner','column reorder');
  click('[data-import-visible="quantity"]');ok(!importDisplay.columns.find(c=>c.id==='quantity').visible,'column visibility');
  const width=importDisplay.columns[0].width;click('[data-import-column="title"]');change('#importWidth','100');ok(importDisplay.columns[0].width===width,'title width validation');
  click('#importSaveLayout');ok(JSON.parse(localStorage.getItem(layoutKey)).density==='compact','local presentation persistence');
  importDisplay.columns=SM.clone(importColumnDefaults);importDisplay.density='normal';importDisplay.loadedKey='';shell();ok(importDisplay.density==='compact'&&importDisplay.columns[2].id==='owner','saved layout reloads');
  click('#importDesign');click('#importLayoutReset');click('#importSaveLayout');ok(importDisplay.density==='normal'&&importDisplay.columns[2].id==='designer','restore default presentation');
  click('#importIssuesToggle');ok(importFiltered().every(r=>importOpenIssues(r).length>0),'issue filter retained');click('#importClear');
  click('#importNext');ok(imported.page===2,'tree group pagination');click('#importPrev');
  const r=imported.rows.find(r=>r.parentCandidates.length>1);importDetail(r.excelRow);ok(q('#importResolve select').options.length===r.parentCandidates.length+1,'parent review still available');closeOverlay();
  ok(JSON.stringify(imported.rows)===sourceBefore,'source data and confirmation untouched');ok(JSON.stringify(business)===JSON.stringify([KEY,SCHED_KEY,LEGACY_SCHED_KEY].map(k=>localStorage.getItem(k))),'demo business and layout unchanged');
  ok(document.documentElement.scrollWidth<=innerWidth,'no document overflow');
  const db=await importRequest('rows',{source:imported.batch.sourceHash});ok(JSON.stringify(db.rows)===sourceBefore,'database source unchanged');
  return {passed:checks.length,checks,rows:364,ambiguous:23,projectionGroups:tree.length};
 }finally{if(oldLayout===null)localStorage.removeItem(layoutKey);else localStorage.setItem(layoutKey,oldLayout);importDisplay.loadedKey='';importDisplay.editing=false;importDisplay.collapsed.clear();imported.query='';imported.page=1;shell();}
})()
