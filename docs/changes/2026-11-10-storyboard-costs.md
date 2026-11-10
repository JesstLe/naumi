# VV-07：方案跨阶段费用与返工影响

基线：`e5fb315feed32d2a6f51abc27c2ea3677f62dd5c`。任务分支：`codex/storyboard-costs-20261110`。承接[顺序执行台账](../prd/2026-11-10-canvas-video-execution.md)第五项。

## 模块与职责

- 方案模块编排只读成本报告与修改影响，不新增账本、费用写入、购买、结算、预算或自动重做状态。
- 计费owner的`readTaskCostEvidence`投影实际操作、当前owned reservation、消费账本和确切退款回执；不公开供应商采购价、冻结tariff、凭据、利润或原始调用。
- 视频owner的`readVideoCostHistory`读取全部相关制作链及历史任务，媒体owner的`readMediaCostHistory`读取确切operation／结果素材对应任务；不复用默认30／50条的分页列表冒充全量汇总。
- 时间线owner投影关联粗剪的全部保存／导出回执及素材身份。历史导出和工作流各assembly attempt分别保留，更新或重试不让旧费用消失。
- UI与Agent共用`POST /api/canvas/storyboards/costs`和`inspect_video_storyboard_costs`；CLI/MCP通过原正式网关调用，不另写库。

## 归属与账务语义

1. 普通制作链此前没有持久方案身份。现由正式画布编译器校验方案／revision后填入`VideoWorkflowPlan.storyboard:{id,revision}`；通用工作流入口拒绝客户端自报。历史`reviewOrigin.planId`仍支持精确归属。原操作恢复优先读取已受理意图，不因新增字段重新提交旧任务。
2. 四种归属分别显示：`plan`本方案确切任务；`shared-node`同节点其他／旧任务（未归属本方案）；`inherited`独立版本精确继承take；`referenced-media`关联粗剪或声音中复用的已处理素材。后三者不加到本方案已花费，也不作为本轮新增购买。
3. 预扣以`app_gen_reservations`实际仍持有数额为准，不使用可能已过时的operation.reserved_credits。已结算净额须与真实consume减确切refund一致；API-cost退款实际写为`grant`，读取确切`led-api-refund-{reviewId}`及review匹配，不按kind名称猜退款。
4. 退款与释放分别计数：释放为冻结reserve减原始debited，不把后续refund再当一次释放。失败可零费用，也可按冻结政策收费；状态不是退款凭证。
5. 缺操作／账本、待核查／hold、净额不一致均保留未知。正常reserved不当已结算；明确released的零费用才是已知零。旧确切消费账本可提供legacy已知金额，缺失证据不按任务cost或当前报价补值。
6. BYOC仅在服务端实际保存的zero-policy且无账务占用时确认平台零积分；外部算力费用仍未知。导入声音没有供应采购回执时单独标未知；真实TTS/ASR尚未接入，不伪造声音生成费用。
7. 汇总在截断明细前完成，明细上限500并显式返回`detailCount/detailsTruncated`；总额与未知计数不受显示上限影响。报告附归属缺口、缺失候选任务、可用输入digest基线、未形成任务回执的阶段／导出意图。
8. 本轮generation/assembly报价仍来自现有正式预检与冻结规则，报价不锁价。`executionCeiling`说明现有执行报价，不新增预算；显式Agent令牌预算沿旧流程。没有新增默认限额或重复确认。

## 返工影响与网页

- 当前节点config/inputs摘要与对应方案revision的已冻结摘要比较；可显式指定`compareRevision`读取确切历史方案快照。历史缺摘要保持缺口，不捏造旧输入。
- 新生成选择、节点输入和连续性改变影响本镜；采用变化会影响真实依赖本镜的后续生成。传播只沿video输入nodeId，不沿镜序或画布坐标；改变剪辑入点／时长只影响剪辑。
- 报告保留明确generate/reuse/unselected，不自动改采用版、勾选生成、移动粗剪或提交任务。结构和声音编排变化独立报告。
- 制作准备增加浅色费用面板；分别展示已结算已知小计、预扣、退款、释放、失败／取消、结算中及未知，展示本轮报价和任务明细。方案／选择／比较版本变化标过期；切换账号／空间／项目／方案时中止旧请求并清空显示，失败保留旧报告而不是替换成零。
- 与原制作检查一致，网页显式查询先保存当前方案；成本接口及Agent工具本身只读，不保存方案、不创建模型／媒体任务、不改变账务或采用。

## 验证与证据

证据根：`E:/Workspace/naumi-task-evidence/storyboard-costs-20261110/`。集中验证见`VERIFICATION.txt`与各RESULT.json，命令及字面输出由实际运行结果封存。

| 层级 | 验证 |
| --- | --- |
| 纯规则／契约 | `node --conditions=react-server --import tsx scripts/verify-storyboard-costs.ts`：17项；去重、预扣／退款／释放、未知、失败、BYOC、真实依赖而非叙事顺序、采用／剪辑影响、只读工具及路径边界 |
| 实际React／Edge | `node scripts/verify-storyboard-costs-ui.cjs <out>`：9项；显式查询、准确分栏、选择过期、比较版本、明细截断、503保留、异步方案切换、1440附近桌面与390移动布局 |
| 实际App／PG／Worker／存储／账务／CLI／MCP | `node --conditions=react-server --import tsx scripts/verify-storyboard-application.ts <out>`：113项通过。沿现有完整链路核验；只读令牌零预算费用查询、单镜返工真实净额、继承复用不再次收费、跨账号／工作空间、历史修订、拒绝伪造归属、实际账务核对；事务fixture覆盖hold／released／退款grant／缺证据；55制作链与505任务验证全量汇总及明细截断 |
| 原制作UI回归 | `node scripts/verify-storyboard-production-ui.cjs <out>`：6项，真实视频／声音预演、原粗剪恢复／换片和移动布局 |
| 静态 | 完整TypeScript与受影响文件lint，实际命令／退出码封存 |

退款／故障矩阵是隔离PG中明示构造的证据行；不冒充真实商业供应商退款。完整链路中的供应商视频响应仍受控，实际App／Worker／媒体处理／账务与客户端均真实运行。真实商业模型调用0，不将本地通过写成供应商质量或生产验收。

## 回退与整合

- 任务文件普通合并main并推送后，以`GIT_RECEIPT.json`核验固定SHA／tree／远端包含关系；共享checkout和103模型映射独立线不动。本切片不部署，不增加发布计数，47 HOLD保持。
- 保留原始字节hash、`MODIFIED_FILE.zip`、`DIFF_FILE.patch`、`VERIFICATION.txt`及可执行`ROLLBACK.sh`；独立副本演练回退恢复基线缺此费用模块的行为，modified源码快照保持改变。
- 新增`storyboard`只是既有plan JSON的服务端可选字段，无DB业务迁移；旧无此字段制作链继续走原恢复及执行。回退仅处理源码副本，不回灌账务／媒体、不重放任务。

## 未完成项与下一步

VV-07开发与本地跨入口验收按上述结果关闭。真实供应商费用与成片质量、完整生产体验分别归VV-01／02；VV-06真实配音／转写和VV-05 P2辅助检查仍未关闭。下一顺序对象VV-08：粗剪插镜／删镜／调序的差异预览、位置策略、选择性应用及回执恢复。
