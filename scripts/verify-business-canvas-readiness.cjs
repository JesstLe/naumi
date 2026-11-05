'use strict';
/** Execute the copied business script's actual Canvas-entry code against real
 * Playwright locators. DOM/hydration states are explicit fixtures, not Next/PG
 * or evidence that the historical dev-memory restart has been reproduced. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const ts=require('typescript'),{chromium,expect}=require('@playwright/test');
const option=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const root=path.resolve(option('--source-root','.')),out=path.resolve(option('--out',process.env.BUSINESS_CANVAS_READINESS_EVIDENCE||'output/business-canvas-readiness'));
const script='scripts/verify-business-ui.ts',names=[script,'src/components/canvas/canvas-client.tsx','src/components/canvas/project-browser-surface.tsx','src/components/canvas/project-browser.tsx','package.json','package-lock.json','tsconfig.json'];
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const snapshot=()=>Object.fromEntries(names.map(name=>{const bytes=fs.readFileSync(path.join(root,name));return[name,{sha256:sha(bytes),bytes:bytes.length}];}));
const report={status:'ERROR',sourceRoot:root,sources:{},checks:0,details:[],supplierCalls:0,
  evidenceTier:'actual copied business entry code, real Playwright/loopback DOM with controlled hydration; no real Next/PG/Router, paid supplier, historical-memory-restart or full business-module acceptance'};
let browser,server;
const eq=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);report.checks++;};
function entry(source){
  const ast=ts.createSourceFile(script,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const ready=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='enterCanvasTextTool');
  let text,kind,start,end;
  if(ready){text=ready.getText(ast);kind='enterCanvasTextTool';start=ready.getStart(ast);end=ready.end;}
  else{
    const main=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='main');assert(main?.body);
    const statements=[...main.body.statements].flatMap(node=>ts.isTryStatement(node)?[...node.tryBlock.statements]:[node]);
    const at=statements.findIndex(node=>ts.isIfStatement(node)&&node.getText(ast).includes('isVisible()')&&node.getText(ast).includes('创建新项目'));
    assert(at>=0,'Original business Canvas branch must exist, not a missing new export');
    const selected=statements.slice(at,at+3);assert.equal(selected.length,3);
    assert.match(selected[1].getText(ast),/data-tool="text".*waitFor/);assert.match(selected[2].getText(ast),/data-tool="text".*click/);
    start=selected[0].getStart(ast);end=selected[2].end;text='async function enterCanvasTextTool(user){\n'+source.slice(start,end)+'\n}';kind='original-main-statements';
  }
  assert(!/waitForTimeout|setTimeout|\.reload\(|\.goto\(/.test(text),'Entry must not sleep, navigate, reload or retry');
  report.entry={kind,sourceFile:script,start,end,line:ast.getLineAndCharacterOfPosition(start).line+1,sha256:sha(Buffer.from(source.slice(start,end)))};
  fs.writeFileSync(path.join(out,'ENTRY.ts'),text);
  const context={performance,Date,expect,exports:{}};vm.createContext(context);
  vm.runInContext(ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
  assert.equal(typeof context.enterCanvasTextTool,'function');return context.enterCanvasTextTool;
}
const html=state=>`<!doctype html><html><head><meta charset="utf-8"><title>Canvas readiness fixture</title><style>body{font:16px sans-serif;background:#fff;color:#222;padding:24px}[hidden]{display:none!important}button{padding:12px;margin:8px}</style></head><body><div data-testid="canvas-drop-zone"><div id="loading">正在加载</div><div data-testid="canvas-project-browser" hidden><button id="create">创建新项目</button></div><div id="editor" hidden><button data-tool="text">文字</button></div></div><script>window.actions=[];window.setFixtureState=function(s){document.querySelector('#loading').hidden=s!=='loading';document.querySelector('[data-testid="canvas-project-browser"]').hidden=s!=='empty';document.querySelector('#editor').hidden=s!=='editor';};document.querySelector('#create').onclick=()=>{actions.push('create');setFixtureState('editor');};document.querySelector('[data-tool="text"]').onclick=()=>actions.push('text');setFixtureState(${JSON.stringify(state)});</script></body></html>`;
async function exercise(run,name,initial,{release=false,close=false}={}){
  const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(30000);
  const events=[],rawLocators=new WeakMap();let released=false;
  const before=async(method,description,args)=>{
    const timeout=args[0]?.timeout;if(timeout!==undefined)events.push({kind:'timeout',method,timeout});
    if(!released&&(method==='waitFor'||method==='click')){
      released=true;events.push({kind:'first-action',method,description});
      if(close)await page.close();else if(release)await page.evaluate(()=>window.setFixtureState('editor'));
    }
  };
  const wrap=(locator,description)=>{
    const wrapped=new Proxy(locator,{get(target,key){
      if(['locator','getByRole','getByTestId','or','filter','first','nth','last'].includes(key))return(...args)=>{
        const actual=args.map(arg=>rawLocators.get(arg)||arg);return wrap(target[key](...actual),description+'.'+String(key)+'('+args.map(arg=>typeof arg==='object'?'object':String(arg)).join(',')+')');
      };
      if(key==='waitFor'||key==='click')return async(...args)=>{await before(key,description,args);return target[key](...args);};
      if(key==='isVisible')return async(...args)=>{const value=await target.isVisible(...args);events.push({kind:'visible-sample',description,value});return value;};
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
    }});rawLocators.set(wrapped,locator);return wrapped;
  };
  const user={locator:selector=>wrap(page.locator(selector),'locator('+selector+')'),getByTestId:id=>wrap(page.getByTestId(id),'testid('+id+')')};
  try{
    await page.goto('http://127.0.0.1:'+server.address().port+'/canvas?state='+initial,{waitUntil:'domcontentloaded'});
    let error;const begun=performance.now();try{await run(user);}catch(caught){error=caught;}
    const elapsed=performance.now()-begun;
    const actions=page.isClosed()?[]:await page.evaluate(()=>window.actions);
    const observed={name,initial,events,actions,elapsedMs:Math.round(elapsed),error:error?{name:error.name,message:error.message}:null};
    fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(observed,null,2)+'\n');
    if(!page.isClosed()){await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});fs.writeFileSync(path.join(out,name+'.html'),await page.content());}
    if(report.entry.kind==='original-main-statements'){
      assert.equal(name,'loading-restores-editor');assert(error,'Original branch must actually fail');
      assert.equal(error.name,'TimeoutError');assert.match(error.message,/locator\.click: Timeout 30000ms exceeded/);assert.match(error.message,/创建新项目/);
      assert(events.some(item=>item.kind==='visible-sample'&&item.value===false));assert.equal(events.find(item=>item.kind==='first-action').method,'click');
      assert.equal(await page.locator('button[data-tool="text"]').isVisible(),true);assert.equal(await page.getByTestId('canvas-project-browser').isVisible(),false);assert.deepEqual(actions,[]);
      report.expectedOriginalFailure=observed;report.status='FAIL';return;
    }
    if(close){assert(error,'A lost context must remain a failure');assert.match(error.message,/closed|Target page|context|browser/i);eq(actions,[],'no actions after context loss');}
    else{assert.ifError(error);eq(actions,initial==='empty'?['create','text']:['text'],name);}
    const timeouts=events.filter(item=>item.kind==='timeout').map(item=>item.timeout);assert(timeouts.length>0);
    eq(timeouts.every(value=>value>0&&value<=30000),true,'original budget');eq(timeouts.every((value,index)=>index===0||value<=timeouts[index-1]),true,'one shared deadline, never reset');
    report.details.push(name);report.observations=(report.observations||[]).concat(observed);
  }finally{await context.close();}
}
async function main(){
  try{
    fs.mkdirSync(out,{recursive:true});report.sources=snapshot();const run=entry(fs.readFileSync(path.join(root,script),'utf8'));
    server=http.createServer((request,response)=>{const url=new URL(request.url,'http://127.0.0.1');response.writeHead(200,{'content-type':'text/html; charset=utf-8'});response.end(html(url.searchParams.get('state')||'loading'));});
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
    await exercise(run,'loading-restores-editor','loading',{release:true});
    if(report.status!=='FAIL'){
      await exercise(run,'empty-project-creates-editor','empty');
      await exercise(run,'editor-retains-hidden-browser','editor');
      await exercise(run,'context-loss-stays-failure','loading',{close:true});
      eq(report.details.length,4);report.status='PASS';
    }
    assert.deepEqual(snapshot(),report.sources,'Copied actual source inputs stay unchanged');report.sourceIntegrity='UNCHANGED';
  }catch(error){report.status='ERROR';report.error={message:error.message,stack:error.stack};}
  finally{
    try{if(browser)await browser.close();if(server?.listening)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));report.cleanup={browserClosed:!browser?.isConnected(),loopbackClosed:!server?.listening};}
    catch(error){report.status='ERROR';report.cleanupError=String(error);}
  }
  report.exit=report.status==='PASS'?0:report.status==='FAIL'?1:2;
  report.stdout=`BUSINESS_CANVAS_READINESS=${report.status} ACTUAL_COPIED_ENTRY=1 CASES=${report.details.length} CHECKS=${report.checks} SUPPLIER_CALLS=0`;
  fs.writeFileSync(path.join(out,'REPORT.json'),JSON.stringify(report,null,2)+'\n');
  assert.equal(JSON.parse(fs.readFileSync(path.join(out,'REPORT.json'),'utf8')).status,report.status);console.log(report.stdout);process.exitCode=report.exit;
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=2;});
