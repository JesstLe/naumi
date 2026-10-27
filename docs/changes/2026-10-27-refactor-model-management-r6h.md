# R6H：模型管理编辑器、目录与发布生命周期

基线 `70c50b2243a1789e0666a5f6d0786eccdc708203`，4507 原文件逐字节 hash 与完整归档保存在 `output/refactor-r6h-20261027/`。独立工作区 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。本轮开工 fetch 成功，origin/main 仍为已整合的 `cde64c6aedd75c5197ee2ae17e7bac8759fb8bed`，同步后第 2 模块。

## 实施记录

- 原 444 行、约 80KB 的模型管理入口同时持有目录发现、发布恢复、12 类编辑弹窗与草稿。
- 主页面保留列表/过滤/操作组合；单一带类型 editor 状态替代多个互不约束的弹窗布尔值，注册返回路径显式携带原切换来源或通道草稿。
- `use-model-management` 只负责生效快照、目录读取和原发布 operation 生命周期；编辑器字段不进入该 owner，不增加第二个配置 store。
- 积分、展示/工具范围、质量/尺寸、供应商来源/注册、通道、视频弹窗各归具体职责文件。原字段校验、展示与 payload 保留；共用原 Dialog、ChannelPolicyEditor、VideoCapabilityEditor、ImagegenRoutesEditor。
- 凭据原 helper 迁至 `model-config/credentials` 并保留原出口同函数 re-export，模型管理不再为加密而导入整个 ProviderEditor。原 RSA 算法正文不变。接口/服务器配置/数据库不修改。保留旧 pending key、原 id/expectedVersion/expectedBillingVersion、UNKNOWN 只按原 operation 核对、凭据 RSA、元数据来源和已受理任务冻结语义。不给用户增加确认或业务限额。

- 目录请求归 `useProviderDirectory`；主会话用读序号隔离晚到快照，发布后的读取不再被旧 loadingGuard 吞掉；卸载后的旧发布响应不清理原 pending、不触发新 GET，已发出的 POST 不取消、不重放。

## 集中验收计划

完整模块落盘后一次集中运行完整源码 baseline/modified 实际 React A/B：原各类对话框 HTML、提交 payload、目录去重、未知发布跨刷新恢复及注册返回草稿。复用现有 management/价格/参数 PG suite；全项目类型、相邻管理设置 static、原 runner 绑定同固定源码。未运行的检查不写为通过。

## 交付状态

实现和模块集中验收已完成，固定同SHA core、四产物和Git封存进行中。最终四产物、独立副本回滚行为、精确命令/字面输出/退出码、提交与远端观察以本轮 `VERIFICATION.txt`、`DELIVERY.json` 为准。整体重构 active；供应商元数据库独立大面板、测试资产归属、依赖与长时混合负载、最终完整版本整合继续。当前不合回 main，不部署。

## 已观察的集中结果

- 完整旧树 33 检查、新版 53 检查，18 组实际 React HTML 精确相同、实际客户端原 POST 请求体精确相同；12 类编辑器、注册返回通道草稿、原 expectedBillingVersion、RSA4096/长 UTF8 凭据解密、目录重复点击单请求、明确 failed/not-staged、网络失败仅保留原 operation、刷新后只在显式核对时使用相同 body 均通过。auth/Next link/API 响应明确 fixture，不能代替真实 Next 或线上验收。
- 旧刷新未完成时发布后读取被 loadingGuard 吞掉，旧响应返回后显示旧快照：完整基线 STALE、新版 FRESH。旧视图卸载后发布响应清 pending 并发新 GET：基线 LOST、新版 RETAINED/GET=0；原 POST 仍按原操作发出一次，不取消、不换编号重提。
- 既有真实隔离 PG 管理/积分/质量/分辨率/工具范围五组通过，原 CAS/历史同编号回执、管理员草稿和原任务冻结/钱包保留。原质量脚本完整基线与新版均被同一 stale-draft-base 拦住；只修每个独立 Flow 变体使用当前版本的新 actor 草稿，不改生产约束，修正夹具两侧通过。
- 两个历史结构 verifier 改为读取真实编辑器 owner，并继续逐函数/调度/payload 对照；页面/发布生命周期是明确变更，用实际 React A/B 另验，不再要求巨文件字符串位置不动。现有 core runner 增模型管理 static 入口，static 不冒充浏览器/PG。
- 全项目 tsc exit0；目标和相邻模型管理目录 lint exit0，只有未修改供应商资料大面板的两条原 ref-cleanup warning，新增文件零warning。原 emitted 静态/全字面导入 SCC 均0。后续封版同SHA结果另列。

## 原失败原样保留

首个 tsc 缺迁移后 Search import 已修；首个浏览器基线反例验证后旧页面版本故意过时，下一独立用例未刷新，造成 fixture CAS 失败，已独立重载。扩展故障样本时直接 destroy socket 被 Chromium 传输层同编号重试掩盖；现采用真实服务端完成后丢弃浏览器响应的明确 fault，保留失败日志。基线首个 tsx CLI --tsconfig 调用准备失败后改为已用 Node --import tsx。上述失败没有改写为PASS。

## 固定源码验收

被测固定实现 `1bd07c79b7f9b7a3e0e45b66784e482b8e417718`，core 文件摘要 `f1a45fbcd36f117bbb308295c3c02329b19f065a0c32c02c1859a0f2a554425f`：28/28 PASS，failed=0、not-run=0、exit0。新增模型管理 static 14 检查仅为真实目标编译与纯编辑器转换，不冒充浏览器、API 或 PG。固定源码浏览器仍为 53 检查/18 精确 HTML/20 原 POST 对照，tsc 与仅本轮 TS 文件 lint 均空输出 exit0。

结构检查：入口 444→64 行、80,790→9,219 字节，页面 state hooks 24→4；17 个原顶层 helper/编辑器函数正文原字节保持，原 credential 与 ProviderEditor 两函数正文保持。1,476 个原后端/路由/服务文件字节精确不变；emitted 静态/全导入环均0。实际目标浏览器 bundle 不再引入 ProviderEditor。

自有 PG 容器已按 task label/回环端口核对，其他连接0、随机用户schema0后停止并删除，自有端口关闭；没有操作其他容器。浏览器、loopback和各suite连接均已关闭。

随后仅更新文档，最终 commit 与上述实现 SHA 分开登记，产品/服务/验证脚本字节须在最终封存逐一确认。独立副本回滚将恢复原 4507 文件hash与旧33检查/18HTML行为，实际工作区保留新代码；最终四产物与远端观察以 DELIVERY 为准。
