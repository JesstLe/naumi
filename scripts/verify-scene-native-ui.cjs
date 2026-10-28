const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const esbuild = require('esbuild');
const {chromium, expect} = require('@playwright/test');
const root = path.resolve(process.argv[2] || '.');
const out = path.resolve(process.argv[3] || 'output/scene-native-ui');
const abs = file => JSON.stringify(path.join(root, file).replaceAll('\\', '/'));

// Real editor/React/CSS, with explicit callback fixtures. The application driver
// separately covers HTTP, DB, private assets, graph history, workflow and tasks.
async function main() {
  fs.mkdirSync(out, {recursive: true});
  const source = `
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
    import {SceneEditor} from ${abs('src/components/canvas/scene/scene-editor.tsx')};
    import {newSceneProject} from ${abs('src/lib/scene/project.ts')};
    const picture = color => 'data:image/svg+xml;base64,'+btoa('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640"><rect width="480" height="640" fill="'+color+'"/><circle cx="240" cy="215" r="88" fill="#eac4a7"/><path d="M80 640V470Q80 340 240 340Q400 340 400 470V640" fill="#334c6a"/><path d="M153 200Q145 80 240 100Q345 90 327 200L280 165L200 180Z" fill="#353c4b"/></svg>');
    const scene=newSceneProject('庭院');scene.description='石阶连接木廊，石桌靠东';scene.states[0].referenceArtworkIds=['photo-a'];
    const initial={id:'scene-fixture',projectKey:'tree:scene-fixture',revision:1,title:scene.name,x:0,y:0,width:320,height:300,scene,deletedAt:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    const initialImages=[{id:'photo-a',nodeId:'photo-a',kind:'image',title:'日常肖像',value:picture('#e9edf3'),available:true},{id:'photo-b',nodeId:'photo-b',kind:'image',title:'夜晚肖像',value:picture('#d9e6e6'),available:true},{id:'pending',nodeId:'pending',kind:'image',title:'未完成',value:picture('#eee'),available:false}];
    function App(){
      const [node,setNode]=useState(()=>JSON.parse(localStorage.getItem('scene-saved')||'null')||initial),[images,setImages]=useState(initialImages),[visible,setVisible]=useState(true),[version,setVersion]=useState(0),[readOnly,setReadOnly]=useState(false),[english,setEnglish]=useState(false);
      const update=value=>{setNode(value);localStorage.setItem('scene-saved',JSON.stringify(value));return value;};
      window.__node=()=>node;window.__open=(options={})=>{setReadOnly(!!options.readonly);setEnglish(!!options.english);setVersion(n=>n+1);setVisible(true);};
      window.__remote=()=>update({...node,revision:node.revision+1,scene:{...node.scene,name:'远端场景'}});
      return visible?<SceneEditor key={version} node={node} images={images} draftScope="browser-fixture" readOnly={readOnly} english={english}
        onSave={async(scene,revision)=>{window.__saves=(window.__saves||0)+1;if(window.__failSave||revision!==node.revision)throw Error('场景已更新，草稿已保留');return update({...node,scene,title:scene.name,revision:revision+1});}}
        onUpload={async files=>{window.__uploads=files.map(file=>({name:file.name,type:file.type,size:file.size}));const choices=files.map((file,i)=>({id:'uploaded-'+i,nodeId:'uploaded-'+i,kind:'image',title:file.name,value:picture('#efe6db'),available:true}));setImages(current=>[...current,...choices]);return choices;}}
        onGenerate={async(scene,stateId)=>{window.__generated={scene,stateId,revision:node.revision};}}
        onClose={()=>setVisible(false)}/>:<button onClick={()=>window.__open()}>重新打开</button>;
    }createRoot(document.getElementById('root')).render(<App/>);`;
  const bundle = await esbuild.build({stdin:{contents:source,sourcefile:'scene-fixture.tsx',resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,define:{'process.env.NEXT_PUBLIC_SUPABASE_URL':'""','process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY':'""','process.env.NEXT_PUBLIC_CANVAS_PERF_PROBE':'""'},outfile:path.join(out,'fixture.js'),platform:'browser',format:'iife',jsx:'automatic',nodePaths:[path.resolve('node_modules')],alias:{react:path.resolve('node_modules/react'),'react-dom':path.resolve('node_modules/react-dom')},tsconfigRaw:{compilerOptions:{baseUrl:root,paths:{'@/*':['src/*']}}}});
  const js = bundle.outputFiles.find(file=>file.path.endsWith('.js')).text;
  const css = bundle.outputFiles.find(file=>file.path.endsWith('.css')).text;
  const html = path.join(out,'fixture.html');
  fs.writeFileSync(html, '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#f4f6fa}*{box-sizing:border-box}'+css+'</style><body><div id="root"></div><script>'+js.replaceAll('</script','<\\/script')+'</script></body></html>');
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:960}}), errors = [], external = [];
  page.setDefaultTimeout(15000);
  page.on('pageerror', error=>errors.push(error.message));
  await page.route('**/*', route=>{if(/^https?:/.test(route.request().url())){external.push(route.request().url());return route.abort();}return route.continue();});
  const editor = page.getByTestId('scene-editor');
  const button = name=>editor.getByRole('button',{name,exact:true});
  const field = name=>editor.getByLabel(name,{exact:true});
  const node = ()=>page.evaluate(()=>window.__node());
  try {
    await page.goto(pathToFileURL(html).href); await editor.waitFor();
    assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')), '保存并关闭场景');
    await field('场景名称').fill('庭院');
    await button('添加状态').click(); await field('状态名称').fill('夜晚'); await field('状态设定').fill('夜间暖灯，空间位置保持');
    await field('添加场景参考图').selectOption('photo-b'); await button('设为场景主图 2').click();
    await button('移除场景参考图 2').click(); await button('设为默认状态').click();
    await field('上传场景参考图').setInputFiles({name:'场景.png',mimeType:'image/png',buffer:Buffer.from('fixture callback bytes')});
    await expect.poll(()=>page.evaluate(()=>window.__uploads?.length)).toBe(1);
    await field('场景背景方式').selectOption('panorama');
    await button('保存场景').click(); await expect(button('保存场景')).toBeDisabled();
    let saved = await node(), state = saved.scene.states.find(item=>item.id===saved.scene.defaultStateId);
    assert.equal(saved.scene.states.length, 2); assert.equal(state.name,'夜晚'); assert.deepEqual(state.referenceArtworkIds,['photo-b','uploaded-0']); assert.equal(saved.revision,2); assert.equal(state.background.projection,'panorama');
    await button('删除当前状态').click(); await button('撤销场景编辑').click(); await button('重做场景编辑').click(); await button('撤销场景编辑').click();
    await expect(field('状态名称')).toHaveValue('夜晚');
    await page.screenshot({path:path.join(out,'desktop.png')});
    await button('保存并关闭场景').click(); await editor.waitFor({state:'hidden'}); await page.reload(); await editor.waitFor();
    await expect(field('场景名称')).toHaveValue('庭院'); assert.equal((await node()).scene.states.length,2);
    await field('场景名称').fill('本地冲突草稿'); await page.evaluate(()=>window.__remote());
    await button('保存场景').click(); await editor.getByRole('status').filter({hasText:'场景已更新'}).waitFor();
    await expect(field('场景名称')).toHaveValue('本地冲突草稿'); await expect(button('读取最新场景')).toBeVisible();
    await page.waitForTimeout(350); await page.reload(); await editor.waitFor(); await expect(field('场景名称')).toHaveValue('本地冲突草稿');
    await button('保存场景').click(); await button('读取最新场景').click(); await expect(field('场景名称')).toHaveValue('远端场景');
    await button('撤销场景编辑').click(); await expect(field('场景名称')).toHaveValue('本地冲突草稿');
    await button('保存场景').click(); await expect(button('保存场景')).toBeDisabled(); assert.equal((await node()).scene.name,'本地冲突草稿');
    await field('场景名称').fill(''); await button('保存场景').click(); await editor.getByRole('status').filter({hasText:'请填写有效'}).waitFor();
    await button('撤销场景编辑').click(); await expect(field('场景名称')).toHaveValue('本地冲突草稿');
    await page.setViewportSize({width:390,height:844}); assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=390));
    await field('状态设定').scrollIntoViewIfNeeded(); await page.screenshot({path:path.join(out,'mobile.png')});
    await button('生成参考图').click(); await editor.waitFor({state:'hidden'});
    const generated=await page.evaluate(()=>window.__generated); assert.equal(generated.scene.name,'本地冲突草稿'); assert.equal(generated.stateId,state.id);
    await page.setViewportSize({width:1440,height:960}); await page.evaluate(()=>window.__open({readonly:true,english:true}));
    await page.getByRole('dialog',{name:'Scene',exact:true}).waitFor();
    for(const name of ['Scene name','Scene identity','State name','State details','Add scene reference','Upload scene references','Scene background image','Scene background mode'])assert.equal(await field(name).isDisabled(),true,name);
    for(const name of ['Save scene','Add state','Delete state','Generate reference'])assert.equal(await button(name).isDisabled(),true,name);
    await button('Done').focus(); await page.keyboard.press('Tab'); assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Save and close scene');
    await page.keyboard.press('Shift+Tab'); assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'Done');
    await page.keyboard.press('Escape'); await editor.waitFor({state:'hidden'});
    assert.deepEqual(errors,[]); assert.deepEqual(external,[]);
    fs.writeFileSync(path.join(out,'saved-scene.json'), JSON.stringify(await node(),null,2));
    console.log('SCENE_UI=PASS REAL_COMPONENT_CSS=PASS STATES_DEFAULT_REFERENCES_UPLOAD=PASS BACKGROUND_IMAGE_PANORAMA=PASS UNDO_REDO=PASS SAVE_RELOAD=PASS CONFLICT_DRAFT_RECOVERY=PASS GENERATE_CALLBACK=PASS INVALID_DRAFT=RETAINED MOBILE_390=PASS READONLY_EN_FOCUS=PASS PAGE_ERRORS=0 EXTERNAL_REQUESTS=0');
  } catch(error) {
    await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});
    fs.writeFileSync(path.join(out,'errors.json'),JSON.stringify({errors,external},null,2));
    console.error('PAGE_ERRORS='+JSON.stringify(errors));
    fs.writeFileSync(path.join(out,'failure.txt'), await page.locator('body').innerText()); throw error;
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
