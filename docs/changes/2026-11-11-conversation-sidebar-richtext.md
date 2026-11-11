# 对话侧栏、输入聚焦与 Markdown / LaTeX 富文本

日期：2026-11-11。交付分支：`codex/conversation-sidebar-20261111`。

## 模块与职责

- `ConversationHistory`：左侧会话入口、最新图片缩略图、行内重命名、置顶/取消置顶、删除及键盘菜单；不持有另一份会话数据，不提交生成任务。
- `workbench-session-catalog`：复用既有账号 epoch、目录 observation revision 与 late-response fencing，新增 pin mutation。成功修改使旧 GET 失效，切账号后旧响应不得回填。
- `workbench-session-preview`：同一纯投影同时处理持久事件和当前对话步骤；使用受控媒体 URL，区分参考、结果、生成中、失败和停止。已知 idle 的 owner 可结束遗留 running badge；unavailable 不冒充完成。
- `ConversationRichText` / `conversation-markdown`：只读 Markdown/GFM/数学显示，代码高亮和复制；LaTeX 的 `$...$`、`$$...$$`、`\(...\)`、`\[...\]`；KaTeX 公式字体与长表格/代码/公式横向滚动。原持久消息、执行提示词与代码原文不变。
- 输入 Dock：去掉 textarea 与外容器聚焦蓝框，保留光标；工具按钮的键盘焦点不移除。

## 公共接口、依赖与状态归属

- `WorkbenchSessionSummary` 新增可选 `pinnedAt`、`preview`，兼容旧摘要。
- `PATCH /api/agent/session {id,pinned:boolean}`：当前账号持久置顶。与 title 混合请求拒绝；cv- 会话沿用画布入口。原 title/delete idle 锁与归属不变。
- `app_agent_sessions.pinned_at` 为可空增量字段，添加账号/置顶/更新时间索引。pin 只改目录元数据，不改内容 CAS `updated_at`，允许执行中置顶，不打断已受理任务。
- legacy pin 不转发到旧执行槽；title mutation 保留原 owner forwarding。目录仍为共享持久 owner；无新任务系统、供应商调用或费用。
- 客户端仅 creation appearance 增加可见页面每 15 秒刷新及 focus/visibility 刷新；同一目录 owner 负责取消、账号 fence 和卸载清理，不按行启动定时器。
- HTML 不作为消息执行；URL policy 复用原模块。KaTeX `trust:false`，宏扩展和尺寸有界，不完整流式公式保留可显示文本。

## 本次实现与主线同步

原始基线 `46b2ce9a912c78dcb74164c2ec4d905ba6671b21`。收尾 fetch 后主线为 `fd0301c0d79689fdeb89bfda459c8c93a8a62e92`，当前内容分支 fast-forward 同步主线，无文件重叠。仅提交本模块路径。共享工作树未修改；本轮不合 main、不部署、不连接 47/103。

## 集中验证与证据层级

证据根目录：本工作树 `output/conversation-sidebar/`。

| 命令 | 结果 | 层级 |
| --- | --- | --- |
| `npx tsx scripts/verify-conversation-sidebar.ts` | 30/30 PASS | 真实纯投影、目录 owner、跨账号/旧 GET 和 LaTeX 代码保护 |
| `npx tsx --conditions react-server scripts/verify-conversation-sidebar-pg.ts` | 22/22 PASS | 独立本机 PostgreSQL、实际 repository / Next Route / cookie 鉴权；非生产 DB |
| `node scripts/verify-conversation-sidebar-ui.mjs --baseline` | `BASELINE_REPRODUCED outline=solid/2px math=0 tables=0` | 基线真实组件/CSS + Chromium，准确复现旧蓝框与缺失富文本 |
| `node scripts/verify-conversation-sidebar-ui.mjs` | 28/28 PASS | 修改版真实组件/CSS + Chromium；目录 HTTP 存储、auth 和 model controls 为 fixture |
| `node scripts/verify-workbench-mutation-ownership.cjs src/components/home/workbench-client.tsx output/conversation-sidebar/mutation-regression` | 43/43 PASS | 原实际 React/Chromium 会话目录和附件回归 |
| `node scripts/verify-workbench-recovery.cjs src/components/home/workbench-client.tsx output/conversation-sidebar/recovery-regression` | 51/51 PASS | 原实际 React/Chromium 恢复/SSE/停止/账号边界回归 |
| `npx tsc --noEmit --incremental false` | exit 0，空错误输出 | 全项目静态类型 |
| `node scripts/verify-conversation-sidebar-ui.mjs --rollback` | `ROLLBACK_RESTORED outline=solid/2px math=0 tables=0` | 读取另一个副本内真实恢复文件，复核旧显示行为 |

共 174 个修改版检查通过（另有基线 3 项和回滚显示 3 项）。供应商调用 0。HTTP 持久 fixture 的 reload 不等于浏览器真实登录/生产端到端；真实 PG/Route 层单独核验跨账号相同 ID、执行中置顶、运行中 rename/delete 409、CAS 不受 pin 影响和删除不复活。

截图 `conversation-richtext-sidebar.png` 为实际组件验收场景；瓶子 SVG 是测试占位素材，不是生成结果或公开案例。已打开检查富文本、菜单和 Dock 排版。

## 回滚与真实产物

`MODIFIED_FILE.zip`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh` 均在证据根目录。manifest 保存逐路径原始 Git blob / 修改后 SHA256，`baseline-files.zip` 保存原文。回滚只接受带 fixture marker 的另一个副本，逐文件校验修改后 hash 才恢复；新增文件删除。正式修改文件保持不变。应用回退无需删除增量 pinned_at，不回灌数据库，不重放任务。

精确命令、输入、字面输出、退出码和所有产物绝对路径见 `VERIFICATION.txt`。

## 未完成项与下一步

本模块代码、本机组件/HTTP/PG/类型与副本回滚验收完成。待父线程选择性接入、main 集成与生产版本验收；本记录不把本机通过写成已上线。无收费生成或线上数据迁移验收。
