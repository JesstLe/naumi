# 图片生成中继续编辑与独立新任务（103 隔离验证）

## 用户决定与隔离

用户明确：上游已受理后原任务继续，用户反悔/编辑提示词不退原预扣；再次明确点击生成是一笔新任务、新报价和独立预扣。仅编辑不产生新任务。原有供应商失败/未交付结算政策不在本次变更中调整。

本次不实现前述讨论中的3秒撤销窗口，也不接供应商取消、不调用退款接口。仅标准图片生成 composer 支持后台生成中继续编辑；详情图、三视图、抠图/扩图等专用链路保留原门禁。

分支 `codex/model-mapping-103-20261029` 持续保留、只发布103，禁止反向main或间接带入47。分支超过48小时是用户指定长期实验隔离，不触发自动合并/删除。2026-11-02普通合入 `origin/main cc830f931a9c0d32810cd8d16764b71c54254fc8`，合并基线 `361997596579fbd00844d3bd04fd977361f14767`。四处冲突保留main新比例/参数回归和本分支103全实例活动采集，不回退主线修复。构建前再次fetch后，普通合入仅文档更新的main d97e989d，最终实现前基线e3bd8d22；产品基线字节不变。

## 模块与职责

- `GenerationSubmitAction`：提交阶段交互锁；有效持久回执后释放按钮。每次提交token只释放自己的锁，旧任务finally/迟到回调不解锁新提交。
- `canvas/background-generation`：明确用户动作的attempt identity与空白节点草稿复制。节点身份不是一次付费任务身份，失败恢复保留原attempt。
- `CanvasClient`：已有图普通生成每次分配独立operationKey，复用原client/plan/quote；后台观察仍属于原run。空白节点再次生成创建独立占位，旧完成只移除旧占位。
- `ImageNodeDraftStore` / `ImageReferenceDraftStore`：编辑草稿和临时引用仍按账号、工作区、项目、节点归属。复制引用保留key/role但重新持有preview URL；一边移除不撤销另一边的预览。空白节点完成把**最新编辑草稿**带到结果节点，而不是用冻结旧prompt回填；新画布转为实际结果项目时迁移到对应scope。

## 接口、状态与事务归属

`GenerationSubmitAction.onGenerate(onSubmitted)` 是前端提交回执通知，`allowBackground`只允许提前释放按钮；`generating`仍是明确阻断状态。调用方仅在标准图片链路传提交阶段状态，不全局解除其他工具busy。

`newCanvasImageAttempt(nodeId)` 只在用户点主生成按钮调用。原失败卡片仍闭包持有原operationKey、原输入；UNKNOWN/404仍查原ID。新生成不删除或重解释旧receipt。

没有改后端计费、报价、供应商适配、任务受理、lease、取消、数据库schema或配置。原选4K计价与实际2K发送的既有分工保持；新operation复用现有冻结报价、预占与一次结算。

已有图片沿用服务端版本CAS：同revision并发完成只有一个自动激活，其余结果保存在节点版本历史。**这是first-completion-wins，不宣称最后提交者必定自动激活。** 旧任务晚到不会覆盖已切换的版本；重放attachment不重新切图或收费。

## 集中验证（分层）

证据根 `output/canvas-background-generation-20261102/`。

1. 真实旧组件基线：取得提交回执后仍被完整生成Promise锁定，`CANVAS_BACKGROUND_SUBMIT=REPRODUCED CHECKS=2 ... EXIT=1`，预期反例。
2. 修改后真实组件事件：5组，双击、回执释放、旧finally/迟到ACK、原专用工具busy保持，exit0。
3. 完整imagegen client/recovery模块：9组，新旧ID、同内容新点击、同action并发一次POST、UNKNOWN/404只查原ID、多个receipt互不清理、scope/刷新、4K原价保持，exit0。HTTP为fixture，不冒充真实钱包。
4. 实际Canvas函数/完整draft helper：9组通过，两完成顺序、独立占位/草稿/引用、旧失败恢复与新购买分离、切项目迟到保护；额外核对null项目完成按真实作品groupId迁移草稿，不猜根ID。
5. 本机隔离PostgreSQL→真实plan→child→SDK→APIMart异步HTTP→2048²存储→钱包/账本：`--overlap` 两任务同时存在，原A12与新B8预占合计20，B先完成结算8、A后完成结算12，无编辑退款、原ID恢复新增POST0。56检查通过，外部供应商0。
6. 原节点版本真实PG16项、原client恢复、fanout完整client7项、单次质量映射63检查/17场景均通过。版本PG覆盖并发只一个激活、两结果保留、跨账号/项目拒绝、迟到回执和原始媒体不改。
7. 完整本地Next/React Flow：现图A/B两种完成顺序、空白独立占位和最新草稿、刷新两原ID恢复，4场景5检查通过；最终null项目增量另外2检查通过，主图真实complete/naturalWidth非零。真实浏览器但业务API/media为隔离fixture，不等于真实供应商验收。
8. 原fanout动作15项通过；其AST harness补齐新helper及原receipt helper依赖，原断言不放宽。第一次缺newCanvasImageAttempt、第二次缺AbortController的fixture失败日志保留。
9. 103后继识别：64 Python单元通过、默认前任选择块与原AST等价。仅显式direct103Predecessor的103分支启用，读取固定9文件及真实备份hash、逐实例身份；历史partial/null保持，不宣称旧事务完整排空或制造ACK。

