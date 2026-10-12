# 画布 Windows / macOS 全面适配审查

## 目标与基线

审查画布桌面跨平台的快捷键、IME、鼠标/触控板事件、剪贴板、上传下载、布局缩放、菜单/弹层、媒体播放、历史保存/恢复及 Agent 入口。问题按已复现、代码确认、待实机验证分类，输出严重程度、触发条件、影响和建议；不将模拟 Mac 验证当原生 Mac 验收。

- 日期：2026-10-12。
- 独立分支：`codex/canvas-win-mac-audit-20261012`。
- 开工已 fetch origin/main；基线 `3c36894cbc4e0c8a5683d20d9ea89bff67ffb4b3`。
- 共享 checkout 原为 `codex/labs-workbench`，未切换或改动。
- 当前任务只审查、记录及创建回归脚本，不修产品、不连接服务器、不发布、不消费供应商、不写生产数据。
- 复用并重新运行最新主线的连线/桌面回归，而非将历史测试视为本次通过。

## 检查矩阵与完成标准

1. Windows Chrome / Edge，实际浏览器运行；DPR 1 与 1.25。
2. Chrome / WebKit 模拟 Mac 平台，DPR 2、Meta 键；WebKit 运行宿主为 Windows。
3. 1366×768、1093×614、1280×800、390×844 CSS 视口；记录几何和截图。
4. 普通滚轮双轴平移、快捷键缩放/fit、工具切换、多选、菜单键盘、编辑器与模态隔离、中文组合态。
5. 文件下载字节/类型/命名、媒体下载来源、系统剪贴板写入时的用户激活、默认浅色。
6. 连线删除、失败重试、去重、原子历史、撤销重做、刷新、pending/task 保护：现有实际回归脚本。
7. 每个缺陷关联实际代码行、测试项和证据；所有未覆盖平台行为列入待实机矩阵。审查完成不表示全部缺陷已修复或全部设备通过。

## 本轮结果

Audit-State: AUDITED

**10 类已确认产品缺陷、1 类有实测前提的兼容风险、1 类失效测试。** 无 P0；P1 优先处理误提交和位置保存丢失。这里的“确认”区分真实浏览器 UI、受控事件/API fixture 和源码实际函数执行，不代表原生 Mac 实机复现。

用户本轮明确纠正：**JPEG 下载统一命名 PNG 是规则，不是 bug**。原 C04 从缺陷清单移除；保留统一 `.png` 命名，不提更改后缀或转码的修复要求。原始首轮失败证据不删除，最终分类与新测试按该规则更新。

### 问题清单

源码路径均相对本报告固定 Git 基线，行号以该基线为准。P1=可能发生非预期消费/数据状态丢失；P2=主要操作或桌面交互不正确；P3=验证维护问题。

