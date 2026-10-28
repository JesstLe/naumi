# 原生音频节点：实现与验收接续

## 当前状态

遵循docs/CANVAS_CAPABILITY_ADAPTATION.md及持续目标：角色→场景→音频→多轨。角色/场景已合入main；音频完整候选代码已落地，已取得规则/真实FFmpeg、实际Next/独立PostgreSQL/媒体Worker/账务核心API和真实React组件证据。**音频仍在验收中，尚未合main，不记完整模块交付；多轨尚未实施。** 服务器HOLD保持。

初始基线main 87695ea3b8f8fb07e5bc0b70f880dfa5dd0badf5，分支codex/canvas-audio-native-20261028，工作区E:/Workspace/naumi-canvas-audio-native-20261028。原始归档及SHA256保存在证据目录baseline.json；原包不改。开发期间主线新增data URL decoder修复，接续前普通整合，精确同步SHA/新基线归档另记git-checkpoint.json。

## 固定上游与原生设计

固定tigerowo/infinite-canvas@68b37db04b9083c3ff0af67ffe362f85d04d1f9f，10份原文件/字节哈希位于证据目录source-manifest.json及upstream/。

- canvas-client-page.tsx:3358起体现空音频复用节点、有内容时新增结果、来源连线、任务先建档及旧回执不覆盖新任务。
- audio skill区分独立音色样本、最终朗读和视频模型原生声音；正文与演绎说明分开，未完成结果不直接用于下游。
- services/api/audio.ts及音频设置组件体现真实能力选择→持久任务→真实音频存储/播放/引用，不借此复制上游账号、接口、任务表或配置字段。
- 上游该版本节点手册主要覆盖文本和视频，不虚称已具有目标中的音频剪辑器。
- Naumi已有正式音频上传/导入、私有媒体、播放器、source_audio有序引用及媒体job。原trim预设要求videoCodec，纯音频被拒绝；本模块在音频职责内构造现有ffmpeg job，不让普通用户填写命令/JSON，不新增处理队列。

## 模块与职责

- `audio/project.ts`拥有纯工程/编辑/预览增益/固定处理配方。`sourceArtworkId`为原始素材，`edit`为可保存草稿，`adopted`为明确采用的真实素材及配方快照，`render`仅关联原媒体job的operationId、baseRevision和本次编辑快照，不拥有任务调度或计费。
- `canvas/audio-node-*`拥有节点CAS/operation与共享项目/graph事务。`audio-project-validation`核真实音频、范围、完成job的冻结输入/配方/输出SHA；伪造剪辑说明或拿另一产物冒充会返回409。
- `audio-materials`读取真实已完成音频与scope。事务外进行原字节/真实解码，事务内通过媒体模块公开的`inspectedOwnedMediaTx`和`getMediaAssetTx`核已经解码的不可变媒体元数据、同事务真实素材及scope，不在持锁时另借连接或启动Worker。媒体job的只读证据也接受调用方tx，避免池耗尽/嵌套连接。
- `node-inputs.ts`组合原生绑定：音频节点的live alias `audio-node:<id>`在受理时变为其已采用的实际音频素材；角色/场景再统一展开并只编号一次。视频任务和制作链保留既有冻结/重放，后续音频草稿不改历史结果。
- `POST /api/canvas/audio-nodes/[id]/render`先保存本次编辑快照，再调用原媒体job。原请求重放先查已受理job；来源/节点后来删除仍返回原job，不重复预扣或处理。单纯拖线不会启动收费任务。
- `components/canvas/audio/`拥有卡片、编辑器、preview与hook。真实解码产生波形，Web Audio按同一纯规则预览；开始/结束、音量/淡入淡出、undo/redo、session草稿/冲突恢复、390px/英文/只读/焦点已实现。沿用原media报价并在主按钮显示，不加二次确认。
- CanvasClient只接创建/编辑、正式素材上传、连线/@、项目列表/深链/刷新、属性锁/改名/移动、混合复制删除与历史；job结果回原作品/画布。复制不克隆正在执行的处理；旧处理回执不覆盖另一次编辑。撤销采用结果不会重新触发自动采用。
- 菜单候选状态8项7可用、多轨1项置灰；该状态仍在任务分支，main尚未获得音频功能。配音/音色克隆没有真实Naumi全链能力证据，未凭上游模型名开放入口。

## 已取得的集中证据

证据根：E:/Workspace/naumi/output/canvas-audio-native-20261028。

