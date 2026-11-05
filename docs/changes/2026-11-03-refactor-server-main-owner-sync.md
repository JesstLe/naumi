# 主线整合：模型管理、同步回执与视频媒体 owner

## 本轮对象与职责

- 工作树：`E:/Workspace/naumi-refactor-main-owner-sync-20261103`。
- 整合源：refactor `64ff0b81a90827a9ba9beb2a8874d8e482e2053f`，main `c4b1e2670ea2aebbd056fbf012f2c2ba0a93c513`。
- 模型管理 HTTP 负责鉴权、原始输入身份和发布编排；不可变 publication、草稿与 CAS 仍归 model-config repository/runtime。
- 同步工具回执保留 typed synchronous-operation owner，HTTP adapter 不退回主线大函数。
- 新视频工作流、提示词、协议模块直接依赖实际 pool、repository、schema、creation-scope、object-storage owner；业务规则与原事务边界不挪回兼容 facade。

## 已实现

### 模型管理已应用回执

已应用回执不再用已经推进的 private draft revision 重建 StageInput。服务读取原版本的 actor 标记，核对认证 actor、operation id 与 canonical 原输入 hash；修改输入或外来 actor 仍为 `409 OPERATION_CONFLICT`。connect 继续走原 discovery 响应投影。

只读 applied 回执在获取管理写锁前完成，以避免重复回执读取占用全部连接。正式回归覆盖 9 次回执读取、单次 activation、输入冲突、外来 actor 和 connect discovery。

### 管理发布连接饥饿

本轮真实 PostgreSQL16/pool5 实证了两条问题：

1. 同新 operation id 的 8 个首次请求，阻塞 advisory-lock 等待者占满 5 条业务连接，10 秒 watchdog `exit124`，`idle=0 waiting=4 activations=0`。
2. 仅修同 id 为 try-lock 后，8 个不同 id 仍各持外层连接再请求 repository 连接，`exit124 idle=0 waiting=8 activations=0`。

当前实现只在管理 mutation 编排增加实际 pool-keyed 的窄 permit，同进程各 handler/Next module bundle 共享；不串行化 GET、applied receipt 或全数据库。permit 等待支持默认 30 秒上限和 request abort，异常/超时删除等待项。跨进程仍保留原 `admin-mvp:<operation id>` PostgreSQL session advisory-lock namespace，通过 try-lock 失败立即释放连接后重试；不扩 pool。repository 的全局 pending publication/CAS 保持。

正式 `scripts/verify-model-management-concurrency.ts` 覆盖：

- pool5，同 id 首写 8 并发、两个独立 handler：8 applied、1 activation、1 version、原 full draft 不变；
- pool5，不同 id 首写 8 并发：1 applied、7 CAS 拒绝、1 activation；
- 独立子进程持原 PostgreSQL 锁，期间管理请求不 activation、业务连接可用，释放后原 id 发布且只 activation 一次；
- queue timeout、queue abort、独立 PG session 锁超时均拒绝且不新增版本，下一发布成功。

### 主线功能适配

- 同步计费 owner 修正 `getUser` 到 accounts/session。保留 compact 原 artwork pointer、失败回执、frozen quote/scope/provenance 校验以及 UNKNOWN 不重放。
- 上传兼容旧 headers map 与冻结 `{headers,request}` transport；实际路由保持原始字节与 operation id。
- copy 节点继续使用原共享事务与 typed copy contract；主线 detached copy 与 refactor singleArtwork copy 都把提示词引用保留为显式 inputs。真实 PG 回归新增 singleArtwork x72/y94、无连边、引用不丢失。
- 视频协议只将 selector `wire` 导入改为明确 helper/contracts，以消除新增 SCC；非 import 可执行语句逐条与历史快照比较。

## 集中验证与证据

完整命令、输入、字面 stdout/stderr 与 exit：
`output/refactor-main-owner-sync-20261103/server-agent/COMMANDS.json`。

管理基线完整源码从父封存 tar 还原，5,424 文件 hash 逐一核对；实际 `verify-model-management.ts` 在旧回执读取失败 `409 !== 200 / exit1`。首次并发前后的独立证据分别为 `FIRST_WRITE_BASELINE.json`、`DISTINCT_FIRST_BASELINE.json` 与对应 MODIFIED 记录。旧 timeout、fixture 失配和可重跑性失败保留，不覆盖成 PASS。

服务集中验证含：模型管理/发布/执行、restore-context36、工具原报价16、工具回执43、上传 client14/server17、实际提示词 routes+PG+copy/share25、assembly14、终态证据10、native158、multimodal379、materialization16、真实FFmpeg音轨27、实际PG媒体metadata38、签名媒体689，以及真实App/PG/Worker/存储/计费 storyboard E2E8。paid supplier calls 为0。

`verify-storyboard-creation-evidence.ts` 原先使用固定 actor/public schema，重复运行会因已有团队409。当前每次创建随机专用schema并在finally drop/close，正式套件连续执行两次验收可重跑性；原失败保留。

最终产品/测试输入分开原始 SHA256，并记录集中执行前后是否同 hash：`server-agent/FINAL_SOURCE_INPUTS.json`。fixture PASS、实际本机App/PG/Worker PASS 与 main 合入/CI/部署分别记账。

## 待父集成完成

- 父集成负责全树 lint/typecheck/正式注册、冲突index、Git提交推送、整体四产物和副本回滚；本模块不单独操作Git。
- 全项目退出、main合入与部署状态由父集成最终证据确定。本模块不声明整条重构完成，不进行站点发布或供应商收费调用。
- 本轮 rollback 基线已包含先前 restore-context 修复；不得把回滚描述为恢复旧 restore 草稿误推进缺陷。
