# 全节点 Dock 与编辑面板检查

## 范围、基线与操作路径

- 用户要求检查所有节点的 Dock。分支 `codex/canvas-all-docks-20261110`，独立工作树 `E:/workspace/naumi-all-docks-20261110`，起始 main：`6d475a6ce906d2f794c8f0b7711eb99ee4e7db44`。
- 八种创建入口（图片、文字、视频、角色、场景、3D 导演台、音频、多轨）及空白图片、视频结果、音频结果，共 **11 种面板状态**。原生角色等五类是独立编辑器，不将其误报为重复 Dock。
- 逐类操作：选择/创建节点 → 打开面板 → 短文与长文 → 展开/收起 → 参数浮层/Escape → 底部按钮可达性 → 保存/关闭；多轨补充轨道增删历史、片段选择/编辑，音频补充真实 WAV 解码及来源绑定。
- 视口：1440×900、390×844、1000×300、390×520。任务占位沿用对应生成节点的同一创作栏；导入图片/文本沿用对应 renderer，不另造独立 Dock。
- 未访问服务器或生产数据，47 HOLD 保持。所有新增页面操作运行在隔离 loopback Next 和 HTTP fixture 上，不调用真实供应商。

## 本轮确认与修复

| 问题 | 当前证据与结果 |
| --- | --- |
| 角色、场景的长描述产生 textarea + 外层面板嵌套纵向滚动，部分描述仅三行高度 | `baseline/character-1440x900/02-long-text.png`、`baseline-mobile/scene-390x844/02-long-text.png`；两类面板共四个描述字段接入真实内容高度，最小 112px，由面板 body 滚动 |
| 图片 Dock 在矮窗口被标题/工具栏避让切成约 34px 的窄条，展开也无法改善 | `baseline-short/image-1000x300/01-open.png`；≤360px 高度采用安全区顶部工具栏＋剩余空间创作栏，实测恢复 90px 可滚动区域。正常视口继续保留标题避让 |
| 多轨编辑器的固定预览/轨道最小高度超过窗口，底部操作被 overflow:hidden 裁掉 | `baseline-short/timeline-1000x300/01-open.png`；增加独立 workspace，在 ≤700px 窗口内滚动，标题和底部操作保持可见；正常画布保留独立横向时间线滚动 |
| 音频作品结果复用视频操作，出现提取画面、裁剪视频、下载视频 | `baseline-audio-result/audio-result-1440x900/01-open.png`；按已保存 category 区分音频/视频，音频入口进入已有原生音频编辑器，下载标签改为音频。已有同来源编辑器复用，无编辑器时单次创建并绑定原始来源 |

其他检查：空白图片、文字、视频创作、视频结果、3D 导演台、音频编辑器在覆盖状态下未发现新的 Dock 阻断；参数菜单、展开/收起、底部按钮和 Escape 可操作。3D 左右独立检查器滚动属于不同面板，不是嵌套重复滚动。

## 模块与职责、公共接口、依赖方向

- `CanvasGrowingTextarea` 复用上一轮 `useGrowingTextarea`，只处理 textarea 的 DOM 高度。角色/场景的草稿、CAS、撤销和上传职责不变。
- `dock-layout` 保持纯屏幕几何，不修改节点坐标或画布缩放。极矮窗口优先保证操作区域，可能覆盖底层图片/标题；常规高度的标题保护与工具栏避让仍由原 553 项几何回归约束。
- `TimelineEditor.workspace` 只拥有布局与滚动；媒体预览、轨道、计费、渲染、采用结果保持原职责与接口。
- `VideoResultDock` 新增可选 `kind` / `onEditAudio`，默认仍为视频。工具栏新增可选下载标签，原视频调用不变。
- 音频应用 owner 的 `create(at, source?)` 可在原子节点创建时附带来源，复用 `withAudioSource`；保存、来源归属校验、CAS、历史和账户作用域仍由原 owner/server 管理。点击编辑不启动处理、不生成新媒体、不扣费；编辑已有来源时优先打开已有节点。
- Canvas 入口检查只读、登录、设置就绪、锁定及真实音频 category，不按扩展名猜类型。并发新建仍由原 `creating` 集合去重，失败释放，迟到成功不抢回其他项目焦点。

