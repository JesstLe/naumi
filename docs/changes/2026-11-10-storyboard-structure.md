# VV-08：粗剪结构差异与可控同步

基线：`ecae3495b79b8c01d9d615bdfadaf68442d98b2b`；任务分支`codex/storyboard-structure-20261110`。本记录随模块开发更新，不把计划写成验收。

## 模块与决策

结构同步属于方案应用用例；时间线继续拥有工程、媒体校验、CAS与导出冻结。方案与粗剪关联由storyboard owner持有。新增只读预览、明确选择的插镜／删镜／调序、位置策略和原操作回退；不新建编辑器或任务队列，不自动换片／生成／导出。

- 默认绝对位置保留。插入／移除不会自动挪动其他片段；显式选择移动才改变位置，碰撞时整次拒绝。
- 显式ripple策略按选中结构变化计算整体位置建议；未勾选移动的linked片段、独立声音和人工片段保持绝对位置。预览列出所有移动建议，选择授权后再应用，不隐藏推移。
- 原linked片段保留素材、裁剪、音量、淡变和转场；换片仍走原安全换片入口。独立配音／字幕分别可显式跟随，不沿剪切点复制对白。
- apply冻结预览摘要、方案／时间线revision、原工程与关联，在共享graph事务中同时提交时间线、关联和操作回执。CAS／冲突失败不部分写入。
- 原编号恢复返回已提交原回执，不重新读取新方案组装意图。恢复前工程以确切sourceOperationId和当前timelineRevision为准，后续人工改过工程时拒绝覆盖。
- 历史render/adopted保留确切原工程，更新不把旧结果当新版。

## 公共接口、依赖与原子边界

- 纯`structure.ts`持有选择schema、结构diff与位置建议：差异id为insert:nodeId／remove:clipId／move:clipId，容纳最大160字符节点身份加前缀。保留现有片段裁剪、音量、淡变、转场、采用素材；结构入口不兼做自动换片。
- `structure-service.ts`编排方案、真实采用take、关联粗剪及素材校验，不直接查询其他业务表。只读`structure-inspect`返回previewDigest／差异／移动建议／具体冲突，`structure`接收相同选择与digest原子应用，`structure-restore`按sourceOperationId恢复确切同步前快照。
- 位置策略preserve不跟随任何片段；显式选中的move仍移动到方案建议位置。ripple只根据本次选中的插／删／调序计算位置，不应用未选择结构变化；后续linked／人工／独立声音各片段和每句字幕分别通过followClipIds/followDialogueIds授权。保留原片段之间的间隙／裁剪，转场失效整次拒绝，不自动清零转场或缩短素材。
- 实际素材解码／检查在事务前完成。持既有video-node-graph锁后复核方案revision、时间线revision、关联、已检查素材身份／hash／时长及节点存在；`saveTimelineEditTx`由时间线owner继续校验权限、当前素材、对白原文、CAS和原回执。节点／关联读取支持同一PoolClient，不另开写事务。
- 时间线保存、方案关联更新和原结构操作result回执在同一个事务提交；事务fixture在关联更新处故意抛错，验证前面时间线更新和回执也全部回滚。相同operationId并发返回同一工程revision；不同内容编号冲突。
- 受理后再读原操作回执优先，不重新要求当前方案仍为旧revision。未知／401保留完整请求；恢复操作本身也幂等。若源同步之后人工改过工程或关联，恢复拒绝覆盖，不盲目恢复旧内容。对恢复操作再恢复可回到恢复前工程，保留真实修订链。
- render/adopted不参与结构替换；既有导出冻结工程、媒体job和账务保持。旧导出完成后采用时仍带原project，不变成新结构的成片。

## 网页、Agent与客户端

- 制作面板选择明确目标粗剪后显示结构操作。首次预览不默认勾选变化；选择变化／位置策略／具体移动片段后必须刷新预览，过期digest不应用。显示实际秒数、未移动的声音／人工片段、冲突和一次原子应用。
- 网页原完整操作在账号／空间／项目／方案隔离的localStorage中保存并做schema校验；重载／401沿原路径及请求恢复，不另建操作。最后一次结构回执提供“恢复上次同步前工程”。页面卸载中止预览，旧异步结果不显示到新方案。
- 三个薄Agent工具：`inspect_video_storyboard_structure`只读；`apply_video_storyboard_structure`／`restore_video_storyboard_structure`为非收费写操作。复用正式HTTP、feature权限、CLI/MCP网关与稳定业务operation_id，更新工具目录、读写分类、进度、路径白名单及MCP指引。
- 不新增预算、默认费用限制或重复报价确认，不生成模型／合成任务。已有安全换片与新建粗剪继续保留。

## 验证状态与证据

证据目录：`E:/Workspace/naumi-task-evidence/storyboard-structure-20261110/`。正式集中链路最终结果见`VERIFICATION.txt`及`application-proof/RESULT.json`；失败尝试也保留。

- 纯规则／Agent契约：`node --conditions=react-server --import tsx scripts/verify-storyboard-structure.ts`，26项；插镜、删镜、调序、部分选择、真实片段裁剪／声音保留、显式跟随、对白声音边界、转场、手工改源、短素材、最大节点身份及读写／路径分类。
- 实际React／Edge UI：`node scripts/verify-storyboard-structure-ui.cjs <out>`，8项；首次只读、绝对位置碰撞、显式跟随、390移动布局、断网已提交、重载401恢复及同步前工程恢复。HTTP受控，但结构proposal直接执行正式纯规则。
- 完整App／PG／Worker／存储／账务／CLI／MCP：133项通过。`node --conditions=react-server --import tsx scripts/verify-storyboard-application.ts <out>`。已有链路继续回归，新结构覆盖单次提交、并发、重启、真实客户端丢响应恢复、关联写故障事务回滚、人工剪辑／声音／字幕保留、选中删除留空隙、调序、来源保护、空间边界及缺素材。
- 实际旧导出先冻结并排队，在结构修改之后才执行；输出完整FFmpeg解码通过，采用仍关联旧工程，新工程和声音保持。结构操作新增视频任务0／媒体任务0，只有测试显式导出新增一个既有media job与一笔既有费用。
- 既有制作UI6项、费用UI9项、全量TypeScript及受影响文件lint集中验证。供应商视频响应受控；不是商业模型质量、真实供应报价或生产发布验收。

## 回退、主线与待办

保留原始hash、修改包、精确diff、完整验证记录与可执行副本回退脚本；基线／修改／回退副本逐项运行，修改源码快照保持改变。普通合并main后核对远端SHA与受测tree，清理本任务干净工作树／分支，保留共享checkout改动。无服务器部署，不增加发布计数，47 HOLD保持。

VV-08开发／本地跨入口按最终证据关闭。下一对象VV-01真实通道与质量试片，VV-02完整用户流程及获准发布验收；VV-05 P2辅助检查、VV-06真实TTS/ASR仍保留，持续目标不标完成。