| ID | 级别 / 结论 | 适用端 | 问题、证据及代码位置 | 建议 |
| --- | --- | --- | --- | --- |
| C01 | P1 已复现 | Win / Mac 模拟 | 中文组合态的 Ctrl/⌘+Enter 仍提交文字生成。`text-generate-ime-enter` 四个配置各产生 1 次 `/api/canvas/text-generate`，请求正文包含尚未确认的文字。`canvas-client.tsx:11713-11723` 的局部 handler 未判断 `nativeEvent.isComposing`；全局 guard 不阻止局部 React handler。 | 所有提交 handler 共用组合态检查，兼顾 Safari `keyCode===229` / composition 生命周期；正向测试组合结束后只提交一次。 |
| C02 | P2 已复现 | Win / Mac 模拟 | 节点改名输入收到组合态 Enter 后立即 blur，输入消失并发 1 次 rename POST；期望应保持输入且 0 请求。`canvas-client.tsx:11258-11268`；项目列表和项目顶栏同类未保护路径位于 `9180`、`9669`（后两处只作源码确认）。 | 组合态 Enter/Escape 不保存/取消；普通 Enter 和显式失焦保留原流程。 |
| C03 | P2 已复现 / 原生映射待测 | Mac 模拟 | 先选图片，再 Control+右键，菜单打开但节点从 selected 集合移除。Chrome/WebKit 各复现。`onNodeContextMenu` 在 `canvas-client.tsx:6687-6690` 把 ctrl 和 meta 一概当作切换选择。原生 macOS Control+单击产生 contextmenu 的映射待实机验证。 | Mac 下 Control+contextmenu 按普通右键处理，增选使用平台主修饰键；保持菜单作用对象和可见选择一致。 |
| C05 | P2 已复现 | Win / Mac 模拟 | 视频节点下载请求的 `u` 等于封面 `image` 而非 `videoUrl`，保存的是 PNG 封面；4 配置相同。`canvas-client.tsx:10910-10918`；右键下载 `10460-10465` 也调用 `downloadOne(node.image)`。当前按钮还标注“下载图片”。 | 按媒体类型选原始 asset、Content-Type 和文件名；视频/音频下载与封面下载明确分开。媒体解码未纳入这项验证。 |
| C06 | P2 风险，激活丢失已测 | Safari / 慢网络重点 | 图片复制在 fetch/转码完成后才 `clipboard.write`。人为给代理响应增加 6 秒延迟，4 配置观测写入时 `navigator.userActivation.isActive=false`。`canvas-client.tsx:8151-8181`。本项用监测替身保留系统剪贴板，并未实测原生 Safari 的拒绝；Chrome 也不必然因激活过期拒绝。 | 在点击同步阶段构造 Promise-backed `ClipboardItem` 并调用 write，把拉取/转码放进 Promise；区分复制图片成功、复制链接兜底和失败。真实 Safari 待单测。 |
| C07 | P2 源码函数复现 | Win / Mac | 打包选 31 张，只提交 30 项，无提示。实际 `downloadZip` 函数转译执行确认。`canvas-client.tsx:6221-6229` 的 `.slice(0,30)` 静默截断。 | 显式提示上限并分批导出，或支持完整打包；返回成功/失败清单，避免遗漏被视为全部完成。 |
| C08 | P1 源码函数复现 | Win / Mac | 拖动位置 POST 返回 500 时，单节点本地仍改为 `(99,88)`，无失败提示；多节点移动也保留 `(200,100)` 并推进 1 条 undo。`canvas-client.tsx:8237-8251,8254-8327` 不检查 `response.ok`，网络异常也被 `.catch(()=>{})` 吞掉。真正刷新时服务端旧坐标会覆盖本地，刷新后丢位置是由此推出的影响，未称生产 DB 实测。 | 检查 HTTP/业务结果，记录 pending/失败/重试或回滚本地；多节点尽量使用原子 position history 保存，成功后再推进历史。 |
| C09 | P2 源码函数复现 | Win / Mac | 标注窗口在组合态 Escape 仍 `onClose()`；按 Esc 本意可能只是取消输入法候选，却丢掉未提交的标注编辑。实际 `annotate-editor.tsx:288-295` onKey 在 `isComposing=true` 时关闭 1 次。 | 组合态放行，非组合态再退出；对未提交草稿保留/恢复或确认关闭。 |
| C10 | P2 已复现 | Win / Mac 模拟 | 新用户没有 `nv:canvas:bg` 时画布默认深色；4 配置 `light=false,storage=null`，偏离浅色 UI 约定。`canvas-client.tsx:2440-2450` 只有存储值为 light 才亮，异常也返回 false；error boundary 的缺省却为浅色，口径不一致。 | 默认浅色，是否保留显式深色历史偏好另行统一；SSR/首次绘制避免闪黑。 |
| C11 | P2 已复现 | Windows Chrome / WebKit | ComfyUI dialog 的首个关闭按钮上 Shift+Tab，焦点落到对话框外；按 Escape 后 dialog 数量仍为 1。`canvas-comfy-dialog.tsx:325-343` 虽有 aria-modal，但没有焦点圈/恢复或 Escape handler。两引擎各 2 项明确行为失败。 | 复用帮助/裁剪已有的对话框键盘契约，隔离背景焦点，首焦点/Tab环/Escape/关闭恢复一致；输入法期间 Escape 仍让出。 |
| C12 | P2 已复现 | Win / Mac 模拟 | Agent 小球默认位置在1093×614时遮住图片编辑面板关闭按钮，390×844时还遮住比例/分辨率按钮（Chrome）或添加参考图（WebKit）。四配置16视口的 `elementFromPoint` 命中验证：关闭按钮中心实际命中 `canvas-agent-orb` 而不是按钮；1366/1280视口没有该命中冲突。`canvas-agent-orb.module.css:1-2` 的 z-index32/pointer-events auto 在 dock 的 z-10之上；`canvas-agent-orb.tsx:20` 和 `agent-orb.ts:44` 默认相对位置不避让面板。 | 默认位置与编辑面板避让，保留小球拖动功能；用户应直接关闭面板，无需先移球。把小球纳入布局/点击命中矩阵，验证改变视口和保存位置。 |
| T01 | P3 失效验收规则 | 开发测试 | `canvas-tool-palette-contract.mjs:24` 仍匹配过期的 `min-[800px]:bottom-[84px]`，退出 1。当前安全区使用动态 canvasSize / style。16 个实际布局配置的四个面板均在视口内，96 对面板没有相交，因此此断言失败不作为真实工具栏遮挡 bug。该四面板几何检查没有包含 Agent 小球，独立补测见 C12。 | 更新几何/行为断言，不把实现字符串当验收；保留正确的间距检查，并加入浮层点击遮挡。 |

