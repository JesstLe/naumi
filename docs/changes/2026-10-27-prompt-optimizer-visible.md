# 图片／文字节点提示词优化入口可见性

## 调研结论

- 2026-10-27 15:25:58（北京）实际只读核验47：运行 Web `naumi47-web-custom-ratio-20261027-r1`，源码 `187559d2f6830a2ab34fc232b9ecdaa1ad6f036b`。扫描其445个前端 JS 文件，没有 `canvas-prompt-optimize`。
- 图片／空白图片／文字优化功能提交 `fada4d9e` 已在 main；运行版本未包含它。因此用户看不到的主因是未发布，不是没有输入文字或浏览器缓存。
- 原开发版仅有魔棒图标，悬停才显示名称，发现性也不足。

## 模块与职责

`CanvasPromptOptimizer` 负责提示词优化入口、预览和应用交互。`CanvasComposerShell/Footer` 只负责既有节点面板布局；本次不改布局、生成参数、接口、计费和视频路径。

公共接口维持 `prompt/contextKey/disabled/onOptimize/onApply`；父组件拥有原始草稿，优化器仅在用户点击应用后通过 onApply 写回。依赖为节点创作栏→优化器→既有锚定面板；没有新增 I/O、全局状态、数据库或反向依赖。

## 本次实现

- 主操作由32px纯图标改成“魔棒＋优化提示词”，无须悬停才能识别。
- 按钮可见名称、title、aria-label一致；不为普通用户增加解释文案。
- 仍位于选中节点的创作栏参数行，不加到永久底部 Dock，不复制视频优化入口。
- 图片、空白图片、文字三处复用同一组件；空输入仍显示名称但禁用，运行中／只读／锁定等状态沿用原行为。

## 验证与证据层级

基线 `305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea`，独立 `codex/prompt-optimizer-visible-20261027`。修改仅一个产品组件，另加验证脚本与本文。

```powershell
node scripts/verify-prompt-optimizer-visible.cjs --source E:/Workspace/naumi/output/prompt-button-visibility-20261027/BASELINE --out E:/Workspace/naumi/output/prompt-button-visibility-20261027/baseline-verified --baseline
node scripts/verify-prompt-optimizer-visible.cjs --out E:/Workspace/naumi/output/prompt-button-visibility-20261027/modified-verified
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

- 基线16项：原按钮无可见文字，三处入口、1024/390宽度。
- 修改27项：可见名称/无障碍名称一致、边界无溢出、预览不覆盖、应用、空输入禁用、一次优化回调、无外部网络。
- 实际优化器、Composer及其CSS以本地文件渲染，外围输入/模型选项为测试fixture，不是线上截图，不启动服务器或调用真实模型。
- 全量TypeScript通过。原失败保留：首轮fixture漏替换process.env，基线投影另解析到共享目录React造成重复实例；验证脚本统一解析React后通过，不修改产品逻辑绕过测试。
- 四制品及独立副本回滚记录：`E:/Workspace/naumi/output/prompt-button-visibility-20261027/`。原组件哈希、精确命令/输出/退出码见VERIFICATION.txt。

## 未完成与下一步

- **本轮不发布47**，遵守当前“维持配置、合并后暂缓发布”。代码进main不等于当前页面已有按钮，刷新旧版本不会凭空出现。
- 后续明确解除发布暂停后，从main构建并走蓝绿验收，再核对实际图片／文字节点入口和真实优化请求。
- 生产发布计数增加0；不改用户现有项目、媒体和账务。共享checkout与共享canvas-action-menu未修改。
