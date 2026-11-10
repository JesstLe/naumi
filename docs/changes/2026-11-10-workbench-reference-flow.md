# 参考工作台：画幅、推理与批次结果修复

## 模块与职责
参考工作台只表达画幅意图、保存操作/报价与投影任务状态。Imagegen拥有模型参数解析/已发布映射/受理与计费，文字推理继续走原生文字识图上下文。

## 公共接口、依赖方向、数据归属
新增generation-request.ts为工作台请求构造纯函数；status.ts为操作/子项状态纯投影；text-errors.ts为封闭错误词表与脱敏关联编号。service编排，route保留认证/参数解析。仍由app_reference_operations保存plans/result，权限、余额、防重、冻结及UNKNOWN归属不变，无DB迁移。

## 本次实现
- 移除宽高约分后三位数上限，复用Imagegen的6位比例合同；参考/产品/手动画幅以同一请求送入现有规划器。已有主线规划器支持管理员发布的最近枚举/native-auto策略，本次不重写它；记录并展示frameChoice目标/实际比例，输出按冻结的实际画幅验证，不拉伸裁切原图。
- 每项规划记录明确4xx预检失败；有效项继续形成冻结计划，失败项持久化零积分结果。全部失败则不受理。不吞系统500，不重算已受理任务。
- 修正images在文字入口的参考图计数；workbench推理沿用同一文字识图执行上下文，去掉冗余modalities字段，支持合法文本块响应。
- 在计费动作内部捕获静态分类与关联编号，SDK原文/密钥/图片不返回用户；不确定网络/上游结果保持OPERATION_PENDING，不自动重试。
- 前端按root+operationId+视图revision轮询；切项目、新批次、受理回执、加载及缓存返回均检查视图身份；混合结果中成功项即时应用、失败保留原文，一项失败不提前中断；同一成功结果只回填一次，保留用户后续编辑。状态按plans文字结果/result图片结果投影，未知单列，不混入旧批次计数。
- 新推理失败不清空之前成功提示词；UNKNOWN在项目卡片状态中保留并阻止另起请求。关联编号在计费层重投影后仍写回工作台操作记录，不改变账务归属或结算规则。集中并发验证另复现了claim/result使用不同锁重写同一plans JSON造成已完成子项退回running；统一为operation级锁，避免同批次子项结果丢更新（原始失败日志INTEGRATION-before-text-lock.log保留）。

## 验证与证据层级
基线 main：`628c5e93d711e25bd29f0ab975527d7eba86c5e3`；隔离分支 `codex/workbench-reference-flow-20261110`。证据根：`E:/Workspace/naumi/output/workbench-reference-flow-20261110`。

| 命令 | 结果 | 层级 |
| --- | --- | --- |
| `node scripts/verify-workbench-reference-flow.cjs --source-root ../baseline-source --mode BASELINE --output-root ../checks` | PASS，复现4/15误拦、2张图计0、首错丢弃后续成功 | 真实源函数与Chromium DOM，外部边界fixture |
| `node scripts/verify-workbench-reference-flow.cjs --mode MODIFIED --output-root ../checks` | PASS，21项；0/15误拦、2张图计2、成功回填、手动编辑保留、6种旧异步回执与同项目新批次隔离 | 同上 |
| `node node_modules/tsx/dist/cli.mjs scripts/verify-workbench-reference-flow-pg.ts` | PASS，14组；15图真实报价、中央枚举画幅790:1561→9:16与冻结验证目标一致、首项预检失败后项执行、混合FAILED/DONE/UNKNOWN、4次文字/1次图片模拟调用、重复调用0、账务与跨账号隔离 | 隔离PostgreSQL16.15、原生HTTP/service/计费、loopback供应商 |
| `node scripts/build-reference-workbench.mjs` + `node node_modules/tsx/dist/cli.mjs scripts/verify-reference-workbench.ts` | PASS，18组API/DB；三页桌面1440/手机390，iframe0、脚本错误0 | 同上及真实Chromium，`NAUMI_WORKBENCH_GUI=1` |
| `node scripts/verify-canvas-text-reference-model.cjs` | PASS，7项 | 原请求模块及显式配置fixture |
| `node node_modules/tsx/dist/cli.mjs scripts/verify-workbench-quote-errors.ts` | PASS，真实400/409、未知内部错误脱敏、未受理、未扣积分、供应商调用0 | 隔离PG/原生入口 |
| `node node_modules/tsx/dist/cli.mjs scripts/verify-workbench-model-options.ts` | PASS | 真实模型选项纯函数 |
| `node scripts/verify-workbench-history-cache.mjs` | PASS，14项 | 本机Chromium/缓存fixture |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` / 受影响TS文件ESLint | exit0 / exit0 | 全量类型/定向lint，不等于生产构建或部署 |

PG命令统一使用`NODE_OPTIONS=--conditions=react-server`、`NAUMI_VERIFY_ISOLATED_DB=1`及仅127.0.0.1的临时数据库；测试各自创建/删除独立schema。无生产数据库或真实供应商调用。原版两个旧验收断言在基线同样失败（日志`BASELINE-NATIVE.log`、`BASELINE-QUOTE.log`）：已取消的自动授权虚拟加价、低质量应被拒绝。修正测试为现行真实子计划计费及超过通道参考图上限的no-channel情形，补齐本地HTTP fixture对已存在environment脚本的静态服务；未为绿测恢复旧业务门槛。

四件套为`MODIFIED_FILE.zip`、`DIFF_FILE.patch`、`VERIFICATION.txt`、`ROLLBACK.sh`；原包`ORIGINAL.zip` SHA256：`9060c457fd2c6faf0338aa5c41d0c3f98a1f0baf47d991169a1e3c77d16e0545`。回滚只按清单恢复本任务源码，先校验全部修改hash，后续编辑导致整次零修改退出；独立副本恢复原始行为的实际命令/输入/输出/exit记录在VERIFICATION.txt，不回滚数据库或媒体。

## 未完成项与下一步
本模块验收通过后普通合入main并推送，实际提交/远端核验见证据根FINAL_STATE.json；保护共享checkout和原有未提交改动。47暂停发布保持，不部署其他站；本轮发布计数不增加。历史失败任务不批量重放。历史11条实际拒绝正文已丢失，不以本地fixture宣称原上游拒绝已消失；上线后仍需新发起的正常业务操作完成真实供应商验收。
