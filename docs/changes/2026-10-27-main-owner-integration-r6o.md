# R6O：主线增量按真实 owner 整合

## 模块与基线

- 工作区：`E:/Workspace/naumi-refactor-20261024`，`codex/core-refactor-20261024`。
- 本轮起点：`b28fceb6de3417edddb0009e272ebc040329efec`。
- 固定 incoming main：`4e15e71a2d56ba8518340c04a256cf920b978e41`，25 个提交、87 个路径。
- 普通 merge 保留双 parent；16 个冲突按现有职责边界整合，不恢复旧 db/runtime/Canvas 大文件。
- 完整 4591 个原文件 hash 和原树保存在 `output/refactor-r6o-20261027/BASELINE.json`、`BASELINE_SOURCE.tar`。

## 公共接口、依赖与归属

| 主线增量 | 真实 owner | 本轮处理 |
|---|---|---|
| 会话 revision / CAS / 防晚写复活 | `agent/session-repository.ts` | 原始时间戳字符串、单调更新时间与冲突语义；DDL 仍归 startup |
| 历史媒体地址归属 | `artworks/repository.ts` | runtime 直连窄读取端口；db 仅保留兼容 export |
| 图片参数计划 | `model-config/image-parameter-plan.ts` | 纯编译、统一 schema、实际 wire/omit，不读 current 或数据库 |
| 冻结执行合同 | `execution-contract.ts` / `execution.ts` / `requests.ts` | 新 plan 元数据沿原 quote 传递；旧受理任务未带版本保持旧解释 |
| 供应通道与传输 | `channel-routing.ts` / `execution-transport.ts` / `execution-fetch.ts` | 保持单向 composition 与既有回调；本地拒绝身份不冒充供应商未扣费证据 |
| 参数审计 | `execution-audit.ts` / `saas/creation-writer.ts` | 沿原 operation 记录参数计划；审计失败不授权重新生成 |
| 映射管理界面 | `model-editor.tsx` / `editor-state.ts` | 复用单一 typed editor 状态；不增加多个弹窗 flag |
| 节点菜单 | `node-menu-items.ts` / `context-menu-surface.tsx` | 工具栏与空白右键共享菜单；移除旧平行 nodeTypeMenu 状态 |
| 图片/文字提示词优化 | 已有 image/text composer + `prompt-optimizer-client.ts` | UI 会话与浏览器 HTTP transport 分离；保留 workspace/node/draft revision 和取消 |
| 映射后原图交付 | `finish-stored-image.ts` / `complete-image-delivery.ts` | 新 plan 不隐式 upscale；正常执行与原结果续交同规；显式 frame/postprocess、旧任务不改 |

## 实现与验证进度

- 已完成上述 owner 迁移；自动转移 32 个 hunk，另外 12 个未匹配片段逐项迁入真实 owner。
- 首轮全项目 `tsc --noEmit --incremental false` exit 0。
- 新增 `verify-refactor-main-sync.ts`：三 owner 源投影，真实隔离 PG + 像素校验；基线/修改/回滚使用同组输入。
- 集中功能回归、固定 Linux 包、同镜像 runtime 与控件验收、最终四产物/回滚、Git 远端绑定尚待收尾，最终以本目录后续记录及 DELIVERY 为准。

## 尚未完成

这是整体重构的主线增量整合模块，不代表完整产品重构或生产验收；独立分支继续，不合 main、不发布。本轮同步后功能计数归零，后续继续整体变化传播范围与残余 Canvas 编排收敛。
