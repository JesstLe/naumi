# 独立定价服务（第一版验收）

## 边界与实现记录

- 用户要求先独立验收，满意后再并入 Naumi。此模块本期只运行本地独立服务；不修改 Naumi 的生产配置、钱包、支付、数据库、供应商调用。
- 复用 TypeScript、现有 Zod、`src/lib/billing/money.ts` 的整数舍入、功能注册表及已核查 APIMart 目录。定价核心与 HTTP/UI/存储分离，后续可以原样搬入 `src/lib` 并注入现有 PostgreSQL repository。
- 使用 Node 24 自带 SQLite，独立 `.data/pricing.sqlite`；版本、草稿、冻结报价持久保存。该数据库不是生产 PostgreSQL，不读项目 `.env`。
- 原生按细分输入/缓存/图片输出 token；EXT 按包价，不能叠加 token。默认黄金档、倍率3、预算汇率7、完整质量档（不默默套 medium 上限）。采购成本与售价分开，缺用量标输出部分估计/待核对；真实0与缺失区分。
- 公共目录能力仅是文档证据，EXT账号灰度、生产实际模型、会员充值成本尚未核验。服务不允许发起收费供应商测试。
- 发布到本服务只影响新试算，旧报价冻结；这不表示同步到 Naumi 或生产上线。

## 当前进度

- 已检查现有计费、API成本、预设配置和功能注册表。现有预设只覆盖 low/medium × 三档分辨率，不能完整承载本次全部比例/五档质量售价，需要后续接口整合。
- 已完成：纯定价核心、SQLite存储、HTTP鉴权、浅色管理台、模块测试与浏览器验收。当前已启动在 `http://127.0.0.1:4317/`，当前验收数据目录是忽略目录 `output/pricing-service-20261008/runtime/`。
- 浏览器实测：4K/1:1/medium 原生输出部分售价0.747432元；保存草稿倍率4不改变现版本，应用v2后新报价0.996576元，旧报价保留v1；回滚v1创建v3并恢复倍率3。对本地审阅包及独立数据库进行真实操作，没有修改生产。
- 可配置公开ID、展示名、实际模型/EXT版本、全局与模型独立倍率、价格档位、五种原生token成本、EXT分辨率包价、汇率与依据、质量执行策略、积分兑换与舍入、单规格固定售价覆盖。
- 已构建独立Node24部署包，运行时不依赖Naumi服务或npm依赖；开发源码仍复用项目基础组件。

## 后续接入点（本期不执行）

1. `src/lib/model-config/business-billing.ts` / `image-preset.ts`：公开模型与实际模型、参数映射及版本冻结。
2. `src/lib/billing/quote.ts` / `api-cost.ts`：统一调用定价核心，真实用户确认上限、积分兑换、预占与结算。
3. `src/lib/supplier-cost`：仅使用已核验单任务成本或完整usage；不要将本服务试算当供应商账单。
4. 现有后台、权限、PostgreSQL发布事务与Router版本确认作为唯一生产配置源。本期独立SQLite版本不会与生产版本竞争。

## 启动与验收

Node 24+；源码开发复用仓库已有 `node_modules`，无需新增依赖或读取 `.env`。

```powershell
cd E:\Workspace\naumi
node node_modules/tsx/dist/cli.mjs services/pricing-service/server.ts
# 或执行 services/pricing-service/start.ps1
```

默认只监听127.0.0.1:4317；首次自动生成随机管理口令文件，密钥不输出到终端、不存浏览器LocalStorage。Windows会限制独立数据目录和口令ACL为当前用户。登录只在当前页面内存保存授权，刷新后重新输入。审阅服务不接收供应商密钥。

环境变量：`PRICING_PORT`（默认4317）、`PRICING_DATA_DIR`（默认 `services/pricing-service/.data`）、`PRICING_ADMIN_TOKEN`（可选，至少24字符）。当前验收口令文件：`output/pricing-service-20261008/runtime/admin-token.txt`（忽略、不入库）。

独立打包：

```powershell
node services/pricing-service/build.mjs
# 可将 services/pricing-service/dist/ 复制至独立目录
node services/pricing-service/dist/server.mjs
```

