# cb2 Core：生成活动与真实账单回执 fixture

## 原失败与本次边界

PR #8 的 Core run 41676168204 / job 126057245027 对应 head cb2e5d39，实际 checkout f53d15c9；149 PASS / 1 FAIL / 96 NOT_RUN。原命令 `node scripts/verify-canvas-generation-activity.cjs` 在 `known results are added once` 报 `0 !== 1`、exit 1。前一个真实 PG/loopback image-version pipeline PASS 独立保留，不等于这一条通过。

本轮以当前 9fe89090 的 clean 5708 文件原始字节为基线。未修改脚本首轮同样 exit 1；诊断副本捕获 `ReferenceError: readBillingSubmissionResponse is not defined`，五种 detail/edit caller 首轮均 POST1、supplier1、poll0、position0、history0。这不是“已经拿到已知结果而产品丢了历史”的证据：VM 抽取真实 BillingProvider submit，但没有绑定该闭包新增的真实 import。保留本轮基线、原 CI 日志及前阶段产物，不以过时通知为由跳过。

## 实现与归属

只改两个验证文件，产品代码零修改：

- `verify-canvas-task-boundaries.cjs` 把实际 `billing/client-response` 导入同一 owner bundle，并在捕获的 submit 引用 reader/terminal helper 时前置核验真实绑定。receipt 读取与终态判断仍由产品实现负责，fixture 不复制成功/UNKNOWN 规则。
- 成功工具 fixture 返回完整 `ok/id/url/user`；缺 `ok/url` 独立保留为 UNKNOWN 反例，不修改产品校验。
- 2500ms poll 使用可取消快时钟；30000ms body deadline 默认使用真实原生 timer。只有明确 stalled-body 场景推进该 deadline；clear 同时取消原生 handle 和失效待执行微任务。断体/超时只结束本响应 reader，不取消受理的服务器工作。
- activity 与 boundary 的 position-fails 前置检查必须真正到达 position port，history0 且 retained failure.kind=sync，然后同一任务并发 retry。原 `history===1` 保留，activity 额外要求总 POST1、quote1、supplier1；各轮无泄漏 timer。

activity 只拥有 busy/retain/clear。detail/edit controller 保存原 form/job/result；result-attachment 拥有已成功位置记录、merge 后完整结果校验和 recorded IDs 历史去重。selection/drop 不拥有生成付费执行。本轮不把这些职责移回 Canvas 或另造通用 manager。

## 正式回归与集中验证

原 `task-boundaries` 正式 case 新增 16 个组合：坏 JSON、响应体错误、受控 body deadline，各覆盖 detail/detail-blank/cutout/expand/annotate，另含 cutout 缺字段。首轮 POST1、无自动重投、position/history0、intent 保留；显式 retry 用原 operation/quote/body/credits，supplier1、quote1，成功后只新增一次完整历史。UNKNOWN 的显式原身份 receipt POST 与“已知结果重试 POST0”严格区分；fixture supplier map 不是线上财务证据。

集中执行：activity 38 cases/182 checks；boundary 90/772；secondary 50/171；image task 47/177；text task 30/202；账单读体真实浏览器/本机 fixture HTTP 4 cases；generation/pending 实际 React 各 8 groups、46/36 checks，全部 exit0。原 project/ABA/unmount、原报价/请求、partial GET-only 和 timer 清理合同继续保留。两个兼容 detail/edit CLI 委托同一 boundary，不重复运行整套以堆叠数字。

首次改动文件 lint 发现两处既有 VM 局部变量名 `module` 触发 Next no-assign-module-variable；仅重命名为 loadedModule，并保留 VM global.module/exports 实际绑定，不关闭规则。原失败日志保留，最终 lint 与正式回归绑定最终字节。非增量 tsc exit0；本次后续修改只有 CJS 局部名/文档，TypeScript 配置与输入未改。

本次没有新增 case 注册项：正式目录仍 248。最终 source SHA、原 case 正式 runner、非增量 tsc/改动文件 lint、独立窄审和 copy-only 三相回滚以 `output/pr8-generation-activity-cb2-20261104/` 的命令与封存产物为准。selected runner 的 PARTIAL/exit2 不冒称完整 Core。

## 证据与下一步

四产物为 `MODIFIED_FILE.tar`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`。基线全文 hash/mode 保留；回滚只作用于另一份源副本，later-edit/source guard 必须先于任何写入，当前候选和封存 modified archive 保持修改。共享原工作树与上一阶段四产物不变。

整体重构继续 ACTIVE；当前局部通过不替代新头远端 Core/Verify、R04/同 case 页面、完整固定 Web/Worker/runtime/performance 或 main 整合。mainMerged=false、deployed=false、47 HOLD。等待新头 CI，不重跑、轮询或借用旧头状态。
