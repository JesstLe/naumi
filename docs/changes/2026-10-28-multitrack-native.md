# 原生多轨完整模块

## 当前状态、基线与交付入口

角色→场景→音频→多轨按完整原生切片推进。音频已交付 main `815603cb0fe5496473d0854fc87b4c38b1d6d3f8`；多轨由该基线建立独立工作区 `E:/Workspace/naumi-canvas-multitrack-native-20261028`、分支 `codex/canvas-multitrack-native-20261028`。共享管理工作区的原有修改保持。

原始源码 `ORIGINAL.zip` SHA256 为 `dd0e40c9200fb7516cd450131137dbfca41ff61991bb318d5c5b7e2dfcf34527`。证据根目录为 `E:/Workspace/naumi/output/canvas-multitrack-native-20261028`。根目录旧四件套仅代表 `c8b36fde` 的6路径纯核心检查点；完整源码/补丁/回滚及精确命令另存 **`delivery-final/`**，不覆盖旧证据。

**完整本地模块验收已通过**：持久化/CAS、原生画布与浅色编辑器、真实预览/FFmpeg异步导出、非零账务/取消/失败/并发/重启、结果采用与视频制作链冻结均取得证据。菜单为8项全部可用。最终源码合入/远端SHA以证据根目录 `git-delivery.json` 为准；本地验收不等于上线。本目标保持服务器HOLD，不连接、不发布服务器，不调用真实付费供应商，不声称验证了10万活跃用户容量。

主线同步：先整合 `e68fbd2b9b83eeadab163d835a71826b7e11a9bf`，整合头为 `e6b1c6d1e06e44a2fb7b1a9e7f2999280b203c56`；最终开工刷新 main 为 `4345de529e7ca46b29207f93dbb85034044affd1`，其中 `73352ed7` 已合入纯核心。最终提交、合并前刷新和远端SHA另行登记，不以旧检查点代替完整交付。

## 固定上游与流程取舍

- 固定 `HBAI-Ltd/Toonflow-app@ae9e5f1ac4f37713b902fed7fa5ca87819b324ae`，实际读取audioProcessing、audioClipEditor、FFmpeg browser/types/catalog和execute/cancel；7份文件字节与SHA见 `source-manifest.json`。尝试的videoNode/src/index.ts在该树不存在，保留missing记录。
- 上游先ffprobe确认真实时长/音轨，再按片段atrim/asetpts/concat，生成新文件、复核输出，取消用AbortSignal终止command；不覆盖原素材。
- 该固定树没有独立多轨节点；全文amix/acrossfade/xfade未找到完整多轨编辑器。固定 `tigerowo/infinite-canvas@68b37db04b9083c3ff0af67ffe362f85d04d1f9f` 的Timeline命中为版本说明，不是剪辑实现。
- 因而学习“核真实素材→范围处理→新产物→复核→取消”的成熟流程，按Naumi原生节点/连线/@/项目和媒体任务实现多轨；不声称移植了上游不存在的成品，不嵌入整页或另造账号、存储、任务队列。

## 模块职责、公共接口与归属

- `lib/timeline/project.ts`、`edit.ts`：只拥有版本1工程、稳定轨道/片段身份、源内范围/时间线位置/音量/淡变/溶解/静音及编辑规则。`planTimeline`、`sampleTimeline`和双端裁剪均为纯函数，不依赖React/DB/供应商；真实素材摘要由调用者传入。
- `lib/timeline/render.ts`：把同一计划编译为既有 `MediaJobRequest` 固定虚拟文件配方，不拥有执行、账务或存储。
- `canvas/timeline-node-*`、`timeline-materials`、`timeline-project-validation`：拥有节点revision/operation/草稿/采用与冻结意图，以及真实归属/解码/配方/输入输出SHA核验；媒体job、产物和账务仍归既有模块。
- `/api/canvas/timeline-nodes/**`：列表/单节点/materials/render/adopt的协议、鉴权、作用域和响应映射，薄入口调用节点服务。
- `components/canvas/timeline/**`：节点hook、浅色编辑器、真实预览和卡片；临时草稿属于编辑器，服务端工程与回执为持久事实。
- `timeline/canvas`、`canvas/timeline-references`：`timeline-node:<id>` live alias及预览/服务端受理解析。`clip.canvasSourceId`只保留静态原画布来源连线，不是执行绑定；受理时冻结已采用真实视频。