## 验证命令与证据层级

证据根：`output/all-docks/`，交付归档路径 `E:/workspace/naumi/output/canvas-all-docks-20261110/`。

| 检查 | 结果 |
| --- | --- |
| `node scripts/verify-canvas-all-docks.cjs --out output/all-docks/modified --assert` | 原十类 × 三视口，30 组、102 个状态采样通过；长输入、菜单/Escape、展开/收起、footer 可达性、轨道撤销重做 |
| 同脚本 `--viewport 390x520` | 包含音频结果的 11 类键盘高度复查通过 |
| 同脚本 `--kind audio-result --new-audio-editor` | 三视口正确音频入口、原始来源绑定、只新增一个编辑器通过；键盘视口另验证已有编辑器复用 |
| 同脚本 `--kind audio --populated` | 三视口真实 WAV 解码、开始秒数修改、保存通过 |
| 同脚本 `--kind timeline --populated` | 三视口含素材与多条轨道，片段选择/时长编辑/保存通过，最终以 `timeline-populated-accepted/` 为准 |
| `node scripts/verify-canvas-audio-result.cjs` | 11 项：来源保留、空白创建兼容、已有节点复用、并发创建、失败重试、迟到结果、只读/锁定/类别门禁；付费调用 0 |
| `node scripts/verify-character-native-ui.cjs . output/all-docks/character-regression` | 通过；真实组件/CSS、外观引用、撤销重做、保存重载、冲突保留草稿、移动端、只读/英文/焦点 |
| `node scripts/verify-scene-native-ui.cjs . output/all-docks/scene-regression` | 通过；含场景状态、普通背景/全景设置及上述编辑边界 |
| `node scripts/verify-timeline-native.cjs MODIFIED . output/all-docks/timeline-assets` | 108 项通过，真实本机 FFmpeg 媒体测试，用于后续 UI 素材 |
| `node scripts/verify-timeline-native-ui.cjs . output/all-docks/timeline-regression output/all-docks/timeline-assets` | 通过；真实解码/播放、混合预览像素、音频增益、拖拽裁剪撤销、草稿冲突、手机/只读/英文/焦点 |
| `node node_modules/tsx/dist/cli.mjs scripts/verify-canvas-compact-dock-layout.ts` | 原 553 项及新增极矮窗口 6 组通过，未放宽正常标题/工具栏保护 |
| `node scripts/verify-main-compact-dock-behavior.cjs` | 8 项通过，正常布局与文字/视频既有几何保持 |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | 通过 |

真实 Next/React Flow/Edge UI 与真实本机媒体解码；账户、数据库保存、报价与生成/处理回调是明确的本地 fixture。测试截图和 DOM 断言不代表真实供应商或生产数据库验收，也不代表完整 WCAG 合规。

复现入口：设置 `CANVAS_ALL_DOCKS_FIXTURE=1`、`VIDEO_DOCK_NEXT_PORT=15371`、`VIDEO_DOCK_FIXTURE_PORT=15372`、`NEXT_DIST_DIR=.next-all-docks` 后运行 `node scripts/serve-canvas-unified-dock-fixture.cjs`；视频播放样本为本任务通过 FFmpeg 生成的 `output/canvas-video-dock-fixture.mp4`。其他调用默认不启用 all-docks fixture。

## 审查过程与未完成项

- T3 预览连续两次 `Preview automation snapshot timed out after 15000ms`，按工具回退条件改用隔离 Edge。无效/陈旧截图不作为结论，最终验收使用本轮重新捕获的图片。
- 首次导演台点击被前一用例增长的文本遮住；修正为每个用例重置独立 fixture 数据，未将该种测试污染记为产品缺陷。
- 历史 fixture 未实现 image-prompts、workflow manifests、timeline materials 及精确 artwork IDs 回执，曾显示无关错误。已补齐 fixture；保留产品的回执完整性保护，相关失败日志保留。
- 实际打开检查代表性截图与全部节点视口总览；重点检查角色/场景长文、矮窗口图片栏、多轨 footer 和音频结果入口。截图报告另存交付目录。
- 后续仅剩刷新并整合 main、整合检查、普通 merge/push 和本任务 worktree 清理。生产发布不在本轮范围；成功发布计数增量 0。
