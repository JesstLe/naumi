# HTTP 画布计费提交兼容修复

## 基线与原因

- 基于生产提交 `51e3bd71e96fb4ce2f054fad592a099e46ce99d2`，保留其模型管理、可配置计费和管理中心，不覆盖为旧 main。
- 真实 HTTP 入口的 `isSecureContext=false`，`crypto.subtle` 和 `crypto.randomUUID` 均不存在。线上画布 bundle 直接调用二者，用户提交先在请求指纹处报错，生成请求未发出。
- 此修复只处理该浏览器兼容问题，不扩大为之前计费审计的任务恢复改造。

## 实现

- `browser-crypto.ts`：可用时使用原生 SHA-256，否则使用直接锁定版本的 `@noble/hashes` SHA-256 实现。保持已有请求指纹及本地重试键完全一致，不把原始提示词或图片写入 localStorage。
- HTTP 的随机请求编号使用 `crypto.getRandomValues` 生成标准 UUID v4；HTTPS 保留原生 UUID。没有密码学随机源时返回明确错误，不降级为时间戳或 `Math.random`。
- 计费提交、画布改字/视频/历史操作和视频工作台批量编号复用同一入口。保留稳定 operation ID、报价确认、服务端计费及重试逻辑。
- 不修改服务器 TLS、价格、余额、凭据、数据库 schema 或媒体卷。

## 集中验收

- 原代码在独立归档副本、HTTP 等效 API 环境运行 `scripts/verify-browser-billing-crypto.ts`，原样返回 `HTTP_INTENT=FAIL Cannot read properties of undefined (reading 'digest')`，退出码 1。
- 修复后该脚本退出码 0：HTTP 与原生 SHA-256 的空输入/边界/1MB/字节视图一致，JSON/文件指纹与安全上下文完全一致；1000 个 UUID v4 无重复；缺少密码学随机源时不使用弱随机降级。
- T3 实际浏览器在生产 HTTP 页面同源隔离 iframe 中执行修复后的真实 BillingProvider 与指纹函数，`isSecureContext=false`、`subtle=undefined`、`randomUUID=undefined`。模拟生成接口共 5 次：500 重试、待核查、重新挂载均保留 ID，成功清理，新操作获得新 ID，冻结 body/header 和报价不变。
- 同一浏览器 fixture 在 loopback 安全上下文验证原生路径，全部通过。安全上下文不等同于服务器已配置 HTTPS，本次不更改域名或 TLS。
- `npx tsc --noEmit`、`npm run lint`、`npm run build` 通过。lint 仅保留两项已有 img 优化提示。
- 原有 `verify-billing-review.ts retry` 与独立 PostgreSQL `verify:billing-intents` 通过：重复及不确定提交不执行创建两次。

## 可重复验收

```powershell
npm run verify:browser-billing-crypto
node scripts/build-browser-billing-crypto-fixture.mjs
```

浏览器通过 T3 preview 在同源临时 iframe 执行忽略目录的 `browser-fixture.js`，调用 `runBrowserBillingCryptoFixture()`。fixture 使用真实 BillingProvider，仅鉴权与供应商接口替换为本地测试夹具；结束后销毁 React 根和 iframe，恢复 fetch/localStorage。不在生产创建账户、充值或生成任务。

## 发布状态

- 已提交并推送 `95e1cd8d9d22ea8d3262774ed9fa927051a2af48`，PR [#5](https://github.com/JesstLe/naumi/pull/5) 以模型配置分支为基底，未合并其他尚开放的 PR。
- 修复提交的[完整回归 CI](https://github.com/JesstLe/naumi/actions/runs/37558898645)通过，包含全部计费、模型执行、后台浏览器验收及原业务回归。[镜像 CI](https://github.com/JesstLe/naumi/actions/runs/37558898524)构建成功，但 GitHub artifact 存储配额阻止离线包上传；本机从相同提交归档用原 Dockerfile 构建 Linux amd64 固定镜像，核验版本、SHA-256/UUID 实现和 sharp 原生模块后离线发布。没有向生产持久分发 GitHub 凭据。
- 实际 release：`/opt/naumi/releases/95e1cd8d9d22-20261007-100525`；app/worker 同为 `ghcr.io/jesstle/naumi:95e1cd8d9d22ea8d3262774ed9fa927051a2af48`，镜像 ID `sha256:e0c8f391f24e8e689a585ce367b9d098c3dda10794d756a39dcb0add723c5ab0`；公开版本 `1791337673`。
- 源码包 SHA256 `50cfd7118c5a27030b3554a3d250c9897ec1d69c45e381ca6d0c29a905665b75`；镜像 gzip 包 SHA256 `35cd08b2f5aea918a59a278b0b98354ae7b228d5000a54c88d5d02033b9e9cd6`。上传摘要与 gzip CRC 通过。
- 发布前入口维护、暂停 worker/app、确认无进行中任务或待结算操作；使用既有 `scripts/deploy-release.sh` 协调发布。独立备份 `/opt/naumi/backups/http-billing-crypto-20261007-retry` 保留数据库 custom dump、配置、Nginx、旧路径和数据/媒体校验清单。媒体卷不重建、不恢复、不清理，保持现有媒体备份策略。
- 用户/余额、流水、积分批次、作品、计费与模型配置、设置和模型凭据逐表摘要完全一致；媒体逐文件 SHA256 清单一致，生产 .env 与 Nginx 逐字节一致，模型和计费版本仍为 1。
- 首页、画布、视频、health、version 返回 200；数据库健康，匿名后台和公开内部容量接口保持原有 404。app/worker 同版本且运行。
- 首次最后验收把匿名后台预期误写为 403，但原代码和旧版都约定 404；保护流程真实恢复旧 app/worker、原版本 `1791096317` 与原 Nginx，数据未恢复或改写。纠正检查后重新发布成功。新 release 的 `ROLLBACK.sh --check` 通过，旧 release/镜像/备份保留。
- 发布后 T3 浏览器直接调用线上 webpack 模块导出的 SHA-256、UUID 和 clientIntentKey：真实 HTTP 下 known vector、1000 个 UUID v4、JSON 重试及文件指纹全部通过，`DEPLOYED_HTTP_CRYPTO=PASS`，供应商调用为 0。修复源码真实 BillingProvider 的隔离接口 fixture 再次通过，未把模拟验收标为付费生成成功。
- 本文为发布后记录；后续文档提交不代表另外的运行镜像。
- 远端模型分支在生产基线后仅多一个发布验收文档提交；修复分支从实际运行的生产源码构建，未包含未经部署的业务改动。

隔离测试均不调用付费供应商。生产验收不创建付费生成或修改用户账务。
