const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process'),ts=require('typescript');
const mode=process.argv[2]||'modified',root=path.resolve(process.argv[3]||'.'),base='aa01e8184922054f74afd265733884179c59e1a6';
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8'),canvas=read('src/components/canvas/canvas-client.tsx'),workbench=read('src/components/labs/workbench-client.tsx');
const removed=['src/components/imagegen/imagegen-panel.tsx','src/components/imagegen/imagegen-panel.module.css','src/components/imagegen/imagegen-frame-choice.tsx','src/components/imagegen/imagegen-frame-choice.module.css','src/lib/imagegen/frame-choice.ts','scripts/serve-imagegen-frame-choice-fixture.cjs','scripts/verify-imagegen-frame-choice-browser.js','scripts/verify-imagegen-frame-choice.cjs'];
if(mode==='baseline'){
 assert(canvas.includes('function openImagegenPanel()'));assert(canvas.includes('{imagegenPanel&&<ImagegenPanel'));assert(workbench.includes('{imagegenOpen&&<ImagegenPanel'));for(const f of removed)assert(fs.existsSync(path.join(root,f)));
 console.log('BASELINE=REPRODUCED PANEL_ENTRIES=2 COMPONENT_FILES=4 PANEL_TESTS=3 FRAME_UI=1 EXIT=0');
}else{
 let n=0;const check=(ok,label)=>{assert(ok,label);n++};for(const f of removed)check(!fs.existsSync(path.join(root,f)),'deleted '+f);
 for(const source of [canvas,workbench])check(!/ImagegenPanel|imagegenPanel|imagegenOpen|openImagegenPanel|mountImagegenResult|imagegenPlacement/.test(source),'no panel imports/state/entry');
 const functions=s=>{const out=new Map();const visit=x=>{if(ts.isFunctionDeclaration(x)&&x.name)out.set(x.name.text,x.getText().replace(/\s+/g,' '));ts.forEachChild(x,visit)};visit(ts.createSourceFile('x.tsx',s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX));return out};
 for(const [file,current,outer] of [['src/components/canvas/canvas-client.tsx',canvas,'CanvasClient'],['src/components/labs/workbench-client.tsx',workbench,'WorkbenchClient']]){
  const before=functions(cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'})),after=functions(current);
  const approvedAgent=file.includes('/canvas/')?functions(cp.execFileSync('git',['show','703b33cc:'+file],{encoding:'utf8'})):new Map();
  for(const [name,body] of before){if(['restoreAssistantConversation','sendAssistantMessage'].includes(name)){check(after.get(name)===approvedAgent.get(name),'approved stream integration '+name);continue;}if([outer,'openImagegenPanel','mountImagegenResult'].includes(name))continue;if(name==='RatioIcon'){const render=after.get(name)||'';check(render.startsWith(body.slice(0,body.indexOf(' return ')))&&render.includes('<svg')&&render.includes('<rect'),'ratio sizing unchanged; SVG presentation');continue;}check(after.get(name)===body,'unchanged '+name);}
 }
 check(canvas.includes('{modelControl(false)}')&&canvas.includes('{ratioControl}')&&canvas.includes('onClick={generateChild}'),'original image Dock retained');
 check(canvas.includes('submitCanvasImagegen(form'),'original shared generation path retained');
 check(workbench.includes('jobsForType')&&workbench.includes('/api/generate-image'),'native batch workflow retained');
 check(read('src/lib/imagegen/plan.ts').includes('automaticFrameRatio(request,inputs'),'server ratio repair retained');
 const helper=read('src/lib/imagegen/frame-ratio.ts');check(helper.includes('defaultFrameSource')&&!helper.includes('resolveFrameChoice'),'server role helper only');
 const files=[];const walk=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(/\.(tsx?|css)$/.test(f))files.push(f)}};walk(path.join(root,'src'));
 for(const f of files)assert(!/(?:from\s*["'][^"']*(?:imagegen-panel|imagegen-frame-choice|imagegen\/frame-choice)|\bImagegenPanel\b)/.test(fs.readFileSync(f,'utf8')),'dangling import '+f);
 check(true,'full src no dangling imports');
 console.log(`MODIFIED=PASS CHECKS=${n} PANEL_ENTRIES=0 REMOVED_FILES=8 ORIGINAL_DOCK=BUSINESS_UNCHANGED NATIVE_BATCH=UNCHANGED SERVER_RATIO=RETAINED EXIT=0`);
}
