# 计费与模型路由管理（2026-10-07）

## 当前代码审计（已落地）

- 基线：090b25f，工作分支 `codex/billing-model-routing`，从已同步远端的画布修复分支开始。
- 现有 `/admin/billing` 支持积分规则、钱包预占、幂等结算、不可变计费版本和人工核对。
- `/admin/bi/models` 支持供应商凭据、真实上游模型、公开别名、混合池、Router prepare/activate 确认及版本回滚。
- 已落地：按工具/画布操作的公开模型目录、人民币售价与采购成本分离、usage 实际用量结算、版本化路由、在途冻结、重复请求幂等、普通生图/画布改字后处理恢复。
- 明确未接通：AI 超分独立供应商 receipt、5xx/超时后的质量检测升级、视频阶段回退、任意代码规则、独立 `tool.upscale`/`tool.printfile` 模型路由、供应商任务查询 API。后台对这些能力阻止保存或保留原专用处理器，不用静态成功冒充已接通。
- 复用：计费 operations/ledger/reservations，model versions/drafts/publications，现有 SDK 适配、安全 transport、任务 checkpoint。密钥不进浏览器。

## 实施约定

新增功能配置存入现有模型完整版本，模型选项、人民币售价与兑换规则一起发布；计费操作冻结覆盖后的 tariff 和模型版本。原计费功能总开关、充值、钱包及旧配置兼容保留。禁止新增另一个生效配置指针。

旧版本扩展字段采用可选字段，不重写旧版本 JSON/digest。新增草稿数据通过幂等加表迁移持久化，回滚代码不删除新表或历史版本。

结构化请求规则与明确拒绝后的规则分阶段执行；未知供应商状态不重提。供应商未返回 usage 时进入待核对，不用估算值充当真实值。普通缩放不标作原生图或 AI 超分。

## 实现状态

- [x] 功能模型目录与执行校验
- [x] 人民币售价、成本来源及实际用量计费
- [x] 功能工作流后台与应用版本
- [x] 结构化路由、预算与调用审计
- [x] 后处理 checkpoint 与独立恢复
- [x] 隔离数据库/本地协议端点集成验收
- [x] 浏览器验收
- [x] Git 选择性提交、推送、固定镜像发布与线上只读验收
- [ ] 真实供应商付费/质量验收与未接通阶段能力

本文件随实现更新。隔离测试供应商验证协议和业务链，不代表真实供应商质量验收。

## 后台操作步骤

1. 管理员打开 `/admin/billing`，默认进入“功能计费与模型路由”；钱包、充值与旧兼容价格位于 `?section=wallet`。
2. 选择工具或画布操作，新增公开模型 ID/名称，或复用已验证兼容的公开模型；公开 ID 与供应商真实模型始终分开。
3. 在采购成本区选择 CNY/USD、按张/按任务/token、来源和更新时间。未确认或缺失成本显示“成本未知”，不会计算确定利润；按张包价不会叠加 token。
4. 单独填写人民币售价、兑换积分精度和舍入，按尺寸/质量设置变体；固定月费在顶部独立维护，不摊入调用利润。
5. 需要时打开阶段路由，设置请求前结构化条件、明确未收费拒绝后的回退、默认上游、最大尝试次数和人民币采购上限。5xx、超时、断流及付费状态不明不自动重提。
6. 图片操作可配置普通缩放或原生像素校验。AI 超分、未达到规格的“返回底图并按成品收费”会被后端拒绝。
7. 保存草稿 → 校验并预览差异 → 应用。应用会准备并激活 Router、写入不可变完整版本；任务开始后冻结模型/计费版本。发布记录可恢复为新版本。

## 接口摘要

- `GET /api/models?feature=<feature>`：只返回已生效的脱敏公开模型、能力和版本。
- `POST /api/billing/quote`：根据生效功能模型、参数和计费版本报价。
- `/api/admin/bi/model-config`：管理员读取、草稿、校验、模拟、发布、历史与恢复；普通用户统一 404。
- `GET /api/admin/billing/models/stages?operationId=...`：查看命中规则、供应商阶段、冻结版本、预算/实际阶段成本和后处理状态。
- `POST /api/media/postprocess/retry`（任务所有者）或 `/api/admin/billing/models/postprocess/retry`（管理员）：仅恢复后处理，不重新生成底图。

## 数据与精度

金额统一以人民币微元（1 元 = 1,000,000）保存，积分换算采用配置化兑换率与 ceil/floor/nearest。采购成本、用户售价、固定月费、阶段预算、实际 usage 成本分别存储。新增字段和表见 `scripts/migrations/20261007-business-model-routing.sql`；迁移为 additive，旧钱包、配置历史和媒体不会删除。

## 验收证据

- `output/billing-routing-20261007/full-delivery.log`：TypeScript、业务路由、模型配置、发布、执行、Router 合同和 18 个原计费模块均通过。
- `output/billing-routing-20261007/business-delivery.log`：关闭路由直连、优先级、预算、未知收费暂停、部分 usage 待核对、版本冻结、幂等回放、后处理恢复、实际像素和作品元数据通过。
- `output/billing-routing-20261007/ui-delivery.log`：真实隔离 Next + 锁定 Go Router 浏览器验收通过，模型列表脱敏、应用触发 Router、刷新保留价格、画布文字节点使用后台目录、移动端无横向溢出、非管理员 404。

## 完整交付范围与限制