### 通过的检查

- **最终浏览器审查矩阵 142 条判定，112 通过、30 失败**：基础扩展审查 82 条（按最新规则分类60/22）、现有桌面/连线回归 52 条（52/0）、ComfyUI 扩展 4 条（0/4）、小球遮挡补测4条（0/4，各覆盖4视口）。JPEG 四项初始判定使用了错误预期，原始82项日志仍为56/26；最终 `assessed-results.json` 记录由用户规则纠正的分类和补测来源，不冒充修复。失败次数是跨配置判定数，不等于30个不同bug。
- Windows Chrome DPR1、Edge DPR1.25；Mac 平台模拟 Chrome/WebKit DPR2。4 个 viewport × 4 个配置 = 16 组布局图；PNG 下载文件和 JPEG 统一 PNG 命名的响应字节均保留。JPEG 使用8字节头尾哨兵 fixture，只验 MIME/命名/透传，不代表完整JPEG解码通过。
- JPEG 统一 `.png` 文件名列为已接受产品规则（原 C04），独立 `jpeg-download-png-naming-policy` 回归验证四个配置均遵循规则。除命名外是否转码不添加新需求。
- 导航、工具快捷键、工具层 IME 放行、Shift 多选、右键键盘菜单、普通滚轮平移、Ctrl/Meta 缩放和 fit、编辑器 Backspace、帮助平台标签/焦点/模态隔离、PNG 下载及 pageerror 均通过。
- 现有 Edge/WebKit 回归重新运行，各 26 条（内部各含 Win/Mac 模拟）：图片/产品/文字连线、失败重试、长按去重、历史 undo/redo/刷新、空白 deselect、模态 Backspace 不后退、节点 marker paste、Space 拖动和 pending 断线保护。真实供应商调用 0。
- 实际源码函数故障验证 4 项（位置单/多、ZIP、标注 Escape）；剪贴板文件识别 7 项通过，包括 Explorer/Finder 缺 MIME、中文文件名、items/files 防重复、HEIC 明确不支持，不把已声明只支持 PNG/JPEG/WebP 的格式边界伪报 bug。
- 当前 desktop contract、edge 实际 handler、media actions、media controls、并发 contract、help contract（156）、workflow paste handler/parser、orb contract（127）通过。工具栏旧 contract 单独标 T01。
- `npx tsc --noEmit --pretty false` 退出 0；两审查脚本语法检查和 `git diff --check` 退出 0。

### 构建与审查材料口径

