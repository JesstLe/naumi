# 原生多轨：工程与媒体配方切片

## 当前状态与基线

持续目标为角色→场景→音频→多轨。音频已普通合入并推送main `815603cb0fe5496473d0854fc87b4c38b1d6d3f8`，49路径完整源码包与独立副本回滚通过。其完整本地证据与main回执保存在 `E:/Workspace/naumi/output/canvas-audio-native-20261028`；服务器未发布。

本切片从该main建立 `codex/canvas-multitrack-native-20261028`，工作区 `E:/Workspace/naumi-canvas-multitrack-native-20261028`。原包SHA256 `dd0e40c9200fb7516cd450131137dbfca41ff61991bb318d5c5b7e2dfcf34527`，原包、固定上游源码及哈希保存在 `E:/Workspace/naumi/output/canvas-multitrack-native-20261028`。

**本切片只有纯轨道工程、同源预览计划与真实FFmpeg媒体配方，尚无多轨节点持久化/API/编辑器/媒体job实际受理。菜单继续禁用，未将多轨完整模块标为完成，也未合入main。** 不把实际FFmpeg命令通过说成真实App/DB/Worker/账务闭环。

## 固定上游与调查结论

- 固定 `HBAI-Ltd/Toonflow-app@ae9e5f1ac4f37713b902fed7fa5ca87819b324ae`，重新读取 `audioNode/src/audioProcessing.ts`、`audioClipEditor.vue`、ffmpeg browser/types/catalog 和服务端 execute/cancel；7份实际文件字节与SHA见source-manifest.json。尝试的videoNode/src/index.ts在该树不存在，清楚保留missing记录，不冒充已读取。
- audioProcessing先ffprobe确认音轨和时长，分段执行atrim/asetpts，再concat，生成新文件并复核输出，取消由AbortSignal传入command.kill。上游明确不覆盖原素材；片段开始/结束来自用户选择。
- 固定树packages/nodes只有audio/audioGeneration/director3d/image/imageGeneration/text/video/videoGeneration，没有独立多轨节点；全文检索amix/acrossfade/xfade只找到音频分段concat，没有找到完整多轨工程或混音转场编辑器。README的“时间轴”文字不是实现证据。
- 固定 `tigerowo/infinite-canvas@68b37db04b9083c3ff0af67ffe362f85d04d1f9f` 的track/timeline检索未发现完整多轨编辑器，Timeline命中是版本说明组件。现有视频节点/制作链不等于多轨剪辑。
- 因而吸收其“先核原媒体→按片段范围处理→输出新文件→复核→取消”成熟流程，多轨工程交互按Naumi自己的画布另行实现；不声称移植了上游不存在的成品。

## 模块与职责

- `src/lib/timeline/project.ts`：只拥有版本1工程、轨道/片段身份、源内裁剪、时间线位置、音量/淡变、转场、静音和同源预览计划。计划输入是经过所属媒体模块核验的实际素材摘要，不接受供应商/数据库/浏览器URL，也不读写任何外部状态。
- `src/lib/timeline/render.ts`：只把同一计划编译为既有 `MediaJobRequest` 的固定虚拟文件FFmpeg配方。沿原mediaJobRequestSchema和nativeMediaArgs约束，不建立新队列、账号、计费或存储。
- 片段保存真实artworkId；从音频节点添加时应解析明确采用的真实素材并冻结该片段，不随源节点后续草稿自动改写。此处只是后续应用边界约定，尚未接线。

## 已实现的语义与公共接口

`newTimelineProject()` → `timelineProjectSchema` → `planTimeline(project, inspectedSources)`；预览调用 `sampleTimeline(plan,time)` 和 `timelineClipGain`；导出调用 `timelineMediaRequest(project,sources,operationId,projectKey)`。

