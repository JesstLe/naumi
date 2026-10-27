# 即梦模板实测与 Naumi 节点能力融合

## 本轮交付

- 日期：2026-10-27。
- 分支：`codex/jimeng-capabilities-20261027`。
- 基线：`cde64c6aedd75c5197ee2ae17e7bac8759fb8bed`；开工、提交前均刷新 `origin/main`，本轮刷新时未发生漂移。
- 工作目录：`E:/Workspace/naumi-jimeng-capabilities-20261027`。共享 checkout 的 18 项修改保持；不修改共享 `canvas-action-menu.tsx`。
- 实测依据：用户选择模板后复制项目，用现成媒体验证编辑和复用，不重复提交收费生成。
- 产品增量：既有图片、空白图片、文字节点 Dock 增加提示词优化。沿用 Naumi 浅色锚定面板，不复制即梦布局；视频已有优化器保持。
- 状态：本地模块验收完成；没有服务器操作、没有上线。整体能力对标仍有后续项，下面明确区分入口观察与真实执行。

## 即梦实测项目

1. `Naumi 能力实测 20261027`：`projectId=13033844393484`，新建空项目，用于图片/视频提示词和文字编辑。
2. `Naumi 模板能力实测 20261027`：`projectId=13038371351308`，从精选作品“胜利协议”的短剧画布点击“复制项目”。初始 136 节点，最终 140 节点。
3. 原用户剧本 `projectId=12974367442956` 没有编辑。这两个测试项目不是原剧本。
4. 首页“旧教室的第三排”只读示例未找到复制入口；实际复制使用的是“胜利协议”，不是把打开模板当复制完成。
5. 前后页面余额均显示 80 积分；本轮未点击图片/视频/文字生成提交。提示词优化实际执行，图片裁剪、视频抽帧、音频分离使用模板已有媒体。

## 能力矩阵

| 能力 | 即梦真实操作与观察 | Naumi 当前源码对照 / 本轮决策 |
| --- | --- | --- |
| 模板复制 | 复制后 136 个节点及现成图片/视频可见，可编辑 | 作为测试素材来源，不等于跨平台剪贴板媒体导入已解决 |
| 图片提示词优化 | 输入→点击一键优化→原文直接替换→重载后保持 | 本轮补齐图片/空白图片 Dock；预览、可编辑、应用/取消，不自动覆盖 |
| 视频提示词优化 | 真实返回，原对白/单镜头要求保留；擅自增加“4K超高清”，实际参数仍为 720p/10s | 已有 `video/prompt-optimizer.tsx`，本轮不新增第二入口；不把模型文案当实际参数 |
| 视频时长 | 将 10s 改为 5s，切换节点后重开仍为 5s | 已有 `video/compact-composer.tsx` 参数交互，不重写 |
| 提示词预设 | 创建“Naumi 实测：固定构图”→保存→重新打开→应用；实际追加到已有文本 | 本基线只查到固定动作/镜头预设，用户自建通用预设库仍待补齐，未宣称已实现 |
| 文字节点 | 正文与生成指令分别编辑成功；没点生成 | 本轮优化文字 Dock 的创作输入，模型只返回优化后的指令，不直接生成正文 |
| 图片引用 | 视频 `@`→图片→选择测试图片节点；引用卡与内文标记出现，移除时同时消失 | 已有引用选择及连接；本轮验证输出保留 `【图N】`、`{{ref N}}`、`<node-asset>`，不新增引用执行器 |
| 图片裁剪 | 1:1→应用→产生分支，原图保留，136→137；下载真实 PNG 为 1152×1152 | 已有 `image-crop-dialog.tsx`、`saveLocalImageEdit`，不重复实现 |
| 视频播放 | 模板视频播放到 00:04/00:04，机器人面罩画面发生变化 | 只记录画面/播放器实际观察；DOM 没有普通 video 元素，不虚构 metadata 验证 |
| 视频首帧 | 素材拆解→抽帧→截首帧→提交，137→138；重载后资产库“视频 - 0秒”存在且可定位显示图片 | 已有 `video/media-actions.tsx` 的 frame 和首帧/尾帧/指定秒数；本轮不新增第二套媒体处理 |
| 音频分离 | 视频音频编辑→音频分离，138→139；波形、00:04 显示；播放按钮变暂停后回到播放 | 已有 extract_audio/separate 操作；没有在 Naumi 生产供应商/Worker重新执行 |
| 音频裁剪界面 | 显示总长 4.11s、时间范围与保存/保存为新节点；取消退出 | 仅验证配置入口，未保存裁剪结果，不算音频裁剪执行通过 |
| 复制结果 | 对裁剪图片右键“创建副本”，139→140，副本图片显示 | 已有节点复制，保留现有实现 |
| 撤销 / 重做 | 画布容器焦点中 Ctrl+Z：140→139；Ctrl+Y：139→140 | 已有作用域历史栈；早期菜单焦点快捷键无变化不记作通过 |
| 编组 / 解组 | Shift 多选两个测试图片→打组：140→141，出现解组工具；解组回 140 | 已有分组/工作流组与多选能力，未在本轮改组结构 |
| 保存重开 | 139 节点时刷新后仍 139，裁剪图、视频首帧及音频分离均在资产库找到 | 本轮 Naumi 图片优化草稿在切换与刷新后保持，属于本地 Canvas fixture，不是线上 DB 验收 |
| 扩图 / 局部重绘 / 九宫格 / 超分等 | 图片顶部菜单看到入口，未执行收费处理 | Naumi 已有部分图片编辑链路；剩余逐工具真实输出验证待后续，不用菜单可见代替通过 |

