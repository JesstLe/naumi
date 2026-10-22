# 管理后台供应商余额与成功率面板（2026-10-21）

> 历史实现记录。凭据选择、协议推断、美元单位、余额/额度语义和面板统计已由 [2026-10-23 修订](2026-10-23-provider-balance-panel.md)替代；下文描述不能作为当前接口或货币单位的依据。历史验收不等于本轮部署验收。

## 背景

10-20 APIB 余额耗尽导致全站 gpt-image-2 编辑链路断供 20 小时无人发现；失败率也只在人工 SQL 统计时可见。管理员缺少一个直观的供应商运营视图。

## 变更

- `src/lib/model-config/provider-balance.ts`：按协议探测供应商余额。apimart-images 协议走 `GET {base}/v1/user/balance`（实测 apib 返回 remain/used，API key 鉴权）；其余协议显式返回"暂不支持"。探测经 `modelEndpointFetch`，自动继承 Router 代理白名单（被墙上游可用）。结果缓存于 `app_settings`（键 `provider-balance:<id>`，TTL 5 分钟），`?refresh=1` 强制重探。凭据只在服务端解密使用，API 响应只含 `hasCredential` 布尔。
- `src/app/api/admin/bi/provider-ops/route.ts`：`GET` 聚合当前生效配置的供应商清单、余额探测、`app_model_execution_stages` 的近 1h/24h 受理统计（成功/被拒/失败/未知四类）与当前熔断通道数。鉴权复用 `biAuthorize`。
- `src/components/admin/model-health/provider-ops.tsx(.module.css)`：在既有 `/admin/model-health` 页面底部新增"供应商余额与成功率"区块。每供应商一卡：余额（低于 $5 红色警示）、成功率（成功/总数 + 被拒/未知/失败明细）、并发与超时配置。60 秒自动刷新，余额按后端缓存节流。
- `model-health.tsx` 仅追加一行组件挂载，未触碰共享未提交文件。

## 验收

- `npx tsc --noEmit`：src 零错误（scripts/ 目录既有杂项错误与本次无关）。
- Windows Next 生产 build 通过。
- 余额端点真实性已实测：apib `/v1/user/balance` 返回 200 及数值；geeknow 无 API key 可用的余额端点（new-api 的 /api/user/self 需 session token），显示"暂不支持"，待供应商侧提供后仅需在 `BALANCE_ENDPOINTS` 登记一条。

## 边界

- 本轮只做只读查询与管理展示，不改路由权重、不自动停启用通道、不发告警（可后续加定时探测+低余额通知）。
- 未连接生产服务器、未发布；上线需另行走蓝绿流程。
