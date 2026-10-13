import assert from "node:assert/strict";

export async function chooseAsset(select,id){
  const options=await select.locator("option").evaluateAll(nodes=>nodes.map(node=>({value:node.value,text:node.textContent})));
  const option=options.find(option=>option.value.includes(id));assert.ok(option,`Owned asset ${id} missing from selector`);await select.selectOption(option.value);
}
export async function openVideoSettings(page,nodeId,english=false){
  const node=page.locator(`[data-id="${nodeId}"]`).getByTestId("canvas-video-node");await node.waitFor({state:"visible",timeout:120000});
  await node.getByRole("button",{name:english?"Video node settings":"视频节点设置",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:english?"Video node settings":"视频节点设置",exact:true});await dialog.waitFor();return dialog;
}
export async function runVideoSettingsBrowser(page,h,nodeId,evidence){
  await page.goto(`${h.baseUrl}/canvas?node=${nodeId}`,{waitUntil:"domcontentloaded",timeout:150000});
  let dialog=await openVideoSettings(page,nodeId);
  await dialog.getByLabel("视频模型",{exact:true}).selectOption("managed-video/video-a");
  const prompt="浏览器完整镜头。\n甲：每一句对白完整保留。\n乙：不要截断。";
  await dialog.getByLabel("视频描述",{exact:true}).fill(prompt);await dialog.getByLabel("视频节点名称",{exact:true}).fill("Browser saved video");
  await dialog.getByLabel("视频生成模式",{exact:true}).selectOption("frames_required");
  await chooseAsset(dialog.getByLabel("添加视频引用",{exact:true}),h.refs.image.id);
  await chooseAsset(dialog.getByLabel("添加视频引用",{exact:true}),h.refs.lastImage.id);
  await page.waitForFunction(()=>{const rows=document.querySelectorAll('[data-testid="video-reference-row"] img');return rows.length===2&&[...rows].every(image=>image.complete&&image.naturalWidth>0);},undefined,{timeout:30000});
  const roles=dialog.getByTestId("video-reference-role");assert.deepEqual(await roles.evaluateAll(nodes=>nodes.map(node=>node.value)),["first_frame","last_frame"]);
  await roles.first().selectOption("last_frame");assert.equal(await roles.first().inputValue(),"last_frame");assert.equal(await dialog.getByRole("button",{name:/^生成视频/}).isDisabled(),true);await roles.first().selectOption("first_frame");
  await dialog.getByRole("button",{name:"交换首尾帧",exact:true}).click();
  assert.deepEqual(await roles.evaluateAll(nodes=>nodes.map(node=>node.value)),["first_frame","last_frame"]);
  await dialog.getByLabel("生成声音",{exact:true}).selectOption("false");
  await dialog.getByLabel("启用视频摄影设置",{exact:true}).check();
  for(const [label,count] of [["视频摄影机",8],["视频镜头",8],["视频焦距",11],["视频光圈",10]]){
    const input=dialog.getByLabel(label,{exact:true}),list=await input.getAttribute("list");assert.equal(await dialog.locator(`datalist[id="${list}"] option`).count(),count);
  }
  await dialog.getByLabel("视频摄影机",{exact:true}).fill("Panavision DXL2");
  const lens=dialog.getByLabel("视频镜头",{exact:true}),list=await lens.getAttribute("list");await lens.fill(await dialog.locator(`datalist[id="${list}"] option`).first().getAttribute("value"));
  await dialog.getByLabel("视频焦距",{exact:true}).fill("50mm");await dialog.getByLabel("视频光圈",{exact:true}).fill("f/4");
  assert.ok((await dialog.getByTestId("video-compiled-prompt").textContent()).includes("shot on Panavision DXL2"));
  await dialog.getByLabel("启用视频摄影设置",{exact:true}).uncheck();assert.ok(!(await dialog.getByTestId("video-compiled-prompt").textContent()).includes("shot on Panavision"));
  await page.screenshot({path:`${evidence}/settings-desktop.png`,fullPage:false});
  await dialog.getByRole("button",{name:"保存设置",exact:true}).click();await dialog.waitFor({state:"hidden"});
  let saved=(await h.request("a","GET",`/api/canvas/video-nodes/${nodeId}`)).body.node;
  assert.equal(saved.config.prompt,prompt);assert.equal(saved.config.generateAudio,false);assert.equal(saved.config.camera,undefined);assert.deepEqual(saved.inputs.map(input=>input.role),["first_frame","last_frame"]);
  assert.deepEqual(saved.inputs.map(input=>input.nodeId.replace(/^(image|video|audio):/,"")),[h.refs.lastImage.id,h.refs.image.id]);
  assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,0);
  dialog=await openVideoSettings(page,nodeId);await dialog.getByLabel("视频生成模式",{exact:true}).selectOption("reference");
  await chooseAsset(dialog.getByLabel("添加视频引用",{exact:true}),h.refs.video.id);await chooseAsset(dialog.getByLabel("添加视频引用",{exact:true}),h.refs.audio.id);
  await dialog.getByRole("button",{name:"添加参考文字",exact:true}).click();await dialog.getByLabel("视频参考文字",{exact:true}).fill("参考对白全文\n不能截断参考文字");
  await dialog.getByRole("button",{name:"添加镜头",exact:true}).click();await dialog.getByRole("button",{name:"添加镜头",exact:true}).click();
  for(const index of [1,2]){await dialog.getByLabel(`镜头${index}描述`,{exact:true}).fill(`镜头${index}独立完整对白`);await dialog.getByLabel(`镜头${index}时长`,{exact:true}).fill("2");}
  assert.ok((await dialog.getByTestId("video-shot-total").textContent()).includes("4 / 4"));
  await dialog.getByRole("button",{name:"添加元素",exact:true}).click();await dialog.getByLabel("元素1名称",{exact:true}).fill("原主体");await dialog.getByLabel("元素1描述",{exact:true}).fill("不替换主体身份");
  await chooseAsset(dialog.getByTestId("video-element-editor").locator("select"),h.refs.image.id);
  await dialog.getByRole("button",{name:"保存设置",exact:true}).click();await dialog.waitFor({state:"hidden"});
  saved=(await h.request("a","GET",`/api/canvas/video-nodes/${nodeId}`)).body.node;
  assert.deepEqual(saved.inputs.map(input=>input.kind),["image","image","video","audio","text"]);assert.equal(saved.config.shots.length,2);assert.equal(saved.config.elements[0].references[0].artworkId,h.refs.image.id);
  dialog=await openVideoSettings(page,nodeId);await dialog.getByLabel("视频模型",{exact:true}).selectOption("managed-video/video-motion");
  await dialog.getByLabel("角色朝向",{exact:true}).selectOption("1");assert.deepEqual(await dialog.getByLabel("角色朝向",{exact:true}).locator("option").allTextContents(),["模型默认","跟随角色图片","跟随运动视频"]);
  await dialog.getByRole("button",{name:"保存设置",exact:true}).click();await dialog.waitFor({state:"hidden"});
  saved=(await h.request("a","GET",`/api/canvas/video-nodes/${nodeId}`)).body.node;assert.equal(saved.config.mode,"motion_control");assert.equal(saved.config.providerOptions.characterOrientation,"video");assert.equal(saved.config.shots,undefined);assert.equal(saved.config.elements,undefined);assert.equal(saved.config.prompt,prompt);
  return {prompt,saved};
}
