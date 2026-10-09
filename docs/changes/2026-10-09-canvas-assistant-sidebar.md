# 画布侧边 Agent UI/UX 对齐

## 范围与参考

- 用户提供竞品截图，要求复刻其侧边 Agent 的 UI/UX。参考右侧约400px白色圆角面板、轻量顶部工具、居中欢迎态/4个任务卡片、底部一体输入区；保留 Naumi 品牌、实际功能与画布主题。不复制竞品品牌、无实现的套图/模型切换入口或宣传口号。
- 只提交/推送任务分支，不合main、不发布新机/旧机。分支 `codex/canvas-assistant-sidebar`，独立worktree `C:\Users\13357\.codex\worktrees\canvas-assistant-sidebar\naumi`。
- 基线 `5e3b433c31bce732f42d209b81df8c85a988462f`，包含上一工具栏/图标/质量控件修复；开工观察 `origin/main=44c9eb877c004754cbf06d59ecb70c1ff471dfc4`。统一合并者先合工具栏分支，再合本分支，避免覆盖并行模型计价工作。

## 实施

1. 新增纯展示组件 `CanvasAssistantPanel`；SSE、参考链、生成、计价与管理员模型路由保留在既有CanvasClient，不加独立后端或浏览器模型选择。
2. 桌面≥1024px作为画布兄弟组件，400px宽，24px圆角；真实画布测量区域随侧栏收缩，原节点Dock避让继续工作。窄屏使用右侧8px内边距浮层，内部滚动、不产生页面横溢。
3. 空状态提供8个实际适用任务，每页4项：主图、详情配图、场景、精修，换一换进入背景、文案排版、点评、提示词。卡片只填入提示词并聚焦，发送由用户触发，不冒充批量套图工作流。
4. 顶部新建对话、对话记录、收起均接真实动作。新建先保存当前对话快照再清空；记录最多20项，仅当前节点、当前面板打开期间的内存记录，关闭/换节点会清空，不代表服务器持久化历史。生成中禁止新建、恢复与重复发送。
5. 参考图缩略图收进输入卡片上的参考按钮/加号，保留当前图+最多4个上游参考与实际大图预览；加号不是文件上传入口，不增删生成链。
6. 对话采用浅灰用户气泡/开放助手正文，保留原 `[[GEN]]` 生图块与同一runGen路径。新增复制回复、错误重试、流式自动跟随；用户上翻后不强制拉回底部。
7. 输入框自动增长64–144px，Enter发送、Shift+Enter换行、中文IME不误发、空输入/生成禁用；Esc先关参考/记录再收起，打开聚焦输入、关闭恢复原焦点。新UI中英翻译、浅深色主题。

## 验证与状态

实现及本地验收完成。最终集中检查：助手基线/修改契约、157个函数/预设AST业务对照、工具栏11/14项与32px控件契约、图标12槽位、工具面板15项、桌面输入9项、UI6模块、主题11项、Dock碰撞2625案例、全量TypeScript、两文件Next Lint和git diff --check均exit0。记录见证据目录中的 `final-tests.json`。

浏览器使用真实CanvasAssistantPanel、真实翻译与原renderAssistantContent；发送/复制/预览/生图回调为本地stub，供应商调用0。实际验收了任务填入/换页/选中、Enter/Shift+Enter、模拟isComposing保护、错误重试、禁用状态、临时记录保存/恢复、原GEN入口、参考预览/外点关闭/Esc焦点、上翻与回到底部、主题和中英界面。1440×900侧栏400px并列；390×844和320×700无页面横溢；1024×420长输入142px、footer bottom411。加号/发送均32×32。截图与 `browser-evidence.json` 留存。这里的IME是模拟KeyboardEvent，不代表真实操作系统输入法验收。

未执行整站生产构建、数据库联机/真实消费或线上验收，未发布服务器。统一整合者仍须验收组合版本。最新fetch观察 `origin/main=39ccf2c4e1ad4092bb878ceed09e7d204987d80a`，本分支不合main；依赖上一工具栏分支，不能用旧候选覆盖并行模型计价提交。

## 组件调研与第二轮精修

用户要求“再高级一点，可以去网上找组件”，实际读取以下官方资料（HTTP200），原始HTML保存在证据目录：

- [Vercel AI Elements Prompt Input](https://ai-sdk.dev/elements/components/prompt-input)：借鉴输入卡片中header/body/footer与参考缩略图的组织，不引入示例模型选择/上传或useChat运行时。
- [assistant-ui Thread](https://www.assistant-ui.com/docs/ui/thread)：借鉴消息区/输入区分层、自动跟随与显式ScrollToBottom。其Thread依赖runtime，不直接移植。
- [Radix Tooltip](https://www.radix-ui.com/primitives/docs/components/tooltip)：参考键盘可访问性、焦点与Escape行为；按钮保持aria-label、原生title和可见焦点。本轮没有安装Radix，也不宣称使用其Tooltip组件。

采用现有React18、Tailwind3、Lucide与canvas tokens实现兼容的展示层，无新增依赖和后端。任务改2×2卡片、8类独立线性图标、hover箭头与选中标记；欢迎语主次字体、顶部标识与间距精修；输入区参考图堆叠/数量、整卡聚焦边框、32px圆形按钮；上翻提供回到最新消息，参考弹层支持外点关闭、Esc恢复加号焦点。浅色默认，不使用紫色渐变、发光或无意义宣传文案。

证据目录：`E:\Workspace\naumi\output\canvas-assistant-sidebar-20261009`。保存原始字节/hash，提供修改包、差异、验证记录、可执行副本回滚脚本；回滚只在独立副本演练，保留实际任务源码修复。

## 接手提示词

```text
阅读AGENTS.md、docs/AGENT_COLLABORATION.md及本文。
拉取codex/canvas-assistant-sidebar：基于5e3b433，包含canvas-toolbar-consolidation。
刷新main，按Git整合，保留多人并行工作；勿用整个目录覆盖或强推。
保留桌面400px并列侧栏、窄屏浮层、4项可见任务、节点范围临时历史；
复用原SSE/生成/计价/参考链，不把本地预览stub混入应用。
本任务未发布。合并者对组合版本完成构建、联机对话/生图与响应式验收后统一发布，
旧机不回传，除非用户明确要求。
```
