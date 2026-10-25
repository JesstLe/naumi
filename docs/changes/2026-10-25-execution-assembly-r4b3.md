# R4B3 — 冻结执行与管理装配分离

## 基线与目标

工作区 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。基线 `bca892fb33be5f1f9870283349fd4bcd99d1cc3f` 的4232个原文件字节与SHA保存在 `output/refactor-r4b3-20261025/BASELINE_SOURCE.tar`、`BASELINE.json`。

R4B1已分离普通模型读取，实际executor、报价、typed operation与抠图仍先装配后台。R4B3让已有冻结执行读取原模型、原计费、原凭据和原Router投影，不要求先创建管理连接或执行初始化DDL。

## 实现

- `model-config/execution-services.ts`装配执行所需的轻组件，不装配后台repository/发布runtime，不进行legacy发现。只有真正新建外部Router投影时才取得管理连接。
- `execution-projections.ts`复用原prepare完整正文，保持原版本键、摘要、lease、unknown与同版本重试；已接受投影校验单独SELECT，不初始化或替换路由。
- `credential-reader.ts`共享原引用、provider绑定与解密验证。后台store在原位置传入readiness；执行只读原凭据，不发现、改写或换用其他key。
- `billing/frozen-config.ts`共享原计费快照解码；历史执行按version SELECT，不bootstrap、不切current。管理catalog继续原初始化和发布路径。
- 实际executor、图片plan、typed model operation及cutout引用上述执行读侧；`createModelExecutor`内部resolve/describe/run算法保持。
- 集中相邻回归复现一处原有视频身份错误：`submission.ts`将wire model传给公开模型报价，完整旧基线也在同一位置报MODEL_UNAVAILABLE。现报价使用冻结publicModelId，供应商请求继续原wire model，原价、通道及版本不变；legacy未托管路径保持原modelId。

## 结构与行为保持

- 4条实际执行/报价到管理server的直接引用归零；新owner无环。20文件视频环、12文件图片恢复环及其余小环仍在。
- 8项核心AST对照保持：完整executor factory、prepare原正文、发布apply、管理凭据import/save、共享凭据read算法（readiness回调位置单列）、计费decoder与catalog runtime正文；另17个保留顶层声明不变。
- 投影校验改为SELECT-only，缺表按原EXECUTION_MISMATCH处理；历史计费读取缺表/缺版本不初始化或回退current。

## 集中验收

主输入：`DATABASE_URL=postgresql://fixture:fixture-local-only@127.0.0.1:65456/naumi_refactor_r4b3_fixture`、`NAUMI_VERIFY_ISOLATED_DB=1`、`NODE_OPTIONS=--conditions=react-server`。每部分另进程种子后退出，真实冷模块运行；源码来自完整4232文件基线，不是局部投影。

```powershell
node --conditions=react-server --import tsx scripts/verify-model-execution-boundary-pg.ts --baseline --source-root output/refactor-r4b3-20261025/baseline
node --conditions=react-server --import tsx scripts/verify-model-execution-boundary-pg.ts
```

- 完整旧版6部分57检查、新版6部分71检查均exit0。旧版冷只读executor在PG25006尝试DDL，新版构造无SQL，describe/runBundle只读原模型、凭据、计费与Router投影。此结论仅指该组件链，不扩大为整站无DDL。
- 管理token缺失时，旧executor报ROUTER_UNAVAILABLE，实际plan HTTP返回原400；新版直连/原Router冻结任务正常解析，实际plan HTTP200且使用current99积分。没有准备Router或发现供应商。
- 原冻结模型/计费合同仍按6积分，current已99；typed operation只进一次回调，原版本路径不读current模型/计费pointer，报价没有预占或消费。
- 真正新投影使用原prepare lease；注入一次loopback控制端500后保留unknown，8路同版本重试只增加一次prepare，最终prepared且lease清空。损坏digest、凭据、历史版本及bundle版本不符仍拒绝，没有生成POST。
- 相邻模型发布、preparation45（单model read、原3/current17）、已发布模型读8/80、身份8/171、视频frozen-source真实双入口16、wallet/entitlements/billing config、195登录均通过。
- 完整原模型执行脚本在修正视频public/wire身份后继续验证到末尾；原视频密钥轮换/重复受理、Canvas排队恢复、私有目录、压缩响应及未知结果不重提通过。该脚本供应商调用是loopback fixture，不是外部供应商。
- 全项目tsc和本轮14个TS/TSX文件lint最终exit0。未运行full build、产品浏览器、生产或规模容量验收。

## 原始失败与修正

1. `MODEL_EXECUTION_1.log`首次在视频报价报MODEL_UNAVAILABLE；`MODEL_EXECUTION_BASELINE_CONTROL.log`对完整旧源码复跑同样exit1，定位为wire/public身份混用。最小生产修正只改报价参数，不改变实际供应商wire请求，既有脚本新增读回这两种身份的断言。
2. 修正后`MODEL_EXECUTION_2.log`继续到旧第268行，要求过期图片客户端header抛MODEL_CHANGED。这个预期与此前去重复确认协议冲突；只更新测试为current服务端报价、正确公开模型且supplier calls不增加，不把旧门槛加回产品。`MODEL_EXECUTION_3.log`最终通过。
3. 主A/B、已经通过的相邻suite不因这两项反复全跑；视频修正后补主modified与frozen-source，测试预期更新后只补完整model execution和最终tsc/lint。原失败日志保留。

## 未完成

未接完整Web/Worker显式启动hook；真正空库仍使用既有兼容初始化，当前配置和身份/媒体等域仍有各自ensure。`modelConfigurationEnabled`原环境开关语义保持。未修改运营价格、用户权限、计费确认或未知任务重提行为。

本轮完成后是第3模块，按约定刷新并普通整合origin/main到任务分支；不反向合main，不部署。所有实际命令/字面结果、四产物、副本回滚及交付SHA以本轮VERIFICATION/DELIVERY为准。

## 封存接口复核

必填byVersion端口原先直接引用可选参数的current/version读函数，静态上会把undefined解释成current。保留旧repository的INVALID_CONFIG判定后，完整A/B增加两项检查：非法缺失版本被拒绝且SQL为0。最终旧6/57、新6/71及tsc/lint通过，原55/69中间轮留存；已完成的模型执行/视频和其它相邻结果不重复跑。该项来自静态接口审阅，不冒充先有运行失败。