依赖为入口→应用服务→纯计划/媒体接口。现有媒体模块负责报价/预留/异步受理/Worker/取消/恢复/产物与结算，不拆共享事务。真实媒体I/O在事务前；graph/history事务内只核已真实检验的媒体元数据，不另借连接。

## 原生操作与关键语义

1. 添加多轨节点，导入真实图片/视频/音频，或从现有素材/原生音频等handle接入；保存、纯多轨项目深链和刷新正常。
2. 拖动片段位置、拖两端裁剪或键盘逐帧调整，源内不越界，图片可延长。支持增删/移动片段与轨道、轨道增益/静音、主音量、原声开关、音频淡变和相邻画面溶解。
3. 画面按工程数组由下到上合成；相邻溶解的重叠必须等于指定时长，不允许同轨三片段重叠。混音不按输入数平均。空区是底色/静音，不延长前片段末帧；静音轨道仍决定工程时长。
4. Video/Image通过Canvas真实解码，音频使用实际媒体和GainNode；每层先离屏补边再单次alpha合成。管理媒体跨源跳转使用anonymous CORS。预览与导出读取同一计划。
5. 导出前保存冻结意图（工程、真实素材key/SHA、固定配方），再调用原媒体job；render不在公共写schema中。原受理重放先查原意图/job，不因后来删源/改工程/换报价重新扣费。
6. 完成后明确“采用结果”，不自动覆盖后来草稿；采用核原意图/job配方/输入key和SHA/输出SHA。成片回原画布，handle和命名@可继续引用；服务端重读真实已采用素材，不信任客户端URL。
7. 复制映射当前/采用工程与真实素材身份，不复制进行中render；复制/删除/属性/锁/项目删除/原子混合撤销重做沿原graph/history。
8. 编辑器支持undo/redo、session草稿、冲突保留和显式载入最新、停止导出/下载；390px片段音量/轨道可滚动访问，英文只读与关闭后焦点回还已验收。

## 集中验证与证据层级

| 证据目录/记录 | 实际结果 |
|---|---|
| `core-trim-final` | 108组PASS；裁剪边界/live alias/旧URL不可信；真实FFmpeg红蓝溶解/图片叠加/双音轨/全静音/空区/重复源；源SHA不变 |
| `application-first` | 实际Next/隔离PG/媒体Worker：保存重放/权限/CAS、拒伪造render、冻结后改草稿和报价、3秒私有输出/SHA、伪造配方409、原价3结算、7取消释放、混合失败原子回滚、复制映射/反序恢复/删源后replay/foreign tenant404；供应商create0 |
| `matrix-second` | 服务端受理后真实客户端abort ACK，App+媒体Worker重启仍一个job/一笔7；并发200/409一笔7；1920×1080/300秒真实处理进度>.1秒后取消，7预留全释/临时目录消失；真实编码器失败全释；制作链后换采用成片并删多轨仍冻结原素材/replay不增调用；媒体总14、预留0，2个模拟视频create、真实付费0 |
| `native-ui-color-second` | 实际整画布Chromium/Next/PG/Worker：菜单/纯项目刷新/私有红视频+绿图+660Hz导入、双端裁剪undo、音频handle/来源边、真实预览导出、丢ACK且job列表离线刷新重试同operation/job、不自动采用/后来草稿保留、显式采用undo/redo、成片handle/@生成视频、删除后replay、拖动/锁/复制删除撤销；3积分一笔，1个模拟视频create、真实付费0 |
| `ui-complete-final` | 真实React/CSS/Chromium与媒体解码/GainNode，双端/逐帧裁剪、undo干净清缓存、冲突/刷新保留、导入/保存/取消回调、390px片段音量/轨道可达、英文只读焦点；API回调是fixture，与真实应用证据分开 |
| `worker-retirement-final` | 9个真实Worker进程、51断言；取消终态在PATCH前可读、重启可结算、晚POST防重、ACK后退休释放、真实60秒collector。引擎hold为fixture，不冒充Linux原生sandbox验收 |
| 相邻模块 | 音频53/角色38/场景39/导演30/视频120、作用域历史12、原位生成、结果位置5、冻结报价138组1208断言、auto quote7、scope receipt23、8项菜单全可用；实际独立PG图片版本16与durable receipt/部分失败/账务保留均通过 |

