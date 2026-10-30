# R7W：账务客户端移除反向展示依赖

## 模块与职责

本片在独立重构目录 `E:/Workspace/naumi-refactor-20261024` 实施，基线 `38127633cf9dc7cdd9deeb14bf739cfb0ad8da29`。账务客户端负责报价、原 operation 提交及回执处理；UI 通知由展示层决定，账务模块不引入具体组件。整体重构仍 ACTIVE，未合 main、未部署，47 HOLD。

## 调研与实现

- `BillingProvider` 原来仅为分辨率自动调整的信息提示导入 `components/ui/toast`。实际 RootLayout 中 BillingProvider 位于 ToastProvider 外，旧 `useToast()` 取得 fallback；原顺序下本来不会显示此提示。
- 用户已在 `2026-10-30-image-notice-visibility.md` 明确隐藏 A/B 类信息提示，包括分辨率调整。该分支的合理退出是删除已不需要的展示动作与反向依赖，而不是新增通知总线、回调协议或重新排列全站 provider。
- 删除 toast 导入、hook、分辨率提示及其 callback 依赖。服务端 requested/effective 参数、完整报价、原价、原 operation、原响应、余额检查、UNKNOWN 保留及原回执恢复都不改。
- 原任务、数据库、账本、回执与事务仍归原 owner，本片不增加存储、任务、API 或状态容器。
- 新 verifier 接入既有 `refactorCases` 的 pricing 组，通过 `BILLING_PRESENTATION_EVIDENCE` 独立保存证据，不另建测试框架。

## 验证设计与已观察结果

`verify-billing-presentation-boundary.cjs` 执行实际 BillingProvider、ToastProvider、React DOM，并用 TypeScript AST 读取实际 RootLayout 的 provider 祖先顺序。auth、HTTP、cache、workspace/model 是受控端口，不冒充完整 Next/真实 PG 或供应商。

原版 8 检查、6 共同轨迹，结构依赖为 1、exit1（预期复现）；新版 9 检查、6 共同轨迹 EXACT，结构依赖为 0、exit0。验证过期原 quote/12积分/original-op 不替换；一次报价与一次提交；pending409、UNKNOWN503、余额402原响应不变；显式重试保持原 operation/quote，无自动额外 POST。

## 原生门禁诊断边界

R7V 的 timeline/scene/character 原生门禁曾有 Next dev 提前退出，原始报告保持不变。R7W 的 observer 只记录实际 fork 子进程、exit/signal 和 uncaughtExceptionMonitor，不改变退出与重试行为。

第一次 observer 语法错误未进入产品；第二次 C: 源码副本 junction 到 E: node_modules，Next webpack 报跨盘入口解析失败，属于验证准备错误，不是原退出根因。另建 C: 完整原版副本，使用同盘已安装且主要包版本一致的依赖，5200 源码 hash 全对齐，timeline 实际浏览器验证 exit0。该单次结果不是对原历史退出根因的证明，也不把 R7V 153 PASS/3 OPEN 改写成全绿。

## 集中验证、完整产物及未完成项

模块集中类型、lint、架构与相关报价/身份/UNKNOWN 回归、同盘完整应用原生复核、字节补丁及独立副本回滚结果在本节封版时补齐，完整字面命令与日志以 `output/refactor-r7w-20261030/VERIFICATION.txt` 和 `DELIVERY.json` 为准。没有通过的新矩阵不借用历史报告计通过。

本片为 R7V 同步后第 1 个模块；开工已记录 incoming main `e470988555d18b553c56924ad64edfbe6582b75f` 的 3 提交，本片不在验收后混入。全核心门禁、原生退出根因、性能/容量、有效远端 CI 及最终普通合入 main/整版验收继续记录，不能以小切片通过宣称完整重构完成。