上述是本轮覆盖到的主要非付费节点路径，不是即梦所有工具、Naumi 全功能或供应商生成质量的完成证明。

## Naumi 实现

### 组件

- 新增 `src/components/canvas/prompt-optimizer.tsx`：统一图片/文字优化器，复用已有 `CanvasActionPanel`。
- `canvas-client.tsx` 只接入三处 Dock，不修改视频布局、共享菜单、永久底部工具栏或重复增加“图像创作”。
- 开始请求时绑定账号/项目/节点上下文与原文 revision，使用 `AbortController`；切换、取消、只读、卸载后不回填。A→B→A 原文切换也使旧结果失效。
- 请求在等待鉴权后再次检查工作空间 revision 与 abort，防止在新工作空间提交旧提示词。
- “应用”只写回当前创作输入；不调用图片/文字/视频生成，不直接改已生成作品。文字输入沿用现有草稿语义，没有顺带改造文字持久化。

### 路由

- 新增 `canvas-image` / `canvas-text` 分支，`mode=optimize`，复用 `/api/prompt-assist`。
- 旧普通分支会截取 600 字；新分支完整接收至 6000 字，超长返回 422，不静默截断。
- 托管模型已配置但 legacy key 为空时，新分支仍调用托管模型；无配置返回 503，不返回“商业产品摄影”模板假结果。
- 图片系统提示词支持普通场景/人物/故事，不强制商品摄影；文字路径只优化创作指令。
- 输出非空、长度、`finish_reason=length`、引用标记数量/身份、引号中的原文做校验。模型仍可能在其他细节上偏离原意，所以预览由用户决定是否应用，不声称语义百分之百保证。
- 中文长文本输出 token 预算复用视频路径的 12000，结果字符限制仍为 6000；保留 signal、90 秒超时、零自动重试。
- 旧视频及普通工具路径的行为有回归断言；没有新增生成/计费执行器或数据库迁移。

## 集中验证

工作目录为本任务 worktree，证据环境变量：

```powershell
$env:CANVAS_PROMPT_EVIDENCE='E:/Workspace/naumi/output/jimeng-capability-e2e-20261027'
node scripts/verify-canvas-prompt-optimizer.cjs E:/Workspace/naumi/output/jimeng-capability-e2e-20261027/BASELINE baseline
node scripts/verify-canvas-prompt-optimizer.cjs . modified
```