最初本机共享依赖 Geist 字体文件缺失；只在本任务依赖副本安装完整 `geist@1.7.2`，不修改共享依赖。随后 Next 优化编译、Lint/类型及 97 页生成完成，但 standalone trace 遇到 C/E 跨盘 dependency junction 路径 `ENOENT`，完整 build 命令退出 1，不记录构建通过。浏览器验证使用该次已产出的优化页面资产，经 `next start` 实际运行；未把它称为完整可发布 standalone 包。

测试夹具校正记录保留：初筛 Shift 多选失败来自测试合成 keydown 缺少配对 keyup，修正后 4 配置均通过，未列产品缺陷。早期文本报价 fixture 缺 version、选下层节点被现有 composer 遮住、菜单项的 accessible name 包含 hint，均修正夹具/定位后集中复核；小球补测 WebKit 首次缺少视口变化后fit导致点击超时，补齐fit后单配置重跑，确认真正的按钮命中遮挡。原始失败保留；夹具超时不混入最终142条。输入法事件验证是浏览器合成组合态事件，不等价于原生拼音输入法验收。

### 实机及未覆盖矩阵

| 项目 | 本轮覆盖 | 还需验证 |
| --- | --- | --- |
| Windows 10/11、Chrome/Edge | Windows 宿主浏览器交互；浏览器版本保留在环境证据；未分别切两套 OS | 两套 OS × 100/125/150/200% 显示缩放；外接屏跨 DPI；浏览器 80/125/150/200% 缩放。DPR/小 CSS viewport 不替代这些实机变化。 |
| macOS Intel/Apple Silicon、Safari/Chrome/Edge | Mac platform/UA/Meta 模拟；Windows WebKit 引擎 | 原生 Safari、系统 Clipboard 权限/Promise 写图、Finder 文件与截图、Fn+Delete/⌫、Control+单击、多屏 Retina/字体 PingFang、中文拼音 composition。 |
| 触控板 | 实际 wheel 双轴平移；Space+鼠标拖动来自现有回归 | 原生双指平移/惯性/捏合、Safari gesture、缩放焦点是否贴手；浏览器后退侧滑边界。 |
| 上传/本地编辑/媒体 | 文件判定、已有代码/媒体控制合同、PNG/JPEG下载字节 | 拖入真实 Finder/Explorer、大批次/损坏图片、HEIC 转换需求；真实裁剪/替换持久化、视频/音频各 codec 解码/抽帧/全屏。 |
| Agent/模型/历史 | 本轮桌面隔离回归、状态/并发/入口合同、实际 marker paste | 原生系统 Clipboard 全链路、真实模型流式输出/收费/断网恢复、生产 DB/媒体持久化、大画布>60节点/万字文本/多图片性能。未运行付费供应商。 |
| 完整弹层/无障碍 | 帮助、右键、ComfyUI 实际键盘验证；裁剪/属性/标注等源码检查 | 所有弹层逐个焦点环和读屏、Windows 高对比、prefers-reduced-motion、原生 select/color picker；旧 Safari dvh 兼容支持范围。 |

### 修复目标（仅计划，不冒充实现）

1. 第一模块：C01/C02/C09 的 IME 与 C11 对话框输入隔离。目标：组合态 0 提交/0退出；结束后普通快捷键保持；Tab 不离 modal。
2. 第二模块：C08 保存/历史可靠性。目标：注入 HTTP500/断网时有 pending/重试或精确回滚，刷新/undo/redo 不丢位置。
3. 第三模块：C05/C06/C07 复制/下载媒体契约。目标：保留用户确认的统一PNG命名规则，视频拿原 asset，31张无静默遗漏，原生 Safari 快慢网复制通过。
4. 第四模块：C03/C10/C12/T01 平台语义、浅色初态、小球与面板避让、契约维护；集中 Win/Mac 实机矩阵，记录新发现。按完整模块计数，每3次刷新/整合 main，不按测试或文档提交计数。

## 证据与复跑

任务工作根：`C:/Users/13357/.codex/worktrees/canvas-win-mac-audit-20261012/naumi`。
所有原始材料在该目录 `output/canvas-win-mac-audit-20261012` 下；最终结构化结果已重开解析，16张布局截图汇总到 `layout-contact-sheet.png` 复核，下载文件检查签名字节；未提交原始大文件。

