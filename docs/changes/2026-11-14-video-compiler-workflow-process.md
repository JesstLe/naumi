# 视频编译器：工作流真实独立进程验收

## 模块与职责

本轮基线 main `276a94e14c351f3a13996e405b759256578a3d0a`。目标是补齐RFC A10/A12/A14的实际Next listener、独立应用Worker、媒体Worker与PG证据，不以直接调用工作流service/Route/编译函数代替进程链路。复用现有调度器、编译器、冻结上下文与计费事务，不另建执行平台。

## 公共接口、依赖与归属

`scripts/verify-video-compiler-process.ts --projected-worker-env --workflow-process` 可选启用 `video-compiler-workflow-process.ts`。父harness拥有进程、隔离PG、供应商HTTP与配置fixture；子验证模块只通过真实HTTP执行应用动作，并通过只读DB及受信冻结reader观察结果。fixture配置发布、售价变更、供应商完成状态和Worker重启是显式故障注入；不替换组件、接口或工作流调度函数。

产品职责保持：Canvas/Storyboard拥有节点与正式方案；Video Workflow拥有依赖槽、冻结阶段与操作身份；独立Worker恢复和推进任务；媒体与资产验证真实产物；账务拥有预占/结算；creation owner维护根与阶段回执。

## 本次实现与迁移状态

新增实际HTTP验收：Canvas两阶段DAG、原生Workflow变量/依赖、Canvas批次、Storyboard明确采用旧片且只生成新镜头、受理前取消、未知受理重启不重放、已知拒绝阻断下游、前序成片真实时长约束。

接受工作流后发布新型号/路径与价格、编辑源文字，再由独立Worker执行，核对仍使用冻结原型号/参数/文本/价格；前序未完成时无伪造MIME/时长/最终wire计划，完成后下游消费真实资产。源码实测通过13项工作流检查，覆盖8个run。最终独立解包副本同样通过，并串联原工作台/画布回归。

## 已确认的Worker配置投影缺陷

扩展实际BYOC端点验收时发现 `scripts/direct-worker-settings.mjs` 没有传递已有配置 `USER_IMAGE_PROVIDER_ALLOW_PRIVATE_NETWORK`。Web显式允许本机/NAS端点，但生产模式独立应用Worker丢失该设置，会在恢复冻结端点时拒绝其地址。组合Worker环境基线测试 actual=undefined、expected=true，exit1。原有“未设置/显式false拒绝私网”语义须保留；只传播已配置值，不默认打开，不传播给native媒体子进程。

真实基线已复现：Web受理v3并保留回执，Worker重启后任务仍queued，上传0、/prompt0；原tick为UNKNOWN且paused=true，driver exit1。修复后8项BYOC实测通过：无需端点保存工作流、缺端点准确诊断、预览零任务/凭据/端点I/O、接受与预览摘要一致、修改库和停用端点后回执保持、生产白名单Worker恢复原密钥/原DAG且真实字节上传、成片/私有历史/零积分、取消后显式retryOf单次新执行、正式Canvas BYOC工作流。3次真实上传hash均核对，3个生成均独立Worker完成，consume账本新增0。

产品修改仅增加该既有变量到应用scanner白名单；true/false原样传播，未配置保持缺省，native媒体子进程不获得该值。没有修改默认私网策略、地址校验、租约、UNKNOWN、回滚或计费规则。

## 验证命令、结果及证据层级

证据目录：`E:/Workspace/naumi/output/video-compiler-workflow-process-20261114`。源码运行 `run-fc6b955a-cab4-468d-87ad-05f10b5cdaf7` 通过14项原进程检查＋13项Workflow＋8项BYOC，exit0；真实独立应用Worker/媒体Worker/Next/PG，没有直调工作流或编译执行函数。最终fixture消耗账本11笔177（原41＋工作流136），BYOC新增0；托管供应商POST14＋Comfy POST3，下载14。8个自有子进程实际退出、随机schema已删除。Core137、App138、Worker44集中回归通过，TypeScript通过。

原始失败日志保留：两次driver OrderedInput.value缺失/空值被正确拒绝422，随后按真实schema提供非空展示值，未放松产品schema；BYOC原环境确实停在queued并使scanner UNKNOWN。本轮源码包/patch/VERIFICATION/可执行ROLLBACK及独立副本回退按7个任务路径封装，以最终固定包回执为准。

独立解包副本 `copy-runtime/run-bd5ebced-e3f4-4cce-8d26-9bdd8a5bc808` 以 `--projected-worker-env --browser --canvas-browser --workflow-process --byoc-process` 完成14进程＋4工作台＋10Canvas＋13Workflow＋8BYOC，共49项，exit0。全组合结果13笔consume/211个fixture积分（原41＋Canvas34＋Workflow136），BYOC0；托管POST16＋Comfy POST3，下载16。两浏览器已关闭，8个子进程有退出回执，随机schema删除。源码与包文件hash一致。

## 未完成项与下一步

全目标ACTIVE。实际BYOC端点ComfyUI进程链已覆盖；RunningHub/AutoDL的实际独立进程及全协议在用配置、Agent实际入口、A06上传提及等价、固定生产构建和Linux混合版本/蓝绿、授权付费上游仍须继续。生产配置修改0、真实付费0、部署0；47 HOLD保留。
