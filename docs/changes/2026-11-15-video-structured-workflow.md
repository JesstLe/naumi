# Workflow 结构化未来素材：显式元素目标与版本化执行

## 模块与职责

本片属于video Workflow编排/冻结模块。既有Input Resolver/Profile继续拥有素材归属、真实解码与最终编译；版本配置、报价、预占、账务、资产和租约仍使用原模块与事务。新增纯 `workflow-element-bindings.ts` 仅拥有依赖槽身份、分组目标与物化位置，不读取数据库、模型能力、供应商或隐式全局状态。

## 已复现缺口与实现

固定旧包a554b6a0/当前main720a37dc的真实HTTP复现：一个包含明确前序video依赖、目标元素分组尚为空的合法创作意图返回422/INVALID_VIDEO_WORKFLOW，原结构只允许静态refs，mediaBindings没有元素目标。不能把未产生的视频冒充已存在artwork，更不能先发任务再补身份。

- `mediaBindings.elementId` 是可选显式目标；旧flat依赖未改变ID/默认值/顺序，新目标必须唯一、存在且role=element，不能与静态素材或普通输入槽重复。BYOC DAG继续使用原输入槽协议，不把模型元素语义强塞进DAG。
- 只有Workflow请求允许暂时空的元素refs；plan验证要求至少一个静态或已声明未来成员。普通生成/Canvas节点schema仍要求具体素材，不放宽它们。
- freeze阶段以私有identity-only草稿把slot纳入目标分组，再由原prepareDeferredVideoInputs移除待完成ID。没有MIME、SHA、字节、尺寸或时长伪造；原持久plan不写临时artwork引用。
- 前序完成后原dependencyReference核对实际结果种类/索引/归属，将回执只加入该元素组；不同时追加ordinary refs。最终编译仍一次，静态文字/素材、绑定和政策继续逐项核对冻结值。
- 未来回执核验同时查flat和group refs；原根创建/父子资产/报价/任务/账务事务保持。没有第二执行器或旁路HTTP调用。

## 历史与回滚

新元素目标改变持久工作流语义，不能让旧reader误读：只有含elementId的run写execution_version=2，原flat run保持1，历史保持0；现有列继续扩展使用，无删表/回写历史。当前reader拒绝未支持版本及缺加密快照的新格式。

`videoRuntimeFormats`声明workflow0/1/2；固定Worker manifest/export/bundle哈希继续绑定该声明。原发布回滚守卫扩展对version2的完整plan/profile读取闭包检查；旧只支持0/1的包拒绝version2，不能因旧任务已完成就把不兼容包当作回滚候选。源码副本回退不是运行态回退许可；存在version2记录时保留当前兼容执行器，不能回灌数据库或重放UNKNOWN。

## 集中验证与证据层级

新增纯规则19项：目标/用途/身份冲突、空组、BYOC边界、旧ID逐字一致、旧flat no-op、draft不变、只生成identity、物化不重复、持久版本与reader描述一致。

`verify-video-compiler-process.ts --structured-workflow` 的真实鉴权HTTP/独立Worker/native媒体增量覆盖：

1. static镜头文字＋图片/音频元素＋普通future video，受理后改型号/配方/文字/价格、暂停与重启，仍按原冻结值执行。
2. future video只进入显式元素组，历史恢复保留分组；受理时仅静态事实与future slot，最终plan2。
3. 显式历史欠授权fixture（child授权1/实际17）经原确认接口暂停、无child任务/扣费、重启和确认后仅执行一次，不重放parent。不是“当前正常固定价自然涨价”的证据。
4. 实际前序一秒成片超过发布的0.25秒上限，parent成功、child阻断且零task；取消时零stage任务。
5. UNKNOWN/已知上游拒绝均不产生dependent；UNKNOWN跨重启不重发、不扣费；未知组/错误role/重复slot在受理前零增量。

最终开发态完成14基础+16结构化检查、七run、七个新增成功任务119 fixture积分；全程13次本地供应商POST/10次下载，UNKNOWN跨重启零重发。真实App/PG/媒体回归93项通过（26 POST/20 poll/20 download），核心137、Workflow Profile30、Runtime Formats25、readiness15及完整tsc通过；新固定生产包/副本的实际检查数、原始回执与集中回归以 `E:/Workspace/naumi/output/video-structured-workflow-20261115/VERIFICATION.txt` 为准。原核心137、Workflow Profile30、Runtime Formats25、readiness15、真实结构/Workflow/历史App回归、16项软件格式/23项旧协议守卫与完整tsc分别记录，未通过项保留原失败。

## 未完成项

实际目标站启用绑定/环境迁移、全部高级协议组合、付费上游、浏览器连续性与整站lifecycle/蓝绿仍开放。本片本地供应商/固定程序验收不冒称真实供应商成功。总目标ACTIVE、47 HOLD；生产写入/站点操作/付费/部署0。四产物保存720a37dc基线与本片路径SHA，副本代码回退与旧包运行态兼容分别验收。
