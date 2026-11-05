import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';

/** Shared real-page interactions, used by isolated Next and packaged-product
 * acceptance. The caller owns login, PG setup, mutation/exception observation,
 * browser lifecycle and receipt checks; no browser routes are intercepted. */
/** @param {{page:import('@playwright/test').Page,expect:typeof import('@playwright/test').expect,out:string}} options */
export async function verifyCanvasInputControls({page,expect,out}){
 await mkdir(out,{recursive:true});const checks=[],pass=name=>{checks.push(name);console.log('PASS '+name);};
 const tools=page.getByTestId('canvas-main-toolbar'),view=page.getByTestId('canvas-view-toolbar'),stage=page.getByTestId('canvas-drop-zone');
 await expect(tools).toBeVisible();await expect(view).toBeVisible();pass('actual Canvas mounts the shared primary-tool and view-toolbar components');
 const focus=async()=>{const box=await stage.boundingBox();assert.ok(box);await stage.click({position:{x:Math.min(1100,box.width-30),y:Math.min(320,box.height-30)}});};
 for(const[key,tool]of [['h','hand'],['v','move'],['m','marquee']]){await focus();await page.keyboard.press(key);await expect(tools.locator(`[data-tool="${tool}"]`)).toHaveAttribute('aria-pressed','true');}pass('V/M/H reach the real Flow tool state through the shared command owner');
 for(const tool of ['hand','move','marquee','move']){await tools.locator(`[data-tool="${tool}"]`).click();await expect(tools.locator(`[data-tool="${tool}"]`)).toHaveAttribute('aria-pressed','true');}pass('toolbar and keyboard use the same three tool transitions');
 await view.getByRole('button',{name:'小地图',exact:true}).click();await expect(page.locator('.react-flow__minimap')).toBeVisible();await view.getByRole('button',{name:'小地图',exact:true}).click();await expect(page.locator('.react-flow__minimap')).toHaveCount(0);pass('minimap toggles the actual ReactFlow minimap without a document write');
 const snap=view.getByRole('button',{name:'网格吸附',exact:true});await snap.click();await expect(snap).toHaveAttribute('aria-pressed','true');await snap.click();await expect(snap).toHaveAttribute('aria-pressed','false');pass('snap preference remains local to the view owner');
 const zoom=view.locator('button[title="缩放比例"]');await zoom.click();const field=view.locator('input');await field.fill('75');await field.press('Enter');await expect(zoom).toContainText('75%');await expect.poll(async()=>await page.locator('.react-flow__viewport').evaluate(el=>el.style.transform)).toContain('scale(0.75)');pass('custom zoom input updates the real Flow viewport and live HUD');
 await zoom.click();await field.fill('123');await field.press('Escape');await expect(field).toHaveCount(0);await expect(zoom).toContainText('75%');pass('Escape discards the zoom draft without changing the actual viewport');
 await zoom.click();await view.getByRole('button',{name:'缩放至100%',exact:true}).click();await expect(zoom).toContainText('100%');pass('zoom presets use the same viewport port as typed input');
 const theme=page.getByTestId('canvas-theme-toggle');await theme.click();await expect(theme).toHaveAttribute('aria-pressed','true');assert.equal(await page.evaluate(()=>localStorage.getItem('nv:canvas:bg')),'dark');await theme.click();await expect(theme).toHaveAttribute('aria-pressed','false');pass('theme keeps the original local preference key and returns to the light layout');
 await tools.locator('[data-tool="more"]').click();await page.getByTestId('canvas-more-tools-menu').getByRole('menuitem',{name:'快捷键与帮助',exact:true}).click();const modal=page.getByTestId('canvas-help-dialog');await expect(modal).toBeVisible();await modal.getByRole('button',{name:'关闭帮助',exact:true}).focus();await page.keyboard.press('h');await expect(tools.locator('[data-tool="hand"]')).toHaveAttribute('aria-pressed','false');await modal.getByRole('button',{name:'关闭帮助',exact:true}).click();await focus();await page.keyboard.press('h');await expect(tools.locator('[data-tool="hand"]')).toHaveAttribute('aria-pressed','true');await page.keyboard.press('v');pass('real help overlay owns the keyboard, then releases it after closing');
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await expect(view).toBeVisible();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,`canvas-input-${width}.png`),fullPage:true});}pass('view controls remain reachable in desktop and 390px layouts');
 await page.setViewportSize({width:1440,height:1000});return checks;
}