本次不是所有供应商能力已齐备的全量版本：工具印花/独立超分仍走原处理器，图片 token 用量收费、视频阶段回退、质量检测升级和供应商原任务查询仍未接通。付费状态不明时保留任务与预占，须管理员按供应商原任务证据核对后结算/退款；禁止直接重复提交。已接入的回退仅接受明确 `billing_status=not_charged`，HTTP 429 本身不算未收费证明。

数据库生效配置在 PostgreSQL，Router 投影共用模型/计费版本；新增业务路由在应用执行链控制，不在 Router 维护第二套规则。独立 Router 继续处理已有混合池和协议适配。发布确认以 Router prepare/activate 回执及数据库有效版本为准。

验收环境为本地隔离 PostgreSQL、实际 Next 服务与锁定 Go Router，供应商为本地协议 fixture（没有真实付费）；生产发布只能证明服务、权限、目录、版本与迁移状态，不代表真实供应商质量/结算验收完成。

旧钱包浏览器回归：`output/billing-routing-20261007/billing-ui-delivery5.log`，15 passed。基线归档 SHA256：`9dfe4be036152c187b7db5ad9508d6f1180d7c431992facd8dca5c636cad0454`。

## 生产交付（2026-10-07）

- 已推送分支：`codex/billing-model-routing`。应用固定提交：`ed69d0ab93f7dd421ebef9f61010d928e2e7b011`；发布目录：`/opt/naumi/releases/ed69d0ab93f7-20261007-122518`。
- GitHub 镜像构建成功，离线 Artifact 因仓库配额耗尽上传失败，生产 GHCR 拉取返回 403；使用本机从同一提交构建的固定镜像离线发布（不在生产构建），`BUILD_VERSION=1791346455`。本机镜像摘要：`sha256:206a56477a8008c82ac85b13fc55273a7c1a70458ccaa75d2fa1f1dd5c114db4`。镜像归档 SHA256：`874ee8638227e53e28d3e57e25f12b657a615dc10d8707eb8ec0ee8a6e1c13e7`。
- 新增 SQL 已在 PostgreSQL 执行，迁移前备份：`/opt/naumi/backups/billing-routing-20261007-20261007-122516`；备份目录包含环境、Compose、Nginx、可读的 PostgreSQL dump 与 SHA256。
- `scripts/deploy-release.sh` 首次在 Nginx reload 阶段失败：旧重启时 Nginx 因 Docker 网桥 172.20.0.1 尚未就绪而启动失败。恢复 Nginx 后，新应用直连验收通过，沿该发布目录完成权限/健康/计数/固定镜像校验并更新 current 链接。没有删除数据库或媒体。
- 生产回滚保护发现 2 个带模型快照的未结算图片任务，阻止退回旧应用；没有绕过保护或重提这些任务。代码回滚在独立副本成功，发布成功与失败恢复链分别通过隔离容器测试。生产 `ROLLBACK.sh --check` 通过，但不是生产回滚已完成。
- Nginx 增加 `/etc/systemd/system/nginx.service.d/naumi-docker-startup.conf`，等待 Docker 且失败后重试；现运行态 `active`，未为了验收重启生产主机。撤销该单独启动修复：移除该精确文件并运行 `systemctl daemon-reload`（不恢复数据库）。原状态记录在当前发布的 `backups/nginx-startup.before`。
- 公网 `http://101.133.166.67/api/health=200`，数据库正常；普通访问后台 API=404，匿名后台页面=307 登录跳转，管理员后台/阶段 API=200。模型目录不含供应商密钥与成本。
- 生产继续 `STORAGE_DRIVER=s3`，环境文件字节一致，发布前后均 75 用户、1968 作品。原模型有效版本仍为 1，26 个公开模型；没有自动发布新售价或改变客户模型，功能配置条目仍为 0。普通生图/工具/画布图片目录各 13 个模型，文字目录当前为空，需管理员登记并核验文字供应商后配置，不能把空目录说成已接通。
- 已完成页面、权限、迁移与目录线上验收，供应商调用 0；改价实际调用/扣费、路由、冻结与后处理恢复验收使用本地协议端点，不是供应商实际账单或质量证明。

### 改动与证据入口

完整 77 文件改动清单：`output/billing-routing-20261007/changed-files.txt`，代码差异：`DIFF_FILE.patch`。核心模块为 `src/components/admin/model-config/business-editor.tsx`、`src/lib/model-config/business*.ts`、`src/lib/model-config/stage-routing.ts`、`src/lib/billing/money.ts`、`src/lib/media-postprocess.ts`、`src/app/api/models/route.ts`、`src/app/api/admin/billing/models/**`，以及既有工具/画布/计费执行入口。

四个交付制品位于 `output/billing-routing-20261007/`：`MODIFIED_FILE.tar.gz`（已部署应用源码）、`DIFF_FILE.patch`、`VERIFICATION.txt`（精确命令/输入/输出/退出状态）、`ROLLBACK.sh`（只允许独立验收副本，非生产回滚脚本）。生产回滚脚本是 `/opt/naumi/ROLLBACK_RELEASE.sh`，保留未结算任务保护。原始代码归档 SHA256 保持不变。

线上证据：`production-final-acceptance.log`、`production-finalize.log`、`production-final-state.log`。本地回滚证据：`package-delivery.log`，基线与恢复后模型/计费测试退出状态均为 0。
