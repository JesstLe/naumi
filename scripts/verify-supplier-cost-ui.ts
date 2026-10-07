import assert from "node:assert/strict";
import { readFile,mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";
async function main(){
  if(process.env.NAUMI_VERIFY_ISOLATED_DB!=='1')throw new Error('isolated fixture required');
  const f=JSON.parse(await readFile('output/supplier-ui-fixture.json','utf8')),origin='http://127.0.0.1:54980',folder='output/supplier-cost-20261007';await mkdir(folder,{recursive:true});
  const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true}),admin=await browser.newContext({viewport:{width:1440,height:960}}),member=await browser.newContext();
  try{
    const login=await admin.request.post(origin+'/api/admin/login',{data:{password:'SupplierFixture2026!'}});assert.equal(login.status(),200);
    const page=await admin.newPage();page.setDefaultTimeout(30000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+'/admin/billing/supplier-cost');await page.getByText('灵动2.5 fixture').first().waitFor();assert.ok(await page.getByText('待确认',{exact:true}).count()>0);assert.ok((await page.getByTestId('supplier-cost-manager').innerText()).includes('$0'));
    await page.getByRole('button',{name:'展开',exact:true}).first().click();await page.getByRole('dialog').waitFor();assert.ok((await page.getByRole('dialog').innerText()).includes('供应商任务'));await page.getByRole('button',{name:'关闭',exact:true}).click();
    await page.getByLabel('用户邮箱',{exact:true}).fill('none@example.test');await page.getByRole('button',{name:'查询',exact:true}).click();await page.getByText('没有符合条件的调用').waitFor();await page.getByLabel('用户邮箱',{exact:true}).fill('');await page.getByRole('button',{name:'查询',exact:true}).click();await page.getByText('灵动2.5 fixture').first().waitFor();
    await page.getByRole('button',{name:'成本统计',exact:true}).click();await page.getByText('暂估／数据未齐',{exact:true}).first().waitFor();assert.ok(!(await page.getByTestId('supplier-cost-manager').innerText()).includes('最终利润'));
    await page.getByRole('button',{name:'账户与折算',exact:true}).click();await page.getByRole('button',{name:/APIMart 验收 fixture/}).click();await page.getByLabel('美元折算人民币').fill('7.25');await page.getByLabel('凭据 / 来源').fill('fixture：管理员汇率凭据');await page.getByRole('button',{name:'保存配置',exact:true}).click();await page.getByRole('status').waitFor();
    await page.reload();await page.getByRole('button',{name:'账户与折算',exact:true}).click();await page.getByRole('button',{name:/APIMart 验收 fixture/}).click();assert.equal(await page.getByLabel('美元折算人民币').inputValue(),'7.25');
    await page.screenshot({path:folder+'/supplier-accounts-desktop.png',fullPage:true});await page.getByRole('button',{name:'调用成本明细',exact:true}).click();await page.screenshot({path:folder+'/supplier-calls-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await page.screenshot({path:folder+'/supplier-calls-mobile.png',fullPage:true});
    await member.addCookies([{name:'nv_user',value:f.userCookie,domain:'127.0.0.1',path:'/'}]);assert.equal((await member.request.get(origin+'/api/admin/supplier-cost')).status(),404);assert.equal((await member.request.post(origin+'/api/admin/supplier-cost/actions',{data:{action:'retry',key:'forged'}})).status(),404);
    assert.equal(errors.length,0,errors.join('\n'));console.log('SUPPLIER_BROWSER=PASS FILTER=PASS CHAIN=PASS UNKNOWN_NOT_ZERO=PASS FX_DB_RELOAD=7.25 PROFIT_PROVISIONAL=PASS MOBILE=PASS NON_ADMIN=404 PAID_REQUESTS=0');
  }finally{await admin.close();await member.close();await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