基线的真实 route 打包执行（auth/LLM/db mock）：

```text
BASELINE=CONFIRMED IMAGE_TEXT_DOCK_OPTIMIZER=ABSENT INPUT_600_TRUNCATION=1 MANAGED_NO_LEGACY_KEY_RETURNS_FAKE_COMMERCE=1 SUPPLIER_CALLS=0
exit=0
```

改版 route：

```text
MODIFIED_API=PASS CHECKS=27 REAL_ROUTE=1 MOCK_LLM=1 SUPPLIER_CALLS=0
exit=0
```

复用既有 Canvas fixture 启动，不维护第二份 server：

```powershell
$env:CANVAS_PROMPT_FIXTURE='1'
$env:VIDEO_DOCK_FIXTURE_PORT='14981'
$env:VIDEO_DOCK_NEXT_PORT='14980'
$env:NEXT_DIST_DIR='.next-canvas-prompt-fixture15'
node scripts/serve-canvas-unified-dock-fixture.cjs
# 另一终端执行
node scripts/verify-canvas-prompt-optimizer-ui.cjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

```text
MODIFIED_UI=PASS CHECKS=12 REAL_NEXT_CANVAS=1 API_FIXTURE=1 SUPPLIER_CALLS=0
exit=0
TSC_EXIT=0
```

UI 使用完整 Next/CanvasClient/ReactFlow，API 使用隔离 loopback fixture。覆盖三种 Dock、预览不覆盖、编辑应用、图片草稿重选/重载、上游失败、取消迟到结果、A→B→A、workspace 事件、空输入、390px、Escape、无 pageerror/外部请求。不是线上 LLM、生图或 DB/Worker 验收。

复用的测试提示词：

```text
雨后的夜晚，一台橙色维修机器人站在老街便利店门口，手里拿着一把蓝色雨伞。
保持一个机器人，不出现其他人物，店招写“晚安”，横向电影构图。
```

## 原始失败与收尾

- T3 preview 两次返回 `Preview automation snapshot timed out after 15000ms.`，随后使用 Chrome 扩展中的独立测试标签。
- 基线脚本首次漏复制未变化的 `src/lib/video/prompt-assist.ts`，构建 exit 1；补齐原始依赖后重跑，保留初始失败。
- root 依赖还是 Next14/React18；初次本地启动失败。任务 worktree 改用已有 Next15.5.27/React19.3.0 依赖 junction，未修改依赖目标。
- UI 首轮“创建新项目”按钮被画布遮挡。测试改用底部“新建图片节点”，未用 force click 隐藏问题；保存失败日志。
- 浏览器出现元素 detached、菜单焦点不生效及两次输入超时；依据返回状态重新定位。撤销最终在画布焦点实测通过，未把无变化的尝试计为成功。
- 本任务 fixture 进程已停止，Next 自动改动的 tsconfig 恢复 HEAD 原字节；原共享 18 项修改的前后 diff 规范化比较一致。
- 所有凭据/线上配置保持。生产发布继续交由现有发布线程统一协调，本任务没有新增 47 候选、构建或锁。

## 后续能力缺口

1. 用户自建、可复用的通用提示词预设库，需与已有镜头/动作预设区分，不新增同义入口。
2. 以模板已有媒体继续核验 Naumi 抽帧/音频/裁剪的真实 Worker 输出与作品回执；当前只确认源码已有入口与执行实现。
3. 宫格切分、局部编辑、扩图、视频高级处理逐项形成实际输出证据。模板复制替代素材生成，不替代“提交新生成任务→上游完成”的验收。
4. 即梦引用 ID 到 Naumi 媒体的跨平台导入仍是独立链路，本轮模板复制成功不是导入兼容修复。

功能迭代同步计数：本轮完成 1 个模块；提交前 fetch main 基线未变。服务器成功发布计数增加 0。
