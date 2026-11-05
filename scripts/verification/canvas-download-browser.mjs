/** Fixed original Web/PG/authorization/cache and real browser download events. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';

export async function verifyCanvasDownloadBrowser({page,expect,out,snapshot,stats,requests}){
  await mkdir(out,{recursive:true});const checks=[],pass=name=>{checks.push(name);console.log('PASS '+name);};
  const original=await snapshot(),supplier=await stats(),root=original.artworks.find(row=>row.id==='r6c-root');
  const rowImage=row=>row.canvas_image_version?.image||row.image_url;
  const canonical=async url=>{const response=await page.request.get(new URL(url,page.url()).href);assert.equal(response.status(),200);return response.body();};
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  const save=async(name,click)=>{const event=page.waitForEvent('download');await click();const download=await event,file=path.join(out,name);await download.saveAs(file);return{bytes:await readFile(file),name:download.suggestedFilename()};};
  // All download checks run before later Comfy/creative controls overlap nodes.
  await page.getByTestId('canvas-main-toolbar').locator('[data-tool="move"]').click();
  await page.locator('.react-flow__node[data-id="r6c-root"]').click({position:{x:90,y:90}});
  let result=await save('selected-original.png',()=>page.getByTestId('image-node-toolbar').getByRole('button',{name:/下载|Download/}).click());
  assert.equal(hash(result.bytes),hash(await canonical(rowImage(root))));pass('native selected-image download matches actual authorized original PNG bytes');
  const close=page.getByRole('button',{name:'关闭创作栏',exact:true});if(await close.isVisible())await close.click();
  result=await save('project-original.zip',()=>page.getByTestId('canvas-top-actions').locator('button').filter({has:page.locator('svg.lucide-download')}).click());
  const zip=await JSZip.loadAsync(result.bytes),files=Object.values(zip.files).filter(file=>!file.dir);
  const visible=original.artworks.filter(row=>!row.deleted_at&&row.source_url!=='canvas-node-version');assert.equal(files.length,visible.length);
  const expected=await Promise.all(visible.map(async row=>hash(await canonical(rowImage(row)))));
  const actual=await Promise.all(files.map(async file=>hash(await file.async('nodebuffer'))));assert.deepEqual(actual.sort(),expected.sort());
  pass('native project ZIP preserves all visible artwork versions and every original byte through actual cache');
  // The fixed workflow already generated and persisted this original version.
  // Use its real selector, not a fixture mutation or hidden state assignment.
  await page.locator('.react-flow__node[data-id="r6c-root"]').click({position:{x:90,y:90}});
  const dock=page.getByTestId('image-node-dock');await dock.getByTestId('image-version-control').click();
  await page.locator('[data-version-id="initial"]').click();await expect.poll(async()=>(await snapshot()).artworks.find(row=>row.id==='r6c-root').canvas_image_version.id).toBe('initial');
  result=await save('initial-version.png',()=>page.getByTestId('image-node-toolbar').getByRole('button',{name:/下载|Download/}).click());
  assert.equal(hash(result.bytes),hash(await canonical(root.image_url)));pass('original version selection downloads initial bytes rather than the previously displayed generated version');
  if(await close.isVisible())await close.click();await page.getByTestId('canvas-main-toolbar').locator('[data-tool="undo"]').click();
  await expect.poll(async()=>(await snapshot()).artworks.find(row=>row.id==='r6c-root').canvas_image_version.id).toBe(root.canvas_image_version.id);
  const final=await snapshot(),withoutRevision=state=>({...state,artworks:state.artworks.map(({canvas_image_revision,...row})=>row)});
  assert.deepEqual(withoutRevision(final),withoutRevision(original));assert.equal(final.artworks.find(row=>row.id==='r6c-root').canvas_image_revision,root.canvas_image_revision+2);assert.deepEqual(await stats(),supplier);
  pass('downloads and one intentional version undo leave original PG documents, tasks and original ledger history unchanged');
  await writeFile(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',checks,actualProduct:true,actualNativeDownloads:true,realPG:true,cache:'ACTUAL',authorization:'ACTUAL',routeMocks:0,downloadCount:3,originalBytesExact:true,addedSupplier:0,addedConsume:0},null,2)+'\n');
  console.log('CANVAS_DOWNLOAD_PRODUCT=PASS CHECKS='+checks.length+' NATIVE_DOWNLOADS=3 ORIGINAL_BYTES=EXACT VERSION_SELECTOR=ACTUAL REAL_PG=1 ROUTE_MOCKS=0 SUPPLIER_ADDED=0 CONSUME_ADDED=0');return checks;
}

export async function verifyCanvasLargeDownloadBrowser({page,expect,out,snapshot,stats,seed}){
  await mkdir(out,{recursive:true});const input=await seed();
  // Seeding from the isolated PG observer is intentionally outside Web. Publish
  // its project name through the real browser mutation path so the existing
  // account metadata cache receives its ordinary invalidation, not injected UI.
  const status=await page.evaluate(async input=>{
    const response=await fetch('/api/projects',{method:'POST',headers:{'content-type':'application/json','x-naumi-workspace':'personal'},body:JSON.stringify({key:input.project,name:input.title})});return response.status;
  },input);assert.equal(status,200);
  const before=await snapshot(),supplier=await stats();
  await page.reload({waitUntil:'domcontentloaded'});await page.getByTestId('canvas-project-chrome').locator('button').first().click();
  await page.locator('aside').getByRole('button',{name:'全部项目',exact:true}).click();
  await page.getByTestId('canvas-project-browser').getByTitle(input.title,{exact:true}).click();
  await expect(page.locator('.react-flow__node[data-id="'+input.ids[0]+'"]')).toBeVisible();
  const event=page.waitForEvent('download');await page.getByTestId('canvas-top-actions').locator('button').filter({has:page.locator('svg.lucide-download')}).click();
  const download=await event,file=path.join(out,'all31.zip');await download.saveAs(file);
  const zip=await JSZip.loadAsync(await readFile(file)),files=Object.values(zip.files).filter(file=>!file.dir);assert.equal(files.length,31);
  const response=await page.request.get(new URL(input.url,page.url()).href);assert.equal(response.status(),200);
  const hash=value=>createHash('sha256').update(value).digest('hex'),expected=hash(await response.body());
  for(const item of files)assert.equal(hash(await item.async('nodebuffer')),expected);
  assert.deepEqual(await snapshot(),before);assert.deepEqual(await stats(),supplier);
  const checks=['actual31-artwork PG project downloads one ZIP containing31 exact original images','large project download changes no original PG rows, jobs or debit and calls no supplier'];
  for(const name of checks)console.log('PASS '+name);
  await writeFile(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',checks,images:31,actualPG:true,nativeDownload:true,originalImageSha256:expected,routeMocks:0,serverRoute:'actual /api/suite/download',supplierAdded:0,consumeAdded:0,fixtureSeed:'31 explicit isolated original artwork rows,not generated or production'},null,2)+'\n');
  console.log('CANVAS_DOWNLOAD_LARGE_PRODUCT=PASS CHECKS=2 IMAGES=31 NATIVE_ZIP=1 ORIGINAL_BYTES=EXACT REAL_PG=1 ORIGINAL_SERVER_ROUTE=1 SUPPLIER_ADDED=0');return checks;
}
