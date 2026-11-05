# 固定源码架构审计：证据与目录归属

日期：2026-10-24。审视 HEAD：`8b00cb35ddf318ec81d6c7e604d4d11956d50ffc`。业务源码基线：`905c8c635e41ff3f4443d43db9776d1db3aab469`。

本文是[重构方案](../REFACTOR_ARCHITECTURE.md)的证据附录，不是线上故障归因或安全审计报告。

## 1. 方法与复核口径

1. `git ls-files -z` 盘点 4,005 个 tracked 文件。
2. 对 2,496 个 TS/JS 代码文件解析 TS AST；`src` 子图包括 1,226 个代码文件，不含 `.d.ts`。
3. 读取 import、export-from、字面动态 import、字面 require；解析 `@/` 和相对路径。此次本地未解析依赖为 0。
4. 计算源内直接依赖、反向静态可达集合和 Tarjan 强连通分量。去除显式 type-only；另外用 TypeScript `transpileModule` 擦除类型再扫描，静态 SCC 规模一致。
5. 核对实际调用顺序和职责，补充 HTTP 调用、SQL 写入、构建资源等 AST 图未涵盖的边。

限定：TS 擦除扫描不是生产 bundle/tree-shaking 结果；计算 import、运行时注册、环境开关、Python/SQL/HTTP 不靠 AST 图完整证明。`functions` 统计含箭头回调，不当作命名业务函数数量。行数含注释和空行。未逐行人工审阅全部代码，未执行测试/构建或验证服务在运行。

完整机器结果在本工作树的 `output/architecture-review-20261024/`：`SUMMARY.json`、`FILES.json`、`DEPENDENCIES.json`、`EMITTED_DEPENDENCIES.json`、`MODULE_EDGES.json` 和 `scan.log`。它们只用于本轮原始取证，固定精简结果在本目录的 `2026-10-24-baseline.json`。

可复跑只读结构扫描：

```powershell
# 在重构 worktree；可使用本地已安装的 TypeScript，不加载应用模块。
$env:TYPESCRIPT_PATH='C:/Users/13357/.t3/worktrees/naumi/codex-imagegen-simplify-release47-20261023/node_modules/typescript'
node scripts/architecture/analyze.cjs output/architecture-review-current
```

重跑后的 HEAD/总文件数随文档新增变化，勿强求等于旧 4,005；比较 `src` 文件 hash 和相同指标。scanner 不是 tsc、产品 verifier 或容量 benchmark。

## 2. 整体目录盘点与处理意见

| 目录 | tracked 文件 | 实际职责/本轮证据 | 重构处理 |
|---|---:|---|---|
| `src` | 1,271 | app 367、components 293、lib 609；271 个 API route | 按业务模块渐迁，保留 Next 路由约定 |
| `scripts` | 1,247 | 根下924，ops196，staging69，video-fusion18，其他40；测试、运维、迁移、生产运行代码混排 | 先移运行实现，再按 test/ops/build/migration/fixture 归类；旧命令留 CLI 壳 |
| `docs` | 697 | 模块实现、发布与历史证据 | 留历史；增加一个当前架构入口和阶段台账，不重复复制全部历史 |
| `services` | 292 | enterprise-workflow253、reference-workbench23、pricing-service16 | 按运行/构建连接分别处理，不整目录清理 |
| `design` | 282 | 原型和实际被主应用引用的企业素材并存 | 标记 build-input / prototype；先查引用再整理 |
| `public` | 140 | 静态与工作台生成资产 | 源文件和 generated 输出分清，构建可复现 |
| `deploy` | 21 | 发布/运行配置模板 | 与当前真正入口核对，不在架构任务操作实例 |
| `vendor` | 2 | 外部固定输入 | 保留来源/版本，不当业务大文件拆 |
| `output` | 18 | 历史被跟踪文件 | 与本轮 ignored output 不同，不按“输出”批量删除 |

### `src/lib` 的主要业务群

