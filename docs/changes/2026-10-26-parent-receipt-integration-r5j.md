# R5J：原结果父回执及 post-accept 诊断整合

日期：2026-10-26。工作树 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。

## 固定输入与实现

- 完整重构基线：`151240c168b101ae8b6cf60c5a4ca0a36e8a6978`，4390 个原文件 SHA-256 与完整源码归档。
- 普通 merge 来源：`b15d4761b938428c449531e2d8744401a38a2ec7`；不重新开发 main 的业务修复，不回写 main，不部署。
- 唯一冲突为 `verify-imagegen-parent-completion.cjs` 的依赖注入表；保留重构后的 creation-scope owner，补入 incoming 的 completed-parent-receipt stub。它仍是独立通知链回归，不冒充真实 finalizer 验证。
- 新 `completed-parent-receipt.ts` 只将旧 db import 改到 `platform/db/pool`，函数正文、SQL、CAS 与 incoming 精确一致。其余诊断模块扣除既有 Pool、synchronous-operation、BI context 的 import 改绑后，与 incoming 正文精确一致，见 INCOMING_PRESERVATION.json。
- dispatch 保留已有 direct Worker 归属、creation-scope、delivery-billing 与部分交付口径，接入原子父回执投影。不恢复 HTTP 反调、巨型 db 或多套账务。

## 行为与边界

1. active result/完成通知可把已经结算、原作品与像素可读的单步骤 generate/edit child 投影为 parent 完成；readImagegenReceipt 仍只读。
2. 父子 owner、空/过期 lease、snapshot/payload、作品地址与真实账务证据继续核验；已存在 release UNKNOWN 不删除、不重写，也不触发再次生成或结算。
3. 原结果 URL 的可重试 GET 最多再读取一次，共用原 60 秒 signal；不重复生成 POST、不换通道，不重试 403/非法像素。
4. WeakMap 将 post-accept 失败绑定到精确 Response/供应调用；下载与解码错误不伪装成未受理或用户余额问题。客户账务不因补诊断发生变化。

## 一次模块集中验证

所有 PG 均为本轮独立 `127.0.0.1:65472/naumi_model_fixture_r5j`；无外部供应商调用。命令、输入、完整 literal、exit 与源码绑定见 `output/refactor-r5j-20261026/VERIFICATION.txt`。

| 验证 | 实际结果 |
|---|---|
| 完整旧树真实 active-result 入口 | 6 检查，原 child 已存但 parent 仍 queued，exit 0（缺陷复现） |
| 新完整源码真实 active/notification + writer + PNG | 24 检查 PASS；原价6、UNKNOWN/child/账务/媒体不变；新增扣款0、网络0 |
| 同原 URL GET | 旧 reset 后中断复现；新14检查 PASS，最多2 GET、同URL/同预算、生成POST0 |
| 真实 PG finalizer primitive | 29检查 PASS，像素实际解码；无新生成/结算 |
| post-accept 诊断 | 23检查 PASS；真实sharp，无HTTP/DB调用 |
| 原父完成回归 | 25场景 PASS，无供应POST/结算/网络 |
| 供应成本 | 原suite PASS，新增精确3 calls持久诊断、跨调用泄漏0、原图GET2、客户账务不变 |
| 后台失败证据 | 39检查 PASS，真实PG/new+legacy/企业隔离保持 |
| 模型健康、冻结模型执行 | 现有真实夹具 PASS，unknown不重提、账务和归属保持 |
| Linux真实独立图片Worker | 71检查 PASS；Web执行0、batch Web POST0、冻结6/current17不混价 |
| 实际 Next15.5.27 六入口 | 20检查 PASS；Web claims0、受理正常、HTTP Worker tick409 |
| TypeScript / 本轮源码lint / diff-check | 全部exit0 |
| 编译 | Worker2352 inputs/HTTP route inputs0，ownership fixture2382 inputs |
| 导入图 | emitted静态SCC0、全部literal导入SCC0，与基线相同 |

Linux运行首轮 exit1：证据runner只挂了verifier，漏挂实际video-worker启动链；未改生产实现，补齐4个实际脚本后只重跑失败项及未执行的Next。失败原文保留于 IMAGE_RUNTIME.log.FIRST_FAILURE 等及 BUILD_RUNTIME_INDEX.json；不将原失败改写为PASS。

## 回滚、Git 与交付

最终四产物为 `MODIFIED_FILE.tar`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`。独立完整 modified 副本恢复4390个原始hash、删除本轮introduced路径，验证恢复后 active-result 为queued、GET reset中断的原行为；真实工作树保留新实现。精确统计、patch重放、提交双parent、push与远端SHA、容器清理以 DELIVERY.json 为准。

本轮是固定main增量整合，功能模块同步计数保持0。此前R5I四产物保持原固定源码，不覆盖历史证据。本轮Worker为源码绑定产物挂入固定Node/native runtime；Next是受影响六入口真实构建，不是完整候选产品镜像或100k容量验收。

## 未完成与下一模块

- Canvas主组件仍8534行，外围上传/助手/弹层组合与跨请求、多tab CAS继续拆责；不把SCC0当作整体模块化完成。
- R6完整候选构建、同SHA CI/主benchmark整合、实际性能容量与生产功能验收继续；旧fixture债务按原记录保留。
- 整体重构保持active。本分支尚未合回main、未发布；不操作其他线程发布锁/在线服务。
