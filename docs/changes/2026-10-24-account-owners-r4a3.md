# R4A3：账户事实、会话、钱包余额与支付历史的数据归属

## 基线与本轮改动

- 工作区：`E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。
- 完整源码基线：`62f6aefb6bcc7b8ae5234a8b2c224a1f5cdb0b59`；原始归档与逐文件 SHA 在 `output/refactor-r4a3-20261024/BASELINE_SOURCE.tar`、`BASELINE.json`。
- R4A1/R4A2 的 pool、transaction、schema、raw settings owner 不重做。本模块不改表、不换价格、不改变业务参数和任务协议。

## 数据与调用职责

| Owner | 实际职责 | 明确不负责 |
|---|---|---|
| `lib/accounts/repository.ts` | 账号存在、密码 hash、角色、站长/本地 operator、封禁事实、登录 IP、备注 | 报价、供应商执行、HTTP 响应、跨表账号删除/迁移 |
| `lib/accounts/session.ts` | 注册事务与赠额编排、SessionUser 投影、plan 标签 | 定价选择、重新确认积分、供应商调用 |
| `lib/billing/wallet-balance.ts` | 活本金、过期流水、用户锁后的余额镜像刷新、到期概览 | 重做 reserve/settle 账务引擎 |
| `lib/payments/history.ts` | 已付订单累计金额、保存的发票历史 | 计算售价或修改历史订单 |
| `lib/user-image-provider/repository.ts` | 既存用户供应商记录和历史兼容读写 | 恢复已下线的新 BYOK 目录/执行 |

旧 `db.ts` 仅同函数 re-export 兼容；实际 src 调用方切到 owner。支付累计查询原本不做 ensureSchema，继续保持调用次序。独立钱包/会话函数保持原 SQL、用户优先锁与过期流水幂等，删除确认无调用的 `liveBatchBalance` 私有函数。

纯计费运行时消费者从 `billing/server` 改为真实 owner `billing/runtime`；HTTP 报价函数继续使用 server facade，同实例/同函数兼容出口保留。没有新增 DI 容器、全局注册器、事件总线或通用 repository 基类。

## 历史边界

- 新 BYOK 入口 `GET/POST/DELETE /api/account/image-provider` 继续 410，`getUserImageProvider` 继续 null；历史任务 credential envelope 按原 owner 恢复。
- `*_enc` 列的旧密文和历史原值语义保持；本轮不做凭据迁移。
- 旧 provider 写接口的 `ON CONFLICT(id)` 本身未增加 owner 条件、并发激活的双 UPDATE 与 facade 的吞错也未重写。当前 facade 先查 owner，新入口已退休；这不是已证实线上越权或事故归因，不能由迁移测试宣称这些历史设计已整改。
- 跨表 `deleteUser`、`setOwnerAccount`、后台汇总、订单履约和 legacy FIFO 等仍在旧门面，后续按完整用例拆；本轮没有把数据 owner 提取等同全站解耦。
- 账户会话仍通过实际 billing runtime 取得注册赠额。运行时/存储的动态依赖环与首次调用 DDL 继续归后续 R4A/R4B，不通过伪接口隐藏。

## 集中验收

模块实现完成后，集中运行两个新 verifier：实际函数/SQL 端口对照与完整源码真实隔离 PG 对照。新增检查覆盖账户读写与 owner、并发八次注册一次赠额、余额锁等待、重复 settlement 一次 consume、过期一次流水、零余额、支付 owner、历史 provider 字节/快照及已退休 HTTP 入口。登录 sidecar 单独进程检查只读余额路径。

相邻回归复用既有 wallet、entitlements、platform PG、persistence、creation 脚本。原 `verify-persistence-boundaries.cjs` 只扩展运行时 fixture 的 module alias，继续接受 `billing/server` 与 `billing/runtime`，不改测试业务预期。

### 实际结果

| 验证 | 实际结果 |
|---|---|
| 函数/SQL 端口对照 | 完整基线与新版均 `28 cases / 88 checks`，exit 0 |
| 完整源码真实 PG | 基线 `2 scenarios / 88 checks`；新版 `2 / 146`，均 exit 0；差额为新旧出口同函数断言，不是新增 58 个业务场景 |
| 实际登录 HTTP handler | 195 个同 IP 用户全部 200/有效 cookie；错误密码、封禁、跨站与无效请求保持原语义，用户余额行不变；exit 0 |
| 既有 platform PG | 29 检查；真实钱包、原 operation 幂等、事务 rollback、query pool 全占时独立协调 pool 仍可用；exit 0 |
| 既有 wallet/entitlements | reserve/settle、unknown hold、赠额、冻结产品、充值金额、兑换事务及管理员重放均 exit 0 |
| 既有 creation writer | 实际 scope/父子/多输出/原 checkpoint/账务归属链通过，供应调用 0；exit 0 |
| 既有 persistence | 29/90；settings 对照使用 R4A2 已保存的原始 expectation，SHA 绑定在 `persistence-adjacent/EXPECTED_BINDING.json`；exit 0 |
| 全项目 TypeScript | `node node_modules/typescript/bin/tsc --noEmit --incremental false`，exit 0 |
| 受影响 TS/TSX lint | exit 0，`No ESLint warnings or errors`；仅 Next 自身的 lint 命令弃用提示 |

实际函数不是浏览器点击验收；本轮无 UI 改动、无供应商业务请求、无完整 build/线上压测。

首次相邻 persistence 运行遗漏该脚本必需的 `SETTINGS_BASELINE.json`，exit 1。复用 R4A2 原期望并核对 SHA 后重跑这一个脚本通过；没有改预期。AST 比较器首次把一条拆成两条的动态 import 当作业务改变；补充绑定身份/顺序检查后只忽略已验证的 import 迁移，原失败保留 `BUSINESS_COMPARE_FIRST_FAILURE.log`。产品代码没有为测试放宽逻辑。

## 结构结果与未关闭项

- `db.ts` **5321 → 4793 行**。迁出 37 个顶层声明，规范化 import 后 AST 保持；旧 db 保留 212 个声明、其余 71 个调用文件的 686 个业务声明保持。实际消费者迁移登记为 71 文件/126 个绑定（不含 db 自身兼容出口调整及追加的纯 pool 引用调整）。
- 旧 db 的 emitted 静态消费者 **144 → 130**；旧含 db 的 24 文件静态 SCC 拆开，db 已退出静态环，剩余报价/执行环为 **19**。视频静态环仍 **20**，另有配置组装 **6**。
- 五个新 owner 均不在静态 SCC。**最大含动态 import 的 SCC 为 66 → 67**：账户会话随原 runtime→creation/storage 链进入，不能宣称所有环减少。后续须拆真实组装/存储反向依赖，而不是把 import 改动态来美化统计。
- 没有改收费、账户策略、数据 schema 或 provider 激活语义；兼容出口仍是同一函数/同一 lazy runtime。剩余跨表账户管理、legacy 钱包、资产/任务 owner 与配置 DDL 继续处理。

四产物及副本回滚的最终命令/literal/hash 在 `output/refactor-r4a3-20261024/VERIFICATION.txt`，源码交付状态在同目录 `DELIVERY.json`。仅本任务隔离 PG/schema/媒体按归属清理；不操作其他任务服务。

## 后续

继续完整重构候选而非另建第二套产品。本模块完成计数为上次 main 同步后第 2 个模块；不自动合 main、不部署。R3 外围 UI/CAS、R4B DDL/配置组装、R5 Worker/provider、R6 最终完整构建/CI/规模验证继续在迁移台账。
