# 2026-10-12 画布快捷键与帮助更新

## 交付状态
独立分支 `codex/canvas-shortcuts-help-20261012`，基于 `origin/main` 的 `1506166`。用户明确本轮只改代码，由其他 Agent 合并上线；不连接服务器、不修改共享 main、不发布。

## 已实现
- 替换旧7条项目符号帮助，使用独立浅色帮助弹窗；3组18项实际快捷键、6条短操作指南。
- 导航、选择编辑、创建导入分组；Windows/macOS自动选择且可手动切换，中文/英文。
- 增加搜索、空结果、滚动正文；桌面双列，窄屏单列，关闭按钮/搜索始终可达。
- Esc关闭、Tab焦点约束、关闭后恢复入口焦点；帮助打开时继续阻断画布删除/历史/新节点快捷键。
- 列出V/M/H、空格平移、Shift框选、撤销重做、缩放/适屏、Shift+T、媒体复制、粘贴节点/工作流/图片、文字提示框内Ctrl/⌘+Enter。没有捏造新快捷键，也未改变原有键盘处理器。
- 删除“连同其衍生删除”的错误显示；新帮助准确描述仅删除选中节点或连线。
- 操作指南覆盖右键节点、连线、素材导入、多选工具栏、Agent、生成状态。保持短句，无营销描述。

## 源码
- `src/components/canvas/canvas-help-dialog.tsx`：独立portal弹窗、焦点与布局。
- `src/lib/canvas/help-catalog.ts`：有中文英文的实际操作目录。
- `src/components/canvas/canvas-client.tsx`：只替换原帮助渲染块与增加导入。
- `scripts/verify-canvas-help.ts`、`scripts/verify-canvas-help-browser.mjs`：内容契约、浏览器验收。

## 验收
- 真实Next.js/Chrome隔离本地模式基线：旧版7条帮助可见，`CANVAS_HELP_BASELINE=PASS checks=1`。
- 内容/键位/弹窗契约154项，`CANVAS_HELP_CONTRACT=PASS checks=154`。
- 实际Chrome浏览器Windows/macOS平台模拟：键位标签、平台切换、搜索/空结果、阻止底层画布删除/创建/历史、Tab双向边界循环、Esc关闭与恢复焦点、390/320px边界/滚动/遮罩关闭、英文内容共15项：`CANVAS_HELP_BROWSER=PASS checks=15`；pageerror=0。不是Mac实体设备验收。
- 节点保护检查要求画布真实加载并选中1个文字节点，焦点放在帮助按钮而非输入框，按Delete/Backspace/撤销/Shift+T后节点ID与选中状态保留；不以空节点集合认领通过。
- 全项目 TypeScript（隔离完整依赖）exit0。
- Windows本地 `npm run build` 正式构建exit0，所有路由完成；不是Linux镜像构建或线上验收。
- 最终截图已检查：桌面/320px为浅色，键帽/工具项整齐，正文可滚动。截图禁用动画，英文截图使用真实桌面尺寸命名。
- 测试使用隔离本地账号/数据，不连接业务DB或触发模型调用。不是供应商消费或线上验收。

## 环境问题和边界
共享main的node_modules缺少新主线Markdown依赖，首次共享依赖基线编译失败。没有修改共享依赖，改在output中的独立runtime-copy按锁文件npm ci；随后基线、类型和浏览器通过。首次窄屏英文重新打开入口被站点版本角标遮住，属于已有主工具栏窄屏重叠；测试恢复桌面后开启英文帮助完成。帮助弹窗本身320px验证通过。未在本任务扩展修改站点角标。

## 待交接
由其他Agent合入本分支后集中发布。保持既有账号/配置/数据库/媒体、模型与价格不变，无Schema迁移。本任务不发布任何服务器；接手Agent先核对最新目标/运行基线与发布约定，不据历史迁移记录推断目标。

## 本地证据
`E:/Workspace/naumi/output/canvas-help-20261012/` 保存最终日志/截图/补丁和回滚说明。依赖/构建隔离目录是开发验证产物，不作为生产源包。恢复测试仅操作独立副本，源分支保持新版。

## 交接与源码回滚
- 六个任务文件选择性提交到 `codex/canvas-shortcuts-help-20261012`；开工与交付前刷新origin/main，基线仍为1506166，没有共享checkout重置或强推。
- 证据中的 `MODIFIED_FILE.zip` 为六个任务文件，`DIFF_FILE.patch` 为完整提交差异，`VERIFICATION.txt` 记录精确命令/结果/退出码，`ROLLBACK.sh` 仅接受带标记的隔离rollback-copy。
- 原canvas-client SHA256：`ac30fdd8597926da0f7900fe87643b66a233da5d1e8b808f0b0850827a5a382f`。回滚脚本恢复此哈希；隔离Chrome确认恢复旧7条帮助，源码分支及修改运行副本保持新版。
- 合并上线者如需回滚业务提交，应对该提交使用审查后的git revert并按发布流程构建固定版本；本地fixture脚本不是服务器部署回滚脚本。
