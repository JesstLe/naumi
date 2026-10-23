# 历史员工失败 benchmark

## 目标与执行边界

用户提出：统计过去员工失败，用新调整重跑同样行为；旧版能复现、新版能正确完成，才构成修复合理性的直接证据。本模块只增加测试、去身份历史参数与文档，不改产品代码、供应商账户或生产配置；47维持配置、暂缓发布。

先分清三种证据：

1. **完整原行为重放**：原输入字节、参数、冻结配置/报价、入口操作顺序、任务初始状态及触发故障条件齐全。
2. **保留原参数回归**：已有真实比例/参考数/版本，但原图、原报价或完整交互缺失。
3. **故障机制复现**：在隔离PG和本机HTTP中重建相同顺序/状态，如4K预览后误拦、零POST容量忙、已有checkpoint续交付。不是同一员工原任务重提。

当前完整原行为重放为 **0**。不以生成的fixture数量、断言数量或HTTP200充当员工历史失败修复数量，不重放生产旧付费任务。

## 已留存历史统计

这些是固定旧快照，不是本轮实时线上失败率：

| 时间窗 | 去重口径 | 已留数量 |
|---|---|---|
| 10/19 10:05:52—10/20 10:05:52 | 756个父operation | 519成功、222失败、15待结果 |
| 10/21 01:30:52—10:14:40 | 固定94父operation | 初读60成功、9错误、23待核查、2等待；稍后同组61/9/23/1 |
| 10/23 09:10:12—09:40:12 | 24个失败逻辑请求，不是父子合计48次 | 22个供应商额度403，2个供应商完成但本地无最终图；30分钟全部请求分母未留 |
| 10/23 00:00—11:47:22某账号受理前取证 | 非任务/点击计数 | 0新受理/供应商/账务记录、64输入保存；失败点击数未知 |

10/20的222个失败互斥分类：非标准比例80、本地繁忙49、已有图交付失败33、供应商错误/结果异常24、调用后无最终交付12、结果大于父读取12MiB的12、特定工具比例拒绝8、比例差异误当失败4。合计222。

同一cohort的子时间窗、父/子任务、供应商记录、输入资产不能相加。去身份来源索引、逐operation伪名、源文件SHA及重叠检查留在本地 `output/imagegen-history-benchmark-20261023/inventory/`；原prompt、email、token、URL、图字节不进Git。

## 最小实现

- `docs/benchmarks/imagegen-history-20261023.json`：15个场景，明确来源、历史数量、回放精度与OPEN/NOT_PROVEN；真实历史、相关日志和审阅反例分开。
- `docs/benchmarks/imagegen-history-ratios-20261023.json`：80笔真实比例参数、23种比例，来源SHA和operation不可逆伪名，不含原始身份/提示词/图片。
- `scripts/verify-imagegen-history-ratios.cjs`：执行真实 `request-size.ts`，当前v2新请求75笔可映射，5笔超出3:1继续拒绝；旧冻结v1不静默升级。这项既有能力在本次调整前已存在，不归为本次新增修复。
- `scripts/verify-imagegen-history-benchmark.cjs`：复用现有harness，不另建工作流框架；5组旧版对照、10组新版检查，每组保留实际命令、源码/脚本SHA、输入说明、输出、退出码。基线分别是1871f84d、05598fe5、9f049b07，不能只切一个CLI flag假装换了产品源码。
- `scripts/verify-imagegen-history-supplier-quota.ts`：真实PG+channelRoutingFetch+本地HTTP，供应商403无not_charged时保持OPEN；显式not_charged对照走现有fallback。该层未执行客户账务，不能宣称验证客户扣费0。

## 使用

只接受显式隔离标志和 `127.0.0.1` PostgreSQL；每个PG测试使用随机schema。输出目录必须新建，避免覆盖以前证据。依赖沿用现有node_modules，不安装/修改依赖。

```powershell
$env:NAUMI_VERIFY_ISOLATED_DB='1'
$env:DATABASE_URL='postgresql://fixture:fixture-local-only@127.0.0.1:65434/history_benchmark'

node scripts/verify-imagegen-history-benchmark.cjs --self-test
node scripts/verify-imagegen-history-benchmark.cjs --phase baseline --output output/imagegen-history-benchmark-20261023/baseline-run
node scripts/verify-imagegen-history-benchmark.cjs --phase modified --output output/imagegen-history-benchmark-20261023/modified-run
# 或一次 compare；会实际创建独立Git归档，不写产品源码。
node scripts/verify-imagegen-history-benchmark.cjs --phase compare --output output/imagegen-history-benchmark-20261023/next-run
```

退出码：`0`只用于基线缺陷按预期复现/自检；新版完整历史闭合仍有已知缺口时为`2/PARTIAL`；意外产品回归、harness失败或基础设施错误为`1/ERROR`。本版保留强制历史未闭合状态，不用“所有命令exit0”伪造全绿。逐项测试本身可以exit0，但额度场景的业务结论仍为OPEN。

## 验收标准

- 有效图像字节解码、目标尺寸、持久对象回读、作品归属与父子最终回执均符合原合同。
- 同operation重复点击/刷新/Worker恢复不新增付费POST、账本或错误预占；unknown/started不盲目重放。
- 原报价/数量/显式比例不被客户端金额、current变化或派生默认值替换。
- 原有身份、作用域、归属和幂等校验不退化。
- 历史故障缺原始材料、外部额度未解决、最终镜像容量未证明时保留OPEN/NOT_PROVEN，不降低标准凑通过率。

## 执行结果

本轮已复现5组旧版行为；新版本逐项结果、失败更正及封版hash以同任务output中的 `VERIFICATION.txt`、`baseline-run/REPORT.json`、`modified-run/REPORT.json` 为准。产品源树与d7461ee7相同；benchmark提交和本地候选镜像版本分开。上线与员工原请求完整验证仍未完成。


### 本次实跑，不改断言凑通过

- 基线5/5组按预先定义复现，runner退出0。
- 修改态10组中9组符合预先定义，`verify-sunjiang-image-routes.ts` 在第92行拒绝原因保真断言失败：预期“参考图片未被生成服务接受”，实际通用“图片生成失败,请稍后重试”；runner准确退出1/ERROR。失败原日志完整保留，未删除用例、替换期望、改产品或将整套标PASS。前四个正常/比例偏差图case已经走到该断言之前，最后两个后续case未执行，不计整套7场景通过。
- 原始80比例参数回归75映射/5仍不支持；大图与checkpoint的真实PG交付27 checks通过；quota主用例仍403、A1/B0，明确OPEN；显式not_charged对照200、A1/B1。
- 这一结果支持报价/本地容量延期的定向修改，但**不支持“历史失败已全部解决”**。错误分类失败归因由独立定向审阅记录；在归因完成前不叫它本轮新增回归或纯测试漂移。

- 同一verifier在调整前05598fe5独立Git归档中实际重跑，也在第92行以相同预期/实际文字退出1；因此该失败至少在本次删除门槛/并发调整之前已存在，不是这些调整新引入。独立代码审阅补充保留在任务output。未放宽断言，最终benchmark仍ERROR。
