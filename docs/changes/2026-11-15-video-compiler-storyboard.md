# 视频编译架构：Storyboard实际编辑、审片、独立版本与成片

## 模块与职责

基线main `418a1420318757a56e552faa342be685c8c113af`，独立分支 `codex/video-compiler-storyboard-acceptance-20261115`。本模块补齐RFC A08/A10/A12/A17的真实分镜操作与确认按钮，不把已有Workflow采用生成的局部检查等同完整界面通过。

## 调研与已确认缺陷

1. `storyboardIntent`要求复用节点有`lastResultId`。但独立分叉按设计保留正式方案中的已采用take，同时新节点没有伪造的lastTask/lastResult。服务端`storyboardAdoptedResult`已经按保存方案版本、take真实归属和冻结来源校验，前端的另一次节点结果判断反而拒绝合法采用版本。实际函数基线退出1，错误“镜头还没有可复用结果”。
2. 真实浏览器完成拆镜、合镜、生成和17积分确认后，点“编辑新方案”回到了原节点的新单镜方案，而不是刚执行的两镜方案。DB保留正确方案，界面却新建另一方案；原始五项通过及失败日志保留。原因是重新挂载时仅按最初节点ID挑方案，拆合后的节点身份已改变。

## 公共接口、依赖方向、状态归属

- `storyboardIntent(..., context?)`统一接收并验证正式StoryboardContext；正式请求携带该上下文，不伪造节点结果。普通无方案复用仍执行已有节点结果检查。最终采用素材的所有权、项目、方案版本和冻结take由原服务端校验，客户端不取得额外执行许可。
- Panel编辑当前制作记录时传递`run.plan.storyboard.id`，Editor/`useStoryboardPlan`按明确方案ID恢复。失去正式方案时明确报错，不偷偷回退到别的节点方案；未完成pending保存仍保持原身份以便恢复。
- 方案owner继续负责CAS/operation receipt、采用和审片数据；视频模块继续负责冻结、依赖、任务及结算；媒体模块继续负责拼接结果。没有新增跨域写表或另建计费规则。

## 实现与验证

新增交互fixture桥接与真实浏览器驱动：`video-compiler-storyboard-session.ts`、`video-compiler-storyboard-browser.cjs`。初始仅通过真实HTTP创建两个空视频节点；后续通过实际上传以外的原生分镜控件编辑/保存/拆镜/合镜/生成/确认/选片/批注/采用/分叉/成片/返工，不拦截响应、不注入React状态。观察读取DB和正式查询API，控制独立Worker；欠授权1→17显式作为隔离历史检查点seed，不伪称新固定报价自然涨价。

共享预览两次返回“The browser is not producing screenshot frames”，其标签已关闭，按工具规则改用本机受控Edge；仍使用同一真实Next/PG/独立Worker。首次函数基线及第一轮浏览器中途发现的编辑上下文错误完整保留；修复后续跑审片/采用/独立版本合成/仅一镜返工4项通过，原始方案不变、fork节点不伪造lastResult。

最终文件包在独立副本从头完整重跑；其结果、源码哈希、命令/输入/逐字输出/exit和真实回滚以 `E:/Workspace/naumi/output/video-compiler-storyboard-20261115/VERIFICATION.txt` 为准，不以分段运行冒充一轮完整通过。

最终副本 `copy-runtime/run-b6622552-d032-4037-8f50-79cd983c919d` 已通过完整10项分镜UI与底座14＋预算10＋Agent6＋远程协议10＋Workflow13＋BYOC8，共71项，两个进程命令均退出0。Storyboard新增3个生成任务/51 fixture积分、复用成片不新增视频生成；完整组合22笔364 fixture积分、21次托管JSON创建、25次成片下载，13子进程退出/schema及连接池清理。该fixture成片报价为0，不据此宣称产品合成统一免费。

十项实际UI包括编辑加入、拆镜、合镜、连续性/预演/预算零生成、欠授权1后正确确认17、审片意见/时间码/采用、clean节点独立分叉、陈旧方案版本409零副作用、采用成片真实播放时长、只返工一镜且来源冻结。最终页面错误0、HTTP替换0、React状态注入0；当前制作记录返回编辑保留正式方案，原始方案逐字不变。完整tsc、核心137、采用意图12、独立版规则12、Workflow合同12、App138通过。

开放基线问题单独保留：旧`verify-storyboard-independent-ui.cjs`在原始418a1420及修改版均在首个方案输入控件等待30秒超时，未计为通过。完整副本前两次初始化画布曾等待60/180秒、出现account请求abort及作品读取失败，后续真实API读取和暖路由重开才完成完整10项；没有通过延长等待就宣称修复，也没有归因为已证实的缓存/供应商问题。冷初始化的根因及旧受控UI脚本继续核查。初期桥接解析、错误观测字段和中止运行的清理回执保留，不混写为产品缺陷；一次旧驱动无abort时仅终止本任务PID树并验证唯一fixture项目/节点后清理schema，后续驱动提供显式abort并由原finally回收。

## 未完成项与下一步

本模块当前使用development Next、本地供应商和独立生产Worker bundle；不冒称生产镜像浏览器或真实付费上游。高级音频/辅助模型审片、原稿分镜Agent创作质量、全部生产绑定、combined supervisor活动中断、v2/v3混合版本、双槽排空回滚、有授权的付费上游及目标站发布继续独立验收。47 HOLD、103实验分支隔离保持。目标ACTIVE，生产写入/付费调用/部署均0。