复制包需Node24；运行无需数据库服务器或供应商密钥。SQLite建表幂等，`PRAGMA user_version=1`；重启不会重新覆盖管理员已保存配置。打包不会包含 `.data`。

### 操作步骤

1. 打开工作台并输入本地口令，查看原生/EXT售价矩阵，切换分辨率、成本/售价/API价差视图。
2. 「定价配置」中编辑采购成本、倍率、汇率、公开/实际模型、独立倍率和参数策略。
3. 「保存草稿」只持久化草稿；「预览草稿售价」不修改生效版本。
4. 填写原因，点击「应用到本服务」。完整验证后发布版本；出错时上一版本不变。
5. 「报价试算」可输入细分usage或手工任务总USD费用；后者优先，不再加usage。用固定幂等编号冻结报价，重放仍使用同一快照。
6. 「版本记录」填写原因回滚指定版本，生成新版本；「导出审阅包」包含价格和来源，明确 `productionReady=false`，不是自动部署配置。

### API

除页面静态资源和`GET /health`外，所有接口需要 `Authorization: Bearer <本地口令>`；限制Host和Origin，未提供公网跨域接口。

|接口|作用|
|---|---|
|GET `/health`|健康、独立模式、当前版本，不含敏感价格配置|
|GET `/v1/state`|当前配置、草稿revision、历史、项目功能注册表、来源|
|GET `/v1/matrix?publicId=…&resolution=4K`|当前已生效价格矩阵|
|POST `/v1/preview`|`{config,publicId,resolution?}` 验证草稿并预览|
|POST `/v1/draft`|`{expectedRevision,config}` 保存草稿，revision冲突409|
|POST `/v1/apply`|`{expectedVersion,expectedRevision,reason}` 在SQLite事务内发布|
|POST `/v1/rollback`|`{expectedVersion,targetVersion,reason}` 回滚产生新版本|
|POST `/v1/try`|当前版本纯试算，不保存报价|
|POST `/v1/quote`|需 `Idempotency-Key`；冻结配置、有效参数、精确金额、版本|
|GET `/v1/quotes/{id}`|读取原冻结报价|
|GET `/v1/export`|只供审阅的配置包与剩余阻塞|

报价请求：

```json
{
  "publicId": "gpt-image2.5",
  "resolution": "4K",
  "ratio": "1:1",
  "quality": "medium",
  "quantity": 1,
  "usage": {
    "textInput": 1000,
    "cachedTextInput": 20,
    "imageInput": 100,
    "cachedImageInput": 10,
    "imageOutput": 1483
  }
}
```

输入各维度互斥，不重复计缓存。usage是整次调用合计，不按quantity再乘。`reportedTotalUsd`可选，存在时总费用优先，0是有效金额；省略usage且没有总费用的原生请求仅返回输出部分估计。所有金额字符串；`saleExact`保存有理数分子分母，直到展示/积分边界才舍入。

### 测试与恢复

```powershell
node node_modules/tsx/dist/cli.mjs services/pricing-service/tests/verify.ts
npx tsc --noEmit --pretty false
```

通过1800项原生会员档/模型/规格/质量金额核对，及输入/输出/缓存、总费用优先、0与缺失区分、EXT包价/数量、质量上限、固定售价、积分舍入、401权限、403来源/Host、409冲突、SQLite重开/报价冻结/幂等/回滚。未发起收费API测试。真实用户扣费、退款、供应商补查及Router同步留到用户验收后集成现有业务链。

配置回滚优先用页面「版本记录」。CLI恢复（目标版本1）：

```powershell
node node_modules/tsx/dist/cli.mjs services/pricing-service/rollback.ts 1 "E:/Workspace/naumi/output/pricing-service-20261008/runtime/pricing.sqlite"
```

可执行 `services/pricing-service/ROLLBACK.sh` 等价调用；`--test`只操作临时独立数据库做恢复演练。数据库备份应在停止该微服务后复制 `.sqlite`（含未checkpoint时的wal/shm）或使用SQLite在线备份；不要用文件复制覆盖正在工作的库。

验收证据：`output/pricing-service-20261008/VERIFICATION.txt`、源码副本、补丁、截图和独立恢复库。原目录数据hash及现有钱包金额代码保持不变。