- 工程包含输出宽高/帧率/底色/主音量；轨道按数组顺序由下到上合成。片段有稳定身份、实际素材、时间线位置、源内入点/时长、音量和淡入淡出。素材和轨道类型、重复身份、缺失源及越界裁剪明确失败。
- 画面轨道的相邻片段允许指定时长的重叠溶解；重叠必须恰好等于转场时长，同轨不允许三片段叠加。图片支持固定时长与独立叠加轨道。素材缩放保持比例并按工程底色补边。
- 视频转场的进入透明度与音频交叉淡变共享同一计划。音频叠加使用各片段×轨道×主音量与淡变，混音不按输入数自动平均。视频原声可关闭。
- 时间线空区为底色和静音，不重复上一片段末帧；片段结束采用右开区间。静音轨道不进入导出输入，但仍决定已保存时间线长度。重复引用同一实际素材只登记一次输入。
- 固定配方使用现有虚拟asset与output路径；应用层以后仍须独立核实际归属/字节/解码和冻结输入，客户端摘要不构成受理证据。

## 集中验证与证据层级

`node scripts/verify-timeline-native.cjs MODIFIED . E:/Workspace/naumi/output/canvas-multitrack-native-20261028/core-final-second`：74组PASS，exit0。真实本机FFmpeg，经现有nativeMediaArgs生成实际命令：红/蓝视频溶解、图片叠加、双音轨混音、视频原声交叉淡变、全静音、空区黑场、同一源重复剪辑均生成并实际采样。3.5秒320×180成片，红/蓝转场帧RGB约(101,0,153)，图片叠加约(1,253,1)；音频增益/静音/源哈希见result.json。原素材全程未改。

首轮本机FFmpeg9.0.1已经移除filter_complex_script选项，后改用跨版本的固定内联filter_complex；沿现有MediaJobRequest单参数16384字符与总参数512的技术界限，超界明确失败，不另加业务额度或绕过引擎。大工程过滤图的兼容文件载入方案后续结合实际Worker版本再实现。第一次黑场断言忽略了有损YUV转换的3级偏差，实际RGB(2,0,3)，改为容许4级而非放宽成“有输出即成功”，原失败日志保留。

这些是纯规则/真实本机FFmpeg证据，不是浏览器真实预览、App鉴权/持久化、Worker任务恢复/取消退款或线上容量验收。菜单仍是8项7可用、多轨1禁用。集中类型/lint及四件套/独立源码回滚结果见VERIFICATION.txt，不以未执行步骤填PASS。

## 数据、状态与事务归属

工程纯模块不拥有数据表或账务。后续画布节点服务拥有revision/operation/project及共享graph/history事务；现有媒体模块拥有真实输入检查、异步job和输出素材；原计费模块拥有冻结报价、预留和幂等结算。预览与导出读取同一版本工程和已核源摘要，变化不得改写已经受理的导出快照。

## 未完成项与下一步

1. 多轨节点CAS/工程保存与刷新恢复，接共享项目/graph/复制删除/原子撤销；仅复用现有模块，不建第二套队列。
2. Naumi浅色原生编辑器：素材入轨、片段位置/裁剪、音量/淡变、相邻溶解、轨道静音、时间尺与画布预览；主要操作使用文字，无口号与字段堆砌。
3. 服务端从真实归属素材解码构造计划，保存导出意图后调用原媒体job；冻结配方与输入，不被后来改工程/删源/未知ACK重放改写；输出回原作品/画布。
4. 完整模块后集中验证：实际GUI预览与成片采样一致、权限/企业scope、非零积分、取消/退款、并发CAS、失联/重启恢复、混合历史、私有结果与结果回画布；之后才启用菜单并普通合入推送main。

多轨当前为当日开发检查点，未增加完整功能模块计数（音频3次后已整合主线归零）。持续目标active；服务器HOLD；不重试旧清理拒绝，也不将清理审计作为业务开发。

## 接续提示

```text
先读CANVAS_CAPABILITY_ADAPTATION.md、本文件及音频git-delivery.json。
音频已合main815603cb；多轨纯工程/预览计划/真实FFmpeg74组通过，菜单尚禁用。
继续在独立多轨工作区，先做节点持久化+原项目/graph/history，再做原生浅色轨道编辑器与既有媒体job导出闭环。
不要把纯FFmpeg输出、播放器时间轴、上游README或检查点push写成完整多轨已完成。
保留共享脏文件、历史付费任务、未知受理和服务器HOLD；不要另造任务/计费/账号体系。
```
