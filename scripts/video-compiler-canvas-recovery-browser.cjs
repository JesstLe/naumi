// Actual Next Canvas, authenticated fixture session, real reads and retry controls.
// Only the explicitly labelled failure case aborts account GETs; successful HTTP
// responses and React state are never substituted. Does not generate or finish
// the Storyboard bridge: the full driver must subsequently complete that run.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,expect}=require('@playwright/test');
async function main(){
 const file=path.resolve(process.argv[2]),session=JSON.parse(await fs.readFile(file,'utf8')),root=path.dirname(file),browser=await chromium.launch({channel:'msedge',headless:true}),results=[];
 try{
  for(const inject of [false,true]){
   const context=await browser.newContext({locale:'zh-CN',viewport:{width:1600,height:1100}}),[name,...value]=session.cookie.split('=');
   await context.addCookies([{name,value:value.join('='),url:session.origin},{name:'naumi_locale',value:'zh',url:session.origin}]);
   const page=await context.newPage(),events=[],errors=[],scriptFailures=[];let failing=inject;
   const devtools=await context.newCDPSession(page);await devtools.send('Runtime.enable');await devtools.send('Debugger.enable');devtools.on('Runtime.exceptionThrown',value=>scriptFailures.push({event:'exception',value}));devtools.on('Debugger.scriptFailedToParse',async value=>{let source;try{source=await devtools.send('Debugger.getScriptSource',{scriptId:value.scriptId});}catch{}scriptFailures.push({event:'script-failed',value,source});});
   try{
    if(inject)await context.route('**/api/account?*',route=>failing?route.abort('failed'):route.continue());
    page.on('console',m=>{if(m.type()==='error')events.push({event:'console',message:m.text(),location:m.location()});});
    page.on('pageerror',error=>errors.push({message:error.message,stack:error.stack}));
    page.on('requestfailed',r=>events.push({event:'failed',url:r.url(),reason:r.failure()}));
    page.on('response',r=>{if(r.url().includes('/api/'))events.push({event:'response',url:r.url(),status:r.status(),method:r.request().method()});});
    await page.goto(session.url,{waitUntil:'domcontentloaded',timeout:180000});
    if(inject){
     await expect(page.getByTestId('canvas-artwork-load-error')).toBeVisible({timeout:90000});
     failing=false;
     await page.getByRole('button',{name:'重试同步作品',exact:true}).click();
    }
    await expect(page.locator(`.react-flow__node[data-id="${session.nodeIds[0]}"]`)).toBeVisible({timeout:90000});
    await expect(page.getByTestId('canvas-artwork-load-error')).toHaveCount(0);
    assert.equal(events.filter(e=>e.url?.includes('/api/account?')&&e.status===200).length>0,true);
    assert.deepEqual(errors,[]);
    results.push({scenario:inject?'account-failure-actual-retry':'first-fresh-context',ok:true,events,errors,scriptFailures,body:await page.locator('body').innerText()});
    console.log('CANVAS_RECOVERY_BROWSER_CHECK='+results.at(-1).scenario+' PASS');
   }catch(error){results.push({scenario:inject?'account-failure-actual-retry':'first-fresh-context',ok:false,error:String(error),events,errors,scriptFailures,body:await page.locator('body').innerText()});throw error;}
   finally{await context.close();await fs.writeFile(path.join(root,'CANVAS_RECOVERY_BROWSER.json'),JSON.stringify({results,successfulHttpMocks:0,reactInjection:0,paidCalls:0},null,2));}
  }
  console.log('CANVAS_RECOVERY_BROWSER=PASS CHECKS=2 REAL_NEXT=1 SUCCESS_HTTP_MOCKS=0 REACT_INJECTION=0 PAID_CALLS=0');
 }finally{await browser.close();console.log('CANVAS_RECOVERY_BROWSER_CLEANUP=PASS');}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