整画布预览/成片RGB：0.8秒 `(254,0,0)/(253,0,0)`；1.8秒溶解 `(101,152,0)/(101,153,0)`；2.8秒 `(0,254,0)/(1,254,0)`。真实GainNode为原声1、配乐.25、未进入片段0。三份导入源SHA不变。桌面/390px/英文只读截图已打开检查。最终类型/lint、完整包正向应用/独立副本回滚的精确命令、输入、原样输出与exit见 `delivery-final/VERIFICATION.txt`。

## 实际发现与修复，失败记录保留

- `matrix-first`发现运行中取消立即写退休标记，Worker误作App结算ACK而丢终态，轮询503。现在 `acknowledged:false` 只阻止晚POST，不隐藏/驱逐终态；PATCH结算后才确认退休。旧回执和共享scratch兼容保持。matrix-second及Worker回归通过。
- 拖动pointerup更新undo引用但按钮未重绘，增加历史版本state；真实拖动/撤销按钮通过。
- `native-ui-color-final`发现undo回已保存工程时旧session草稿未清，重开恢复旧工程/CAS冲突。干净状态现清缓存，只保留真实未保存草稿；后续整画布通过。
- 已有render意图但job列表未读到时，旧判断把两个undefined当作“已采用”，重开重试会分配新operation。现在未确认失败/取消/已采用就复用意图；真实丢ACK+列表离线重开验证同job、无新扣款。
- scope receipt相邻脚本旧mock缺新增诊断/图片版本/历史隔离import，原始基线和候选都11过12失败。只补测试依赖，禁止receipt fixture进入诊断执行，明确无重生成target，复用真实关闭的历史guard和查询mock；现23过，产品权限/回执逻辑未改。
- 早期本机FFmpeg9移除filter_complex_script，改固定内联配方，沿现有16384字符技术边界；黑场YUV实际3级偏差以明确4级阈值验收。异步poll过早读clips[1]、焦点fixture移除原触发元素的驱动错误及原失败也独立保留。

## 回滚、交付和接续

完整四件套在delivery-final，保留原包与历史。仅在另一份原始源码+正向补丁副本执行hash-guarded回滚；不回灌DB/媒体、不重放已受理任务、不覆盖后来编辑。MODIFIED_FILE和开发候选保持修改。最终主线与合理资源收尾见git-delivery.json/cleanup.json；模块计数从音频3次同步后的0增加到多轨1。

本地完整功能不扩展为真实付费供应商内容质量、线上发布或生产容量结论。旧导演/音频目录的删除拒绝和残余沿旧记录保留，不重试、不换方式绕过，不以清理审计替代业务开发。

```text
接续先读本文件、CANVAS_CAPABILITY_ADAPTATION.md、本轮git-delivery.json和delivery-final/VERIFICATION.txt。
角色/场景/音频交付保持；多轨完整本地API、整画布、真实媒体/账务和恢复矩阵已通过。
主线是否合入以远端SHA回执为准，不把根目录旧6路径包当完整交付。
继续学成熟流程用Naumi原生逻辑实现；保持共享修改、冻结受理和服务器HOLD。
```
