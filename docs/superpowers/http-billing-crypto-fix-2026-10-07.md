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

- 待提交与生产发布：固定 SHA 镜像，原配置与数据库备份，回滚预检、实际版本/健康/浏览器 HTTP 验证。
- 远端模型分支在生产基线后仅多一个发布验收文档提交；修复分支从实际运行的生产源码构建，未包含未经部署的业务改动。

隔离测试均不调用付费供应商。生产验收不创建付费生成或修改用户账务。
