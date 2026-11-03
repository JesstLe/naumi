# 重构主线 owner 整合：多 agent 汇合记录

## 固定输入与工作区

- 重构输入 `64ff0b81a90827a9ba9beb2a8874d8e482e2053f`；原 Core / Verify 已实际成功，但不是本轮 merge 的 CI。
- 本轮先整合 main `c4b1e2670ea2aebbd056fbf012f2c2ba0a93c513`，共同祖先后 319 个路径、14 个冲突文件。后续 main 刷新及普通合并以 `output/refactor-main-owner-sync-20261103/` 的 Git 回执为准。
- 唯一集群整合工作树 `E:/Workspace/naumi-refactor-main-owner-sync-20261103`；共享旧开发树的原分支、索引及逐文件 raw 哈希已在开始前固定，不覆盖其工作。
- 原 R9V restore 反例及上一轮四产物保留。本轮 64ff 基线**已经包含** restore-context 修复；回滚 64ff 不代表恢复更旧的 restore 草稿误推进。

## 并行分工与汇合原则

1. Canvas agent：图像、后台独立 attempt、提示词引用、scene、像素/Dock/缩放，统一进入已有 application/controller/presentation owner。
2. Assistant/navigation agent：prepared storyboard、原项目 document 保存、分享深链当前文档就绪。
3. Server agent：工具回执与计费、冻结 model identity、copy 同事务、视频协议/成片/恢复、管理发布并发。
4. 协作 UI agent：按实际 native HTTP 合同修正旧 fixture，保留所有原业务断言与时限。
5. 独立语义 reviewer：只读复核回执/UNKNOWN/锁、UI/context、视频 helper 依赖；两处真实反例及源 hash 已保存，微修由主集成执行。
6. 主集成：ModelEditor/session 新能力、协作 context 叶子、正式 catalogue、全树类型/图谱、Git 与四产物。

没有把巨型主线组件整个覆盖回去，也没有把仅按文件位置失败的 AST fixture 误称为产品缺陷。测试沿实际 import/call owner 执行，原输入、输出、并发、费用与超时断言保留；fixture 修订有独立失败记录及真实合同引用。

## 职责与事务归属

- 图像新 Generate 是新 attempt，原任务核对仍沿原 receipt；持久 ACK 仅释放自己的提交锁。空白节点 fork 不复制付费任务，完成后迁移 live draft，目的节点已有编辑优先。
- `image-creation → image-runs → image-task-controller` 保持提交/轮询/原结果 attachment 生命周期；`generation-presentation` 只保存视图状态，scene owner 决定显示投影。
- prepared storyboard 进入 assistant-session；不带普通聊天 skill/图片引用，保留用户未发送草稿和原 submission 身份；实际本轮 video nodes 成功后才投影面板。
- 分享项目导航等待当前账号/workspace 实际文档完成读取，绑定 revision / navigation 实例；已受理文本仍由原 document/task owner 保存，跨项目不丢答案，账号/workspace ABA 不串写。
- inline image prompt copy 仍和 native copy 在同一 PG transaction；detached 与原 singleArtwork 合同兼容，提示词 inputs、坐标与无连边保持。
- 工具已保存作品、失败回执、scope 证明与账务终态保持同一 owner；UNKNOWN 不转失败、不重复提交。冻结报价后的 public model 不在执行时再次按画幅选别名。
- 视频新协议依赖 wire helpers/contracts，不反向依赖 selector；成片复用、assembly、terminal evidence repair 与原 Worker 调度语义并存。媒体 concat 使用实际视频流时长，保留有/无音频组合。
- 协作 context 是窄消费 port，provider 仍构造唯一 client 并拥有账号生命周期；entrySnapshot 窄订阅不变。provider/window/panels 不再互相循环。

## 管理发布：实证失败与修复

- 完整 64ff 原测试 `verify-model-management.ts:63`：applied 回执重读期望 200、实际 409，exit 1。原回执现在校验 immutable actor marker（含原 id / canonical body），不从已推进 private draft revision 重建 StageInput；connect discovery 保持。
- 同 id 首写 pool5/8并发：旧阻塞 PG 锁耗尽池，10 秒 watchdog exit 124，activation 0。改为原 namespace 的 try-lock，失败立即还连接后等待，成功 session 仍持原锁。
- 不同 id 首写同样复现池耗尽。仅管理 mutation 的 pool-keyed permit 收敛该用例编排，不序列化 GET/applied 回执或其他 DB 业务、不增池；repo 的原全局 pending/CAS 仍权威。
- 新正式 PG 回归：同 id 8 applied / 1 activation / 1 version；不同 id 1 applied / 7 CAS 拒绝 / 1 activation；独立进程原锁持有期间业务 pool 可查询，释放后单 activation。
- queue timeout、abort、PG lock timeout 都保留原 ID；专用 `PUBLICATION_LOCK_PENDING` 明确 `operationNotStaged:false`，包含既有 UNKNOWN 与 pricing。原 repository 的已证实未 staging 合同不改。
- 独立 reviewer 实证 applied CONNECT 二次快照读取异常会越过 async catch。两处 `return await publicationResponse` 微修后，正式 PG 验证 JSON503、未 staging 证明为 false、原 applied 回执保持；恢复读后 200、activation 不增。

## 已执行的分层验证

- Assistant/navigation：新 17 case / 95 check；原 assistant 15/55、text 19/88、navigation30，均 exit 0。
- Canvas：19 条集中命令全部 exit 0，产品 owner 执行前后 hash 保持；详见 Canvas 模块文档和 `canvas-agent/CANVAS_BATCH.json`。包含真实 React/DOM、图像 controller、scene、overlay、viewport、原回执和新 attempt。
- Server：21 命令阶段全 PASS，431 产品 / 40 测试输入同 hash；其后管理等待身份精修的 5 条定向命令全 PASS，阶段源身份分别记录，未把旧 hash PASS 重标为最终微修。
- Native PG / signed-cookie / routes：collaboration integration10、review fixes、canvas-sharing review12、native分享23，供应商 0。
- 协作 UI：实际 React19 / local HTTP / headless browser29项通过，非真实 backend；ModelEditor static15、management session25、video upgrade UI7通过。
- Reviewer：UNKNOWN 独立窄复验通过；CONNECT 新反例已修并独立复验；四个视频协议非 import AST 与整合输入 4/4 一致。不是整体 R04 语义验收完成声明。

各 agent 的 module / final microfix 命令、字面 stdout/stderr、退出码、输入 hash 与未跑项分别保留在同一 output 子目录；全树类型、原 catalogue、图谱、固定 source 构建与副本回滚由主集成汇合后执行，结果以最终 `VERIFICATION.txt` / `DELIVERY.json` 为准。

## 退出边界

整体 **ACTIVE**。main 同步进重构分支不等于整条重构合入 main，不自动部署，不解除本线程 47 HOLD。

R04 整体语义退出、同 case 页面矩阵、当前完整 core / 固定 Web+Worker / 运行及性能证据仍按实际执行闭合。此前分支超过48小时的未整合原因仍保留，不以 SCC0、模块通过或 Git merge 冒充整体完成。
