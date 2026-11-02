# 分镜制作完整流程

## 模块与职责
- 基线 `2e79509754542ce620e22be62e24721d6ae47487`；独立 `codex/storyboard-flow-20261102`，工作树 `E:/Workspace/naumi-storyboard-flow-20261102`。
- 本轮代码、集中测试、普通合 main；47 HOLD继续，不修改线上模型目录，不使用103实验线。
- 复用文字/视频正式节点、Agent工具、持久workflow与媒体job，不建立第二套生成任务。

## 已实现的完整切片
1. 文字Dock拆镜，Agent保存正式分镜与原文；制作面板编辑节点、排序、选择复用或新生成、仅生成或生成并合成。
2. 原生结构化分镜独立v4协议，仅文档明确支持的Kling通道；旧v2/v3协议和定义字节保持。
3. 工作流`assembly.nodeIds`记录完整成片顺序；媒体合成状态/报价随run持久化，与各镜状态分离。
4. `reuseCompleted`仅显式选择真实已有视频结果，验证归属/字节并冻结。复用节点不再次报价生成；新镜仍经原冻结/幂等/账务。
5. 新`workflow-assembly`编排只通过media-jobs公开接口提交/查询/取消；本地媒体operation由run+attempt确定，断网/未知保留原编号。重试必须证实原media job失败/取消，expectedAttempt防重复提交，只新建媒体处理，不重做视频。
6. concat混有声无声时补静音，短音补齐、长音截断到真实视频时长；原素材保持。详见audio子模块记录。

## 公共接口、依赖与数据归属
- POST `/api/canvas/video-workflows`: 原id/projectKey/nodes接口；新增nodes[].reuseCompleted与assembly:{nodeIds}。
- GET run返回assembly:{status,attempt,jobId,outputs,error}；POST action=retry-assembly,expectedAttempt，仅已知失败允许新尝试。
- workflow owns plan/reuse/assembly intent and state; media owns validated inputs, media job, processing, outputs and settlement. Agent/UI never query these tables directly.
- 各镜报价沿旧冻结记录，成片video.process报价在受理前冻结；Agent总预算包含成片，不修改旧账单或历史配置。
- 恢复扫描包括只剩assembly的run；前序未完成不得合成；整体progress与创作记录包含成片阶段。

## 集中验证与未完成项
- 原生协议与真实FFmpeg子模块已完成局部测试，主任务仍需整体types、UI、App/PG/Worker/存储/账务/失败恢复验收，不能将源码存在当上线。
- 完整验收以总证据 `E:/Workspace/naumi/output/storyboard-flow-20261102/VERIFICATION.txt` 为准；实现阶段不提前标完成。
- 真实供应商收费调用与创意质量不在本轮本地fixture验收之内；生产发布仍暂停。

## 独立复审修正与最终验收
- 复用素材仅登记input/reuse，不冒充本次新产物；新增workflow-outcome公共纯规则，写入与只读证据恢复共用输出选择。个人素材作为企业输入后不被改成企业output。
- 创作列表与详情的live状态SQL加入assembly阶段；旧未迁移schema经to_jsonb读取仍兼容，不再提前显示成功。
- assembly状态持久化同时标记证据欠账；补证据时先锁run，再读取阶段与清标志，避免新状态欠账被旧写入清掉。终态pending单独限量扫描只补记录，不再提交视频/媒体任务；只读回溯包含最终成片、排除复用素材。
- 真实隔离PG验证10项：复用归属不变、7种assembly状态/筛选、真实SQL投影失败、只读成片恢复、终态债务清除，新增视频任务0。
- 完整App最终8项通过：真实Agent工具存稿/3镜、视频Worker/自动12秒成片、原run重启恢复与幂等、局部重做1镜、全复用重排、真实媒体故障仅重试合成、取消、原生multi_shot；真实PG/存储/账务，5次供应模拟创建，真实收费供应调用0。
- UI真实组件11项（1366/390）、原生协议158项、真实FFmpeg27项、assembly规则14项、workflow契约12项、升级2型号4字段全部通过。
- TypeScript全量exit0；定向lint exit0，旧canvas-client/settings-dialog hooks dependency warnings保持，新模块无warnings。
- 来源、首次测试装配失败、最终命令/输出/退出码、整任务hash与副本回退在总证据目录保存。

## 交付边界
- 这是代码、受控供应响应下的完整本地App验收，不把真实LLM的创作判断、真实供应商的分镜遵循度或画质称为已验收。
- 分镜/成片入口使用Naumi已有浅色Dock与节点，不照抄外部UI。单个原生多镜头直接产视频，多节点assembly才执行concat。
- 旧配置升级走“更新视频能力”预览，人工差异保留；没有修改生产配置，47不发布。
- 最终main合并SHA、远端包含证明及临时资源清理状态以 `GIT_RECEIPT.json` / `VERIFICATION.txt` 为准。
