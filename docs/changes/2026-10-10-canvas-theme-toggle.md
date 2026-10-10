# 画布颜色切换外置

- 分支 `codex/canvas-theme-toggle`；基线 `0edd49acfaae1105dce2b6beea7e04844ecfbd98`。
- 浅色/深色切换从底部省略号移至左下角视图工具栏，在适应视图和缩放百分比之间。省略号保留快捷键入口，删除重复颜色入口。
- 使用Lucide Moon/Sun，32×32按钮与相邻视图按钮一致；复用现有中英文文案。提供状态、键盘焦点样式；可用Enter/Space。
- 保持原`nv:canvas:bg`偏好存储、即时切换、刷新恢复及存储错误兜底；不改变初始偏好、不调整节点/数据/模型/生成。
- 保持只读画布中的本地视图切换；节点编辑权限不受影响。
- 分支交付，由其他agent整合发布。本轮不合入main、不访问服务器、不发布；与`codex/canvas-smart-layout`独立，不包含其布局实现。

## 验收

```powershell
node scripts/verify-canvas-theme-toggle.mjs
node scripts/verify-canvas-theme-toggle-browser.mjs
node scripts/canvas-light-theme-smoke.mjs
node scripts/canvas-tool-palette-contract.mjs
node node_modules/typescript/bin/tsc --noEmit
```

浏览器脚本使用独立本地Next缓存与Edge Chromium，API夹具只读、供应商地址指向本机不可用端口；不调用模型。测试桌面、320px手机、刷新偏好、键盘、存储异常、中英文、省略号无重复入口、按钮尺寸与栏间避让。

结果与源码副本回滚证据保存在 `E:\Workspace\naumi\output\canvas-theme-toggle-20261010`。

- 原菜单基线、外置按钮契约、浅色样式11项、工具栏契约15项、ESLint、TypeScript均通过。
- 真实Next开发页面与Edge隔离浏览器验收通过：1440px桌面、320px窄屏、32×32尺寸、单击、Enter/Space、刷新、存储异常、中英文、只读画布。省略号中仅保留快捷键；API写入0，模型消费0。
- 浏览器验收使用合成账号/项目和只读API响应，不代表线上验收。Windows本地验收观察到开发JS响应在256KiB处截断，夹具从独立Next编译缓存读取相同完整JS字节供浏览器执行，未修改业务代码或服务端配置。测试结束恢复Next临时修改的tsconfig。
- 回滚脚本只在另一份源码副本演练，恢复原文件SHA和菜单入口、删除三个新增文件；开发分支保留本次修改。
- 交付包 `MODIFIED_FILE.tar.gz`、补丁 `DIFF_FILE.patch`、验收 `VERIFICATION.txt`、回滚 `ROLLBACK.sh` 均位于上述证据目录。

## 整合提示

最终刷新origin/main为`0c8c8c35917d804e8981fb392a73aebe1697d7d7`。最新main对同一文件的额外修改是生成参数下拉改读`generationParameters.resolutions`，与本任务位置不同；合并时保留该修改，不用本分支完整文件覆盖main。本分支不包含`codex/canvas-smart-layout`，应通过Git提交整合两项功能后集中验收。

```text
接手codex/canvas-theme-toggle：阅读本文件及docs/AGENT_COLLABORATION.md；
刷新origin/main，通过Git提交合并，只吸收Moon import、移除more/theme、外置按钮及验证脚本；
保留最新参数范围和smart-layout等其他任务，运行本文验收；按用户安排统一发布，本分支本轮未发布。
```