- `verified/results.json`、各 profile `*-requests.json` 与16张 `*-宽x高.png`：原始82项和请求证据；`assessed-results.json` 记录JPEG四项按用户规则纠正；`naming-rule-confirmed/results.json` 保留新命名规则回归。
- `edge-regression/result.json` / `webkit-regression/result.json`：各26项。
- `dialogs-verified/results.json`：ComfyUI两引擎四项。
- `orb-layout-supplement`：小球遮挡初次四配置（保留WebKit夹具超时）；`orb-webkit-verified`：WebKit补齐fit后重验；各自 `*-orb-hit-targets.json` 含控件名称、中心坐标、命中对象。
- `runtime/results.json`、`layout-overlap.json`、`contracts.json`、`typecheck.log`、`build.log`、`environment.json`：函数/几何/合同/环境口径。
- `MODIFIED_FILE.md`、`DIFF_FILE.diff`、`VERIFICATION.txt`、`ROLLBACK.sh`：报告与验证交付；回滚仅报告副本，不改变业务源码/服务器。

```powershell
# 在上面的独立工作根运行；先提供自己的可启动 Next 优化构建目录。
$env:WIN_MAC_DIST='.next-win-mac-audit'
$env:WIN_MAC_EVIDENCE='output/canvas-win-mac-audit-20261012/verified'
node scripts/audit-canvas-win-mac-browser.mjs
# 输出审查统计，已发现的产品行为失败计入 JSON；退出0仅表示审查完成。
$env:WIN_MAC_PROFILES='win-chrome,mac-webkit-sim'
$env:WIN_MAC_CHECKS='comfy-dialog-focus-trap,comfy-dialog-escape'
$env:WIN_MAC_EVIDENCE='output/canvas-win-mac-audit-20261012/dialogs-verified'
node scripts/audit-canvas-win-mac-browser.mjs
Remove-Item Env:WIN_MAC_PROFILES,Env:WIN_MAC_CHECKS
node scripts/audit-canvas-win-mac-runtime.mjs
# 补验小球与编辑面板的点击遮挡（显式筛选才运行）。
$env:WIN_MAC_CHECKS='orb-dock-control-hit-targets'
$env:WIN_MAC_EVIDENCE='output/canvas-win-mac-audit-20261012/orb-layout-supplement'
node scripts/audit-canvas-win-mac-browser.mjs
# 只重验用户确认的命名规则（不混入上面142条矩阵重复计数）。
$env:WIN_MAC_CHECKS='jpeg-download-png-naming-policy'
$env:WIN_MAC_EVIDENCE='output/canvas-win-mac-audit-20261012/naming-rule-confirmed'
node scripts/audit-canvas-win-mac-browser.mjs
Remove-Item Env:WIN_MAC_CHECKS
# 已有首轮原始证据时，将四条旧命名预期按规则分类；不覆写原始结果。
node scripts/verify-canvas-audit-report.mjs ASSESS
node scripts/verify-canvas-audit-report.mjs MODIFIED
```

## Git、同步、交付状态

收尾再次 fetch origin/main，仍为 `3c36894cbc4e0c8a5683d20d9ea89bff67ffb4b3`；基线无变化，不必合并。仅选择性提交本报告与三份审查/报告验证脚本并推任务分支。业务源码、数据库、媒体、供应商、服务器配置未修改；生成的 tsconfig include 改动已按原件字节恢复。功能迭代完成次数为0，本审查/文档不计功能迭代或发布；两机发布/空间维护计数不变。

## 后续接手提示词

```text
以本报告固定基线和证据为起点逐项修复确认缺陷；先刷新 origin/main，使用独立 codex 分支/worktree，保护同事未提交改动。
修复一个完整模块后集中回归，更新问题状态和真实覆盖；原生 Mac/Safari 系统剪贴板、IME、Fn/Delete、触控板、Retina/浏览器缩放必须单独验收，不用 UA/Meta 模拟替代。
不将该只读审查报告当作修复或上线证据。报告保留发现、复现步骤、代码位置、修复提交、验收和未覆盖项目。
```
