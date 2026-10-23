# 画布图片用途切换修复

用户问编辑目标用途并反馈点不动。源码证据：ImageReferenceComposer把当前edit-target的其余三个option设为disabled，故不是用户操作或遮挡问题。

## 修复
- 移除option锁定；只读时整个select仍disabled。名称改为“要修改的原图”，title说明直接修改这张原图。
- 同时允许零张修改原图的纯参考生成：保留编号、身份和实际传输顺序；选中修改原图时仍唯一且首位。
- Canvas提交模式根据是否存在edit-target决定edit/generate，编译提示词不再对纯参考图注入“以编辑目标为修改基础”。旧请求/已接受回执不重解释、不重放。
- 真正edit/postprocess/mask/抠图仍要求明确目标，未放宽这些执行约束。模型选择的needsEdit继续根据有无参考素材，纯参考并不跳过带图通道能力核验。

## 验证状态
集中验证通过：
- 原始源码AST回放：当前edit-target下其他三个选项disabled=true，准确复现点不动的根因；改后选项全部可切，只读整体禁用保留。
- `verify-canvas-image-references.ts`通过：单图改成构图/主体/风格任一用途后，manifest允许纯参考生成，模式为generate，编译提示词不强制修改原图；edit及抠图无目标仍拒绝。多张纯主体/风格素材的auto比例可按参考图共识解析。
- 原生ImageReferenceComposer React组件+实际Canvas提交适配器+mock HTTP+真实schema/prompt编译的浏览器19项通过，包含单图用途切换和纯参考真实请求体、回切目标再切回参考、多图目标重排/字节顺序、编号引用、中文输入法、草稿、缺图阻止提交、390px和只读。pageerror=0，真实供应商调用0。未将该fixture当生产或全站E2E。
- 全量TypeScript检查退出0；imagegen intent原有回归通过。
- 额外旧`verify-multi-reference-frame.ts`回归在本机依赖的server-only导入阶段失败，添加react-server条件仍失败；没有把该脚本记为通过。当前受影响frame函数已由本轮集中契约检查覆盖。
- 原UI验收fixture回执fixture-job已不符合当前客户端operationId回执校验，已只修fixture为imagegen-<operationId>，并等待实际POST计数，不放宽产品回执检查。
- T3预览打开本机fixture，连续两次snapshot报`Preview automation snapshot timed out after 15000ms.`；切换独立headless浏览器完成上述验收，未连接用户日常浏览器。
- 回滚脚本在独立副本恢复四个产品文件并检查原始哈希，再次回放原锁定行为通过。工作副本保留修复。预览父子进程已停止。

证据：`C:/Users/13357/.t3/userdata/task-evidence/canvas-reference-role-fix-20261023`，含MODIFIED_FILE、DIFF_FILE、VERIFICATION.txt、可执行ROLLBACK.sh、原始哈希、mock请求及实际组件截图。

本机独立worktree基线9ae4edff，保护共享checkout未提交改动；本轮不连接服务器或执行发布，不调用真实供应商。