| 命令/材料 | 实际范围与结果 |
|---|---|
| verify-audio-native.cjs BASELINE | PASS，原菜单禁用、音频模型/API不存在，角色/场景/视频/导演保留 |
| verify-audio-native.cjs MODIFIED | PASS，47组规则与真实FFmpeg。4秒原音频裁到2秒，中段增益0.500010，淡入窗口0.060986、淡出窗口0.040376，原文件SHA不变 |
| verify-audio-native-application.ts application-second | PASS/exit0，实际Next/独立PG/真实FFmpeg媒体Worker/私有媒体/账务；保存重放、跨账号404、无效范围不扣费、真实处理与SHA、配方伪造409、混合复制/反序恢复、音频→视频受理冻结、源/节点删除后处理及视频重放。1个模拟视频任务，真实付费0 |
| verify-audio-native-ui.cjs ui-third | PASS/exit0，真实组件/CSS/Chromium，实际解码180个峰值、播放启动、剪辑/音量/淡变、保存刷新/undo/redo、处理/取消回调、无效/冲突草稿保留、390px/只读英文/焦点，pageerror与外部请求均0；API由上项另验 |
| 相邻角色/场景/视频/导演规则、scoped history | 分别PASS，38组/39组/120种排列/30组/11组；导演旧测试把音频固定认作禁用，现按实际模型/菜单检查 |
| 菜单menu-third | PASS，8项7可用1禁用、精确回调、3视口、键盘/只读/视频门禁/工具栏 |
| tsc/typecheck-second.log | exit0；最终主线整合/验收后再集中核验 |

桌面与390px组件截图已逐张打开检查；不是整画布实际浏览器验收的替代。核心API与组件fixture分别报告，不宣称真实供应商语音质量、生产发布或容量完成。

本次核心API的媒体处理配置为0积分，实际媒体job cost=0；组件单独用3积分报价fixture验证主按钮显示，不表示线上媒体定价。非零媒体报价、取消退款及并发账务仍在下方待验收矩阵内，不以0积分通过替代。

## 保留的失败与修正

1. 首次真实FFmpeg幅度断言失败，发现输出-ss裁剪配合afade仍按原时间轴。现固定配方先`atrim`、`asetpts=PTS-STARTPTS`再增益/淡变，采样测量通过，原失败日志保留。
2. 首次核心API在已完成真实job后，测试驱动误用h.request的bytes字段；改用真实ArrayBuffer body，第二次通过，不改写首次exit1。
3. 首次组件fixture缺少浏览器构建环境定义导致process未定义；补齐fixture定义。下一次错误反馈暴露原始Zod JSON，产品现只显示必要的字段错误；最终无效/冲突草稿用例通过。
4. 初次tsc发现右键菜单变量ctxMenu拼写错误，已修，第二次exit0。
5. 旧菜单fixture缺少音频创建回调/仍把视频当最后可用项，按实际7项更新；最后实际键盘/位置/门禁用例通过。混合音频新增撤销的空项目判断也补上现有场景节点。

## 尚未完成与下一步

- 整画布实际浏览器：菜单创建→导入→保存刷新→处理→自动采用→私有结果/播放→真实handle与命名@→拖动/锁/复制/删除/undo/redo，不能只凭独立组件与API称完成。
- 真实媒体任务取消/退款、并发CAS、未知受理/重启恢复、过期结果不覆盖后编辑、失败混合历史整步回滚与企业scope的补充矩阵。
- 两阶段制作链冻结及音频/角色/场景混合引用、生成复用及相邻最终类型/lint集中核验。
- 已整合最新main后刷新完整四件套/独立副本回滚，再普通合入推送main。当前检查点四件套不冒充完整模块验收。功能迭代计数保持2；音频完整交付后到3，记录同步并归零。
- 音频完成后继续多轨，不缩小持续目标，不标goal complete。服务器HOLD保持；旧清理拒绝不重试、不绕过。

## 2026-10-28 整画布补充验收

- `native-ui-fifth` 实际 Next/独立 PostgreSQL/Chromium/真实 FFmpeg 媒体 Worker 全画布 PASS/exit0。菜单导入、180峰波形播放、裁剪/增益/淡变保存刷新、处理自动采用/私有SHA/跨账号404、过期回执不覆盖后编辑、拖动/锁定/复制/删除/undo/redo、真实handle/命名@/视频提交、两阶段制作链冻结后更改素材并删除节点和原请求重放全部通过。3个模拟视频create，真实付费0。
- 本轮发现真实缺陷：右键菜单入口判定漏了audioNode，菜单直接返回null。已补入音频节点识别，真实锁/复制/删除及历史复测通过。失败原日志`native-ui-fourth`保留。
- 前端实时音频引用预览改用当前已采用素材，不沿用旧保存URL；缺失、错误类型/角色和不可用引用明确失败。统一组合后再展开角色/场景并编号。更新规则为53组，真实FFmpeg采样通过。
- 新增非零计费/并发/响应丢失重启/原子历史/scope矩阵。首轮暴露fixture只改了价格、仍保留video.process计费disabled，报价按原规则返回0；现仅在隔离fixture中显式enabled，未改产品定价或计费开关。矩阵尚待重跑。
- 最终类型检查发现测试DOM元素的paused属性需明确HTMLMediaElement类型，已修正；最终集中类型/lint待执行。音频尚未合main，多轨未实施，持续目标保持active。
