import {expect} from '@playwright/test';

// Exercise the accessible picker, including the disabled single-model state.
// Model identity is additionally verified in each test's HTTP/persisted request.
export async function chooseVideoModel(page,scope,name){
  const control=scope.getByRole('combobox',{name:'视频模型',exact:true});
  await expect(control).toBeVisible();
  await expect.poll(async()=>await control.isEnabled()||(await control.innerText()).trim()===name,{timeout:30000}).toBe(true);
  if((await control.innerText()).trim()!==name){
    await control.click();
    await page.getByRole('option',{name,exact:true}).click();
  }
  await expect(control).toHaveText(name);
}
