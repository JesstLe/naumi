# R5M：Canvas 助手会话 owner 与原结果同步

日期：2026-10-26。工作树 `E:/Workspace/naumi-refactor-20261024`；分支 `codex/core-refactor-20261024`。完整基线 `545fa1ca1c54ac8d11985793ecac770cb9f28a29`，4412个原文件 hash 与完整归档。

## 变化理由与实际消费者

Canvas 的助手 transcript、draft、附件、历史、SSE、停止、错误/继续状态和原 operation 重试此前混在主组件闭包。会话、场景、账务与页面状态同时变化，工作空间/项目迟到回调难以隔离；原结果读取失败还会让 busy 保持，阻碍用户只同步已有结果。

- `src/lib/canvas/assistant-session.ts` 成为当前 editor 助手会话唯一 owner；持有 transcript、draft、附件、skill、busy/activity/tool progress、outcome/error、续写、server session、AbortController、epoch 与 retained billing submission。窄 context ports 负责 submit/read/merge/history/upload/cue/selectAnchor/video/text/revealVideo，不引用 Canvas/UI 实现。
- `use-canvas-assistant.ts` 只负责每 editor 一个 owner 与 `useSyncExternalStore`；真实卸载/StrictMode 使用 mount/invalidate；账号/项目/工作空间身份切换同步换会话，不等父 effect。
- Canvas 真实改绑并删除平行 state/ref/send/stream/restore/upload 实现。助手merge只在原view可见时落地；R5L导入的后台保存/同步语义保持，未把该view限制扩散给普通导入。
- 原 `assistantContext` 原样迁到 assistant-references。Orb状态/cue合同独立；orb-model/companion保持同对象兼容导出；orbToolFace原算法迁到 agent-orb，删除 lib→UI 反向依赖。
- panel复用原浅色布局，仅原错误按钮在存在saved IDs时执行“同步已有结果”，不调用send，不要求重新输入。
- Canvas **8080→7791行**；163个非目标具名函数AST一致，8个adapter明确改绑；helper/Orb5个声明精确迁移、2个兼容运行时对象同一。

## 行为与集中验收

| 层级 | 实际结果 |
|---|---|
| 完整旧Canvas函数基线 | 9类34检查，sync失败busy仍true、workspace迟到写、project迟到undo按预期复现 |
| 实际新owner | 15类55检查；以上三缺口为0；同帧一次提交、同意图原body/turn/quote、chunk/CRLF/UTF8及无尾空行、历史/附件/停止/卸载通过 |
| 实际owner→quote/Canvas/history handler＋隔离PG | 20检查；真实2积分一笔consume，原请求replay模型调用0，实际model config/auth/账本；本地文字SSE，外部/图片调用0 |
| 实际Next＋完整BillingProvider＋实际Canvas/panel | 6组：乐观显示、delta/final、拒绝后原意图重试、saved ID同步不重POST、停止原cv-session、新对话 |
| 相邻实际Next | 创作栏15、图片任务5通过，接口为fixture |
| 既有live feedback / Orb | 29场景、128检查通过；测试改绑真实owner，不继续索引已删除的Canvas setter |
| 全项目tsc | exit0 |
| 所有本轮源码/脚本lint | exit0，Canvas原8个hook warning保留 |
| 结构 | emitted静态及全部literal导入SCC均0；原fixture lib→app2与toast lib→UI1如实保留，不称全层级倒置归零 |

SSE仅消费本次response，不重连、不自动重新POST。未知状态保留原operation，人工重试沿原意图/原报价；没有新增积分确认、限额或授权框架。结果读取失败释放busy并保存原ID，读回后恢复原终态，不抹掉上游错误。

真实PG的客户端wrapper构造实际billing协议，不等于完整BillingProvider；完整Provider由另一个Next控件用例覆盖。Next使用本地dev/HMR完整源码副本，9个owned生产文件最终hash一致；不是生产构建或真实外部供应商验收。scope隔离同时含账号/项目/workspace；saved client receipt是当前editor内状态，不冒充跨刷新durable client恢复。

## 保留失败与纠正

原失败日志保留：基线fixture依赖/时序、runtime snippet缺diagnostic、esbuild mock误匹配、react-server条件影响SSR、真实PG准备的quantity/project/router token/default disabled tariff/账务ID等。只修测试准备与观察器，不恢复旧确认门槛。真实控件前两次失败来自错误accessible label（发送消息/新建对话）及user turn不带assistant-turn testid，改为实际DOM选择器后通过；未改产品文案迎合脚本。

AST preserve还抓到一次非目标import context误加view guard，已精确恢复，之后相邻Next通过。失败原始日志不改PASS。

## 产物、回滚与后续

`output/refactor-r5m-20261026/`保存完整基线、MANIFEST、MODIFIED_FILE.tar、DIFF_FILE.patch、VERIFICATION.txt及可执行ROLLBACK.sh。独立完整modified副本恢复4412原hash、删除introduced文件，重跑旧owner行为；真实工作树保留新实现。patch重放、提交/push/远端与fixture清理以DELIVERY.json为准。

这是同步后的第3功能模块，封存后普通整合main（开工观察d460e61f，合并前再fetch并固定）。不合回main，不部署。外围Canvas组合、多tab/CAS、R6同SHA CI/完整候选构建、基准债务/实际性能容量仍继续，整体目标active。后台Agent管理装配依赖另列，不借此模块重写整条业务链。