- `video` 85 个代码文件；`model-config` 80；`imagegen` 53；`canvas` 47；`billing` 38；`agent` 27。其中 model-config 目录还含2个非代码文件，billing 还含2个非代码文件。
- 根层 117 个 tracked 文件：db、settings、storage、auth、各类 image job、支付、画布等横向聚集。
- 其他已存在模块包括 enterprise、saas、teams、BI、supplier-cost/models、model-health、feature-access、studio3d、fleet、pay、object-storage、comfyui、image-skills 等。**有独立目录不等于没有跨层依赖；本轮没有把这些目录逐个认定为应重写。**
- `templates-data.ts` 5,911 行、`i18n/dict.ts` 2,201 行主要是数据，不能和有复杂状态/副作用的 Canvas 一起按行数排序改造。

## 3. 证据台账

分类：**S** = 本轮源码/结构确认；**D** = 设计判断；**V** = 后续需运行/现场核实。优先级表示迁移顺序，不是假定线上事故严重度。

| ID | 优先 | 分类 | 证据 | 结构问题、动作与完成信号 |
|---|---|---|---|---|
| A01 | 第一批 | S/D | `src/lib/imagegen/generation-core.ts:12-16,40-57`；`src/lib/imagegen/adapters.ts:16` | 业务反向构造 HTTP/用户 cookie 调 route。提取真实 typed 用例，两个 route 保留协议壳；生产 lib→app 2条归零 |
| A02 | 第一批 | S/D | `src/app/api/generate-image/route.ts:227-426,496-608,632-725,726-975,1000-1189` | provider、图像处理、存储、解析、编排同文件。按真实步骤和 owner 提取，不仅逐函数搬 utils |
| A03 | 第一批 | S/D | `src/lib/imagegen/stored-delivery.ts:48-120`；`src/app/api/generate-image/route.ts:726-975` | 正常和原结果恢复都涉及处理/作品/结算；合并本地 continuation，保留不同进入条件、原字节、原账务身份 |
| A04 | 第一批 | S/D | `src/lib/model-config/requests.ts:97-165`；`src/lib/imagegen/plan.ts:28-85`；`src/lib/canvas/generation-parameters.ts:41-76` | 多处推断/限制同一规格。每入口翻译，单一准备函数生成 effective 参数/候选/报价 |
| A05 | 第一批 | S/D | `src/lib/model-config/server.ts:2-3,15-35`；`src/lib/billing/server.ts:2-26` | models 与 billing 组装反向依赖。把构造移到 composition，执行读取和配置管理分开 |
| A06 | 分阶段 | S/D | `src/lib/db.ts:1-26,43-63`；`src/lib/db.ts:2433-2459,2505-2581,4199-4220` | 底层出口加载上层业务，242直接消费者。先拆纯连接/Tx，再按 owner 迁 repository，db.ts 只短期兼容 |
| A07 | 分阶段 | S/D | `src/lib/db.ts:63-622`；`src/lib/media-assets.ts:12-33`；`src/lib/billing/image-quotes.ts:13-19` | 热路径 ensure 混合 DDL/bootstrap。逐模块迁到版本迁移；新库和已有库升级等价后再删 |
| A08 | 第一批 | S/D | `src/components/canvas/canvas-client.tsx:1576-1627,4435-4674` | Canvas 内网络路由、业务报价与占位/视图混杂。提取生成 controller，UI 只发意图并投影 receipt |
| A09 | 第二批 | S/D | `src/components/canvas/canvas-client.tsx:2272-2404,5968-6100,8403-8425` | 撤销/保存/本地 optimistic 写有多套组织方式。合并文档 command 入口；保留现有历史请求事务和视频 revision |
| A10 | 第二批 | S/D | `src/components/canvas/canvas-client.tsx:2481-2583,3112-3125,8491-8523` | 账号初始化、任务恢复、弹层键盘门控在主文件共享状态。按 persistence/tasks/interaction 分域，不搬进一个 god hook |
| A11 | 第一批 | S/D | `src/lib/agent/runtime.ts:350-369`；`src/lib/billing/agent.ts:87-113`；`src/lib/agent/naumi-tools.ts:1276-1303` | Agent 已有 prepared plan 复用，但工具/计费仍相互理解，tool schema 还有旧确认描述。工具变成用例 adapter；运行逻辑与文案分别核对，不把描述当硬拦证据 |
| A12 | 第二批 | S/D | `src/lib/video/providers/wire.ts:5-15,28-85`；`src/lib/video/providers/protocols/index.ts:1-35`；`src/lib/video/providers/protocols/apib-documented.ts:3` | 20文件环：注册和纯helper同出口。拆纯合同/helper，装配只单向读取 codecs；原 wire fixtures 应逐 profile 保持 |
| A13 | 第二批 | S/D | `src/lib/model-config/business.ts:7`；`src/lib/model-config/tool-scope.ts:3,9-16` | business/tool-scope互用选择函数和常量。把纯绑定/默认选择归同一owner，消除二文件运行环 |
| A14 | 第二批 | S/D | `src/lib/canvas/video-node-service.ts:8,20-25`；`src/lib/video/assets.ts:10,16-20` | Canvas调用素材导入，素材又调用Canvas授权。改窄项目授权函数/端口；不复制归属校验 |
| A15 | 第二批 | S/D | `src/lib/video/providers/wire-adapter.ts:10,13-17`；`src/lib/video/providers/workflow-upload.ts:5` | endpoint helper在高层adapter导致上传与adapter相互依赖；提为纯helper |
| A16 | 第三批 | S/D | `src/lib/video/media-jobs.ts:16-17`；`src/lib/video/media.ts:6`；`Dockerfile:76-87` | 运行实现位于scripts并被Docker明确复制。迁runtime与镜像清单一起做；仅改import可能导致镜像缺文件 |
| A17 | 第三批 | S/D/V | `scripts/worker-runtime.mjs:163,175-208`；`src/app/api/video/worker/tick/route.ts:25-33` | Worker通过HTTP驱动Web扫描多任务，任务函数仍在Web运行。按资源域迁Worker用例调用；独立媒体部分已存在，不能说全是Web执行 |
| A18 | 第二批 | S/D | `src/lib/billing/service.ts:130-153`；`src/lib/image-job-repository.ts:1-28` | billing费用补查直写image job标记；job repo又组装账务/创作。保留同Tx，改跨owner窄接口或上层协调，不各自开Tx |
| A19 | 第二批 | S/D | `src/lib/model-config/context.ts:1-29`；`src/lib/imagegen/generation-core.ts:57` | 关键执行计划/账务依赖隐式context。先显式传Prepared/Frozen契约，ALS留边界日志及旧入口适配 |
| A20 | 后续 | S/D/V | `scripts/build-reference-workbench.mjs:4-13`；`services/reference-workbench/README.md:1-32` | HTML/JS经大量replaceAll接入原生Web；另有Python服务。先单一资产来源与typed bridge，不新建第三套执行系统 |
| A21 | 后续 | S/D/V | `services/pricing-service/package.json:1-10`；`services/pricing-service/server.ts:85-98` | 独立价格评审工具；限定主应用/构建入口无直接引用。保留用途标识，非生产计价模块，不凭无import判无人使用 |
| A22 | 后续 | S/D | `src/app/api/enterprise/workflow/routing/route.ts:7`；`services/enterprise-workflow/src/routing-store.ts:1-24`；`src/lib/enterprise/workflow-identity.ts:48-57` | BFF跨进独立服务store导入schema，而桥接又用HTTP。共享纯合同，保留真实独立服务，不把store类带进Web编译依赖 |
| A23 | 全程 | S/D | `.github/workflows/image-gateway.yml:12-64,121-159`；`.github/workflows/docker.yml:6-18` | 已有真实PG/build/账务/模型/浏览器CI，并非无测试；PR path和镜像path未显式覆盖services/design依赖，需要跟随实际构建图。required branch protection未查询 |
| A24 | 后续 | S/D | `src/components/admin/admin-settings.tsx` 3331行；`src/components/admin/model-config/manager.tsx` 1219行；`src/components/supabase-auth.tsx` 1322行 | 按设置、账户、模型管理等职责拆；先创作链后治理这些大面板，避免全站一起搬 |
| A25 | 全程 | S/D | `src/lib/saas/creation-context.ts:14-35`；`src/lib/durable-image-jobs.ts:227-230`；`src/lib/storage.ts:6-19` | 已有冻结workspace、恢复上下文、存储adapter。保留并厘清边界，不当作冗余护栏删除 |

