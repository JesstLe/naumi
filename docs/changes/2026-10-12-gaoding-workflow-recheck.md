# 稿定工作流粘贴复核（2026-10-12）

## 基线与确定的问题

- 本任务独立 worktree：`C:/Users/13357/.codex/worktrees/gaoding-workflow-recheck-20261012/naumi`；分支 `codex/gaoding-workflow-recheck-20261012`。
- 开工刷新 `origin/main`，基线 `b627a3048a5a554278527dcea80ac5d21e7cd115`。共享 checkout 保持原分支，不切换、不修改。
- 使用用户此前实际复制的 `editor-next / 10.0.0` HTML，仍只留在忽略目录，不将文案或带签名的素材 URL 提交。
- 基线解析器与隔离 PostgreSQL 导入通过；实际浏览器首步粘贴失败（`false !== true`）：常驻 Agent 小球的 `data-canvas-hotkeys-blocked=true` 被旧全局选择器当作模态遮罩。
- 上一轮已完成但尚未进入 main 的 `codex/canvas-desktop-input-20261012 / 66805d7` 已有正确修复。通过普通 Git 合并整合到当前候选 `931748c`，不重复手改同一个大文件。`CANVAS_MODAL_SELECTOR` 仅让真正模态层全局阻断，常驻控件仅隔离自己的事件。保留上一轮连线删除与桌面输入修复。

## 复核覆盖

- 原样本：16 文字 + 11 图片 + 6 SVG/path 装饰 + 5 组 = 38 元素，19 连线，无缺失引用。
- 实际公网素材重新下载：8 个素材正常落地；9 张原图仍返回 403，按用户决定生成占位 PNG。占位保留坐标、显示尺寸、标题、提示词、分组与连线，不冒充原图下载成功。
- 真实本地 API + 独立 PostgreSQL + 本地媒体：一步撤销/重做、混合分组整体拖动、刷新持久化、失败重试操作 ID、离开项目取消与晚响应隔离、普通图片/本站节点粘贴兼容。
- 原位补图通过 multipart API；原节点 ID/连线/布局不变；像素版本撤销/重做与刷新保留。
- 新增 `verify-canvas-workflow-recheck.ts`：纯文字项目、零素材下载、并发同操作仅导入一次、重复粘贴重映射 ID 和连线、坐标偏移、范围外引用计数、缺 URL 占位、补图后晚到重试读取当前像素/标题/位置。
- 新增 `verify-canvas-workflow-paste-handler.mjs`：执行源码中的实际 handler，覆盖常驻小球/模态/输入框/只读/项目浏览界面。可在基线副本以 `--baseline` 重现阻断。
- 扩展浏览器脚本支持 Edge/Windows 与 WebKit/Mac 平台模拟，检查常驻小球存在时仍可粘贴，新增纯文字、重复粘贴、刷新、损坏剪贴板不新增节点。
- 不调用生成模型，不改变供应商/计费配置；隔离账本保持不变。

## 验收与局限

集中验收结果与命令保存在 `E:/Workspace/naumi/output/gaoding-workflow-recheck-20261012/VERIFICATION.txt`：Edge/Windows 与 WebKit/Mac 模拟各 11 项浏览器检查通过，pageerror 为 0；解析器、实际 paste handler、连线输入回归、节点编辑、隔离 PostgreSQL 全链与新增边界测试通过；类型检查与本任务定向 lint 通过。

完整 Next 生产构建通过，96 个页面生成且 `.next-workflow-recheck-final/standalone/server.js` 已核验。首次复用依赖 junction 时 Next 虽退出 0，但 standalone 写入报 EPERM；没有把该次构建当成完整交付。将依赖复制到本任务 worktree 后重新构建，实际独立 server.js 生成。全量 lint 仅保留既有 4 条警告（account-dock-menu 的依赖与 annotate-editor / assistant-richtext / team-manager 的 img 提示），没有新增工作流警告。

四份证据为同目录 `MODIFIED_FILE.zip`、`DIFF_FILE.diff`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`。保存开工原文件 SHA256，回滚仅对本证据目录内的独立源码副本执行；业务分支保留修改。基线/修改/回滚源码使用实际 paste handler 检查，恢复的是基线的小球阻断行为而不是把失败描述为修复；原始生产数据、媒体与配置不在源码回滚范围。

历史 `verify-canvas-agent-entry.mjs` 源码 token 契约已落后于当前 main：仍断言 `contextReady={Boolean(anchor)}`，而已发布实现允许纯文字对话并使用 `contextReady={true}`；同时它还要求本轮正在移除的旧全局阻断选择器。本任务保留失败日志，不为迁就过期测试倒退业务实现。Agent 输入不劫持由实际浏览器验收覆盖。

本次验收使用保存的真实 HTML，通过浏览器 `DataTransfer/ClipboardEvent` 输入；不读写用户当前系统剪贴板。WebKit 在 Windows 上运行并模拟 Mac 平台/Meta 快捷键，不等于原生 macOS 系统剪贴板验收。未检查生产运行版本，未连接或发布服务器。未来竞品变更复制格式时需重新提供样本验证；视频与未支持节点不在本次已适配类型中。

## 同步与交接

本模块计数 1/3；开工与整合前刷新 main，前后均为 `b627a30`（一次代理 TLS 握手失败，随后重试成功）。最终提交前再刷新，若有新业务提交则正常整合后集中验收。不将该候选自动合到 main，不发布。

```text
接手先 fetch origin main，再审阅 codex/gaoding-workflow-recheck-20261012。
该分支包含上一轮尚未合入 main 的桌面输入修复，不要只挑测试提交遗漏 66805d7 的业务修复。
读取本记录和 VERIFICATION.txt；用独立 PostgreSQL/媒体目录运行工作流测试。
保留 403 占位与原位补图，不能把占位视为原素材已迁移。
按项目统一合并/发布约定操作；不从测试环境复制数据库到服务器。
```
