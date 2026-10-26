# R5D：视频协议合同、纯 helper、注册与传输边界

## 固定基线

- 工作区：`E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。
- 完整源码基线：`23c55daf50c95ad23fa0308be101cb745064a4a3`，4337 个原始文件已归档并保存 SHA256。
- 开工已刷新 main，仍为 `368c93e2343c57a330a0db6831ccbef01283ed6d`。
- 证据：`output/refactor-r5d-20261026/`。

## 原问题与实际修改

原来的 `wire.ts` 同时持有类型、通用值处理、注册表和协议选择。codec 为复用 helper 又 import `wire.ts`，形成 `wire → protocols/index → codecs → wire` 的 20 文件运行导入环。另有 `wire-adapter ↔ workflow-upload` 的 endpoint 计算反向依赖。

本轮按现有职责拆为：

| owner | 唯一职责 |
| --- | --- |
| `wire-contracts.ts` | 现有 `VideoWireContext/Request/Codec` 类型，只有 type imports。 |
| `wire-helpers.ts` | 原 helper 函数原样迁移，处理字段、状态、结果、引用和选项；不 import registry、codec 或 transport。 |
| `wire-registry.ts` | 原 Map、重复注册检查和读取；不负责内建 codec 装配。 |
| `protocols/index.ts` | 原内建协议注册顺序和 install-once，注册到 storage owner，不回引 `wire.ts`。 |
| `wire.ts` | 原 build/decode 公开入口与兼容重导出；不是第二份 helper/registry 实现。 |
| `wire-endpoint.ts` | 原 endpoint 计算原样迁移；adapter 与 uploader 直接调用同一函数。 |

18 个 codec/helper 文件的混合 imports 改为纯 helper 和 type 合同；注册装配文件另迁移。submission、direct、adapter 和 uploader 的真实生产消费者已改用相应 owner。旧 `wire` helper 导出、类型导出、`registerVideoWireProfile` 以及旧 adapter 的 endpoint 导出保留同函数别名，已有调用方不另造实现。

不更改 codec 函数正文、注册顺序、协议参数映射、冻结能力、客户价格、operation/租约、重试或供应商派发行为；没有增加二次确认、用户业务限额或新的任务系统。

## 集中验收设计

完整基线、候选和独立恢复副本使用同一份定向 verifier：遍历全部声明 profile，执行 create/poll/cancel、创建/轮询解码、路径覆盖、错误结果和原 workflow upload 模块；结果逐项对照基线，不用新 codec 生成自己的预期。上传存储仅为 owned-byte fixture，transport 沿现有函数注入口；没有外部 HTTP、PG 或付费调用。

独立预期继续复用既有 capability-options、verified profiles、family preset、provider fixtures 和 contract 检查；research JSON 只从留存副本复制为本轮输入，来源与 hash 单列，不联网。

同时验证原函数 AST、全源码依赖环、Worker bundle、真实 PG 冻结双入口、TypeScript、lint 及独立副本回滚。最终数字、原始失败、源码/运行绑定、四产物及 Git 结果在集中执行后记录；本节不是通过声明。

## 整体后续

本轮只处理协议依赖与 shared endpoint。视频新任务首次提交的执行归属、媒体 runtime 目录迁移、其它剩余环、外围 UI/CAS 和 R6 全产品候选继续。独立任务分支推进，不合回 main、不部署。


## 实际集中结果

| 项目 | 结果与边界 |
| --- | --- |
| 完整源码行为对照 | 53 profiles、2506操作（含成功与拒绝）结果精确一致；baseline capture6检查、modified23检查，actual codecs/uploader，HTTP/PG/付费调用0。 |
| 独立预期能力回归 | 两侧均32models/92modes/912wire/1254场景/8251断言；legacy7profiles/33SKU。 |
| 旧SKU与preset | 两侧均verified33SKU/802断言、family32active/33declared/886断言，独立wire预期。 |
| provider fixture端口迁移 | 相同新版夹具分别作用完整基线和新版，8类协议48模拟HTTP通过；实际adapter/decoder/download，网络transport端口明确替代。不是DNS、SSRF或真实供应商验收。 |
| 冻结来源PG | 实际提交/工作流双入口8场景16检查，原control10退化可复现；管理员来源、原冻结值、reservation/POST0保持。 |
| Next与Worker | 实际Next15.5.27 build/start六入口20；当前Worker bundle2340inputs/2外置包/HTTP route0，Linux包解析及31生命周期unit通过。不是完整产品镜像/生产验收。 |
| AST与依赖 | 7170原生产声明保持（21个移owner，仅内部codec读取同一Map改窄getter）；9个业务算法文件字节不变。最大emitted静态与全导入SCC均20→3，原20成员全部退出环；adapter/upload环删除，其余环成员完全保持。 |
| helper导入 | 实际esbuild只引用helper时，生产输入31→6，protocol文件19→0，registry0；不是内存或延迟测量。 |
| 类型/lint | 全项目TypeScript、全部本轮源码及测试定向lint通过。 |

### 保留失败与修正

1. 新边界观察器首次把esbuild虚拟`<stdin>`当真实文件读，exit1；仅把source hash清单限定实际`src/`，原log保留。
2. 原provider脚本在完整基线与新版均把Request看成普通字符串，出现“视频服务未返回任务ID”exit1。修正Request观测后，又发现global fetch没有拦住原生transport，产生域名解析拒绝；该失败也保留，没有真实供应商POST。最终明确注入modelEndpointFetch网络端口，并共享Error realm，未修改生产transport或协议行为。原有幂等/解码/结果及跨origin鉴权断言全部保留，最终同夹具两侧通过。
3. Worker包测试第一次只复制了部分unit依赖，23通过/1模块缺失；补齐实际`video-worker-with-media.mjs`后31通过，原日志不覆盖。
4. AST检查者的可选byte-exact列表误列不存在的`video/recovery.ts`，改为实际`video/worker.ts`，没有业务修改。

完整命令、literal、退出码和绑定在本轮VERIFICATION。独立副本恢复/patch重放、四产物、提交推送和自有夹具清理在本轮DELIVERY终态核对，实际工作树保持重构实现。