## 4. 实际主链与现有可复用能力

### 图片请求与恢复

```text
Canvas / Agent / 工作台
  → imagegen plan / prepared plan / 通用报价适配
  → /api/imagegen 的原回执优先与 submitImagegen
  → plan steps / DurableImageJobs
  → generation-core 组内部 HTTP
  → /api/generate-image
  → model / provider / paid checkpoint
  → 后处理 / 对象存储 / artwork / 原账务结算
  → 子/父回执

Worker → tick HTTP → Web 恢复函数 → 原 job/quote/checkpoint
stored-delivery → 已保存字节的独立本地续交
```

这是选定链路，不代表所有入口已完整统一。`_category` 等 legacy工具分支、suite/aplus、cutout、同步文字/媒体仍应逐调用方登记。

### 保留资产

- `createModelRepository` / `createModelRuntime` / credential store 工厂：已有显式依赖注入基础。
- `billing/service.ts:93-110`：余额与幂等结算；repository钱包锁/Tx：直接沿用。
- `DurableImageJobs` paidOperation、lease 与 frozen execution：重构边界，不另造任务引擎。
- `imagegen/quotes.ts` 原quote/fingerprint/scope 与 route receipt-first：沿原契约兼容。
- `output-advisory.ts:4-32`：已将比例偏差作为告知并保留产物，不能误记为全都拒交。
- Canvas现有 `useVideoTasks`、videoNode store、account cache、history operation：纳入局部controller，不重复建平行store。
- video capability/profile/schema、provider codec fixtures：字段语义与来源保留。
- object-storage adapter、media variants、镜像补传：继续用，不另接第二套存储SDK。