## 真实失败与修正

- `billing-overlap-r1.log`：测试脚本在Windows多行补丁因CRLF未命中，出现`ReferenceError: supplierTaskId is not defined`；修正fixture换行后r2通过，未改产品账务。
- UI首轮恢复按钮被打开的composer遮挡；保留原截图/ERROR，按真实用户关闭composer后检查原任务，定向与全量通过，没有用force点击掩盖布局观察。
- Next dev自动重写tsconfig include/格式，仅本地测试生成；交付恢复本轮开始的Git原字节，不提交该生成变化。

## 103 实际状态与后继门禁

只读采样2026-11-02 09:41:47北京：103已是main cc830f93/build1793582472、同Web/Worker image b78f4fc7…，不是本分支10月29旧版本。根canonical255/BASELINED，最新direct事务release103-pixel-size-20261102=COMPLETE；两锁当时无人持有、约38.95GiB可用。

原mapping发布器只认历史siteControl前任，未识别最新direct103事务；按真实oldCommit会阻断，禁止伪填旧commit或覆盖active指针。后继适配须显式绑定原direct最终证据、实际实例和CAS；前任历史partial排空不能被升级为完整证明，新事务仍独立做任务保护和蓝绿验收。

本段是只读样本，不是锁预约或本次上线结论。程序构建/部署、真实付费端测、四产物副本回滚和最终SHA分别在收尾更新；不得把上述fixture通过写成103新功能已上线。


## 最终103真实交付（2026-11-02）

- 固定源码8868df04956add2062055a3a65a9737c6d3cc2e9/build1793584643，91页Linux构建、37静态资源网络隔离smoke通过。同Web/Worker image9a8a96931d161f6f7f615b58ff820ab4e98ffdde41e04dd7896e65dc950a069c。
- 双锁完整事务release103-mapping-background-20261102-r1于北京时间10:16:37 phase COMPLETE；新Web9d6d9920/13108、新Workerfd3a4935，旧pixel-size pair已排空停止restart=no。原配置/任务保护通过，旧页跨切流真实保存200、新页准确读回；历史partial证据保留。
- 真实前台生成两张1024×1024 PNG，A操作5937723c-83d4-4fd6-b412-eaddfbfe2b2d（APIB sunburst）、B操作fe2295e0-9123-4bd7-beb6-821de225d539（APIB flare）；各UI/冻结报价/预扣结算6积分，合12积分，两账本消费行，无编辑退款，最终预占0。供应商reported合0.021608USD，不当最终账户账单。
- B点击前A应用回执仍queued；两条供应商生成时间实际重叠。此证明后台任务并行，不冒称B点击时A供应商已受理。原实际提示词分别冻结，第三份未提交草稿保留，刷新新增POST0。
- 私有只读PG账务sidecar最初把supplier_calls.state期待为succeeded而实际completed，首断言失败保留；按真实schema修正验收断言后两任务逐ID核对通过，不改生产记录。
- 17文件独立副本真Bash回滚恢复9原hash/删除8新增；恢复旧按钮全程busy及旧node receipt复用行为，正式文件保持修改。later-edit hash不符时零写。
- 最终证据output/canvas-background-generation-20261102/FINAL_ACCEPTANCE.json、real103-r1、real-accounting/verified.summary.json、proof/四件；程序、配置、UI、供应商和钱包证据分层。用户后续提出dock遮挡像素标签，为独立增量，不再新增本模块收费测试。