## 5. 静态环的解释

最大54文件环横跨 db/auth/settings、billing、model-config、supplier-cost、model-health、saas/teams/enterprise。加入字面动态导入后最大分量为68。另有20文件视频协议环；2文件环3组。含动态导入时还出现7文件等分量，完整列表在基线JSON/原始结果。

环是修改/初始化/测试边界互相影响的结构证据；不能凭环的大小断言生产死锁。解决顺序是剪具体反向边：纯DB、独立配置读取、组合根、纯helpers；不是强行把54文件移进一个大模块消除“跨模块”统计。

## 6. 已完成修复与后续基线

本轮只读核对本地提交 `9fc284514aeaed740cdf55cc49b611445676b517`：

- `model-config/requests.ts` 未知或不支持quality改为默认档+记录。
- `model-config/billing-model.ts` supplierRouting 不再用单primary能力代表全部候选进行计费前拒绝。
- `billing/server.ts` catalog只需要账号计价事实，不依赖默认执行模型。
- `billing/client.tsx` 和 Canvas 调整指定模型单价/总价路径。

这些提交不在扫描业务基线，统计未把它们混入。后续实施必须固定整合后的SHA、复用其23/35/22等验证脚本但重新绑定实际运行结果；本轮没有复跑或确认其线上状态。定价减法和视频来源修复在本基线中已有实现，不能通过回滚到更老实现重新引入确认门槛。

## 7. 未扩大为完成的事项

- 无线上服务、锁、容量或用户失败归因结论。
- 无所有271个route的完整权限/竞态审计结论。
- 无Python、3D、支付、enterprise全部业务语义已审结论。
- 无产品测试/build、真实浏览器创作、供应商交付、账务生产核验结论。
- 后续重构每模块须给新旧调用方清单、删除项和同SHA运行证据；这个设计文档不替代实施验收。
