# 逐文件代码索引

固定源码：`052665c8cc295cdba04d28a489f8c9cd727c5862`。本清单覆盖核心目录每一个跟踪文件，含 CSS/JSON；关联代码和依赖另行标记。导出、符号、静态导入与反向调用来自 TypeScript AST。此清单不是“每个函数运行验收通过”或“全仓漏洞审计”的声明。

## 方法与边界

- core：初始模型/供应商/计费/健康模块及其管理页、API、shell。
- related：补充 BI 质量审计、旧设置、鉴权、公共模型目录、Worker/callback/capacity 等。
- direct-consumer：直接调用 core 的其他业务入口；其业务规则不归本轮重整。
- dependency：从 core+related 递归遍历可静态解析的仓内 import；第三方 npm 包只记录入口，不审计实现。
- 变量拼接 dynamic import、数据库 JSON、反射及仓外在线 Router 不由静态图证明穷尽。
- 全量路径、hash、依赖深度见 SOURCE_COVERAGE.csv；函数/导出/SQL/路由原始索引见同目录 AUDIT_INDEX.json。

## Core 与补充关联文件

### `src/app/admin/bi/models/page.tsx`

- 分类：core；行数：14；SHA256：`f1afa0adb1ad6f819b3320ac917272fc4944687ea3d9c0790034527eb9ffd6e0`。
- 导出：`metadata` L4；`dynamic` L8；`ModelsPage` L9。
- 函数/类型：`ModelsPage` L9–13。
- 仓内依赖：`src/lib/admin-page.ts` L1；`src/components/admin/model-config/manager.tsx` L2；`src/components/admin/center-shell.tsx` L3。

### `src/app/admin/billing/page.tsx`

- 分类：core；行数：18；SHA256：`6eab0c4b08eb84c36c8b4ce91d2aef0c65ba535c840c8f0c3abd00994f924428`。
- 导出：`dynamic` L5；`metadata` L6；`BillingPage` L7。
- 函数/类型：`BillingPage` L7–17；`Tab` L11–11。
- 仓内依赖：`src/components/admin/model-config/manager.tsx` L1；`src/lib/admin-page.ts` L2；`src/components/admin/billing/billing-manager.tsx` L3；`src/components/admin/center-shell.tsx` L4。

### `src/app/admin/billing/price-table/page.tsx`

- 分类：core；行数：11；SHA256：`7651b39d7dcf71eba0ec0b9c01a4f437880515bcbf79f8789ac9efe1f6d747c8`。
- 导出：`dynamic` L5；`metadata` L6；`PriceTablePage` L7。
- 函数/类型：`PriceTablePage` L7–10。
- 仓内依赖：`src/lib/admin-page.ts` L1；`src/components/admin/center-shell.tsx` L2；`src/components/admin/billing/navigation.tsx` L3；`src/components/admin/billing/image25-price-table.tsx` L4。

### `src/app/admin/billing/supplier-cost/page.tsx`

- 分类：core；行数：8；SHA256：`4677123e60a6257d0e381f1fecaf53c167bb46454bd90c7ec3d33f6d5cd050c1`。
- 导出：`dynamic` L5；`metadata` L6；`SupplierCostPage` L7。
- 函数/类型：`SupplierCostPage` L7–7。
- 仓内依赖：`src/lib/admin-page.ts` L1；`src/components/admin/center-shell.tsx` L2；`src/components/admin/billing/supplier-cost-manager.tsx` L3；`src/components/admin/billing/navigation.tsx` L4。

### `src/app/admin/center/page.tsx`

- 分类：related；行数：27；SHA256：`37c613df90a45ac9fe0bfa3ed1421eee360df4c94bccaed8644a043f7e72a869`。
- 导出：`dynamic` L8；`metadata` L9；`AdminCenterPage` L11。
- 函数/类型：`AdminCenterPage` L11–26。
- 仓内依赖：`src/components/admin/center-shell.tsx` L1；`src/components/saas/platform-console.tsx` L3；`src/lib/admin-page.ts` L4；`src/lib/bi/contracts.ts` L5；`src/components/admin/bi/dashboard.tsx` L6。

### `src/app/admin/layout.tsx`

- 分类：core；行数：4；SHA256：`420502142b2de9b0e0131cf85330078957d804645e3722fa1429898cda78f840`。
- 导出：`AdminLayout` L3。
- 函数/类型：`AdminLayout` L3–3。
- 仓内依赖：`src/components/admin/theme.module.css` L1。

### `src/app/admin/model-health/page.tsx`

- 分类：core；行数：13；SHA256：`337d2aeb06331cf6382e1e3812541aad26dfce4d85ff8404f2fc5a85ad47f9c9`。
- 导出：`metadata` L4；`dynamic` L8；`ModelHealthPage` L9。
- 函数/类型：`ModelHealthPage` L9–12。
- 仓内依赖：`src/lib/admin-page.ts` L1；`src/components/admin/center-shell.tsx` L2；`src/components/admin/model-health/model-health.tsx` L3。

### `src/app/admin/model-management/library/page.tsx`

- 分类：core；行数：7；SHA256：`81ff5b9be260490c586eeecf457e414a3b164b276610eaa72e1bc18c8acc7156`。
- 导出：`runtime,dynamic` L4；`metadata` L5；`SupplierLibraryPage` L6。
- 函数/类型：`SupplierLibraryPage` L6–6。
- 仓内依赖：`src/lib/admin-page.ts` L1；`src/components/admin/center-shell.tsx` L2；`src/components/admin/model-management/supplier-model-library.tsx` L3。

### `src/app/admin/model-management/page.tsx`

- 分类：core；行数：10；SHA256：`821262e82b2121186acc69d2aa5996532b49c9bf25005c71a51c8c67cf6f9818`。
- 导出：`runtime,dynamic` L4；`metadata` L5；`ModelManagementPage` L6。
- 函数/类型：`ModelManagementPage` L6–9。
- 仓内依赖：`src/lib/admin-page.ts` L1；`src/components/admin/center-shell.tsx` L2；`src/components/admin/model-management/model-management.tsx` L3。

### `src/app/admin/mvp/library/page.tsx`

- 分类：core；行数：12；SHA256：`2416efb507ce6209c1854292ec01a71c8dec6d55698edb9d6d3ca286e7117e2c`。
- 导出：`LegacySupplierLibraryPage` L5。
- 函数/类型：`LegacySupplierLibraryPage` L5–11。
- 仓内依赖：`src/lib/admin-navigation.ts` L2。

### `src/app/admin/mvp/page.tsx`

- 分类：core；行数：12；SHA256：`5d2de62283b9d5fcd06e3af34980f854f4532592015e9b493a8eb1093723cef8`。
- 导出：`LegacyModelManagementPage` L5。
- 函数/类型：`LegacyModelManagementPage` L5–11。
- 仓内依赖：`src/lib/admin-navigation.ts` L2。

### `src/app/admin/page.tsx`

- 分类：core；行数：27；SHA256：`73e41b4101344f07dab5e1513bd091a08123a55dfde85a82a2a55ff7e1a94446`。
- 导出：`metadata` L7；`AdminPage` L9。
- 函数/类型：`AdminPage` L9–26。
- 仓内依赖：`src/lib/site-control/identity.ts` L1；`src/components/enterprise/enterprise-console.tsx` L2；`src/components/admin/admin-client.tsx` L4；`src/lib/brand.ts` L5。

### `src/app/admin/pricing/page.tsx`

- 分类：core；行数：520；SHA256：`f9057d2f92f36eef1364380bc0a44cdb41094463aece01ca23326aedc564f031`。
- 导出：`metadata` L28；`dynamic` L29；`AdminPricingPage` L31。
- 函数/类型：`AdminPricingPage` L31–519。
- 仓内依赖：`src/components/admin/center-shell.tsx` L2；`src/lib/admin-page.ts` L3；`src/components/ui/button.tsx` L4；`src/components/pricing-research.tsx` L5；`src/lib/i18n/server-locale.ts` L6；`src/lib/brand.ts` L7；`src/lib/commerce.ts` L8；`src/lib/image-quality.ts` L9；`src/lib/billing/runtime.ts` L10；`src/lib/billing/quote.ts` L11；`src/lib/pricing.ts` L12。

### `src/app/admin/supplier-balances/page.tsx`

- 分类：core；行数：10；SHA256：`8b47cbad86bcec25533f95832999ac86c9bebd21d4afbb6ffbe965a4ffedc573`。
- 导出：`dynamic` L4；`metadata` L5；`SupplierBalancesPage` L6。
- 函数/类型：`SupplierBalancesPage` L6–9。
- 仓内依赖：`src/lib/admin-page.ts` L1；`src/components/admin/center-shell.tsx` L2；`src/components/admin/model-health/supplier-balance-page.tsx` L3。

### `src/app/api/admin/bi/conversation/route.ts`

- 分类：related；行数：34；SHA256：`0c6154f75aaf9a66424fdb7583a15b4642cdd9c807a150ece774261942634ccd`。
- 导出：`runtime` L4；`dynamic` L5；`GET` L6。
- 函数/类型：`GET` L6–33。
- 仓内依赖：`src/lib/bi/access.ts` L2；`src/lib/bi/repository.ts` L3。

### `src/app/api/admin/bi/media/route.ts`

- 分类：related；行数：114；SHA256：`a06485030ddddd4d72ec685431dd987178aa16f05b220f06c25d7781fcce1326`。
- 导出：`runtime` L14；`dynamic` L15；`GET` L17。
- 函数/类型：`GET` L17–113。
- 仓内依赖：`src/lib/bi/artwork-inputs.ts` L3；`src/lib/imagegen/input-assets.ts` L4；`src/lib/bi/access.ts` L5；`src/platform/db/pool.ts` L6；`src/lib/bi/repository.ts` L7；`src/lib/object-storage/runtime.ts` L8；`src/lib/object-storage/managed-read.ts` L9；`src/lib/download-source.ts` L10。

### `src/app/api/admin/bi/model-config/catalog/route.ts`

- 分类：core；行数：5；SHA256：`cefb5ef133d3ecfcfe5cf25c22eb2b2a1aea19212afd4a0a6d0f3964398a5d62`。
- 导出：`runtime,dynamic` L2；`GET` L3；`POST` L4。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：`src/lib/model-config/catalog-access.ts` L1。

### `src/app/api/admin/bi/model-config/credentials/route.ts`

- 分类：core；行数：4；SHA256：`132ff9b2054fb20a1eb8973b1d6f5633946f1c66917932844944cbe1c2ca622a`。
- 导出：`runtime,dynamic` L2；`POST` L3。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：`src/lib/model-config/access.ts` L1。

### `src/app/api/admin/bi/model-config/draft/route.ts`

- 分类：core；行数：4；SHA256：`7a811b25d3610878d02216981e8ddbd18304ee58b31c8a4e916d619602c429a5`。
- 导出：`runtime,dynamic` L2；`PUT` L3。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：`src/lib/model-config/access.ts` L1。

### `src/app/api/admin/bi/model-config/route.ts`

- 分类：core；行数：5；SHA256：`0cd067352a91375aa61f4cd8b768b3a30373439b5771c1c9a02d3755bf8832d7`。
- 导出：`runtime,dynamic` L2；`GET` L3；`POST` L4。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：`src/lib/model-config/access.ts` L1。

### `src/app/api/admin/bi/model-config/simulate/route.ts`

- 分类：core；行数：4；SHA256：`569c8646ec41446bc2b46d2de0af27ca46333e33da6e92adf34ba607c4d64847`。
- 导出：`runtime,dynamic` L2；`POST` L3。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：`src/lib/model-config/access.ts` L1。

### `src/app/api/admin/bi/model-config/validate/route.ts`

- 分类：core；行数：4；SHA256：`d3518cee6a276ee2e83c8be68b2064df7ae323af6bc05a15b55c441b5e0707cf`。
- 导出：`runtime,dynamic` L2；`POST` L3。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：`src/lib/model-config/access.ts` L1。

### `src/app/api/admin/bi/model-config/versions/route.ts`

- 分类：core；行数：5；SHA256：`4202938c2e3a570c452c95d2d90e7e4082fcc3e45a5f1edfce8a47af39e02c0c`。
- 导出：`runtime,dynamic` L2；`GET` L3；`POST` L4。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：`src/lib/model-config/access.ts` L1。

### `src/app/api/admin/bi/profile/route.ts`

- 分类：related；行数：51；SHA256：`9fb54a774d0043179240c76557f6101de1db03048b672b3e10c637835e232b8e`。
- 导出：`runtime` L6；`dynamic` L7；`PUT` L25。
- 函数/类型：`PUT` L25–50。
- 仓内依赖：`src/lib/bi/access.ts` L3；`src/lib/bi/repository.ts` L4；`src/lib/account-identity-schema.ts` L5。

### `src/app/api/admin/bi/provider-ops/route.ts`

- 分类：core；行数：5；SHA256：`77bb000edf7d3096387570361403ab3e02efaf517677c4a6bf788f76fe24067b`。
- 导出：`runtime,dynamic,maxDuration` L3；`GET` L4。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：`src/lib/model-config/provider-balance-access.ts` L1。

### `src/app/api/admin/bi/route.ts`

- 分类：related；行数：26；SHA256：`96c9bc52505d2352f3f29fc9daf2e0f033a9776bde483ea5c52084d6ec2e655f`。
- 导出：`runtime` L5；`dynamic` L6；`GET` L7。
- 函数/类型：`GET` L7–25。
- 仓内依赖：`src/lib/bi/access.ts` L2；`src/lib/bi/contracts.ts` L3；`src/lib/bi/repository.ts` L4。

### `src/app/api/admin/bi/trace/route.ts`

- 分类：related；行数：34；SHA256：`0b38bc43002b8f55754d5c9372e825cecc70d727e0ee754aad442ae93fe7cfe7`。
- 导出：`runtime` L5；`dynamic` L6；`GET` L7。
- 函数/类型：`GET` L7–33。
- 仓内依赖：`src/lib/bi/access.ts` L2；`src/lib/bi/repository.ts` L3；`src/lib/bi/router-trace.ts` L4。

### `src/app/api/admin/bi/usage/route.ts`

- 分类：related；行数：16；SHA256：`dff47f6ccc8f655917853fe682eaceb39557e734bda674964e683481726680f7`。
- 导出：`runtime` L6；`dynamic` L7；`GET` L8。
- 函数/类型：`GET` L8–15。
- 仓内依赖：`src/lib/bi/access.ts` L2；`src/lib/bi/repository.ts` L3；`src/lib/bi/usage-contracts.ts` L4；`src/lib/bi/usage-repository.ts` L5。

### `src/app/api/admin/bi/users/route.ts`

- 分类：related；行数：46；SHA256：`23673d480f2b1b3bb1887008e574c08f9c7f9bf9a243102bd13f7583fc493bf3`。
- 导出：`runtime` L9；`dynamic` L10；`POST` L11。
- 函数/类型：`POST` L11–45。
- 仓内依赖：`src/lib/bi/access.ts` L2；`src/lib/bi/user-management.ts` L3；`src/lib/auth-mode.ts` L8。

### `src/app/api/admin/billing/image25-prices/route.ts`

- 分类：core；行数：28；SHA256：`3f2553325118f97e57cdff39b64ed5d8f44565759c5c0c43078d2c1d503dfcba`。
- 导出：`runtime,dynamic` L5；`GET` L7。
- 函数/类型：`GET` L7–27。
- 仓内依赖：`src/lib/admin-auth.ts` L1；`src/lib/bi/access.ts` L2；`src/lib/model-config/server.ts` L3；`src/lib/model-config/image25-price-table.ts` L4。

### `src/app/api/admin/billing/models/postprocess/retry/route.ts`

- 分类：core；行数：22；SHA256：`0a7c39c7c7434fd2aa0462b081f379d8d53763a2182dfa271f43db1a1c2eac29`。
- 导出：`runtime,dynamic` L9；`POST` L10。
- 函数/类型：`POST` L10–21。
- 仓内依赖：`src/lib/bi/access.ts` L2；`src/platform/db/pool.ts` L3；`src/lib/media-postprocess.ts` L4；`src/lib/media-postprocess-schema.ts` L5；`src/lib/postprocess-recovery.ts` L7。

### `src/app/api/admin/billing/models/preview/route.ts`

- 分类：core；行数：19；SHA256：`347859583f6021ac4603c6efdcef8324d9712fb62c901026009446770ce073bc`。
- 导出：`runtime,dynamic` L7；`POST` L9。
- 函数/类型：`POST` L9–18。
- 仓内依赖：`src/lib/bi/access.ts` L2；`src/lib/model-config/server.ts` L3；`src/lib/model-config/business-preview.ts` L4；`src/lib/billing/rules/registry.ts` L5；`src/lib/model-config/types.ts` L6。

### `src/app/api/admin/billing/models/stages/route.ts`

- 分类：core；行数：18；SHA256：`17fdcd9969e1626c35841e5a8d1df99c94ea99adcb7d3c6ecde4c8b65d48ec53`。
- 导出：`runtime,dynamic` L7；`GET` L8。
- 函数/类型：`GET` L8–17。
- 仓内依赖：`src/lib/bi/access.ts` L1；`src/platform/db/pool.ts` L2；`src/lib/model-config/execution-audit-schema.ts` L3；`src/lib/media-postprocess-schema.ts` L5。

### `src/app/api/admin/billing/operations/route.ts`

- 分类：core；行数：36；SHA256：`844a8ff91550bbf7c186bac787ee58930955f35f9aba0e9c66040ffd80146ef3`。
- 导出：`runtime,dynamic` L9；`GET` L10；`POST` L25。
- 函数/类型：`GET` L10–23；`POST` L25–35。
- 仓内依赖：`src/lib/billing/access.ts` L2；`src/lib/billing/request.ts` L3；`src/lib/billing/runtime.ts` L4；`src/platform/db/pool.ts` L5；`src/lib/application/billing-task-recovery.ts` L6；`src/lib/billing/validation.ts` L7；`src/lib/billing/synchronous-operation.ts` L8。

### `src/app/api/admin/billing/route.ts`

- 分类：core；行数：24；SHA256：`544f7eac1e8e5f60f9384436fbb75072d56f7c965d9168dedad86b61c928ced4`。
- 导出：`runtime,dynamic` L5；`GET` L6；`POST` L14。
- 函数/类型：`GET` L6–12；`POST` L14–23。
- 仓内依赖：`src/lib/billing/access.ts` L2；`src/lib/billing/runtime.ts` L3；`src/lib/billing/request.ts` L4。

### `src/app/api/admin/billing/simulate/route.ts`

- 分类：core；行数：20；SHA256：`78565afe5f0ea673920b0432141aa9aaeecb135e5ff2dcfa093b07e7686e5876`。
- 导出：`runtime,dynamic` L8；`POST` L10。
- 函数/类型：`POST` L10–19。
- 仓内依赖：`src/lib/billing/access.ts` L2；`src/lib/billing/request.ts` L3；`src/lib/billing/rules/schema.ts` L4；`src/lib/billing/quote.ts` L5；`src/lib/billing/costs.ts` L6；`src/lib/billing/validation.ts` L7。

### `src/app/api/admin/billing/versions/route.ts`

- 分类：core；行数：24；SHA256：`6278c4a0095dba3e50552195e189b01a1af69156200ee2b58ada2c60268df8a6`。
- 导出：`runtime,dynamic` L5；`GET` L6；`POST` L15。
- 函数/类型：`GET` L6–13；`POST` L15–23。
- 仓内依赖：`src/lib/billing/access.ts` L2；`src/lib/billing/runtime.ts` L3；`src/lib/billing/request.ts` L4。

### `src/app/api/admin/model-health/route.ts`

- 分类：core；行数：5；SHA256：`81699b5a61e144201cb33b2bf4bf32df7688f84e375f09737a7bbaf83b55e672`。
- 导出：`runtime,dynamic,maxDuration` L2；`GET` L3；`POST` L4。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：`src/lib/model-health/access.ts` L1。

### `src/app/api/admin/model-management/library/route.ts`

- 分类：core；行数：5；SHA256：`6adf5224fd52fbd11bbb312bbddde72d88792d93f834acbfe17bd9ce7718358a`。
- 导出：`runtime,dynamic` L2；`GET` L3；`POST` L4。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：`src/lib/supplier-models/access.ts` L1。

### `src/app/api/admin/model-management/onboarding/route.ts`

- 分类：core；行数：5；SHA256：`44ae94a3e51beb043a3e4fa1f5676cd08a46e324bd1033b2abaa6c970e1a85b4`。
- 导出：`runtime,dynamic` L2；`GET` L3；`POST` L4。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：`src/lib/model-config/onboarding-access.ts` L1。

### `src/app/api/admin/model-management/route.ts`

- 分类：core；行数：5；SHA256：`941df966e4bd1c21c0be504284f58b55beb2908e469fb770445456ff66fc72aa`。
- 导出：`runtime,dynamic` L2；`GET` L3；`POST` L4。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：`src/lib/model-config/management-access.ts` L1。

### `src/app/api/admin/mvp/library/route.ts`

- 分类：core；行数：6；SHA256：`a351fbc7cbd4c37e8a42b454074fedebf9f3c33ba4c5e6c91a0987a3c1008262`。
- 导出：`runtime,dynamic` L3；`GET` L4；`POST` L5。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：`src/lib/supplier-models/access.ts` L2。

### `src/app/api/admin/mvp/route.ts`

- 分类：core；行数：6；SHA256：`356d6c2a3de1758cb827f4a78a084fa79040a047b0821d81a1361acb657d1856`。
- 导出：`runtime,dynamic` L3；`GET` L4；`POST` L5。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：`src/lib/model-config/management-access.ts` L2。

### `src/app/api/admin/settings/route.ts`

- 分类：related；行数：329；SHA256：`29d03f06cb2d4d1c1b3a04316b7cc0dc4a44b02bad6217ee20002cbacb09652d`。
- 导出：`runtime` L38；`dynamic` L39；`GET` L54；`POST` L64。
- 函数/类型：`guard` L41–52；`GET` L54–62；`POST` L64–328；`decryptField` L97–107。
- 仓内依赖：`src/platform/db/pool.ts` L2；`src/lib/settings.ts` L3；`src/lib/admin-auth.ts` L28；`src/lib/admin-mutation.ts` L29；`src/lib/bi/management-log.ts` L30；`src/lib/settings/repository.ts` L31；`src/lib/billing/runtime.ts` L32；`src/lib/billing/types.ts` L33；`src/lib/settings/mutation-schema.ts` L34；`src/lib/model-config/availability.ts` L35；`src/lib/model-config/types.ts` L36。

### `src/app/api/admin/supplier-cost/actions/route.ts`

- 分类：core；行数：21；SHA256：`785cfccefcd3ed1cc016beeab75daa2170b0e73c7684fdd7b23970aca25348f3`。
- 导出：`runtime,dynamic` L6；`POST` L13。
- 函数/类型：`POST` L13–20。
- 仓内依赖：`src/lib/billing/access.ts` L2；`src/lib/supplier-cost/runtime.ts` L3；`src/lib/supplier-cost/admin.ts` L4；`src/lib/supplier-cost/policy.ts` L5。

### `src/app/api/admin/supplier-cost/operations/[id]/route.ts`

- 分类：core；行数：6；SHA256：`9f7c98a70c68fe021ccfac0e6c14eee27ea21c27f076884b7ffb69084105f2f2`。
- 导出：`runtime,dynamic` L4；`GET` L5。
- 函数/类型：`GET` L5–5。
- 仓内依赖：`src/lib/billing/access.ts` L1；`src/lib/supplier-cost/repository.ts` L2；`src/platform/db/pool.ts` L3。

### `src/app/api/admin/supplier-cost/route.ts`

- 分类：core；行数：10；SHA256：`80994be3de6e6d49c8874bcedd78144c76f6ccc49e5a3f8fac94b4ca6d858b2e`。
- 导出：`runtime,dynamic` L6；`GET` L9。
- 函数/类型：`GET` L9–9。
- 仓内依赖：`src/lib/billing/access.ts` L2；`src/lib/supplier-cost/repository.ts` L3；`src/platform/db/pool.ts` L4；`src/lib/supplier-cost/admin.ts` L5。

### `src/app/api/internal/model-capacity/route.ts`

- 分类：related；行数：5；SHA256：`0d54a13da8bd53d6f9d3aad1f9b433b412c129fa41a9d629a7efb49d034eaa88`。
- 导出：`runtime` L2；`dynamic` L3；`POST` L4。
- 函数/类型：`POST` L4–4。
- 仓内依赖：`src/lib/model-config/router-capacity.ts` L1。

### `src/app/api/model-health/worker/tick/route.ts`

- 分类：related；行数：9；SHA256：`c5d222af87d9d4ae9ed189414665fe00b91e4f24388c006436eecb4a1fa237de`。
- 导出：`runtime,dynamic,maxDuration` L3；`POST` L4。
- 函数/类型：`POST` L4–8。
- 仓内依赖：`src/lib/model-health/access.ts` L1；`src/lib/model-health/service.ts` L2。

### `src/app/api/models/route.ts`

- 分类：related；行数：34；SHA256：`02151fe368d63a9648e7105950270e3c4b402bfc3a4d666d63de8c79cea66179`。
- 导出：`runtime,dynamic` L10；`GET` L11。
- 函数/类型：`GET` L11–33。
- 仓内依赖：`src/lib/billing/rules/registry.ts` L2；`src/lib/model-config/availability.ts` L3；`src/lib/model-config/published.ts` L4；`src/lib/model-config/catalog-query.ts` L5；`src/lib/model-config/feature-model-policy.ts` L6；`src/lib/model-config/bindings.ts` L7；`src/lib/model-config/types.ts` L8；`src/lib/frontend-image-models.ts` L9；`src/lib/settings.ts` L26。

### `src/app/api/supplier/apimart/[account]/callback/route.ts`

- 分类：related；行数：16；SHA256：`6d0e283873d97a2bbc0a2140fd4998c7b6a9a01521045a5315bf1a39a531e694`。
- 导出：`runtime,dynamic` L7；`POST` L8。
- 函数/类型：`POST` L8–15。
- 仓内依赖：`src/lib/supplier-cost/runtime.ts` L2；`src/lib/supplier-cost/callback.ts` L3；`src/lib/supplier-cost/io.ts` L4；`src/lib/rate-limit-http.ts` L5；`src/lib/ip.ts` L6。

### `src/app/api/video/worker/tick/route.ts`

- 分类：related；行数：45；SHA256：`c15a59068bd5f9c42b877527e0c4398ce9b34308771192227ceebad37674b7e9`。
- 导出：`runtime` L9；`dynamic` L10；`maxDuration` L11；`POST` L24；`GET` L36。
- 函数/类型：`store` L14–19；`failure` L21–23；`POST` L24–35；`GET` L36–44。
- 仓内依赖：`src/lib/worker/scan.ts` L2；`src/lib/worker/authorization.ts` L4；`src/lib/application/task-execution.ts` L5；`src/platform/db/pool.ts` L6；`src/lib/release-runtime/worker-tick-receipts.ts` L7。

### `src/components/admin/admin-client.tsx`

- 分类：core；行数：116；SHA256：`c170823dcde8a6cd07365542818222b98f3f865a7bea0c5bd17c92ff322d1d41`。
- 导出：`AdminClient` L13。
- 函数/类型：`AdminClient` L13–115。
- 仓内依赖：`src/components/admin/center-shell.tsx` L4；`src/lib/admin-navigation.ts` L5；`src/components/admin/use-admin-entry.ts` L7；`src/components/admin/admin-settings.tsx` L9；`src/components/ui/button.tsx` L10；`src/components/ui/input.tsx` L11。

### `src/components/admin/admin-settings.tsx`

- 分类：core；行数：202；SHA256：`0a7d0bd6d5a1000ee609b03ad18be16c6acad996c7c46e8eb7d31aa3258f01a3`。
- 导出：`AdminSettings` L51。
- 函数/类型：`SettingsSection` L37–37；`AdminSettings` L51–201；`setUsageDays` L58–58；`setSection` L76–80。
- 仓内依赖：`src/components/admin/usage/usage-panel.tsx` L6；`src/components/admin/admin-templates.tsx` L7；`src/components/admin/admin-tryon.tsx` L8；`src/components/admin/admin-prompts.tsx` L9；`src/components/operator/deploy-center.tsx` L10；`src/components/operator/relay-tokens-client.tsx` L11；`src/components/operator/cardkeys-admin.tsx` L12；`src/components/admin/settings/use-settings-session.ts` L13；`src/components/admin/settings/api-panel.tsx` L14；`src/components/admin/settings/auth-panel.tsx` L15；`src/components/admin/settings/site-panel.tsx` L16；`src/components/admin/settings/credits-panel.tsx` L17。

### `src/components/admin/bi/artwork-media.module.css`

- 分类：related；行数：19；SHA256：`807ce38a07847bab1ac9bd5cdaa6b82ee473f7b8faf982169a1fd0f51788a6c7`。
- 导出：无命名导出 / 数据或样式文件。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：无静态仓内导入。

### `src/components/admin/bi/artwork-media.tsx`

- 分类：related；行数：35；SHA256：`9b920275e2050195cb500d15773f1125cd8ee36b51b146ac7e01c19d6bc417e7`。
- 导出：`ArtworkMedia` L18。
- 函数/类型：`Picture` L6–17；`ArtworkMedia` L18–34。
- 仓内依赖：`src/lib/bi/contracts.ts` L3；`src/components/admin/bi/artwork-media.module.css` L4。

### `src/components/admin/bi/dashboard.module.css`

- 分类：related；行数：827；SHA256：`28afd6653b8a6d940385126c9a5d81cd754c1567e30396f9af2beeda47ef8549`。
- 导出：无命名导出 / 数据或样式文件。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：无静态仓内导入。

### `src/components/admin/bi/dashboard.tsx`

- 分类：related；行数：1612；SHA256：`2af4cd42738a2381c81c81f39e10d6234a17dff7fd2424a963943fbad242d6ea`。
- 导出：`BiDashboard` L414。
- 函数/类型：`Filter` L51–61；`Column` L62–75；`display` L281–327；`initialFilter` L328–344；`BiDashboard` L414–1090；`navigate` L483–503；`account` L504–513；`openSourceArtwork` L514–528；`exportPage` L529–548；`Overview` L1092–1318；`ProfileEditor` L1320–1414；`save` L1329–1353；`TraceAttempt` L1416–1431；`ExecutionTrace` L1432–1534；`load` L1448–1467；`ConversationViewer` L1536–1611。
- 仓内依赖：`src/components/admin/center-shell.tsx` L4；`src/lib/billing/decimal.ts` L5；`src/components/admin/bi/model-chain.tsx` L6；`src/components/admin/bi/artwork-media.tsx` L7；`src/lib/bi/contracts.ts` L26；`src/lib/bi/contracts.ts` L32；`src/lib/bi/artwork-view.ts` L33；`src/components/admin/bi/dashboard.module.css` L34；`src/components/admin/bi/user-manager.tsx` L35；`src/components/admin/bi/tooltip.tsx` L36。

### `src/components/admin/bi/model-chain.module.css`

- 分类：related；行数：15；SHA256：`4567d1078368d7a92d35afc047bfa265314b6955ca67ef3fc078f03838f97069`。
- 导出：无命名导出 / 数据或样式文件。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：无静态仓内导入。

### `src/components/admin/bi/model-chain.tsx`

- 分类：related；行数：22；SHA256：`695496b3c6bf784ccc4dfc4d407e8026d0dc879e982ba5017341401331758fee`。
- 导出：`ModelChain` L5。
- 函数/类型：`ModelChain` L5–21。
- 仓内依赖：`src/lib/bi/contracts.ts` L2；`src/lib/bi/model-chain.ts` L3；`src/components/admin/bi/model-chain.module.css` L4。

### `src/components/admin/bi/tooltip.tsx`

- 分类：related；行数：66；SHA256：`170292e58e76a034655a7685e126286efe2c5b10b7e941672892e5f800e95cfc`。
- 导出：`BiTooltip` L4。
- 函数/类型：`BiTooltip` L4–65。
- 仓内依赖：`src/components/admin/bi/dashboard.module.css` L3。

### `src/components/admin/bi/user-manager.tsx`

- 分类：related；行数：315；SHA256：`506f0671c9f00b68f1b0311f161ae6faaaafd75ec198b6a4481d3606c87ad788`。
- 导出：`UserManager` L15。
- 函数/类型：`Command` L6–6；`UserManager` L15–314；`prepare` L55–86；`apply` L87–113。
- 仓内依赖：`src/lib/bi/contracts.ts` L3；`src/components/admin/bi/dashboard.module.css` L4；`src/lib/account-identity.ts` L5。

### `src/components/admin/bi/user-usage.module.css`

- 分类：related；行数：15；SHA256：`1459a1dbeddceabe93541edc6c060be2b2cabf879de3b0588828a3999406f5d8`。
- 导出：无命名导出 / 数据或样式文件。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：无静态仓内导入。

### `src/components/admin/bi/user-usage.tsx`

- 分类：related；行数：242；SHA256：`1627fd2d0052a53677d14fed48da11f17506912c6b5c6be7a0a741f6a1325c20`。
- 导出：`UserUsage` L62。
- 函数/类型：`Filter` L14–14；`Props` L15–15；`number` L27–29；`recentDates` L30–33；`localTime` L34–38；`queryParameters` L39–45；`csvFilename` L46–48；`csvForUsers` L49–59；`UserUsage` L62–203；`navigate` L111–119；`apply` L120–120；`preset` L121–121；`selectUser` L122–122；`drill` L123–126；`exportUsers` L127–155；`Metrics` L205–216；`Trend` L218–241。
- 仓内依赖：`src/components/admin/center-shell.tsx` L7；`src/lib/auth-context.tsx` L8；`src/lib/bi/contracts.ts` L9；`src/lib/bi/usage-contracts.ts` L10；`src/lib/bi/usage-client.ts` L11；`src/components/admin/bi/user-usage.module.css` L12。

### `src/components/admin/billing/billing-manager.tsx`

- 分类：core；行数：108；SHA256：`3823dc737da260b1aefbe2ed48a244a3779a3b189016385081e8903ceab67dfd`。
- 导出：`BillingManager` L26。
- 函数/类型：`Tab` L17–17；`changes` L19–25；`BillingManager` L26–107；`setTab` L30–30；`setFeature` L31–31；`publish` L56–72；`restore` L73–84。
- 仓内依赖：`src/lib/billing/types.ts` L5；`src/lib/billing/rules/registry.ts` L6；`src/lib/billing/labels.ts` L7；`src/lib/supabase.ts` L8；`src/components/admin/billing/fields.tsx` L9；`src/components/admin/billing/business-prices.tsx` L10；`src/components/admin/billing/cost-editor.tsx` L11；`src/components/admin/billing/rule-editor.tsx` L12；`src/components/admin/billing/quote-simulator.tsx` L13；`src/components/admin/billing/operation-reconciliation.tsx` L14；`src/components/admin/billing/version-history.tsx` L15；`src/lib/billing/config-diff.ts` L16。

### `src/components/admin/billing/business-prices.tsx`

- 分类：core；行数：45；SHA256：`6d72a1f96e90687d5da0f2fec2e8cbeee3ba6e4c49ff24be64fb774161eb244e`。
- 导出：`BusinessPrices` L12。
- 函数/类型：`BusinessPrices` L12–44。
- 仓内依赖：`src/lib/billing/types.ts` L3；`src/lib/billing/labels.ts` L4；`src/lib/billing/business.ts` L5；`src/lib/billing/costs.ts` L6；`src/lib/billing/decimal.ts` L7；`src/lib/billing/quote.ts` L8；`src/components/admin/billing/fields.tsx` L9；`src/components/admin/billing/price-editor.tsx` L10。

### `src/components/admin/billing/cost-editor.tsx`

- 分类：core；行数：21；SHA256：`c21cefa27d33357091428078af4a5f0c4e607df492ee55e347f482457d40326f`。
- 导出：`CostEditor` L6。
- 函数/类型：`CostEditor` L6–20。
- 仓内依赖：`src/lib/billing/business.ts` L3；`src/lib/billing/types.ts` L4；`src/components/admin/billing/fields.tsx` L5。

### `src/components/admin/billing/fields.tsx`

- 分类：core；行数：56；SHA256：`57926e9a8592714f4661b419be83e01a9cdfaf58d1e2f607949c42e3f4ca7f90`。
- 导出：`control` L6；`Field` L7；`NumberField` L11；`Choice` L18；`ExpiryEditor` L27；`MoneyField` L32；`PercentField` L38；`YuanField` L46。
- 函数/类型：`Field` L7–10；`NumberField` L11–17；`Choice` L18–26；`ExpiryEditor` L27–31；`MoneyField` L32–37；`PercentField` L38–44；`YuanField` L46–55。
- 仓内依赖：`src/lib/billing/types.ts` L3；`src/lib/billing/decimal.ts` L5。

### `src/components/admin/billing/image25-price-table.tsx`

- 分类：core；行数：83；SHA256：`e8432d002d0149e96d2ea162acfdbc346ba74ac9ab2fa71127f30fca248a59ac`。
- 导出：`Image25PriceTable` L9。
- 函数/类型：`Image25PriceTable` L9–82。
- 仓内依赖：`src/lib/supabase.ts` L3；`src/lib/model-config/image25-price-table.ts` L4。

### `src/components/admin/billing/navigation.tsx`

- 分类：core；行数：13；SHA256：`6977560c236b3dbbb148cb1a1c39f0b9c85d155fc79a007dd1074c8ca4ae7917`。
- 导出：`BillingNavigation` L8。
- 函数/类型：`BillingNavigation` L8–12。
- 仓内依赖：无静态仓内导入。

### `src/components/admin/billing/operation-reconciliation.tsx`

- 分类：core；行数：55；SHA256：`1653b716f1524ceefeed79e9b4779982df1096be3c423a40357251866be4a04b`。
- 导出：`OperationReconciliation` L8。
- 函数/类型：`OperationReconciliation` L8–54；`settle` L30–43。
- 仓内依赖：`src/lib/supabase.ts` L3；`src/lib/billing/types.ts` L4；`src/lib/billing/quote.ts` L5；`src/lib/billing/labels.ts` L6；`src/components/admin/billing/fields.tsx` L7。

### `src/components/admin/billing/price-editor.tsx`

- 分类：core；行数：31；SHA256：`6955f451887a84eee39619684d01d96d6b288f43a9532aeb197754371c779874`。
- 导出：`PricingEditor` L6；`SettlementEditor` L27。
- 函数/类型：`PricingEditor` L6–26；`SettlementEditor` L27–30。
- 仓内依赖：`src/lib/billing/types.ts` L2；`src/lib/billing/business.ts` L3；`src/lib/billing/rules/registry.ts` L4；`src/components/admin/billing/fields.tsx` L5。

### `src/components/admin/billing/quote-simulator.tsx`

- 分类：core；行数：29；SHA256：`3f73d9bbcbbc346ffa5fda11bf4a2e4d021629f23f63b4e6573a8a5f99e638bc`。
- 导出：`QuoteSimulator` L10。
- 函数/类型：`QuoteSimulator` L10–28；`simulate` L15–26。
- 仓内依赖：`src/lib/billing/business.ts` L2；`src/lib/billing/decimal.ts` L3；`src/lib/billing/types.ts` L5；`src/lib/billing/rules/registry.ts` L6；`src/lib/billing/labels.ts` L7；`src/components/admin/billing/fields.tsx` L8；`src/lib/supabase.ts` L9。

### `src/components/admin/billing/rule-editor.tsx`

- 分类：core；行数：17；SHA256：`d8b3f786cbe069e15b08ce0ce5ee7dd7c0355eb48254afef29590fe704ce9479`。
- 导出：`RuleEditor` L5。
- 函数/类型：`RuleEditor` L5–16。
- 仓内依赖：`src/lib/billing/types.ts` L2；`src/components/admin/billing/fields.tsx` L3；`src/components/admin/billing/price-editor.tsx` L4。

### `src/components/admin/billing/supplier-cost-manager.tsx`

- 分类：core；行数：33；SHA256：`5e9aa3c8b751cc438730a22336e02da001a6077a294f2077947fc9cc0b878758`。
- 导出：`SupplierCostManager` L11。
- 函数/类型：`SupplierCostManager` L11–32。
- 仓内依赖：`src/lib/supabase.ts` L4；`src/lib/supplier-cost/money.ts` L5；`src/lib/billing/labels.ts` L6。

### `src/components/admin/billing/version-history.tsx`

- 分类：core；行数：19；SHA256：`f3761738d2657716545a7b4fd9d71bbc33fe15e355a919ff21e9bec363b40d09`。
- 导出：`VersionHistory` L4。
- 函数/类型：`VersionHistory` L4–18。
- 仓内依赖：`src/lib/supabase.ts` L3。

### `src/components/admin/center-shell.module.css`

- 分类：core；行数：42；SHA256：`99cfc3edc7c63a7f0037cf078797214e7c2f15c1ae05e8e8207ff939b245d004`。
- 导出：无命名导出 / 数据或样式文件。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：无静态仓内导入。

### `src/components/admin/center-shell.tsx`

- 分类：core；行数：34；SHA256：`d7551dd724371e4ba41d49919bd492e9299a10efa59a6596e8c24101e58993c2`。
- 导出：`AdminCenterShell` L14。
- 函数/类型：`ShellProps` L13–13；`AdminCenterShell` L14–14；`AdminShell` L15–33；`logout` L22–22。
- 仓内依赖：`src/lib/bi/contracts.ts` L6；`src/components/site-version.tsx` L7；`src/components/admin/navigation.ts` L8；`src/components/admin/page-search.tsx` L9；`src/components/admin/center-shell.module.css` L10；`src/components/admin/theme.module.css` L11。

### `src/components/admin/model-config/audio-capability-editor.tsx`

- 分类：core；行数：50；SHA256：`56f840ef865516f025fd3e9a4619721759391b200c82edd752ae65fa170c9dab`。
- 导出：`AudioCapabilityEditor` L7。
- 函数/类型：`AudioCapabilityEditor` L7–49。
- 仓内依赖：`src/lib/audio/model-capabilities.ts` L3；`src/lib/audio/model-capabilities.ts` L4；`src/components/admin/model-config/fields.tsx` L5。

### `src/components/admin/model-config/batch-editor.tsx`

- 分类：core；行数：81；SHA256：`2be1bd7a6243a9a1d1223be40fdf35baf292ce21bed152175fb056c39d27493a`。
- 导出：`ModelBatchEditor` L12。
- 函数/类型：`ModelBatchEditor` L12–80；`resetPreview` L25–25；`chooseUpstream` L26–26；`chooseAlias` L27–27。
- 仓内依赖：`src/lib/model-config/types.ts` L3；`src/lib/billing/types.ts` L4；`src/lib/billing/labels.ts` L5；`src/lib/billing/rules/registry.ts` L6；`src/lib/model-config/batch.ts` L7；`src/lib/billing/money.ts` L8；`src/components/admin/model-config/business-editor.tsx` L9；`src/components/admin/model-config/fields.tsx` L10。

### `src/components/admin/model-config/business-editor.tsx`

- 分类：core；行数：112；SHA256：`561a6e849d2918e2b2cb04cb998187059f1ba547378000519f45712afb961b04`。
- 导出：`MoneyField` L18；`BusinessEditor` L22。
- 函数/类型：`displayedCredits` L17–17；`MoneyField` L18–20；`BusinessEditor` L22–111；`loadProcurement` L29–34；`addAlias` L36–46。
- 仓内依赖：`src/lib/model-config/types.ts` L3；`src/lib/billing/types.ts` L4；`src/lib/billing/rules/registry.ts` L5；`src/lib/billing/labels.ts` L6；`src/lib/model-config/business.ts` L7；`src/lib/model-config/feature-model-policy.ts` L8；`src/lib/model-config/bindings.ts` L9；`src/lib/model-config/business-schema.ts` L10；`src/components/admin/model-config/fields.tsx` L11；`src/lib/supabase.ts` L12；`src/components/admin/model-config/stage-inspector.tsx` L13；`src/lib/model-config/selection-policy.ts` L14；`src/lib/billing/money.ts` L15。

### `src/components/admin/model-config/configuration-diff.ts`

- 分类：core；行数：52；SHA256：`2ad01d3bf2e6ddc9abc676160f527f31fb9c7a63c4c808cf48247e8f67e5048b`。
- 导出：`ConfigurationChange` L2；`configurationChanges` L38。
- 函数/类型：`ConfigurationChange` L2–6；`values` L7–37；`configurationChanges` L38–51。
- 仓内依赖：`src/lib/model-config/types.ts` L1。

### `src/components/admin/model-config/credentials.ts`

- 分类：core；行数：37；SHA256：`0a5f7ce55a0585a09109e3e0b1f143bd827b758eef6ea2ef0d0335002127f48a`。
- 导出：`encryptCredential` L4。
- 函数/类型：`encryptCredential` L4–36。
- 仓内依赖：`src/lib/supabase.ts` L2。

### `src/components/admin/model-config/fields.tsx`

- 分类：core；行数：170；SHA256：`000a67ac1452248ffdfd2afad8f0c0aa53243c852d75fc2603ff5bb4c479a31d`。
- 导出：`inputClass` L3；`buttonClass` L5；`Field` L7；`TextField` L21；`NumberField` L47；`Toggle` L75；`Choice` L95；`Panel` L123；`Chips` L137。
- 函数/类型：`Field` L7–20；`TextField` L21–46；`NumberField` L47–74；`Toggle` L75–94；`Choice` L95–122；`Panel` L123–136；`Chips` L137–169。
- 仓内依赖：无静态仓内导入。

### `src/components/admin/model-config/image-preset-editor.tsx`

- 分类：core；行数：49；SHA256：`3a7da5b12d59a851af7f49cae5c3ab654f71f9dc6bdedddbb3b6a64e98459c3f`。
- 导出：`ImagePresetEditor` L17。
- 函数/类型：`JsonField` L11–16；`ImagePresetEditor` L17–48。
- 仓内依赖：`src/lib/model-config/types.ts` L3；`src/lib/billing/types.ts` L4；`src/lib/model-config/image-preset.ts` L5；`src/lib/supplier-cost/money.ts` L6；`src/components/admin/model-config/fields.tsx` L7；`src/lib/billing/api-cost.ts` L8；`src/lib/billing/money.ts` L9。

### `src/components/admin/model-config/manager.tsx`

- 分类：core；行数：1220；SHA256：`aace0f62c7ff50ccfff38bdc0689c4d4c2b3ec4d01c2dd25b2c79c308dc7cf60`。
- 导出：`ModelConfigurationManager` L201。
- 函数/类型：`AdminState` L37–54；`Validation` L55–60；`Operation` L61–65；`Simulation` L66–71；`Tab` L84–84；`storedOperation` L123–164；`AdminError` L165–174；`Diff` L175–199；`ModelConfigurationManager` L201–1219；`edit` L452–456；`save` L457–467；`execute` L468–502。
- 仓内依赖：`src/lib/supabase.ts` L4；`src/lib/model-config/publication-result.ts` L5；`src/lib/model-config/types.ts` L6；`src/components/admin/model-config/business-editor.tsx` L14；`src/components/admin/model-config/image-preset-editor.tsx` L15；`src/components/admin/model-config/batch-editor.tsx` L16；`src/lib/billing/types.ts` L17；`src/lib/model-config/catalog.ts` L18；`src/components/admin/model-config/provider-editor.tsx` L19；`src/components/admin/model-config/upstream-editor.tsx` L20；`src/components/admin/model-config/routing-editor.tsx` L21；`src/components/admin/model-config/configuration-diff.ts` L22；`src/components/admin/model-config/fields.tsx` L26。

### `src/components/admin/model-config/provider-editor.tsx`

- 分类：core；行数：238；SHA256：`499181a82c7431ca18dd9264520db953a483b012a18eb652d800bcd3d06d36b3`。
- 导出：`ProviderEditor` L18。
- 函数/类型：`ProviderEditor` L18–237。
- 仓内依赖：`src/lib/model-config/types.ts` L3；`src/components/admin/model-config/fields.tsx` L4；`src/components/admin/model-config/credentials.ts` L14；`src/components/admin/model-config/credentials.ts` L15；`src/lib/model-config/catalog.ts` L16。

### `src/components/admin/model-config/routing-editor.tsx`

- 分类：core；行数：375；SHA256：`cc519764ae5c1d31a97ae357001b150b1e39663225de35ca80af51509847c16c`。
- 导出：`PoolEditor` L155；`PublicModelEditor` L273。
- 函数/类型：`Rule` L19–19；`RuleEditor` L20–154；`PoolEditor` L155–272；`PublicModelEditor` L273–374。
- 仓内依赖：`src/lib/model-config/types.ts` L2；`src/components/admin/model-config/fields.tsx` L7。

### `src/components/admin/model-config/stage-inspector.tsx`

- 分类：core；行数：9；SHA256：`f2c79afef7e1dc75bde5f0396fee18bff74cc9e99f85fd2ab99ecbf4bb636cba`。
- 导出：`StageInspector` L5。
- 函数/类型：`StageInspector` L5–8。
- 仓内依赖：`src/lib/supabase.ts` L3；`src/components/admin/model-config/fields.tsx` L4。

### `src/components/admin/model-config/upstream-editor.tsx`

- 分类：core；行数：213；SHA256：`b71b2016e313b735939e6fc01b13a81a59513ee51e68ea6e6827ad4cecc450ac`。
- 导出：`UpstreamEditor` L8。
- 函数/类型：`UpstreamEditor` L8–212。
- 仓内依赖：`src/lib/model-config/types.ts` L2；`src/components/admin/model-config/fields.tsx` L3；`src/components/admin/model-config/audio-capability-editor.tsx` L4；`src/components/admin/model-config/video-capability-editor.tsx` L5。

### `src/components/admin/model-config/video-capability-editor.tsx`

- 分类：core；行数：32；SHA256：`425207bc4d21a2ca61e2674d82a97b08677d272ce935fea50a681a4bce16d97c`。
- 导出：`VideoCapabilityEditor` L7。
- 函数/类型：`VideoCapabilityEditor` L7–31。
- 仓内依赖：`src/lib/video/capability-schema.ts` L3。

### `src/components/admin/model-health/model-health.module.css`

- 分类：core；行数：707；SHA256：`e0b19724d9764f59a68da785ea884835c721cbe9b816fa4dcb7bd0df46247c2b`。
- 导出：无命名导出 / 数据或样式文件。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：无静态仓内导入。

### `src/components/admin/model-health/model-health.tsx`

- 分类：core；行数：498；SHA256：`e1f112cc600fdac0de80a305318a09e587a5dc82c6be0b89d3758b338d4b4f9e`。
- 导出：`ModelHealthPanel` L169。
- 函数/类型：`ProviderView` L9–9；`ModelView` L10–10；`describeReason` L61–77；`formatClock` L79–83；`relativeTime` L85–97；`describeMoment` L99–101；`formatLatency` L103–106；`formatDuration` L108–115；`summarizeStates` L117–120；`countModelStates` L122–126；`recentBadgeState` L128–134；`recentStateText` L136–138；`ModelRow` L140–165；`PolicyForm` L167–167；`ModelHealthPanel` L169–497；`beginWrite` L198–202；`editForm` L247–254；`savePolicy` L256–295；`discardAndReload` L297–303；`probeDueModels` L305–333；`reconcile` L334–342。
- 仓内依赖：`src/lib/model-health/contracts.ts` L5；`src/components/admin/model-health/model-health.module.css` L6；`src/components/admin/model-health/provider-ops.tsx` L7。

### `src/components/admin/model-health/provider-ops.module.css`

- 分类：core；行数：96；SHA256：`1198a140fcef9de0bed9102352d97751993d81b03bc6cede6fe38c237d05c4d1`。
- 导出：无命名导出 / 数据或样式文件。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：无静态仓内导入。

### `src/components/admin/model-health/provider-ops.tsx`

- 分类：core；行数：64；SHA256：`e42f66a33d5418feca5af396fa5707bbcae2f453cdf3e8f350aa0b306e7beb76`。
- 导出：`ProviderOps` L28。
- 函数/类型：`Measurement` L12–14；`MeasurementColumns` L15–17；`AcceptanceStats` L18–20；`ProviderActivityPanel` L21–27；`ProviderOps` L28–63。
- 仓内依赖：`src/lib/supabase.ts` L5；`src/lib/model-config/provider-balance-contracts.ts` L6；`src/lib/model-config/provider-activity-contracts.ts` L7；`src/components/admin/model-health/provider-ops.module.css` L8。

### `src/components/admin/model-health/supplier-balance-page.module.css`

- 分类：core；行数：2；SHA256：`4c7c0c8f356e0b32c53e54bc161fc678f86359c1436efff4c3db4517cc149529`。
- 导出：无命名导出 / 数据或样式文件。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：无静态仓内导入。

### `src/components/admin/model-health/supplier-balance-page.tsx`

- 分类：core；行数：14；SHA256：`1ac68041cbe915bfa3b8a26b0c8c2a289eb16cf6c3f3310b6db9ca5fe02e705e`。
- 导出：`SupplierBalancePage` L7。
- 函数/类型：`SupplierBalancePage` L7–13。
- 仓内依赖：`src/components/admin/model-health/provider-ops.tsx` L4；`src/components/admin/model-health/supplier-balance-page.module.css` L5。

### `src/components/admin/model-management/channel-display.ts`

- 分类：core；行数：19；SHA256：`0beb764d13b34d5a99d1fd7deb677d23c969a390e9f5457b827de1ddb3afb8b1`。
- 导出：`orderedChannels` L5；`orderedRoutes` L11。
- 函数/类型：`orderedChannels` L5–9；`orderedRoutes` L11–18。
- 仓内依赖：`src/lib/model-config/channel-policy.ts` L1；`src/lib/model-config/management.ts` L2。

### `src/components/admin/model-management/channel-policy-editor.module.css`

- 分类：core；行数：53；SHA256：`7d263969ed803fc13e426ca35c28aa44ba836da09b679770507bcbdca261c4d8`。
- 导出：无命名导出 / 数据或样式文件。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：无静态仓内导入。

### `src/components/admin/model-management/channel-policy-editor.tsx`

- 分类：core；行数：59；SHA256：`cc7b348cca787847faa3736ffa8da56f22c40103af93dd092142df7b578874b0`。
- 导出：`ChannelPolicyEditor` L8。
- 函数/类型：`ChannelPolicyEditor` L8–58。
- 仓内依赖：`src/lib/model-config/channel-policy.ts` L3；`src/lib/model-config/management.ts` L4；`src/components/admin/model-management/channel-display.ts` L5；`src/components/admin/model-management/channel-policy-editor.module.css` L6。

### `src/components/admin/model-management/channels-dialog.tsx`

- 分类：core；行数：37；SHA256：`ed7f604d24febff1e870af87d832c68400640cae9763a1dce973a2e07c62bc10`。
- 导出：`ChannelsDialog` L14。
- 函数/类型：`ChannelsDialog` L14–28；`ChannelDirectory` L30–36。
- 仓内依赖：`src/lib/image-model-routing.ts` L4；`src/lib/model-config/channel-policy.ts` L5；`src/lib/model-config/management.ts` L6；`src/components/admin/model-management/contracts.ts` L7；`src/components/admin/model-management/channel-policy-editor.module.css` L8；`src/components/admin/model-management/channel-policy-editor.tsx` L9；`src/components/admin/model-management/model-management.module.css` L10；`src/components/admin/model-management/dialog.tsx` L11。

### `src/components/admin/model-management/client.ts`

- 分类：core；行数：14；SHA256：`b7e25e7ecf1638f9e8475b9bda71fd800537cb3298abb74f877159d1d1d11033`。
- 导出：`api` L6。
- 函数/类型：`api` L6–13。
- 仓内依赖：`src/lib/supabase.ts` L2；`src/components/admin/model-management/contracts.ts` L3；`src/lib/model-config/management-session-contract.ts` L4。

### `src/components/admin/model-management/contracts.ts`

- 分类：core；行数：7；SHA256：`8cfdfa58fde02968bc37305a9aeaa26cab9b0c721534b88b4ad135f784367f9a`。
- 导出：`endpoint,pendingKey` L4；`types` L6。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：`src/lib/model-config/management-session-contract.ts` L1。

### `src/components/admin/model-management/dialog.tsx`

- 分类：core；行数：13；SHA256：`b0844b784e03afd8a157cadef26f5882d44f34f6f4a0416db9f7e5f4c1d740f9`。
- 导出：`Dialog` L6。
- 函数/类型：`Dialog` L6–12。
- 仓内依赖：`src/components/admin/model-management/model-management.module.css` L4。

### `src/components/admin/model-management/editor-state.ts`

- 分类：core；行数：24；SHA256：`e35f46b50185ca1a041faa140e913402ab203d8462c4aa68f30e1404df04f85c`。
- 导出：`EditorState` L8；`dispatchedEditor` L15；`registeredEditor` L19。
- 函数/类型：`SwitchEditor` L5–5；`ChannelsEditor` L6–6；`ReturnEditor` L7–7；`EditorState` L8–12；`dispatchedEditor` L15–17；`registeredEditor` L19–23。
- 仓内依赖：`src/lib/model-config/management.ts` L1；`src/lib/model-config/channel-policy.ts` L2；`src/components/admin/model-management/contracts.ts` L3。

### `src/components/admin/model-management/image-mapping-editor.tsx`

- 分类：core；行数：73；SHA256：`9df2ea7f26022ebd4e227dadd115b04897dd1d6ea3a4980997c915333539b4ea`。
- 导出：`ImageMappingEditor` L14。
- 函数/类型：`ResolutionMode` L10–10；`Meta` L11–11；`ImageMappingEditor` L14–72。
- 仓内依赖：`src/lib/model-config/management.ts` L3；`src/lib/model-config/image-parameter-plan.ts` L4；`src/lib/model-config/quality-policy.ts` L5；`src/lib/model-config/resolution-policy.ts` L6；`src/lib/model-config/image-mapping-editor.ts` L7；`src/components/admin/model-management/model-management.module.css` L8。

### `src/components/admin/model-management/image-parameter-dialogs.tsx`

- 分类：core；行数：70；SHA256：`777788af8cb8fc3285cbb4a4173bced91639009a2ff5db558f8a04f73f40b8a9`。
- 导出：`ParametersDialog` L10；`ResolutionsDialog` L34。
- 函数/类型：`ParametersDialog` L10–32；`ResolutionsDialog` L34–69。
- 仓内依赖：`src/lib/model-config/management.ts` L3；`src/lib/model-config/quality-policy.ts` L4；`src/lib/model-config/resolution-policy.ts` L5；`src/components/admin/model-management/model-management.module.css` L6；`src/components/admin/model-management/dialog.tsx` L7。

### `src/components/admin/model-management/imagegen-metadata-editor.tsx`

- 分类：core；行数：35；SHA256：`3e3edf243dd9775e2bae29afa5126f09a154c02d00d3f25499177e5a5e30f20c`。
- 导出：`ImagegenMetadataEditor` L6。
- 函数/类型：`ImagegenMetadataEditor` L6–34。
- 仓内依赖：`src/lib/imagegen/capabilities.ts` L2；`src/lib/supplier-models/specifications.ts` L3；`src/lib/imagegen/types.ts` L4。

### `src/components/admin/model-management/imagegen-routes-editor.tsx`

- 分类：core；行数：15；SHA256：`c75dff819e8da07e1b89489242b2dac1f864193a124909e78fb2b097d322def5`。
- 导出：`ImagegenRoutesEditor` L7。
- 函数/类型：`ImagegenRoutesEditor` L7–14。
- 仓内依赖：`src/components/admin/model-management/imagegen-metadata-editor.tsx` L3；`src/lib/model-config/imagegen-policy.ts` L4；`src/lib/model-config/management.ts` L5；`src/components/admin/model-management/model-management.module.css` L6。

### `src/components/admin/model-management/model-editor.tsx`

- 分类：core；行数：44；SHA256：`90e1c5d100e4bd066ed99a2718b33c98ab3c550fba307ecf7ac4181ae390fa91`。
- 导出：`ModelEditor` L19。
- 函数/类型：`ModelEditor` L19–43。
- 仓内依赖：`src/components/admin/model-management/image-mapping-editor.tsx` L2；`src/components/admin/model-management/contracts.ts` L3；`src/components/admin/model-management/editor-state.ts` L4；`src/components/admin/model-management/dialog.tsx` L5；`src/components/admin/model-management/model-management.module.css` L6；`src/components/admin/model-management/pricing-dialog.tsx` L7；`src/components/admin/model-management/presentation-dialogs.tsx` L8；`src/components/admin/model-management/image-parameter-dialogs.tsx` L9；`src/components/admin/model-management/switch-dialog.tsx` L10；`src/components/admin/model-management/source-dialogs.tsx` L11；`src/components/admin/model-management/channels-dialog.tsx` L12；`src/components/admin/model-management/video-parameters-dialog.tsx` L13；`src/components/admin/model-management/video-capability-upgrade.tsx` L14；`src/components/admin/model-management/imagegen-routes-editor.tsx` L15；`src/components/admin/model-management/onboarding-dialog.tsx` L16。

### `src/components/admin/model-management/model-management-clarity.module.css`

- 分类：core；行数：10；SHA256：`7c018b69743080ee89340bfa6af6de2451f5e47677ebf80e9745d8ef70f34050`。
- 导出：无命名导出 / 数据或样式文件。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：无静态仓内导入。

### `src/components/admin/model-management/model-management.module.css`

- 分类：core；行数：217；SHA256：`8ede2c2d25777f471730d04575bbde8e026f8f9ccf34e903665dcfd57094c204`。
- 导出：无命名导出 / 数据或样式文件。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：无静态仓内导入。

### `src/components/admin/model-management/model-management.tsx`

- 分类：core；行数：67；SHA256：`14ae8cc26bdb38447d0a55f1361376e0c916ee1a799c996b0df7d81bdcdec10a`。
- 导出：`ModelManagement` L18。
- 函数/类型：`CreateFrontendModelLink` L14–16；`ModelManagement` L18–66；`run` L22–28。
- 仓内依赖：`src/components/admin/model-management/contracts.ts` L5；`src/components/admin/model-management/model-management.module.css` L6；`src/components/admin/model-management/model-management-clarity.module.css` L7；`src/components/admin/model-management/model-mapping-card.tsx` L8；`src/components/admin/model-management/use-model-management.ts` L9；`src/components/admin/model-management/model-editor.tsx` L10；`src/components/admin/model-management/editor-state.ts` L11；`src/components/admin/model-management/source-card.tsx` L12。

### `src/components/admin/model-management/model-mapping-card.module.css`

- 分类：core；行数：61；SHA256：`214c856035767e5a530585936cbdf51eca22edcd999861e633bfebe3794737dd`。
- 导出：无命名导出 / 数据或样式文件。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：无静态仓内导入。

### `src/components/admin/model-management/model-mapping-card.tsx`

- 分类：core；行数：104；SHA256：`2fbeaf563645aa1e8434ab8dc7373b8e16d8b7c9f35470f1f746681b4c23384b`。
- 导出：`MappingAction` L9；`ModelMappingHeader` L19；`ModelMappingCard` L25。
- 函数/类型：`MappingAction` L9–15；`ModelMappingHeader` L19–23；`ModelMappingCard` L25–103。
- 仓内依赖：`src/lib/model-config/management.ts` L5；`src/components/admin/model-management/model-mapping-card.module.css` L6；`src/components/admin/model-management/channel-display.ts` L7。

### `src/components/admin/model-management/onboarding-dialog.tsx`

- 分类：core；行数：55；SHA256：`e2d5108e11cd92b8bb92e3414f0618fe4cef864badd448e3fa40aa0abf9f4d5b`。
- 导出：`OnboardingDialog` L17。
- 函数/类型：`request` L16–16；`OnboardingDialog` L17–44；`edit` L28–28；`family` L29–29；`catalogSource` L30–30；`previewOrSave` L31–31；`ParameterMapEditor` L46–49；`catalogUpstream` L51–54。
- 仓内依赖：`src/lib/supabase.ts` L4；`src/lib/model-config/gpt26-onboarding.ts` L5；`src/lib/model-config/onboarding-contract.ts` L6；`src/lib/model-config/types.ts` L7；`src/lib/billing/rules/registry.ts` L8；`src/lib/billing/labels.ts` L9；`src/components/admin/model-config/upstream-editor.tsx` L10；`src/components/admin/model-management/dialog.tsx` L11；`src/components/admin/model-management/contracts.ts` L12；`src/components/admin/model-management/model-management.module.css` L13；`src/components/admin/model-management/onboarding.module.css` L14。

### `src/components/admin/model-management/onboarding.module.css`

- 分类：core；行数：4；SHA256：`4d130a5454bd2ec6e38a4e0efcb8f8f38b6315f9c3ffe5ffb06546b333e8e491`。
- 导出：无命名导出 / 数据或样式文件。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：无静态仓内导入。

### `src/components/admin/model-management/presentation-dialogs.tsx`

- 分类：core；行数：59；SHA256：`716ded9b2cbe3fb1046876054c767867153c952bf24111deeb883b97a8ba7cd9`。
- 导出：`OrderDialog` L10；`ScopeDialog` L21；`RenameDialog` L47。
- 函数/类型：`OrderDialog` L10–19；`ScopeDialog` L21–45；`RenameDialog` L47–58。
- 仓内依赖：`src/lib/model-config/management.ts` L4；`src/components/admin/model-management/contracts.ts` L5；`src/components/admin/model-management/model-management.module.css` L6；`src/components/admin/model-management/dialog.tsx` L7。

### `src/components/admin/model-management/pricing-dialog.tsx`

- 分类：core；行数：51；SHA256：`1ffd69dd974964ee996a53b3b7df0077a8a7c12fb4aa6f2435400b71125805f2`。
- 导出：`PriceDialog` L15。
- 函数/类型：`PriceDialog` L15–50；`Draft` L19–19。
- 仓内依赖：`src/lib/model-config/management.ts` L3；`src/lib/model-config/credit-overrides.ts` L4；`src/lib/supabase.ts` L5；`src/components/admin/model-management/contracts.ts` L6；`src/components/admin/model-management/model-management.module.css` L7；`src/components/admin/model-management/dialog.tsx` L8。

### `src/components/admin/model-management/source-card.tsx`

- 分类：core；行数：20；SHA256：`09a318c5bd5f446f0f7073a59d79f88825e0149b8c9e6ca0d15e9ee5d3f042a6`。
- 导出：`Source` L8。
- 函数/类型：`Source` L8–19。
- 仓内依赖：`src/lib/model-config/catalog-store.ts` L4；`src/components/admin/model-management/contracts.ts` L5；`src/components/admin/model-management/model-management.module.css` L6。

### `src/components/admin/model-management/source-dialogs.tsx`

- 分类：core；行数：60；SHA256：`2689bc9ac7d72cd21eaaaad2b518f01734e9ec2baa4e12aaf6f650d85c2d853a`。
- 导出：`ConnectDialog` L38；`RegisterDialog` L51。
- 函数/类型：`useArray` L33–36；`ConnectDialog` L38–49；`submit` L40–47；`RegisterDialog` L51–59。
- 仓内依赖：`src/lib/browser-crypto.ts` L4；`src/components/admin/model-config/credentials.ts` L5；`src/lib/video/capability-schema.ts` L6；`src/components/admin/model-config/video-capability-editor.tsx` L7；`src/components/admin/model-management/client.ts` L8；`src/components/admin/model-management/model-management.module.css` L9；`src/components/admin/model-management/dialog.tsx` L10。

### `src/components/admin/model-management/supplier-library/client.ts`

- 分类：core；行数：20；SHA256：`3ed786498c9a125a9b84cbca5169cd443c5ecfa8cc4fe23d9d1ad8ad4730b778`。
- 导出：`filterParams` L5；`libraryRequest` L9。
- 函数/类型：`filterParams` L5–7；`libraryRequest` L9–19。
- 仓内依赖：`src/lib/supabase.ts` L2；`src/components/admin/model-management/supplier-library/contracts.ts` L3。

### `src/components/admin/model-management/supplier-library/contracts.ts`

- 分类：core；行数：11；SHA256：`82566febc3d9f3862e21030bcab317e3f46464568a7abe627b92849d2bef5723`。
- 导出：`endpoint` L2；`states` L3；`bases` L4；`modalities` L5；`Listing` L6；`Filter` L7；`moneyFields` L8；`moneyNames` L9；`ChangeMetadata` L10。
- 函数/类型：`Listing` L6–6；`Filter` L7–7；`ChangeMetadata` L10–10。
- 仓内依赖：`src/lib/supplier-models/types.ts` L1。

### `src/components/admin/model-management/supplier-library/draft-values.ts`

- 分类：core；行数：36；SHA256：`cafe68559a5c18442057cb754191fb1df7919d5265c7c12f8a550c642f7297da`。
- 导出：`metadataDraft` L5；`priceTexts` L9；`metadataPayload` L15。
- 函数/类型：`metadataDraft` L5–7；`priceTexts` L9–11；`metadataPayload` L15–35。
- 仓内依赖：`src/lib/supplier-cost/money.ts` L1；`src/lib/supplier-models/types.ts` L2；`src/components/admin/model-management/supplier-library/contracts.ts` L3。

### `src/components/admin/model-management/supplier-library/identity-fields.tsx`

- 分类：core；行数：12；SHA256：`da5ec8ed085bb3e63a8bdb15a57f5e669e59e48d36e7a756ae93575754db4e2c`。
- 导出：`IdentityFields` L7。
- 函数/类型：`TextField` L6–6；`IdentityFields` L7–11。
- 仓内依赖：`src/lib/supplier-models/types.ts` L2；`src/components/admin/model-management/supplier-library/contracts.ts` L3；`src/components/admin/model-management/supplier-model-library.module.css` L4。

### `src/components/admin/model-management/supplier-library/mapping-fields.tsx`

- 分类：core；行数：12；SHA256：`12ff4512c4e8d2ebe60b890a80e7661e7b2f23cb403985ac1f81281ea60dac7c`。
- 导出：`MappingFields` L7。
- 函数/类型：`MappingFields` L7–11。
- 仓内依赖：`src/components/admin/model-management/imagegen-metadata-editor.tsx` L2；`src/lib/model-config/resolution-policy.ts` L3；`src/lib/model-config/quality-policy.ts` L4；`src/components/admin/model-management/supplier-library/use-metadata-draft.ts` L5；`src/components/admin/model-management/supplier-model-library.module.css` L6。

### `src/components/admin/model-management/supplier-library/metadata-dialog.tsx`

- 分类：core；行数：32；SHA256：`ea4e3f20d05f68bb499c444d457fc1fc20a03e5ba63c8147ae351a959e32dcb9`。
- 导出：`MetadataDialog` L12。
- 函数/类型：`MetadataDialog` L12–31。
- 仓内依赖：`src/lib/supabase.ts` L4；`src/lib/supplier-models/types.ts` L5；`src/components/admin/model-management/supplier-library/contracts.ts` L6；`src/components/admin/model-management/supplier-library/use-metadata-draft.ts` L7；`src/components/admin/model-management/supplier-library/identity-fields.tsx` L8；`src/components/admin/model-management/supplier-library/price-fields.tsx` L9；`src/components/admin/model-management/supplier-library/mapping-fields.tsx` L10；`src/components/admin/model-management/supplier-model-library.module.css` L11。

### `src/components/admin/model-management/supplier-library/presentation.ts`

- 分类：core；行数：6；SHA256：`b27ea53dd680f4377a770f93c5a9f5f23aeff787faa63bcce512681778eec3f5`。
- 导出：`costSummary` L4；`download` L5。
- 函数/类型：`costSummary` L4–4；`download` L5–5。
- 仓内依赖：`src/lib/supplier-cost/money.ts` L1；`src/lib/supplier-models/types.ts` L2；`src/components/admin/model-management/supplier-library/contracts.ts` L3。

### `src/components/admin/model-management/supplier-library/price-fields.tsx`

- 分类：core；行数：11；SHA256：`a11817279f5af06f718f6aa3a06bbf5825ce4a27740f01cc71a7b5db8a364039`。
- 导出：`PriceFields` L8。
- 函数/类型：`TextField` L6–6；`PriceFields` L8–10。
- 仓内依赖：`src/lib/supplier-models/types.ts` L2；`src/components/admin/model-management/supplier-library/contracts.ts` L3；`src/components/admin/model-management/supplier-model-library.module.css` L4。

### `src/components/admin/model-management/supplier-library/use-metadata-draft.ts`

- 分类：core；行数：30；SHA256：`b73b66059e45d7037bb3943194aadd9889363f252fb0fa308bea3d1beedbb0a3`。
- 导出：`useMetadataDraft` L9；`MetadataDraft` L29。
- 函数/类型：`useMetadataDraft` L9–28；`MetadataDraft` L29–29。
- 仓内依赖：`src/lib/browser-crypto.ts` L3；`src/lib/supplier-models/types.ts` L4；`src/lib/supplier-models/quality-defaults.ts` L5；`src/lib/supplier-models/resolution-defaults.ts` L6；`src/components/admin/model-management/supplier-library/contracts.ts` L7；`src/components/admin/model-management/supplier-library/draft-values.ts` L8。

### `src/components/admin/model-management/supplier-library/use-supplier-library.ts`

- 分类：core；行数：90；SHA256：`0fc6a4c787c78f4baf1d51820a0eaad8e8a8be09ac8a16c1010cf3807a7baf55`。
- 导出：`useSupplierLibrary` L9。
- 函数/类型：`useSupplierLibrary` L9–89。
- 仓内依赖：`src/lib/supplier-models/types.ts` L3；`src/components/admin/model-management/supplier-library/client.ts` L4；`src/components/admin/model-management/supplier-library/presentation.ts` L5；`src/components/admin/model-management/supplier-library/contracts.ts` L6。

### `src/components/admin/model-management/supplier-model-library.module.css`

- 分类：core；行数：18；SHA256：`d1d72b748d06e6699dcd1be1b939366fb58513c326c2b2527960ed4514d39105`。
- 导出：无命名导出 / 数据或样式文件。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：无静态仓内导入。

### `src/components/admin/model-management/supplier-model-library.tsx`

- 分类：core；行数：28；SHA256：`870f98846e19238d8e60ae242c79760f2aa89035bb19f1b95a8c73e995dc40a2`。
- 导出：`SupplierModelLibrary` L10。
- 函数/类型：`SupplierModelLibrary` L10–27。
- 仓内依赖：`src/components/admin/model-management/supplier-library/contracts.ts` L5；`src/components/admin/model-management/supplier-library/presentation.ts` L6；`src/components/admin/model-management/supplier-library/metadata-dialog.tsx` L7；`src/components/admin/model-management/supplier-library/use-supplier-library.ts` L8；`src/components/admin/model-management/supplier-model-library.module.css` L9。

### `src/components/admin/model-management/switch-dialog.tsx`

- 分类：core；行数：32；SHA256：`53a801987855ad744a97640d72f0053d1f3869a84a548ae02bcb9e2ef0cfa866`。
- 导出：`SwitchDialog` L11。
- 函数/类型：`SwitchDialog` L11–31。
- 仓内依赖：`src/lib/model-config/management.ts` L5；`src/components/admin/model-management/contracts.ts` L6；`src/components/admin/model-management/model-management.module.css` L7；`src/components/admin/model-management/dialog.tsx` L8。

### `src/components/admin/model-management/use-model-management.ts`

- 分类：core；行数：27；SHA256：`81dc021d2d8e2592076ea8626c3d8fde19da663459d41487cf991315040c66b4`。
- 导出：`useModelManagement` L11。
- 函数/类型：`useModelManagement` L11–26。
- 仓内依赖：`src/lib/browser-crypto.ts` L3；`src/lib/model-config/public-client.ts` L4；`src/lib/model-config/management-session.ts` L5；`src/components/admin/model-management/client.ts` L6；`src/components/admin/model-management/contracts.ts` L7。

### `src/components/admin/model-management/video-capability-upgrade.tsx`

- 分类：core；行数：40；SHA256：`58998714ba4f445c06afdf7158457f823d7af5358d34297d040a013161d5759c`。
- 导出：`VideoCapabilityUpgrade` L9。
- 函数/类型：`VideoCapabilityUpgrade` L9–39。
- 仓内依赖：`src/lib/supabase.ts` L4；`src/lib/model-config/video-capability-review.ts` L5；`src/components/admin/model-management/model-management.module.css` L6。

### `src/components/admin/model-management/video-parameters-dialog.tsx`

- 分类：core；行数：21；SHA256：`433e369750b4d228a2aaf7978a173aef841d80de9d45090d30c0875630f89567`。
- 导出：`VideoParametersDialog` L10。
- 函数/类型：`VideoParametersDialog` L10–20。
- 仓内依赖：`src/lib/model-config/management.ts` L3；`src/components/admin/model-config/video-capability-editor.tsx` L4；`src/lib/model-config/video-policy.ts` L5；`src/components/admin/model-management/model-management.module.css` L6；`src/components/admin/model-management/dialog.tsx` L7。

### `src/components/admin/navigation.ts`

- 分类：core；行数：30；SHA256：`428b59f34b63845d8ee836ca05934eff03f89b98654659e62be533628ab91c10`。
- 导出：`AdminSection` L3；`AdminLink` L4；`adminEntries` L5；`adminModuleLinks` L16；`adminCategory` L23；`adminLinkActive` L25；`adminSearchLinks` L29。
- 函数/类型：`AdminSection` L3–3；`AdminLink` L4–4；`adminCategory` L23–23；`adminLinkActive` L25–28；`adminSearchLinks` L29–29。
- 仓内依赖：`src/lib/bi/contracts.ts` L2。

### `src/components/admin/page-search.tsx`

- 分类：core；行数：18；SHA256：`06ae85af8f07329a9e27c65950bc81010115b1e5af9abfe6be3ed56a42caddde`。
- 导出：`AdminPageSearch` L7。
- 函数/类型：`AdminPageSearch` L7–17。
- 仓内依赖：`src/components/admin/navigation.ts` L5；`src/components/admin/center-shell.module.css` L6。

### `src/components/admin/settings/api-panel.tsx`

- 分类：related；行数：406；SHA256：`c240d9ed2a9fae31f8194df4a882f0434d9e13b8e7402c5ca1d72b0c9e205605`。
- 导出：`AdminApiSettings` L23。
- 函数/类型：`AdminApiSettings` L23–405；`save` L45–47；`saveReplicate` L48–48。
- 仓内依赖：`src/components/ui/button.tsx` L5；`src/components/ui/input.tsx` L6；`src/components/admin/settings/credentials.ts` L8；`src/components/admin/settings/use-settings-session.ts` L9。

### `src/components/admin/settings/auth-panel.tsx`

- 分类：related；行数：686；SHA256：`d72eeeff0557dfa4f5915ea72f80e82e3558de9c56e73a2a474ed0b926c6b40b`。
- 导出：`AdminAuthSettings` L12。
- 函数/类型：`AdminAuthSettings` L12–685；`saveWechatLogin` L55–64。
- 仓内依赖：`src/components/ui/button.tsx` L5；`src/components/ui/input.tsx` L6；`src/components/admin/settings/ready-badge.tsx` L8；`src/components/admin/settings/use-settings-session.ts` L10。

### `src/components/admin/settings/contracts.ts`

- 分类：related；行数：54；SHA256：`98ec551c2a4e6afc9ff93d558dd210261ebc2365461eb80255463aaaaef1c992`。
- 导出：`SettingsView` L1。
- 函数/类型：`SettingsView` L1–52。
- 仓内依赖：无静态仓内导入。

### `src/components/admin/settings/credentials.ts`

- 分类：related；行数：48；SHA256：`48890643edd77837c07e062d04020cb1063a83c7c7ed1d216ea68124202d6a8a`。
- 导出：`encryptKey` L13；`hasSubtle` L44。
- 函数/类型：`pemToDer` L1–7；`encryptKey` L13–38；`hasSubtle` L44–46。
- 仓内依赖：无静态仓内导入。

### `src/components/admin/settings/credits-panel.tsx`

- 分类：related；行数：74；SHA256：`269fbdde2f4ef4104822ba4cd45f51abd9d22a43114d805b5718f3b0a4d5e6d0`。
- 导出：`AdminCreditSettings` L10。
- 函数/类型：`AdminCreditSettings` L10–73；`grantCredits` L16–16。
- 仓内依赖：`src/components/ui/button.tsx` L5；`src/components/ui/input.tsx` L6；`src/components/admin/settings/use-settings-session.ts` L8；`src/lib/operator.ts` L9。

### `src/components/admin/settings/ready-badge.tsx`

- 分类：related；行数：27；SHA256：`a7f9b3db72d6c9d6e8afe1aeb68830d56b834e75016640ab537ed5b3ecab91e2`。
- 导出：`ReadyBadge` L2。
- 函数/类型：`ReadyBadge` L2–25。
- 仓内依赖：无静态仓内导入。

### `src/components/admin/settings/site-panel.tsx`

- 分类：related；行数：208；SHA256：`e6f408e58f5cb893c768323b0158d8e72a4bae78880bf420555f55ca8a4cef54`。
- 导出：`AdminSiteSettings` L13。
- 函数/类型：`AdminSiteSettings` L13–207；`saveBrandName` L26–28；`saveBrandLogo` L29–31；`saveSitePages` L32–37；`uploadBrandLogo` L38–38。
- 仓内依赖：`src/components/ui/button.tsx` L5；`src/components/ui/input.tsx` L6；`src/components/ui/textarea.tsx` L7；`src/components/cached-image.tsx` L9；`src/components/admin/settings/use-settings-session.ts` L11。

### `src/components/admin/settings/use-settings-session.ts`

- 分类：related；行数：96；SHA256：`1c1132f4ac41ccedee380ff855cc7c9bf466bb478a3849f8200aa87f214454fc`。
- 导出：`useSettingsSession` L13；`SettingsSession` L95。
- 函数/类型：`SettingsMessage` L7–7；`SettingsAccess` L8–8；`Payload` L9–9；`useSettingsSession` L13–94；`SettingsSession` L95–95。
- 仓内依赖：`src/lib/supabase.ts` L3；`src/components/admin/settings/credentials.ts` L4；`src/components/admin/settings/contracts.ts` L5。

### `src/components/admin/theme.module.css`

- 分类：core；行数：13；SHA256：`c61af1b595f1e3a10792cae83779d37ff6a4eeaff6dbd5e09205518ee1352def`。
- 导出：无命名导出 / 数据或样式文件。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：无静态仓内导入。

### `src/components/pricing-research.tsx`

- 分类：core；行数：351；SHA256：`b5016b847afa131e3caa5fa65581239b12656b5e9d666e75c2cec142b45a75ed`。
- 导出：`PricingResearch` L21。
- 函数/类型：`ResearchProps` L9–18；`PricingResearch` L21–350。
- 仓内依赖：`src/lib/pricing.ts` L3。

### `src/lib/admin-auth.ts`

- 分类：related；行数：178；SHA256：`e3a1c4a952f599ee7bf633686ca1d77286e172510e306e9828957b0744ab9c90`。
- 导出：`ADMIN_PW_HASH_SETTING` L24；`ADMIN_COOKIE` L25；`SESSION_TTL_MS` L26；`setAdminPassword` L33；`hasAdminPassword` L38；`verifyAdminPassword` L46；`signSession` L59；`verifySessionToken` L71；`localAdminOk` L103；`adminPasswordState` L109；`authenticateAdminPassword` L117；`requireAdmin` L128；`resolveUserEmail` L160。
- 函数/类型：`secret` L28–31；`setAdminPassword` L33–35；`hasAdminPassword` L38–44；`verifyAdminPassword` L46–55；`signSession` L59–63；`sessionMessage` L65–69；`verifySessionToken` L71–88；`readCookie` L90–100；`localAdminOk` L103–107；`adminPasswordState` L109–115；`authenticateAdminPassword` L117–122；`requireAdmin` L128–150；`resolveUserEmail` L160–177。
- 仓内依赖：`src/lib/site-control/identity.ts` L1；`src/platform/db/pool.ts` L4；`src/lib/settings/repository.ts` L5；`src/lib/supabase-admin.ts` L6；`src/lib/auth-mode.ts` L7；`src/lib/pw.ts` L8；`src/lib/settings-secret.ts` L9；`src/lib/native-auth.ts` L139；`src/lib/accounts/repository.ts` L142；`src/lib/native-auth.ts` L167；`src/lib/accounts/repository.ts` L172。

### `src/lib/admin-page.ts`

- 分类：core；行数：14；SHA256：`db9992c619e124b74c04b2eb860a59b3952670f685639080bc77a83bb8364c3f`。
- 导出：`requireAdminPage` L7。
- 函数/类型：`requireAdminPage` L7–13。
- 仓内依赖：`src/lib/admin-auth.ts` L4；`src/lib/admin-navigation.ts` L5。

### `src/lib/bi/access.ts`

- 分类：core；行数：34；SHA256：`d00e36f95f7649768ef3b8dfb7d530421b099096c7bdfe8df166949ac7780926`。
- 导出：`BI_PRIVATE_HEADERS` L9；`biJson` L15；`biAuthorize` L18；`sameSiteBiMutation` L31。
- 函数/类型：`biJson` L15–17；`biAuthorize` L18–30；`sameSiteBiMutation` L31–33。
- 仓内依赖：`src/lib/admin-auth.ts` L3；`src/platform/db/pool.ts` L4；`src/lib/ip.ts` L5；`src/lib/rate-limit-http.ts` L6；`src/lib/request-origin.ts` L7。

### `src/lib/bi/artwork-inputs.ts`

- 分类：related；行数：44；SHA256：`73cdbe469372a3688ab3e2cf2aa72507405bd642c554759e9457db45798bbbc7`。
- 导出：`ArtworkInput` L5；`artworkInputs` L7；`ARTWORK_INPUT_COLUMNS` L31；`ARTWORK_INPUT_JOINS` L34；`artworkInputPresentation` L40。
- 函数/类型：`RecordValue` L2–2；`ArtworkInput` L5–5；`artworkInputs` L7–28；`artworkInputPresentation` L40–43。
- 仓内依赖：无静态仓内导入。

### `src/lib/bi/artwork-view.ts`

- 分类：related；行数：39；SHA256：`8dc3804918a3a01208d521ebc590c18c80e6bfb209f8d5864698cb866c3c5746`。
- 导出：`ARTWORK_COLUMNS` L4；`artworkValue` L15；`ARTWORK_DETAIL_LABELS` L21；`artworkDetailEntries` L28；`ARTWORK_DETAIL_VALUES` L31；`artworkDetailValue` L36。
- 函数/类型：`artworkValue` L15–20；`artworkDetailValue` L36–38。
- 仓内依赖：`src/lib/bi/contracts.ts` L1。

### `src/lib/bi/call-scope.ts`

- 分类：related；行数：7；SHA256：`b6f3295ce9e19e757b428a5316a6857bfd998eac1fe407490067fdd23b1a5de7`。
- 导出：`currentObservedCallId` L5；`withObservedCallId` L6。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：无静态仓内导入。

### `src/lib/bi/context.ts`

- 分类：related；行数：23；SHA256：`a960cc920a4777539b364c8ccf48d1b39a71517f37043585e9dfae385df38036`。
- 导出：`currentBiOperationId` L8；`currentBiContext` L10；`withBiModelContext` L12；`withBiContext` L22。
- 函数/类型：`Context` L4–4；`withBiModelContext` L12–19；`withBiContext` L22–22。
- 仓内依赖：无静态仓内导入。

### `src/lib/bi/contracts.ts`

- 分类：related；行数：137；SHA256：`b04ddcaa89665efc3a9e06d9ce9227f99c91619ef60ddd4cdcc2d2a02994fb80`。
- 导出：`BI_SECTIONS` L1；`BiSection` L14；`BiRow` L15；`BiQuery` L16；`BiOverview` L32；`BiResponse` L59；`parseBiQuery` L80；`biCsvCell` L131。
- 函数/类型：`BiSection` L14–14；`BiRow` L15–15；`BiQuery` L16–31；`BiOverview` L32–58；`BiResponse` L59–68；`date` L71–79；`parseBiQuery` L80–128；`biCsvCell` L131–136。
- 仓内依赖：无静态仓内导入。

### `src/lib/bi/management-log.ts`

- 分类：related；行数：40；SHA256：`2049311a832e0aaee2429385b2d6302aab8aff6c507b082f66de1bd22bd39e61`。
- 导出：`ManagementLogEntry` L6；`appendManagementLog` L17；`appendManagementLogAfterChange` L33。
- 函数/类型：`ManagementLogEntry` L6–14；`appendManagementLog` L17–26；`appendManagementLogAfterChange` L33–39。
- 仓内依赖：`src/platform/db/pool.ts` L3；`src/lib/bi/schema.ts` L4。

### `src/lib/bi/model-calls.ts`

- 分类：related；行数：171；SHA256：`ca5fe3b1827cb369194971fdb1d50b6374663dda8982f498c644fca6cc3519d6`。
- 导出：`modelExecutionTelemetry` L14；`recordBiModelCompletion` L29；`observeModelCall` L66；`observeOpenAI` L143。
- 函数/类型：`modelExecutionTelemetry` L14–16；`ObservedResponse` L18–21；`token` L23–27；`recordBiModelCompletion` L29–64；`observeModelCall` L66–140；`observeOpenAI` L143–170。
- 仓内依赖：`src/platform/db/pool.ts` L4；`src/lib/image-gateway.ts` L5；`src/lib/billing/synchronous-operation.ts` L6；`src/lib/model-config/context.ts` L7；`src/lib/model-config/client-identity.ts` L8；`src/lib/bi/context.ts` L9；`src/lib/bi/call-scope.ts` L10；`src/lib/bi/schema.ts` L11；`src/lib/saas/creation-writer.ts` L161。

### `src/lib/bi/model-chain.ts`

- 分类：related；行数：40；SHA256：`def36ce9fd812ec5d432e4d17132cb139c9df998b0d86245a7e4569fcca199f8`。
- 导出：`ModelAttempt` L1；`ModelCallEvidence` L2；`modelChainPresentation` L8；`MODEL_CALL_EVIDENCE_SQL` L21。
- 函数/类型：`ModelAttempt` L1–1；`ModelCallEvidence` L2–5；`modelChainPresentation` L8–18。
- 仓内依赖：无静态仓内导入。

### `src/lib/bi/model-observer.ts`

- 分类：related；行数：6；SHA256：`6cf80aa7b7051b3db07efff1329d681baa66b925c335305c9fd9d4d391dacd6b`。
- 导出：无命名导出 / 数据或样式文件。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：`src/lib/bi/context.ts` L3；`src/lib/bi/request.ts` L4；`src/lib/bi/model-calls.ts` L5。

### `src/lib/bi/query-indexes.ts`

- 分类：related；行数：10；SHA256：`91b07389b5037eea01623dbbd95071743ad29441ca6102c8ce15f437888f745d`。
- 导出：`ADMIN_QUERY_INDEXES` L2。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：无静态仓内导入。

### `src/lib/bi/repository.ts`

- 分类：related；行数：532；SHA256：`f6374353a2f00f32e27af0ed8b602f14e874ef08961557ed858c0abe7fcfd3ac`。
- 导出：`logBiAccess` L16；`queryEnterpriseOperations` L144；`queryBi` L205；`updateBiProfile` L427；`biJobTrace` L473；`biConversation` L494。
- 函数/类型：`logBiAccess` L16–27；`operationKeys` L105–116；`queryEnterpriseOperations` L144–163；`normalize` L164–183；`snapshot` L185–201；`queryBi` L205–352；`overview` L354–425；`updateBiProfile` L427–470；`biJobTrace` L473–492；`biConversation` L494–531。
- 仓内依赖：`src/lib/bi/schema.ts` L1；`src/lib/bi/model-chain.ts` L5；`src/platform/db/pool.ts` L9；`src/lib/bi/contracts.ts` L10；`src/lib/bi/artwork-inputs.ts` L11；`src/lib/artwork-provenance.ts` L12。

### `src/lib/bi/request.ts`

- 分类：related；行数：35；SHA256：`9819fb34ed7f222080c3ab078f5a5b043533493009f020d04ca497ab37bef572`。
- 导出：`withBiRequest` L15。
- 函数/类型：`withBiRequest` L15–34。
- 仓内依赖：`src/lib/saas/creation-context.ts` L2；`src/lib/teams/errors.ts` L3；`src/lib/release-runtime/accepted-context.ts` L4；`src/lib/release-runtime/identity.ts` L5；`src/platform/db/pool.ts` L6；`src/lib/admin-auth.ts` L7；`src/lib/billing/synchronous-operation.ts` L8；`src/lib/artwork-provenance-context.ts` L9；`src/lib/artwork-provenance.ts` L10；`src/lib/model-config/requests.ts` L11；`src/lib/model-config/types.ts` L12；`src/lib/bi/context.ts` L13。

### `src/lib/bi/router-trace.ts`

- 分类：related；行数：59；SHA256：`004e76e6ef0361b14ddb517740adecb9b15befc32a971357d45362c3c30c0015`。
- 导出：`readRouterTrace` L6。
- 函数/类型：`readRouterTrace` L6–58。
- 仓内依赖：`src/lib/settings/repository.ts` L2；`src/lib/settings.ts` L3。

### `src/lib/bi/schema.ts`

- 分类：related；行数：50；SHA256：`81874e7b77623573a74d03cc4e55469555e2ea7660f559c50c956dc2aaa2ef14`。
- 导出：`ensureBiSchema` L8。
- 函数/类型：`ensureBiSchema` L8–49。
- 仓内依赖：`src/platform/db/schema-readiness.ts` L2；`src/lib/persistence/schema.ts` L3；`src/platform/db/pool.ts` L4；`src/lib/supplier-cost/schema.ts` L5；`src/lib/enterprise/schema.ts` L6。

### `src/lib/bi/usage-client.ts`

- 分类：related；行数：40；SHA256：`4cb5b3434d689b6a9d7dda91fd8cea5ca7e1824eecb7ee7a6fe5e7c185dc0a99`。
- 导出：`USAGE_READ_TIMEOUT_MS` L4；`UsageReadError` L5；`isUsageAccessError` L8；`readUsageResponse` L11。
- 函数/类型：`UsageReadError` L5–7；`isUsageAccessError` L8–10；`readUsageResponse` L11–39。
- 仓内依赖：`src/lib/bi/usage-contracts.ts` L1。

### `src/lib/bi/usage-contracts.ts`

- 分类：related；行数：72；SHA256：`c8a67e306ed0e6266e980988312a1acf11b5314b75301cab2edf51788f11b2c9`。
- 导出：`USAGE_SORTS` L2；`UsageSort` L3；`UsageQuery` L4；`UsageMetrics` L8；`UsageUser` L17；`UsageDay` L21；`UsageResponse` L25；`parseUsageQuery` L40；`USAGE_DEFINITIONS` L63。
- 函数/类型：`UsageSort` L3–3；`UsageQuery` L4–7；`UsageMetrics` L8–16；`UsageUser` L17–20；`UsageDay` L21–24；`UsageResponse` L25–36；`parseUsageQuery` L40–62。
- 仓内依赖：无静态仓内导入。

### `src/lib/bi/usage-repository.ts`

- 分类：related；行数：174；SHA256：`b1cac77decf2bdd41fa7291fc4f8b3735c40f0eee886336bbe33513b96529eed`。
- 导出：`UsageReadScope` L8；`readUserUsage` L32；`queryUserUsage` L163。
- 函数/类型：`ReadClient` L7–7；`UsageReadScope` L8–8；`metrics` L19–28；`readUserUsage` L32–161；`queryUserUsage` L163–173。
- 仓内依赖：`src/platform/db/pool.ts` L3；`src/lib/bi/schema.ts` L4；`src/lib/bi/usage-contracts.ts` L5。

### `src/lib/bi/user-management.ts`

- 分类：related；行数：211；SHA256：`34e9ddb4a6ecd113bb4546d8838872469d517494810709e5ec4c0f19e2f8dffd`。
- 导出：`userCommandSchema` L21；`UserCommand` L81；`ManagementError` L82；`manageBiUser` L87。
- 函数/类型：`UserCommand` L81–81；`ManagementError` L82–86；`manageBiUser` L87–210。
- 仓内依赖：`src/platform/db/pool.ts` L4；`src/lib/pw.ts` L5；`src/lib/settings-secret.ts` L6；`src/lib/bi/schema.ts` L7；`src/lib/billing/runtime.ts` L9；`src/lib/billing/rules/schema.ts` L10；`src/lib/billing/types.ts` L11；`src/lib/account-identity-schema.ts` L12。

### `src/lib/billing/access.ts`

- 分类：core；行数：17；SHA256：`cd84e8e041a60fefcd2eda7ec3a7e2b29909416ff3eb06c7caa9a9980fbe699b`。
- 导出：`PRIVATE_HEADERS` L5；`billingJson` L6；`sameSiteBillingMutation` L7；`billingAuthorize` L8。
- 函数/类型：`billingJson` L6–6；`sameSiteBillingMutation` L7–7；`billingAuthorize` L8–16。
- 仓内依赖：`src/lib/admin-auth.ts` L2；`src/platform/db/pool.ts` L3；`src/lib/request-origin.ts` L4。

### `src/lib/billing/agent.ts`

- 分类：core；行数：173；SHA256：`cef10623c3ab68947e5cffcb83f621f999580609452a3d7d5a4a6b5ff36eb63e`。
- 导出：`AGENT_FEATURES` L28；`agentQuote` L32；`AgentBillingSession` L107；`agentBillingPrecheck` L129。
- 函数/类型：`agentQuote` L32–106；`AgentBillingSession` L107–128；`agentBillingPrecheck` L129–172。
- 仓内依赖：`src/lib/agent/creation-settings.ts` L1；`src/lib/agent/video-workflow-intent.ts` L3；`src/lib/video/canvas-workflow.ts` L4；`src/lib/video/workflow.ts` L5；`src/lib/video/storage-schema.ts` L6；`src/lib/agent/canvas-video-tools.ts` L8；`src/lib/canvas/video-node-repository.ts` L9；`src/lib/video/media-billing.ts` L10；`src/lib/agent/creative-tool-catalog.ts` L11；`src/lib/billing/quotation.ts` L12；`src/lib/billing/runtime.ts` L13；`src/lib/billing/types.ts` L14；`src/lib/video/task-repository.ts` L15；`src/platform/db/pool.ts` L16；`src/lib/accounts/session.ts` L17；`src/lib/billing/fingerprint.ts` L18；`src/lib/image-job-repository.ts` L19；`src/lib/model-config/context.ts` L20；`src/lib/agent/canvas-context.ts` L21；`src/lib/imagegen/agent-request.ts` L22；`src/lib/imagegen/batch.ts` L23；`src/lib/imagegen/plan.ts` L24；`src/lib/imagegen/generation-core.ts` L25；`src/lib/imagegen/types.ts` L26；`src/lib/model-config/context.ts` L27；`src/lib/canvas/timeline-node-service.ts` L62；`src/lib/canvas/timeline-node-repository.ts` L62；`src/lib/video/media-jobs.ts` L62；`src/lib/storyboard/audio-review.ts` L69；`src/lib/storyboard/assisted-review-service.ts` L69；`src/lib/storyboard/audio-review-service.ts` L72；`src/lib/model-config/requests.ts` L72；`src/lib/storyboard/assisted-review.ts` L75；`src/lib/storyboard/assisted-review-service.ts` L75；`src/lib/audio/operation-schema.ts` L81；`src/lib/audio/operation-service.ts` L81；`src/lib/model-config/requests.ts` L81；`src/lib/storyboard/assisted-review.ts` L89；`src/lib/storyboard/assisted-review-service.ts` L89；`src/lib/model-config/requests.ts` L89。

### `src/lib/billing/api-cost-ledger.ts`

- 分类：core；行数：48；SHA256：`1a8cc336ddd50f96cce16f34eeefdc3f885813613d5092910a3070ec73b00227`。
- 导出：`operationApiCost` L7。
- 函数/类型：`operationApiCost` L7–47。
- 仓内依赖：`src/lib/billing/types.ts` L2；`src/lib/billing/api-cost.ts` L3。

### `src/lib/billing/api-cost.ts`

- 分类：core；行数：43；SHA256：`ad3777be2e9a94d221491483d49fcb3382f1b33b0b41799a11991ea91e2f36ec`。
- 导出：`ApiCostPricing` L6；`apiCostCredits` L8；`procurementCost` L14；`apiCostSettlement` L30。
- 函数/类型：`ApiCostPricing` L6–6；`apiCostCredits` L8–12；`procurementCost` L14–29；`apiCostSettlement` L30–42。
- 仓内依赖：`src/lib/billing/types.ts` L1；`src/lib/billing/types.ts` L2；`src/lib/billing/money.ts` L3；`src/lib/model-config/business-schema.ts` L4。

### `src/lib/billing/audit.ts`

- 分类：core；行数：11；SHA256：`3b26dd1d908b5b201899049bd85292029bb2ba908299dd654c8bdaee62712a41`。
- 导出：`CostAuditFields` L3；`frozenCostAudit` L4。
- 函数/类型：`CostAuditFields` L3–3；`frozenCostAudit` L4–10。
- 仓内依赖：`src/lib/billing/types.ts` L1；`src/lib/billing/costs.ts` L2。

### `src/lib/billing/bootstrap.json`

- 分类：core；行数：1181；SHA256：`3fcdcf248849e37e226847bc81b567167788b6dffb669ef0ef8b1ec31da93697`。
- 导出：无命名导出 / 数据或样式文件。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：无静态仓内导入。

### `src/lib/billing/business.ts`

- 分类：core；行数：40；SHA256：`bbefed70fe7fa7e532bb062a1f6eadb661dc898092a6531802149f1eadafe855`。
- 导出：`QUALITY_LABELS` L4；`BUSINESS_GROUPS` L5；`FEATURE_DESCRIPTIONS` L11；`unitLabel` L25；`pricingSummary` L26；`costLabel` L34。
- 函数/类型：`unitLabel` L25–25；`pricingSummary` L26–33；`costLabel` L34–39。
- 仓内依赖：`src/lib/billing/types.ts` L1；`src/lib/billing/labels.ts` L2。

### `src/lib/billing/canvas-defaults.ts`

- 分类：core；行数：25；SHA256：`55d40fb9066fbaad35c73760662812f5b348b6ce33d676953e9f78851b80d03a`。
- 导出：`CANVAS_FREE_DEFAULTS` L5；`freeCanvasTariff` L13；`withCanvasDefaults` L16。
- 函数/类型：`freeCanvasTariff` L13–15；`withCanvasDefaults` L16–24。
- 仓内依赖：`src/lib/billing/types.ts` L1。

### `src/lib/billing/card-keys.ts`

- 分类：core；行数：130；SHA256：`312f142cec578f182181d00cdf085befcfdf47c1320ef7f3fc338ab63ad1cfa3`。
- 导出：`CardKeyRow` L12；`generateCardKeys` L26；`listCardKeys` L63；`setCardKeyStatus` L73；`redeemCardKey` L85；`cardKeyStats` L107。
- 函数/类型：`CardKeyRow` L12–23；`generateCardKeys` L26–60；`listCardKeys` L63–70；`setCardKeyStatus` L73–82；`redeemCardKey` L85–104；`cardKeyStats` L107–129。
- 仓内依赖：`src/platform/db/pool.ts` L2；`src/lib/persistence/schema.ts` L3；`src/lib/access-codes.ts` L4；`src/lib/billing/types.ts` L5；`src/platform/db/transaction.ts` L6；`src/lib/billing/runtime.ts` L40；`src/lib/billing/runtime.ts` L87。

### `src/lib/billing/catalog.ts`

- 分类：core；行数：138；SHA256：`fb8af01fe6bafcfbb315e401f4be1fb1695c3c2aec532059201d5223e8bf8676`。
- 导出：`createConfigRuntime` L30。
- 函数/类型：`Deps` L9–17；`Row` L19–24；`validateWrite` L26–29；`createConfigRuntime` L30–137。
- 仓内依赖：`src/lib/billing/frozen-config.ts` L1；`src/lib/billing/types.ts` L3；`src/lib/billing/types.ts` L5；`src/lib/billing/rules/schema.ts` L6；`src/lib/billing/schema.ts` L7；`src/lib/billing/fingerprint.ts` L8。

### `src/lib/billing/client-intent.ts`

- 分类：core；行数：30；SHA256：`c9f3f6857bd8c9fb8e9c942ed15ba76257945a1f03e7a5a378c87eebf2fc9e91`。
- 导出：`clientIntentKey` L4；`frozenIntentBody` L25。
- 函数/类型：`clientIntentKey` L4–20；`digest` L21–23；`frozenIntentBody` L25–29。
- 仓内依赖：`src/lib/browser-crypto.ts` L1。

### `src/lib/billing/client-response.ts`

- 分类：core；行数：61；SHA256：`fa3e64d987e971e42d87176e211e2778a6e120b1e94f553e1be5d846e8fb3834`。
- 导出：`isTerminalBillingFailure` L3；`readBillingSubmissionResponse` L11。
- 函数/类型：`isTerminalBillingFailure` L3–8；`readBillingSubmissionResponse` L11–60。
- 仓内依赖：无静态仓内导入。

### `src/lib/billing/client-submission.ts`

- 分类：core；行数：38；SHA256：`7edf7bd121e35d8263eca91b41d0c73f6739c6d401ebdc6f336fde95bb096c61`。
- 导出：`createRetainedBillingSubmission` L13；`RetainedBillingSubmission` L37。
- 函数/类型：`Client` L3–3；`Prepared` L4–4；`createRetainedBillingSubmission` L13–36；`RetainedBillingSubmission` L37–37。
- 仓内依赖：`src/lib/billing/client.tsx` L1。

### `src/lib/billing/client.tsx`

- 分类：core；行数：241；SHA256：`e8aca70d1c54b8374c6f69b97f4aa1e5081b15e08ed6e7c6005d420a3e28a2fe`。
- 导出：`PublicQuote` L13；`QuoteInput` L29；`PublicCatalog` L40；`BillingProvider` L80；`useBilling` L213；`useBillingEstimate` L215；`resolutionQuoteLabel` L235；`BillingEstimate` L238。
- 函数/类型：`PublicQuote` L13–28；`QuoteInput` L29–38；`QuoteScope` L39–39；`PublicCatalog` L40–69；`Client` L70–78；`BillingProvider` L80–212；`useBilling` L213–214；`useBillingEstimate` L215–234；`resolutionQuoteLabel` L235–237；`BillingEstimate` L238–240。
- 仓内依赖：`src/lib/browser-data-cache.ts` L2；`src/lib/supabase.ts` L4；`src/lib/auth-context.tsx` L5；`src/lib/billing/types.ts` L6；`src/lib/billing/client-intent.ts` L7；`src/lib/billing/client-response.ts` L8；`src/lib/model-config/public-client.ts` L9；`src/lib/model-config/feature-client.ts` L10；`src/lib/browser-crypto.ts` L11；`src/lib/saas/workspace-client.ts` L12。

### `src/lib/billing/config-diff.ts`

- 分类：core；行数：56；SHA256：`d689b3d019c0636dff96ba2b8d55775744d8e0094f0b6e2be1b7bb6fcff64441`。
- 导出：`ConfigChange` L5；`configChanges` L10；`describeChange` L23；`mergeConfigDraft` L37。
- 函数/类型：`ConfigChange` L5–9；`configChanges` L10–16；`describe` L18–21；`describeChange` L23–35；`mergeConfigDraft` L37–55。
- 仓内依赖：`src/lib/billing/types.ts` L1；`src/lib/billing/labels.ts` L2；`src/lib/billing/business.ts` L3；`src/lib/billing/decimal.ts` L4。

### `src/lib/billing/configuration.ts`

- 分类：core；行数：37；SHA256：`9cca1978fe522c4a6066fb8fc7ba69035f87c0914751f6c875577c9696635e29`。
- 导出：`getBillingConfiguration` L11。
- 函数/类型：`getBillingConfiguration` L11–36。
- 仓内依赖：`src/platform/db/pool.ts` L2；`src/lib/persistence/schema.ts` L3；`src/lib/billing/bootstrap.json` L4；`src/lib/billing/catalog.ts` L5；`src/lib/billing/types.ts` L6；`src/lib/model-config/billing-publication-check.ts` L34。

### `src/lib/billing/cost-audit-repository.ts`

- 分类：core；行数：112；SHA256：`afe644f185a495677fcdec797c4206b4e9d2a7b93753f8e6ffb5786f4cf49c15`。
- 导出：`recordImageCostAudit` L10；`getImageJobChargedCredits` L51；`getCanvasImageTaskChargedCredits` L57；`ImageCostAuditRow` L63；`listImageCostAudit` L71。
- 函数/类型：`recordImageCostAudit` L10–48；`getImageJobChargedCredits` L51–55；`getCanvasImageTaskChargedCredits` L57–61；`ImageCostAuditRow` L63–68；`listImageCostAudit` L71–111。
- 仓内依赖：`src/platform/db/pool.ts` L2；`src/lib/persistence/schema.ts` L3；`src/lib/mock-data.ts` L4。

### `src/lib/billing/costs.ts`

- 分类：core；行数：58；SHA256：`c8e5ef55f4d672f2835f2472ecf170c8d3f405507d04af85e94ee14b98efa605`。
- 导出：`costPlusCredits` L5；`costRateFor` L24；`estimateCost` L30。
- 函数/类型：`costPlusCredits` L5–23；`costRateFor` L24–29；`estimateCost` L30–57。
- 仓内依赖：`src/lib/billing/types.ts` L1；`src/lib/billing/types.ts` L2；`src/lib/billing/money.ts` L3。

### `src/lib/billing/cutout-receipt.ts`

- 分类：core；行数：40；SHA256：`0ab2fdbd900f5e7a536c5b1820b1d987fdd15621eff79e864798f8cc476c49cd`。
- 导出：`cutoutReceiptCheckpoint` L7；`isCutoutReceiptCheckpoint` L13；`readSettledCutoutReceipt` L20。
- 函数/类型：`cutoutReceiptCheckpoint` L7–11；`isCutoutReceiptCheckpoint` L13–15；`readSettledCutoutReceipt` L20–39。
- 仓内依赖：无静态仓内导入。

### `src/lib/billing/decimal.ts`

- 分类：core；行数：10；SHA256：`abb1a2f7ae406452128883457717471ebc1945636e9ffd196effd8baa7dc7d50`。
- 导出：`microsToDecimal` L1；`decimalToMicros` L2；`yuanToFen` L4。
- 函数/类型：`microsToDecimal` L1–1；`decimalToMicros` L2–3；`yuanToFen` L4–9。
- 仓内依赖：无静态仓内导入。

### `src/lib/billing/entitlements.ts`

- 分类：core；行数：33；SHA256：`c7fbeff7e4ea28791190e936f3d1af09f03ed18732f079e18e342b6ad2f9a50e`。
- 导出：`signupGrantTx` L6；`administrativeGrantInput` L14。
- 函数/类型：`signupGrantTx` L6–13；`administrativeGrantInput` L14–32。
- 仓内依赖：`src/lib/billing/runtime.ts` L3；`src/lib/billing/fingerprint.ts` L4；`src/lib/billing/types.ts` L5。

### `src/lib/billing/failure.ts`

- 分类：core；行数：12；SHA256：`0d3140e8544ceae5b4b5c6d14177ac108a558206334b6acf7f95572a8ea7714f`。
- 导出：`billingFailure` L5。
- 函数/类型：`billingFailure` L5–11。
- 仓内依赖：`src/lib/billing/types.ts` L1；`src/lib/model-config/types.ts` L2。

### `src/lib/billing/feature-map.ts`

- 分类：core；行数：3；SHA256：`2db947fa509f376df7bf8218f3e5f577cde0df651c2322f659ec5aef86ef739b`。
- 导出：`CATEGORY_FEATURES` L2。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：`src/lib/billing/types.ts` L1。

### `src/lib/billing/fingerprint.ts`

- 分类：core；行数：10；SHA256：`e280d7b742f2dedb62fa1140711939c5cf8b1a5f26006cf22c678145978c2ec4`。
- 导出：`stableJson` L2；`fingerprint` L9。
- 函数/类型：`stableJson` L2–8；`fingerprint` L9–9。
- 仓内依赖：无静态仓内导入。

### `src/lib/billing/frozen-config.ts`

- 分类：core；行数：21；SHA256：`7ed3e97536f22eb792f06fba9ba0f9ac4b4786bf01f14fbba0199b94537ec6a7`。
- 导出：`billingSnapshotFromRow` L6；`readFrozenBillingSnapshot` L14。
- 函数/类型：`Row` L5–5；`billingSnapshotFromRow` L6–11；`readFrozenBillingSnapshot` L14–20。
- 仓内依赖：`src/platform/db/pool.ts` L2；`src/lib/billing/types.ts` L3；`src/lib/billing/rules/schema.ts` L4。

### `src/lib/billing/grants.ts`

- 分类：core；行数：30；SHA256：`96fda20eeb72a536c6185b47c6211da9ef58ca1b4e1a983b478cb4f337dc9466`。
- 导出：`addCreditBatch` L9；`adjustUserCredits` L20。
- 函数/类型：`addCreditBatch` L9–16；`adjustUserCredits` L20–29。
- 仓内依赖：`src/platform/db/pool.ts` L2；`src/lib/persistence/schema.ts` L3；`src/lib/billing/entitlements.ts` L4；`src/platform/db/transaction.ts` L5；`src/lib/billing/types.ts` L6；`src/lib/billing/runtime.ts` L11；`src/lib/billing/runtime.ts` L23。

### `src/lib/billing/image-quote-policy.ts`

- 分类：core；行数：5；SHA256：`f4adcbb509d4cb9d9c201e18d672472132d9349544eb07d6b4bb9a3680927c82`。
- 导出：`imageBillingFeature` L2。
- 函数/类型：`imageBillingFeature` L2–4。
- 仓内依赖：无静态仓内导入。

### `src/lib/billing/image-quote-schema.ts`

- 分类：core；行数：15；SHA256：`817143402b979e21ff614206306dd5fb8b61a851b552ee15024d89ba7f47c10e`。
- 导出：`ensureImageBillingQuotes` L6。
- 函数/类型：`ensureImageBillingQuotes` L6–14。
- 仓内依赖：`src/platform/db/schema-readiness.ts` L2；`src/lib/persistence/schema.ts` L3；`src/platform/db/pool.ts` L4。

### `src/lib/billing/image-quotes.ts`

- 分类：core；行数：47；SHA256：`ccad5eaa658df0965976c47248c9d3c05add44d3eebbc625114b0c747197bcbe`。
- 导出：`issueImageBillingQuote` L18；`imageBillingQuoteForRequest` L27；`assertImageBillingSelection` L39。
- 函数/类型：`Row` L14–14；`scopeKey` L15–15；`issueImageBillingQuote` L18–25；`imageBillingQuoteForRequest` L27–37；`assertImageBillingSelection` L39–46。
- 仓内依赖：`src/lib/billing/image-quote-schema.ts` L1；`src/platform/db/pool.ts` L6；`src/lib/admin-auth.ts` L8；`src/lib/saas/creation-scope.ts` L9；`src/lib/model-config/types.ts` L10；`src/lib/billing/types.ts` L11；`src/lib/billing/image-quote-policy.ts` L12。

### `src/lib/billing/intent.ts`

- 分类：core；行数：54；SHA256：`ac0f044353d24e54dfdd2a5e7e84047cbfc5256b0b16916ba8ebb357240bcbc5`。
- 导出：`SubmissionIdentity` L10；`SubmissionReceipt` L11；`claimSubmission` L13；`saveSubmissionReceipt` L23；`withBillingIntent` L32。
- 函数/类型：`SubmissionIdentity` L10–10；`SubmissionReceipt` L11–11；`claimSubmission` L13–22；`saveSubmissionReceipt` L23–28；`withBillingIntent` L32–53。
- 仓内依赖：`src/platform/db/pool.ts` L2；`src/lib/persistence/schema.ts` L3；`src/lib/admin-auth.ts` L4；`src/lib/worker/authorization.ts` L5；`src/lib/billing/synchronous.ts` L6；`src/lib/billing/request.ts` L7；`src/lib/billing/access.ts` L8；`src/lib/billing/types.ts` L9。

### `src/lib/billing/labels.ts`

- 分类：core；行数：7；SHA256：`fa1246f31e4a2607e1ab30c20e3046251bab69e96f9434ec62dc61b9efd342e1`。
- 导出：`FEATURE_LABELS` L2。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：`src/lib/billing/types.ts` L1。

### `src/lib/billing/legacy-credit-reservation.ts`

- 分类：core；行数：55；SHA256：`79bd2a4cfd29bdb50c201f11045ccefc70a4a00a2e1af5e3b6b5903522bd3f4c`。
- 导出：`reserveCredits` L9；`refundCredits` L35。
- 函数/类型：`reserveCredits` L9–33；`refundCredits` L35–54。
- 仓内依赖：`src/platform/db/pool.ts` L2；`src/lib/persistence/schema.ts` L3；`src/lib/billing/wallet-balance.ts` L4；`src/lib/billing/runtime.ts` L5；`src/lib/billing/synchronous-operation.ts` L13；`src/lib/billing/synchronous-operation.ts` L39；`src/lib/billing/service.ts` L42。

### `src/lib/billing/legacy-ledger.ts`

- 分类：core；行数：143；SHA256：`a3699fe999754dd65e847f9e8357210455a255446e38e9af27267e2a6fcd4ee8`。
- 导出：`ledId` L15；`LedgerRow` L19；`listLedger` L49；`addLedgerEntry` L62；`listUserLedger` L101；`listUserLedgerFiltered` L117。
- 函数/类型：`ledId` L15–17；`LedgerRow` L19–27；`mapLedger` L29–47；`listLedger` L49–57；`addLedgerEntry` L62–98；`listUserLedger` L101–113；`listUserLedgerFiltered` L117–142。
- 仓内依赖：`src/platform/db/pool.ts` L2；`src/lib/persistence/schema.ts` L3；`src/lib/billing/wallet-balance.ts` L4；`src/lib/billing/synchronous-operation.ts` L67。

### `src/lib/billing/legacy.ts`

- 分类：core；行数：26；SHA256：`b4a0d092819e8fe022dcb580dd01f24dc71ec967101e3ccd0f5d5d41d3f91a60`。
- 导出：`imageBillCredits` L7；`qualityBillCredits` L10；`qualityCostAudit` L11；`getCreditPack` L24。
- 函数/类型：`imageBillCredits` L7–9；`qualityBillCredits` L10–10；`qualityCostAudit` L11–23；`getCreditPack` L24–25。
- 仓内依赖：`src/lib/billing/types.ts` L4；`src/lib/mock-data.ts` L5；`src/lib/billing/quote.ts` L6。

### `src/lib/billing/metering.ts`

- 分类：core；行数：23；SHA256：`15bc10aab60da749691e542e1fbcf7c94c76a9510c521227b07b92965a6957c8`。
- 导出：`CREDITS_METERING_SETTING` L6；`creditsMeteringOn` L10。
- 函数/类型：`creditsMeteringOn` L10–22。
- 仓内依赖：`src/lib/settings/repository.ts` L2；`src/lib/billing/runtime.ts` L12。

### `src/lib/billing/money.ts`

- 分类：core；行数：19；SHA256：`34211edec3e58015ac3f26d859c339ece89957fe4cf7bc923691e65307da6695`。
- 导出：`rounded` L3；`cnyCredits` L6；`usageAmount` L11。
- 函数/类型：`rounded` L3–5；`cnyCredits` L6–10；`usageAmount` L11–18。
- 仓内依赖：`src/lib/billing/types.ts` L1。

### `src/lib/billing/preview.tsx`

- 分类：core；行数：6；SHA256：`4308fc250ad49a57bb5817c83fe8b27a17f86c8fa172b8c151df638c2aa004d5`。
- 导出：`useFeatureBilling` L5。
- 函数/类型：`useFeatureBilling` L5–5。
- 仓内依赖：`src/lib/model-config/feature-client.ts` L2；`src/lib/image-quality-context.tsx` L3；`src/lib/billing/client.tsx` L4。

### `src/lib/billing/products.tsx`

- 分类：core；行数：20；SHA256：`39aac511e9f3c4e8af70b799e731ba0e669dea339bc3b9edc753a350a6af9919`。
- 导出：`useBillingProducts` L5。
- 函数/类型：`useBillingProducts` L5–19。
- 仓内依赖：`src/lib/billing/client.tsx` L3；`src/lib/mock-data.ts` L4。

### `src/lib/billing/quotation.ts`

- 分类：core；行数：103；SHA256：`33f5948963ea816d9f748d4d9e7cf6b6187b715d27d05fcab1753495275e2bfc`。
- 导出：`billingFactsForSelection` L35；`quoteForImagegenStep` L73；`quoteForActor` L82；`prepareActorQuote` L87。
- 函数/类型：`compatibleQuote` L28–34；`billingFactsForSelection` L35–71；`quoteForImagegenStep` L73–80；`quoteForActor` L82–85；`prepareActorQuote` L87–102。
- 仓内依赖：`src/platform/db/pool.ts` L2；`src/lib/payments/history.ts` L3；`src/lib/model-config/cutout-quality.ts` L4；`src/lib/model-config/selection-policy.ts` L5；`src/lib/user-image-provider.ts` L6；`src/lib/settings.ts` L7；`src/lib/image-model-catalog.ts` L8；`src/lib/image-model-legacy-catalog.ts` L9；`src/lib/image-model-routing.ts` L10；`src/lib/video/providers/config.ts` L11；`src/lib/text-models.ts` L12；`src/lib/model-config/context.ts` L13；`src/lib/model-config/billing-model.ts` L14；`src/lib/model-config/business-billing.ts` L15；`src/lib/model-config/image-quality-selection.ts` L16；`src/lib/model-config/feature-model-policy.ts` L17；`src/lib/model-config/snapshot-reader.ts` L18；`src/lib/imagegen/context.ts` L19；`src/lib/billing/runtime.ts` L20；`src/lib/billing/quote.ts` L21；`src/lib/billing/bootstrap.json` L22；`src/lib/billing/types.ts` L23；`src/lib/billing/rules/registry.ts` L24；`src/lib/billing/canvas-defaults.ts` L25；`src/lib/billing/quote-input.ts` L26。

### `src/lib/billing/quote-input.ts`

- 分类：core；行数：8；SHA256：`15e90ff961a30d4d787e815f6244f9e9bd8c64ac612607c1143a4cc8410c1611`。
- 导出：`QuoteInput` L4；`QuoteSelection` L6；`QuotePreparation` L7。
- 函数/类型：`QuoteInput` L4–4；`QuoteSelection` L6–6；`QuotePreparation` L7–7。
- 仓内依赖：`src/lib/billing/types.ts` L1；`src/lib/model-config/types.ts` L2。

### `src/lib/billing/quote.ts`

- 分类：core；行数：123；SHA256：`6c6be279949e21e1f3f3a1a2a8a0118719c10079715a662cdb6bf14cfc813c18`。
- 导出：`quote` L37；`isChargelessQuote` L64；`settlementFor` L68。
- 函数/类型：`safe` L9–10；`unitPrice` L11–30；`rawAmount` L31–35；`amount` L36–36；`quote` L37–60；`isChargelessQuote` L64–67；`settlementFor` L68–122。
- 仓内依赖：`src/lib/billing/types.ts` L1；`src/lib/billing/rules/registry.ts` L2；`src/lib/billing/rules/evaluate.ts` L3；`src/lib/billing/costs.ts` L4；`src/lib/billing/canvas-defaults.ts` L5；`src/lib/billing/money.ts` L6；`src/lib/billing/api-cost.ts` L7。

### `src/lib/billing/receipt-reader.ts`

- 分类：core；行数：53；SHA256：`c3b961a567b8c35bf9aeee5ca90fad5a6ec935768fc18270f6cf3de9f2d1fc83`。
- 导出：`readSynchronousReceipt` L16；`completeAudioCheckpoint` L33。
- 函数/类型：`readSynchronousReceipt` L16–28；`completeAudioCheckpoint` L33–52。
- 仓内依赖：`src/platform/db/pool.ts` L2；`src/lib/persistence/schema.ts` L3；`src/lib/billing/types.ts` L4；`src/lib/saas/creation-scope.ts` L5；`src/lib/billing/types.ts` L6；`src/platform/db/transaction.ts` L8；`src/lib/billing/service.ts` L9；`src/lib/model-config/snapshot-value.ts` L10；`src/lib/saas/creation-scope.ts` L11；`src/lib/saas/creation-writer.ts` L12。

### `src/lib/billing/repository.ts`

- 分类：core；行数：109；SHA256：`67ac37466dce296ee936df3a19c0672db28795e303f9893267385d10fed96330`。
- 导出：`OperationRow` L5；`lockOperation` L16；`lockWallet` L33；`syncBalanceTx` L47；`debitTx` L50；`reserveTx` L70；`finishTx` L77；`grantBatchTx` L92。
- 函数/类型：`OperationRow` L5–15；`lockOperation` L16–32；`lockWallet` L33–46；`syncBalanceTx` L47–49；`debitTx` L50–69；`reserveTx` L70–76；`finishTx` L77–91；`grantBatchTx` L92–108。
- 仓内依赖：`src/lib/saas/billing-evidence.ts` L1；`src/lib/billing/types.ts` L3；`src/lib/billing/rules/schema.ts` L4。

### `src/lib/billing/request.ts`

- 分类：core；行数：33；SHA256：`49b497776b04f2885cd00fdb12b0e826d3f3da69aa977ae042a873a228187066`。
- 导出：`assertQuotedVersion` L8；`requestQuoteConfirmation` L14；`operationIdFor` L21；`billingErrorResponse` L29。
- 函数/类型：`assertQuotedVersion` L8–13；`requestQuoteConfirmation` L14–20；`operationIdFor` L21–28；`billingErrorResponse` L29–32。
- 仓内依赖：`src/lib/billing/types.ts` L2；`src/lib/billing/access.ts` L3；`src/lib/billing/failure.ts` L4；`src/lib/billing/failure.ts` L5。

### `src/lib/billing/reservations.ts`

- 分类：core；行数：103；SHA256：`894be84f83b514bf29f75d27189846c5a7ab5625ccd1948e4cb27025f79c0da2`。
- 导出：`addReservation` L12；`settleReservation` L25；`touchReservation` L34；`sweepStaleReservations` L45。
- 函数/类型：`addReservation` L12–23；`settleReservation` L25–31；`touchReservation` L34–40；`sweepStaleReservations` L45–102。
- 仓内依赖：`src/platform/db/pool.ts` L2；`src/lib/persistence/schema.ts` L3；`src/lib/billing/wallet-balance.ts` L4；`src/lib/staging-history.ts` L5；`src/lib/billing/synchronous-operation.ts` L49；`src/lib/billing/runtime.ts` L50。

### `src/lib/billing/rules/evaluate.ts`

- 分类：core；行数：27；SHA256：`4a34d54d0dbda25cb8d79cff97056b3f7cf828be9ac72427d036b26498e005ea`。
- 导出：`matches` L2；`conditionsOverlap` L9；`mergeTariff` L18。
- 函数/类型：`matches` L2–8；`conditionsOverlap` L9–17；`mergeTariff` L18–26。
- 仓内依赖：`src/lib/billing/types.ts` L1。

### `src/lib/billing/rules/pricing-schema.ts`

- 分类：core；行数：17；SHA256：`19d0d567fc86a9497bf3cf9f95fd578771b2326cfab7f2f39136dc03d112587d`。
- 导出：`billingPricingSchema` L7。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：`src/lib/billing/rules/registry.ts` L2。

### `src/lib/billing/rules/registry.ts`

- 分类：core；行数：6；SHA256：`60885d2e5566c6bd83fc4d26c83947cea006b2cfeaed3f4c567d6c310639cb2f`。
- 导出：`FEATURE_IDS` L1；`FeatureId` L2；`QUALITY_IDS` L3；`RESOLUTION_IDS` L4；`isFeatureId` L5。
- 函数/类型：`FeatureId` L2–2；`isFeatureId` L5–5。
- 仓内依赖：无静态仓内导入。

### `src/lib/billing/rules/schema.ts`

- 分类：core；行数：77；SHA256：`40b83907d6391d935bf68e30ad6357ea8096c6b57d39c0fb3048ea15f34e583d`。
- 导出：`checkPricing` L16；`validateBillingConfig` L35；`expiryFrom` L64。
- 函数/类型：`checkPricing` L16–33；`checkTariff` L34–34；`validateBillingConfig` L35–63；`expiryFrom` L64–76。
- 仓内依赖：`src/lib/billing/rules/pricing-schema.ts` L1；`src/lib/billing/types.ts` L3；`src/lib/billing/rules/registry.ts` L4；`src/lib/billing/rules/evaluate.ts` L5；`src/lib/billing/canvas-defaults.ts` L6。

### `src/lib/billing/runtime.ts`

- 分类：core；行数：47；SHA256：`3174100cc4dfd751b4403472fad01f1de9eb104f65eb0b0747a225bdbc39ed41`。
- 导出：`getBillingRuntime` L15；`billingSnapshot` L22；`meteringFor` L28；`updateBillingCompatibility` L35；`billingSwitches` L41；`creditMeteringEnabled` L43。
- 函数/类型：`assemble` L14–14；`getBillingRuntime` L15–21；`billingSnapshot` L22–27；`meteringFor` L28–34；`updateBillingCompatibility` L35–40；`billingSwitches` L41–41；`creditMeteringEnabled` L43–46。
- 仓内依赖：`src/platform/db/pool.ts` L3；`src/lib/settings/repository.ts` L4；`src/lib/billing/bootstrap.json` L5；`src/lib/billing/configuration.ts` L6；`src/lib/billing/service.ts` L7；`src/lib/billing/types.ts` L8；`src/lib/auth-mode.ts` L9；`src/lib/accounts/mode.ts` L10。

### `src/lib/billing/schema.ts`

- 分类：core；行数：58；SHA256：`4ae754b40f068df58f0575354a5d419c533255fff882cb09c585072f220f5eae`。
- 导出：`markBillingSchemaReady` L5；`ensureBillingSchema` L6；`applyBillingSchema` L17。
- 函数/类型：`markBillingSchemaReady` L5–5；`ensureBillingSchema` L6–14；`applyBillingSchema` L17–57。
- 仓内依赖：`src/platform/db/schema-readiness.ts` L1；`src/lib/schema-initialization.ts` L4。

### `src/lib/billing/server.ts`

- 分类：core；行数：61；SHA256：`494bb7a9bedb060913186175b999d6c57c7ce3563834ec147971c71f8c39d8c2`。
- 导出：`billingCatalogFacts` L18；`resolveBillingFacts` L25；`quoteForRequest` L30。
- 函数/类型：`billingCatalogFacts` L18–23；`requestSelection` L24–24；`resolveBillingFacts` L25–29；`quoteForRequest` L30–60。
- 仓内依赖：`src/platform/db/pool.ts` L2；`src/lib/payments/history.ts` L3；`src/lib/admin-auth.ts` L4；`src/lib/model-config/context.ts` L5；`src/lib/imagegen/context.ts` L6；`src/lib/model-config/snapshot-reader.ts` L7；`src/lib/billing/image-quotes.ts` L8；`src/lib/billing/runtime.ts` L9；`src/lib/billing/quotation.ts` L10；`src/lib/billing/types.ts` L11；`src/lib/billing/quote-input.ts` L12；`src/lib/billing/runtime.ts` L14；`src/lib/billing/quotation.ts` L15。

### `src/lib/billing/service.ts`

- 分类：core；行数：152；SHA256：`b4fcf5a14c1df402182af76ee98b5b12c8ca9f601175786a1457936efd9b50f5`。
- 导出：`createBillingService` L42；`closeChargelessUnknownTx` L115；`refreshApiCostOperation` L126。
- 函数/类型：`identity` L12–15；`operation` L16–21；`amount` L22–23；`settleLocked` L24–41；`createBillingService` L42–111；`closeChargelessUnknownTx` L115–121；`refreshApiCostOperation` L126–151。
- 仓内依赖：`src/lib/saas/creation-writer.ts` L1；`src/lib/billing/types.ts` L3；`src/lib/billing/fingerprint.ts` L4；`src/lib/billing/quote.ts` L5；`src/lib/billing/repository.ts` L6；`src/lib/billing/api-cost-ledger.ts` L7；`src/lib/staging-history.ts` L8；`src/platform/db/transaction.ts` L10。

### `src/lib/billing/signup.ts`

- 分类：core；行数：33；SHA256：`3fc0c08bdeacd3194712d79d7dc3c98ef720fa0c9f8804223829e0fcfa3480bf`。
- 导出：`getSignupBonus` L10；`setSignupBonus` L28。
- 函数/类型：`getSignupBonus` L10–25；`setSignupBonus` L28–32。
- 仓内依赖：`src/platform/db/pool.ts` L2；`src/lib/settings/repository.ts` L3；`src/lib/billing/runtime.ts` L12；`src/lib/billing/runtime.ts` L30。

### `src/lib/billing/submission-identity.ts`

- 分类：core；行数：16；SHA256：`1215921e6fa78fc91650d2571a252f20a69a66bddf2222db955d7bec145a8a57`。
- 导出：`SubmissionField` L3；`multipartFieldText` L6；`submissionFingerprint` L9；`multipartSubmissionFields` L13。
- 函数/类型：`SubmissionField` L3–3；`multipartFieldText` L6–6；`submissionFingerprint` L9–11；`multipartSubmissionFields` L13–15。
- 仓内依赖：无静态仓内导入。

### `src/lib/billing/synchronous-failure-receipt.ts`

- 分类：core；行数：45；SHA256：`c93fe56a861d6f52166697506a786c44f32599c665c098fefa3e420e7a70ced4`。
- 导出：`synchronousFailureCheckpoint` L8；`isSynchronousFailureCheckpoint` L17；`settledSynchronousFailure` L23。
- 函数/类型：`Failure` L4–4；`synchronousFailureCheckpoint` L8–16；`isSynchronousFailureCheckpoint` L17–19；`settledSynchronousFailure` L23–44。
- 仓内依赖：无静态仓内导入。

### `src/lib/billing/synchronous-operation.ts`

- 分类：core；行数：331；SHA256：`8e12e13bab1b8be7a9f60718a212e02ea616dd40bb7a3a153ae1e73eda0c9119`。
- 导出：`currentSynchronousBilling` L40；`recordBillingUsage` L42；`markBillingUpstream` L59；`SynchronousResult` L63；`SynchronousOperation` L65；`withSynchronousOperation` L75；`checkpointSynchronousResult` L199；`exposeAbandonedBillingOperations` L228；`synchronousCost` L237；`settleSynchronous` L260；`configuredToolCost` L274；`finishSynchronousCreation` L284；`failSynchronousBackground` L290；`synchronousChargedCredits` L307；`completeSynchronousStream` L309；`failSynchronousStream` L322。
- 函数/类型：`Context` L22–38；`currentSynchronousBilling` L40–40；`recordBillingUsage` L42–58；`markBillingUpstream` L59–60；`SynchronousResult` L63–63；`QuoteFacts` L64–64；`SynchronousOperation` L65–70；`synchronousResult` L71–71；`synchronousFailure` L72–72；`withSynchronousOperation` L75–197；`checkpointSynchronousResult` L199–215；`checkpointToolArtwork` L216–226；`exposeAbandonedBillingOperations` L228–236；`synchronousCost` L237–259；`settleSynchronous` L260–273；`configuredToolCost` L274–281；`finishSynchronousCreation` L284–287；`failSynchronousBackground` L290–306；`synchronousChargedCredits` L307–307；`completeSynchronousStream` L309–321；`failSynchronousStream` L322–330。
- 仓内依赖：`src/lib/billing/cutout-receipt.ts` L2；`src/lib/billing/tool-image-receipt.ts` L3；`src/lib/billing/synchronous-failure-receipt.ts` L4；`src/lib/artwork-provenance-context.ts` L6；`src/platform/db/pool.ts` L7；`src/lib/persistence/schema.ts` L8；`src/lib/accounts/repository.ts` L9；`src/lib/accounts/session.ts` L10；`src/lib/billing/service.ts` L11；`src/lib/billing/types.ts` L12；`src/lib/billing/failure.ts` L13；`src/lib/billing/fingerprint.ts` L14；`src/lib/image-quality.ts` L15；`src/lib/model-config/context.ts` L16；`src/lib/staging-history.ts` L17；`src/lib/saas/creation-scope.ts` L18；`src/lib/saas/creation-writer.ts` L19；`src/lib/teams/errors.ts` L20。

### `src/lib/billing/synchronous.ts`

- 分类：core；行数：84；SHA256：`9e6881940647b93282bbd801330079edab9cbadbccf22a9f1065c3078b719c86`。
- 导出：`billingRequestIdentity` L22；`withBillingRequest` L53。
- 函数/类型：`billingRequestIdentity` L22–51；`withBillingRequest` L53–83。
- 仓内依赖：`src/lib/billing/submission-identity.ts` L3；`src/lib/model-config/accepted-context.ts` L4；`src/lib/model-config/server.ts` L5；`src/lib/artwork-provenance.ts` L6；`src/platform/db/pool.ts` L7；`src/lib/admin-auth.ts` L8；`src/lib/billing/server.ts` L9；`src/lib/billing/runtime.ts` L10；`src/lib/billing/types.ts` L11；`src/lib/billing/request.ts` L12；`src/lib/billing/access.ts` L13；`src/lib/saas/creation-context.ts` L14；`src/lib/saas/creation-scope.ts` L15；`src/lib/saas/creation-writer.ts` L16；`src/lib/teams/errors.ts` L17；`src/lib/billing/synchronous-operation.ts` L18；`src/lib/billing/synchronous-operation.ts` L20。

### `src/lib/billing/task-cost-evidence.ts`

- 分类：core；行数：33；SHA256：`da1e0164eb20eaf87288f58a0ce0a73000761015f2960a37ca3ba56bbea87c4e`。
- 导出：`TaskCostEvidence` L6；`readTaskCostEvidence` L11。
- 函数/类型：`TaskCostEvidence` L6–6；`readTaskCostEvidence` L11–32。
- 仓内依赖：`src/platform/db/pool.ts` L3；`src/lib/billing/schema.ts` L4。

### `src/lib/billing/task-operation.ts`

- 分类：core；行数：29；SHA256：`4d2ba468ef5cff111ac3d5206a11ddb4959d04d47eb872845c0d3d8e90ce2d6d`。
- 导出：`taskOperation` L6；`reserveTaskBillingTx` L7；`settleTaskBillingTx` L8；`videoRequestFingerprint` L10；`canvasRequestFingerprint` L24。
- 函数/类型：`taskOperation` L6–6；`reserveTaskBillingTx` L7–7；`settleTaskBillingTx` L8–8；`userParameters` L9–9；`videoRequestFingerprint` L10–23；`canvasRequestFingerprint` L24–28。
- 仓内依赖：`src/lib/billing/service.ts` L2；`src/lib/billing/types.ts` L3；`src/lib/billing/fingerprint.ts` L4。

### `src/lib/billing/task-recovery.ts`

- 分类：core；行数：16；SHA256：`b6361f3f7230c91e26250f77b7dcb21293c920fbf448d38edaf66b15cbf06a56`。
- 导出：`pendingApiCostOperations` L6；`requestCanvasRecoveryTx` L12；`pendingCanvasRecoveries` L13；`canvasRecoveryRequestTx` L14；`finishCanvasRecoveryTx` L15。
- 函数/类型：`pendingApiCostOperations` L6–11；`requestCanvasRecoveryTx` L12–12；`pendingCanvasRecoveries` L13–13；`canvasRecoveryRequestTx` L14–14；`finishCanvasRecoveryTx` L15–15。
- 仓内依赖：`src/lib/billing/types.ts` L3；`src/lib/staging-history.ts` L4。

### `src/lib/billing/task-settlement.ts`

- 分类：core；行数：52；SHA256：`a822dcc0493cd7b268dae04cc077b8ba6df61b2884f4e1aef62f5daed54b0bd9`。
- 导出：`reserveLegacyTaskTx` L9；`releaseLegacyCreditsTx` L17；`clearTaskReservationTx` L20；`settleLegacyTaskTx` L21；`taskBillingExistsTx` L27；`holdTaskBillingTx` L29；`releaseUndeliveredTaskTx` L35。
- 函数/类型：`reserveLegacyTaskTx` L9–16；`releaseLegacyCreditsTx` L17–19；`clearTaskReservationTx` L20–20；`settleLegacyTaskTx` L21–26；`taskBillingExistsTx` L27–27；`holdTaskBillingTx` L29–32；`releaseUndeliveredTaskTx` L35–51。
- 仓内依赖：`src/lib/billing/types.ts` L2；`src/lib/billing/service.ts` L3；`src/lib/billing/wallet-balance.ts` L4；`src/lib/billing/repository.ts` L5。

### `src/lib/billing/tool-image-receipt.ts`

- 分类：core；行数：71；SHA256：`5a1151ff00a73133b24b0b588897b4d2ed687dcf326bfd1605c6ec37a065a838`。
- 导出：`hasToolImageReceipt` L17；`isToolImageReceiptCheckpoint` L20；`toolImageReceiptCheckpoint` L44；`readSettledToolImageReceipt` L54。
- 函数/类型：`Identity` L13–13；`Checkpoint` L14–14；`Artwork` L15–15；`hasToolImageReceipt` L17–19；`isToolImageReceiptCheckpoint` L20–22；`artwork` L27–41；`toolImageReceiptCheckpoint` L44–50；`readSettledToolImageReceipt` L54–70。
- 仓内依赖：无静态仓内导入。

### `src/lib/billing/types.ts`

- 分类：core；行数：261；SHA256：`eb9e8f829076b90dd5e6dc95416704d71676ccc1142f22b9f7fda3e00cef70fb`。
- 导出：`ExpiryPolicy` L4；`CostRate` L8；`Pricing` L15；`SettlementPolicy` L53；`BillingFacts` L61；`RuleCondition` L76；`Rule` L87；`FeatureTariff` L94；`BillingProduct` L102；`BillingConfig` L112；`ConfigSnapshot` L138；`BillingQuote` L142；`BillingResult` L165；`Settlement` L176；`CostEstimate` L181；`Tx` L187；`OperationInput` L188；`GrantInput` L196；`AdjustmentInput` L210；`BillingService` L211；`ConfigRuntime` L231；`BillingErrorCode` L257；`BillingError` L258。
- 函数/类型：`ExpiryPolicy` L4–7；`CostRate` L8–14；`Pricing` L15–52；`SettlementPolicy` L53–60；`BillingFacts` L61–75；`RuleCondition` L76–86；`Rule` L87–93；`FeatureTariff` L94–101；`BillingProduct` L102–111；`BillingConfig` L112–137；`ConfigSnapshot` L138–141；`BillingQuote` L142–164；`BillingResult` L165–175；`Settlement` L176–180；`CostEstimate` L181–186；`Tx` L187–187；`OperationInput` L188–195；`GrantInput` L196–209；`AdjustmentInput` L210–210；`BillingService` L211–230；`ConfigRuntime` L231–256；`BillingErrorCode` L257–257；`BillingError` L258–260。
- 仓内依赖：`src/lib/billing/rules/registry.ts` L2。

### `src/lib/billing/validation.ts`

- 分类：core；行数：6；SHA256：`fcef5cf53153bc06fd6b5df9ab2f1358a5886df482de354a5e91a91212d9dcb1`。
- 导出：`publicFactsSchema` L3；`factsSchema` L4；`resultSchema` L5。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：`src/lib/billing/rules/registry.ts` L2。

### `src/lib/billing/wallet-balance.ts`

- 分类：core；行数：86；SHA256：`52fc74be9be1893b2de7ab83bfcbcbc026ad1eaa0f16fab347906d5b24b0f257`。
- 导出：`expireDueBatches` L15；`refreshBalance` L32；`getCreditOverview` L48；`deductPrincipalFIFO` L67。
- 函数/类型：`expireDueBatches` L15–29；`refreshBalance` L32–45；`getCreditOverview` L48–64；`deductPrincipalFIFO` L67–85。
- 仓内依赖：`src/lib/billing/types.ts` L2；`src/lib/billing/repository.ts` L3；`src/platform/db/pool.ts` L5；`src/platform/db/transaction.ts` L6；`src/lib/persistence/schema.ts` L7。

### `src/lib/frontend-image-models.ts`

- 分类：related；行数：41；SHA256：`07b3e9f9b221aaa2df23f44dba9952d04d165ada77444a66f5c3d964168d8600`。
- 导出：`isFrontendImageModelVisible` L4；`frontendImageModels` L9；`frontendImageCatalog` L22。
- 函数/类型：`FrontendImageModel` L1–1；`isFrontendImageModelVisible` L4–7；`frontendImageModels` L9–11；`FrontendImageCatalog` L13–19；`frontendImageCatalog` L22–40。
- 仓内依赖：无静态仓内导入。

### `src/lib/model-config/accepted-context.ts`

- 分类：core；行数：25；SHA256：`9b650f87c1a37df3b5b343a221924acda3a3e74e22416d8dcf4b9dc01ff605b4`。
- 导出：`signAcceptedModelContext` L10；`acceptedModelVersions` L14。
- 函数/类型：`signAcceptedModelContext` L10–13；`acceptedModelVersions` L14–24。
- 仓内依赖：`src/lib/settings-secret.ts` L3；`src/lib/model-config/types.ts` L4；`src/lib/admin-auth.ts` L5。

### `src/lib/model-config/access.ts`

- 分类：core；行数：89；SHA256：`36e6fcbdf7f266c113facf7a3efa96008e3cd35a774aaddcb19358f907ff9eb8`。
- 导出：`ModelAdminAction` L12；`createModelAdminHandler` L42；`modelAdminHandler` L88。
- 函数/类型：`Administration` L11–11；`ModelAdminAction` L12–12；`readBody` L22–29；`configurationDiff` L30–41；`createModelAdminHandler` L42–87。
- 仓内依赖：`src/lib/bi/access.ts` L3；`src/lib/model-config/server.ts` L4；`src/lib/model-config/capacity.ts` L5；`src/lib/model-config/bindings.ts` L6；`src/lib/model-config/schema.ts` L7；`src/lib/model-config/projection.ts` L8；`src/lib/model-config/types.ts` L9。

### `src/lib/model-config/apimart-image-parameters.ts`

- 分类：core；行数：47；SHA256：`59e9af54a6c1f17dd5d363e2fcf7f3e0825294f6ef1a8bf9dc8b9cc013173ecb`。
- 导出：`apimartImageParameters` L14。
- 函数/类型：`apimartImageParameters` L14–46。
- 仓内依赖：`src/lib/model-config/image-plan-runtime.ts` L1；`src/lib/model-config/parameter-contract.ts` L2；`src/lib/model-config/image-parameter-plan.ts` L3；`src/lib/model-config/context.ts` L5；`src/lib/model-config/types.ts` L6；`src/lib/model-config/quality-policy.ts` L7；`src/lib/model-config/resolution-policy.ts` L8；`src/lib/imagegen/context.ts` L9；`src/lib/imagegen/parameters.ts` L10；`src/lib/imagegen/capabilities.ts` L11；`src/lib/imagegen/request-size.ts` L12。

### `src/lib/model-config/apimart-image-policy.ts`

- 分类：core；行数：27；SHA256：`3d39479536e5611515b12772402ec2a1bad4ab3fdf5072795ac6f69ff9930316`。
- 导出：`apimartImagesSchema` L5；`acceptsAPIMartRatio` L18；`applicationAPIMartImages` L22；`queryableImageScope` L24。
- 函数/类型：`acceptsAPIMartRatio` L18–20。
- 仓内依赖：`src/lib/model-config/context.ts` L2。

### `src/lib/model-config/apimart-preset.ts`

- 分类：core；行数：259；SHA256：`81ae8b6f8ac4f59861c1dd426b1c3395d83e0a129054873e8c8e1a00b282ffdb`。
- 导出：`apimartExecutionParameters` L25；`apimartImagesFetch` L55；`apimartPresetFetch` L258。
- 函数/类型：`apimartExecutionParameters` L25–52；`apimartImagesFetch` L55–255。
- 仓内依赖：`src/lib/supplier-cost/adapter-failure.ts` L1；`src/lib/model-config/apimart-image-parameters.ts` L3；`src/lib/model-config/seedream-preflight.ts` L4；`src/lib/model-config/channel-availability.ts` L5；`src/lib/model-config/context.ts` L8；`src/lib/model-config/schema.ts` L9；`src/lib/model-config/transport.ts` L10；`src/lib/model-config/image-preset.ts` L11；`src/lib/model-config/types.ts` L12；`src/lib/image-gateway.ts` L13；`src/lib/supplier-cost/collect.ts` L14；`src/lib/supplier-cost/runtime.ts` L15；`src/lib/supplier-cost/adapters.ts` L16；`src/lib/supplier-cost/money.ts` L17；`src/lib/supplier-cost/io.ts` L18；`src/lib/billing/synchronous-operation.ts` L19；`src/lib/model-config/channel-image-response.ts` L20。

### `src/lib/model-config/availability.ts`

- 分类：core；行数：13；SHA256：`434f41e88e59a9e351dc63b1d7fc8ab2b1ae9bcb253359c47bf9e8fbc3ec2245`。
- 导出：`modelConfigurationEnabled` L5。
- 函数/类型：`modelConfigurationEnabled` L5–12。
- 仓内依赖：`src/platform/db/pool.ts` L2；`src/lib/model-config/context.ts` L3。

### `src/lib/model-config/batch.ts`

- 分类：core；行数：75；SHA256：`ad69f64e9d2373759a10cd48c92d4520ac313ea0b8836a075f9d99cb9f47b297`。
- 导出：`BatchInput` L9；`batchFeatureAvailability` L15；`planModelBatch` L28。
- 函数/类型：`BatchInput` L9–13；`batchFeatureAvailability` L15–27；`planModelBatch` L28–74。
- 仓内依赖：`src/lib/model-config/types.ts` L1；`src/lib/model-config/business-schema.ts` L2；`src/lib/model-config/business-schema.ts` L3；`src/lib/billing/rules/registry.ts` L4；`src/lib/model-config/feature-model-policy.ts` L5；`src/lib/model-config/bindings.ts` L6；`src/lib/billing/money.ts` L7。

### `src/lib/model-config/billing-identity.ts`

- 分类：core；行数：24；SHA256：`1a70c63b20d8274fa8f75ef250d0816f095d9e8a402e09815216ab34a8094e0a`。
- 导出：`billingForModelIdentities` L7。
- 函数/类型：`billingForModelIdentities` L7–23。
- 仓内依赖：`src/lib/billing/types.ts` L1；`src/lib/model-config/types.ts` L2；`src/lib/model-config/public-identity.ts` L3。

### `src/lib/model-config/billing-model.ts`

- 分类：core；行数：40；SHA256：`c29f9e5e027f41e1f7138a9e762aa95dd2c916b9139e2e9448f7909260919a93`。
- 导出：`managedBillingModel` L15；`managedBillingSelection` L18。
- 函数/类型：`managedBillingModel` L15–17；`managedBillingSelection` L18–39。
- 仓内依赖：`src/lib/model-config/feature-model-policy.ts` L1；`src/lib/model-config/selection-policy.ts` L3；`src/lib/billing/rules/registry.ts` L4；`src/lib/model-config/bindings.ts` L5；`src/lib/model-config/context.ts` L6；`src/lib/model-config/availability.ts` L7；`src/lib/model-config/snapshot-reader.ts` L8；`src/lib/model-config/model-selection.ts` L9；`src/lib/model-config/types.ts` L10。

### `src/lib/model-config/billing-publication-check.ts`

- 分类：core；行数：35；SHA256：`27fa23ddc31a39583471aae609e140ba421e1bbc05add4a3eaa610e0c263dafd`。
- 导出：`billingChangeBreaksModelPricing` L13；`assertBillingKeepsModelPricing` L24。
- 函数/类型：`billingChangeBreaksModelPricing` L13–20；`assertBillingKeepsModelPricing` L24–34。
- 仓内依赖：`src/lib/billing/types.ts` L3；`src/lib/model-config/projection.ts` L4；`src/lib/model-config/environment.ts` L5；`src/lib/model-config/types.ts` L6；`src/lib/model-config/schema.ts` L7；`src/lib/model-config/server.ts` L30。

### `src/lib/model-config/bindings.ts`

- 分类：core；行数：18；SHA256：`62e7063cfa8d5dea15f6f57171fb9ce37ea73df67c2d9c57fa1f869dd8ae83c4`。
- 导出：`MODEL_BINDINGS` L1；`ModelBinding` L17。
- 函数/类型：`ModelBinding` L17–17。
- 仓内依赖：无静态仓内导入。

### `src/lib/model-config/bootstrap.ts`

- 分类：core；行数：149；SHA256：`883ab341527b01470c2ca7b79b4f9ce64b3701f074f35a6da2fb71c82b432e46`。
- 导出：`LegacyModelSources` L13；`bootstrapModelConfig` L19；`readLegacyModelSources` L125。
- 函数/类型：`LegacyImage` L11–11；`LegacyText` L12–12；`LegacyModelSources` L13–13；`publicId` L15–15；`bootstrapModelConfig` L19–123；`readLegacyModelSources` L125–148。
- 仓内依赖：`src/lib/video/providers/config.ts` L4；`src/lib/model-config/credentials.ts` L5；`src/lib/model-config/schema.ts` L6；`src/lib/model-config/types.ts` L7；`src/lib/model-config/legacy-vision.ts` L8；`src/lib/video/capabilities.ts` L9；`src/lib/settings.ts` L126；`src/lib/openai-base.ts` L126；`src/lib/image-model-legacy-catalog.ts` L126；`src/lib/video/providers/config.ts` L126。

### `src/lib/model-config/business-billing.ts`

- 分类：core；行数：147；SHA256：`c6054baf2332374bbdca32e7a32144a1411d6830b2926d2b12b11aab2590f8bc`。
- 导出：`freezeImagePresetQuote` L19；`businessBillingSnapshot` L71；`freezeBusinessQuote` L75；`freezeBusinessQuoteForModel` L79。
- 函数/类型：`freezeImagePresetQuote` L19–45；`originalBusinessBillingSnapshot` L47–70；`businessBillingSnapshot` L71–74；`freezeBusinessQuote` L75–77；`freezeBusinessQuoteForModel` L79–146。
- 仓内依赖：`src/lib/model-config/billing-identity.ts` L1；`src/lib/model-config/public-identity.ts` L2；`src/lib/model-config/image-parameter-plan.ts` L3；`src/lib/model-config/channel-policy.ts` L4；`src/lib/model-config/resolution-fallback.ts` L5；`src/lib/model-config/resolution-options.ts` L6；`src/lib/model-config/context.ts` L8；`src/lib/model-config/snapshot-reader.ts` L9；`src/lib/model-config/business.ts` L10；`src/lib/model-config/types.ts` L11；`src/lib/billing/types.ts` L12；`src/lib/model-config/image-preset.ts` L13；`src/lib/billing/api-cost.ts` L14；`src/lib/billing/money.ts` L15；`src/lib/model-config/credit-overrides.ts` L16；`src/lib/model-config/quality-policy.ts` L17。

### `src/lib/model-config/business-preview.ts`

- 分类：core；行数：23；SHA256：`7fc422c3c9840fd73494e7f064fa4d25fe87e5688572a33f247037cbd5cc960d`。
- 导出：`businessPreview` L7。
- 函数/类型：`businessPreview` L7–22。
- 仓内依赖：`src/lib/model-config/types.ts` L1；`src/lib/billing/types.ts` L2；`src/lib/model-config/business.ts` L3；`src/lib/model-config/business-billing.ts` L4；`src/lib/billing/quote.ts` L5；`src/lib/billing/money.ts` L6。

### `src/lib/model-config/business-schema.ts`

- 分类：core；行数：48；SHA256：`cd8a378afd73a5671c73a054cd4aba63cf0056b9d7871af712116dfbd507f136`。
- 导出：`fixedMonthlyCostsSchema` L7；`procurementSchema` L8；`requestConditionsSchema` L17；`businessRoutingSchema` L23；`postprocessSchema` L31；`businessOptionSchema` L37；`businessFeaturesSchema` L43；`BusinessOption` L44；`Procurement` L45；`BusinessRouting` L46；`Postprocess` L47。
- 函数/类型：`BusinessOption` L44–44；`Procurement` L45–45；`BusinessRouting` L46–46；`Postprocess` L47–47。
- 仓内依赖：`src/lib/billing/rules/registry.ts` L2；`src/lib/billing/rules/pricing-schema.ts` L3。

### `src/lib/model-config/business-validation.ts`

- 分类：core；行数：79；SHA256：`e8c0f8cba0445182759b91a201e6da03f27a1b9fc8fd50a0585df77dc334c14f`。
- 导出：`validateBusinessConfig` L8。
- 函数/类型：`validateBusinessConfig` L8–78。
- 仓内依赖：`src/lib/model-config/types.ts` L1；`src/lib/model-config/types.ts` L2；`src/lib/model-config/business.ts` L3；`src/lib/model-config/feature-model-policy.ts` L4；`src/lib/model-config/bindings.ts` L5；`src/lib/billing/money.ts` L6。

### `src/lib/model-config/business.ts`

- 分类：core；行数：45；SHA256：`9654b48aa5408f3714908d7bb34887ca04dd2baf80b02a1939560a2f5ce27a56`。
- 导出：`selectedBusinessOption` L8；`requestRuleMatches` L23；`businessRoutePlan` L28；`procurementCny` L36。
- 函数/类型：`selectedBusinessOption` L8–22；`requestRuleMatches` L23–27；`businessRoutePlan` L28–35；`procurementCny` L36–44。
- 仓内依赖：`src/lib/model-config/types.ts` L1；`src/lib/model-config/types.ts` L2；`src/lib/billing/rules/registry.ts` L3；`src/lib/model-config/business-schema.ts` L4；`src/lib/model-config/feature-model-policy.ts` L5；`src/lib/model-config/feature-model-policy.ts` L6。

### `src/lib/model-config/capacity.ts`

- 分类：core；行数：114；SHA256：`55d2adcf94fb9cbf8792469fa5d32f98212ecf006988012b836dec46efff647e`。
- 导出：`providerCapacitySummary` L15；`registerProviderCapacities` L22；`createProviderCapacity` L51；`capacityFetch` L82。
- 函数/类型：`Limit` L13–13；`capacityIdentity` L14–14；`providerCapacitySummary` L15–20；`registerProviderCapacities` L22–50；`createProviderCapacity` L51–80；`capacityFetch` L82–113。
- 仓内依赖：`src/lib/model-config/types.ts` L4；`src/lib/model-config/storage-schema.ts` L5；`src/lib/model-config/types.ts` L7；`src/lib/settings.ts` L8；`src/lib/settings-secret.ts` L9；`src/lib/image-gateway.ts` L10；`src/lib/application/work-signal.ts` L11。

### `src/lib/model-config/catalog-access.ts`

- 分类：core；行数：26；SHA256：`accb4354af8b67e042dad57fe3321f6987ce7fe4a4781b568499012ebc875d12`。
- 导出：`createCatalogHandler` L10；`providerCatalogHandler` L25。
- 函数/类型：`createCatalogHandler` L10–24。
- 仓内依赖：`src/lib/bi/access.ts` L3；`src/lib/model-config/server.ts` L4；`src/lib/model-config/catalog-store.ts` L5；`src/lib/model-config/types.ts` L6；`src/lib/supplier-cost/io.ts` L7。

### `src/lib/model-config/catalog-pricing.ts`

- 分类：core；行数：19；SHA256：`7df4d1d08303f45b4e76442cf656803806adcce613a1d2efff5f24c23718feb5`。
- 导出：`modelCatalogWithPricing` L9。
- 函数/类型：`modelCatalogWithPricing` L9–18。
- 仓内依赖：`src/lib/model-config/types.ts` L1；`src/lib/billing/types.ts` L2；`src/lib/billing/rules/registry.ts` L3；`src/lib/model-config/public-catalog.ts` L4；`src/lib/model-config/management-pricing.ts` L5。

### `src/lib/model-config/catalog-query.ts`

- 分类：core；行数：15；SHA256：`48161c33e0e871562ff2b7d497ca37b1de863daa93b60e45bc6702bdae10e10b`。
- 导出：`readPublishedModelCatalog` L10。
- 函数/类型：`readPublishedModelCatalog` L10–14。
- 仓内依赖：`src/lib/model-config/types.ts` L2；`src/lib/billing/rules/registry.ts` L3；`src/lib/model-config/published.ts` L4；`src/lib/billing/configuration.ts` L5；`src/lib/model-config/catalog-pricing.ts` L6。

### `src/lib/model-config/catalog-schema.ts`

- 分类：core；行数：12；SHA256：`150dd892ba78b8526b0d97124ce743f811a9a53d4b41c76f7bd93db2ebb527d2`。
- 导出：`ensureProviderCatalogSchema` L5；`PROVIDER_CATALOG_SQL` L8。
- 函数/类型：`ensureProviderCatalogSchema` L5–6。
- 仓内依赖：`src/platform/db/schema-readiness.ts` L2。

### `src/lib/model-config/catalog-store.ts`

- 分类：core；行数：55；SHA256：`26dd94eb5d43f53966f1585701750af30e4037fb2430433fb22bf8aec3164aa6`。
- 导出：`CatalogEntry` L14；`readProviderCatalog` L24；`refreshProviderCatalog` L29。
- 函数/类型：`CatalogEntry` L14–14；`entry` L18–23；`readProviderCatalog` L24–28；`refreshProviderCatalog` L29–54。
- 仓内依赖：`src/lib/model-config/catalog-schema.ts` L1；`src/lib/model-config/catalog-schema.ts` L3；`src/lib/model-config/catalog.ts` L7；`src/lib/model-config/types.ts` L8；`src/lib/model-config/credentials.ts` L9；`src/lib/supplier-models/repository.ts` L10；`src/lib/supplier-models/discovery.ts` L11。

### `src/lib/model-config/catalog.ts`

- 分类：core；行数：75；SHA256：`f407c4203c63c75cc33b9f037a791bcd33f218798d79b1c5812320525b63a44a`。
- 导出：`ProviderCatalogModel` L9；`ProviderCatalogResult` L10；`discoverProviderCatalog` L49。
- 函数/类型：`ProviderCatalogModel` L9–9；`ProviderCatalogResult` L10–20；`catalogUrl` L25–31；`parseModels` L33–47；`discoverProviderCatalog` L49–74。
- 仓内依赖：`src/lib/model-config/transport.ts` L2；`src/lib/model-config/schema.ts` L3；`src/lib/model-config/credentials.ts` L4；`src/lib/model-config/types.ts` L5；`src/lib/supplier-cost/io.ts` L6；`src/lib/supplier-models/discovery.ts` L7。

### `src/lib/model-config/channel-availability.ts`

- 分类：core；行数：183；SHA256：`3a22d63a75bf3c08e647c9c50c279b31cb9e44270514e82f371f02082b552d8d`。
- 导出：`ChannelGuard` L13；`withAcceptedImageRead` L17；`assertAcceptedImageReadOnly` L20；`readLiveChannels` L33；`channelStillEnabled` L46；`channelOperationKey` L58；`readChannelOperationPin` L66；`recoverableChannelIdentity` L85；`acceptedImageOperationIdentities` L96；`recoverableAPIMartImageOperation` L142；`guardChannelSubmission` L159。
- 函数/类型：`ChannelGuard` L13–13；`withAcceptedImageRead` L17–19；`assertAcceptedImageReadOnly` L20–24；`LiveChannels` L25–29；`readLiveChannels` L33–44；`channelStillEnabled` L46–56；`channelOperationKey` L58–61；`readChannelOperationPin` L66–81；`recoverableChannelIdentity` L85–91；`acceptedImageOperationIdentities` L96–137；`recoverableAPIMartImageOperation` L142–155；`guardChannelSubmission` L159–182。
- 仓内依赖：`src/lib/model-config/apimart-image-policy.ts` L1；`src/lib/model-config/channel-scheduler.ts` L6；`src/lib/model-config/context.ts` L7；`src/lib/model-config/storage-schema.ts` L8；`src/lib/model-config/types.ts` L10；`src/lib/image-gateway.ts` L11。

### `src/lib/model-config/channel-fetch.ts`

- 分类：core；行数：3；SHA256：`ce40e16f0a5aeda7b0c10c0f0e1814a179cd887e529404530b201a54845d652a`。
- 导出：无命名导出 / 数据或样式文件。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：`src/lib/model-config/execution-fetch.ts` L2。

### `src/lib/model-config/channel-health-policy.ts`

- 分类：core；行数：19；SHA256：`9c4048d61eaae9937463035348adc6e72a74259ac17be4698675f5a877648e85`。
- 导出：`ChannelFailureKind` L1；`ChannelFailure` L2；`retryAfterMs` L4；`channelFailurePolicy` L11。
- 函数/类型：`ChannelFailureKind` L1–1；`ChannelFailure` L2–2；`retryAfterMs` L4–8；`channelFailurePolicy` L11–18。
- 仓内依赖：无静态仓内导入。

### `src/lib/model-config/channel-image-response.ts`

- 分类：core；行数：71；SHA256：`a70dee8372259608cbcb7c1efdf4555ff455793e6608aae5d88b9fbcdd3d9c1f`。
- 导出：`validatedChannelImageResponse` L9；`channelImageFailureStage` L14；`completedChannelImage` L21。
- 函数/类型：`validatedChannelImageResponse` L9–12；`completedChannelImage` L21–70。
- 仓内依赖：`src/lib/supplier-cost/io.ts` L3；`src/lib/model-config/transport.ts` L4；`src/lib/model-config/schema.ts` L5。

### `src/lib/model-config/channel-policy.ts`

- 分类：core；行数：47；SHA256：`7da2db5898f5f68ff1c9be6182e6c6e44d096feda10346148cc303a305e5453c`。
- 导出：`channelPolicySchema` L6；`ChannelPolicy` L7；`CHANNEL_PROTOCOLS` L8；`channelProtocol` L9；`publicUpstreamIds` L10；`validateChannelPolicies` L11；`channelEditable` L33；`applyChannelPolicy` L34。
- 函数/类型：`ChannelPolicy` L7–7；`channelProtocol` L9–9；`publicUpstreamIds` L10–10；`validateChannelPolicies` L11–32；`channelEditable` L33–33；`applyChannelPolicy` L34–46。
- 仓内依赖：`src/lib/model-config/apimart-image-policy.ts` L1；`src/lib/model-config/types.ts` L3；`src/lib/model-config/types.ts` L4；`src/lib/image-model-routing.ts` L5。

### `src/lib/model-config/channel-routing.ts`

- 分类：core；行数：118；SHA256：`20d03e6f4fa2523f172975712eb34758ddef94b88abbc0bab0b732b3734054db`。
- 导出：`createChannelRoutingFetch` L18。
- 函数/类型：`createChannelRoutingFetch` L18–117。
- 仓内依赖：`src/lib/model-config/local-image-rejection.ts` L1；`src/lib/model-config/apimart-image-policy.ts` L2；`src/platform/db/pool.ts` L4；`src/lib/model-config/context.ts` L5；`src/lib/model-config/schema.ts` L6；`src/lib/model-config/channel-scheduler.ts` L7；`src/lib/model-config/execution-audit.ts` L8；`src/lib/model-config/types.ts` L9；`src/lib/supplier-cost/io.ts` L10；`src/lib/model-config/channel-image-response.ts` L11；`src/lib/model-config/channel-text-response.ts` L12；`src/lib/image-gateway.ts` L13；`src/lib/model-config/channel-availability.ts` L14；`src/lib/model-config/channel-health-policy.ts` L15；`src/lib/model-config/supplier-failure.ts` L16。

### `src/lib/model-config/channel-scheduler.ts`

- 分类：core；行数：99；SHA256：`21bd4c2cbeb27ad4d6d631715b410e2fe3ce25cdaa5bc36858fe87673e6e515b`。
- 导出：`ChannelTarget` L14；`supplierChannelKey` L17；`channelHealthKey` L22；`channelHealthSummary` L23；`compareChannels` L24；`claimChannel` L32；`recordChannelOutcome` L86。
- 函数/类型：`ChannelTarget` L14–16；`supplierChannelKey` L17–21；`channelHealthKey` L22–22；`channelHealthSummary` L23–23；`compareChannels` L24–31；`claimChannel` L32–85；`recordChannelOutcome` L86–98。
- 仓内依赖：`src/lib/model-config/channel-policy.ts` L4；`src/lib/model-config/context.ts` L5；`src/lib/model-config/storage-schema.ts` L6；`src/lib/model-config/capacity.ts` L8；`src/lib/model-config/types.ts` L9；`src/lib/image-model-routing.ts` L10；`src/lib/model-config/channel-availability.ts` L11；`src/lib/model-config/channel-health-policy.ts` L12；`src/lib/image-gateway.ts` L13。

### `src/lib/model-config/channel-text-response.ts`

- 分类：core；行数：47；SHA256：`2fb47d9298a3ea58d3aebbeee24e083a86de4ca9579268d592cbe4c4ad9f48c3`。
- 导出：`prepareChannelText` L9。
- 函数/类型：`prepareChannelText` L9–46。
- 仓内依赖：`src/lib/supplier-cost/io.ts` L1；`src/lib/model-config/types.ts` L2；`src/lib/model-config/chat-completion-response.ts` L3。

### `src/lib/model-config/chat-completion-response.ts`

- 分类：core；行数：120；SHA256：`b61fc52dcaecfb35fcd54c1f35cecd5ba909d20106fd2a4d730616ced861d5cf`。
- 导出：`chatAnswerText` L8；`normalizeChatCompletionResponse` L28；`chatCompletionResponseFetch` L109。
- 函数/类型：`JsonObject` L3–3；`chatAnswerText` L8–16；`appendContent` L18–24；`normalizeChatCompletionResponse` L28–106；`chatCompletionResponseFetch` L109–119。
- 仓内依赖：`src/lib/model-config/types.ts` L1。

### `src/lib/model-config/client-identity.ts`

- 分类：core；行数：7；SHA256：`f26705df898a3fc5af3d37e9a0c56c9a806d89f8cfb8df15bde76e689a945092`。
- 导出：`isManagedModelClient` L5；`markManagedModelClient` L6。
- 函数/类型：`markManagedModelClient` L6–6。
- 仓内依赖：无静态仓内导入。

### `src/lib/model-config/clients.ts`

- 分类：core；行数：75；SHA256：`594ab7288dec0a98992cd06431301e0da96822254d402262d1e7f4f353dde3ad`。
- 导出：`executionOpenAI` L14；`managedImageEditFetch` L20；`modelAwareOpenAI` L44。
- 函数/类型：`executionOpenAI` L14–18；`managedImageEditFetch` L20–27；`withToolImageOperation` L35–42；`modelAwareOpenAI` L44–74。
- 仓内依赖：`src/lib/model-config/client-identity.ts` L2；`src/lib/model-config/client-identity.ts` L3；`src/lib/model-config/context.ts` L5；`src/lib/model-config/execution-fetch.ts` L6；`src/lib/model-config/execution-fetch.ts` L7；`src/lib/model-config/schema.ts` L8；`src/lib/model-config/types.ts` L9；`src/lib/image-gateway.ts` L10；`src/lib/supplier-cost/collect.ts` L11；`src/lib/model-config/chat-completion-response.ts` L12；`src/lib/bi/model-calls.ts` L25；`src/lib/billing/synchronous-operation.ts` L36。

### `src/lib/model-config/context.ts`

- 分类：core；行数：38；SHA256：`f3f6e1dbc1072b958e73a990547e650ccb2d1e16338371d2016ca29abac196d4`。
- 导出：`ModelExecutionScope` L7；`ExecutionBundle` L9；`ResolvedExecutionBundle` L10；`currentModelExecution` L13；`currentExecutionBundle` L23；`currentModelSnapshot` L25；`currentModelBillingSnapshot` L26；`legacyModelExecutionActive` L27；`runModelExecution` L28；`runExecutionBundle` L29；`runLegacyModelExecution` L30；`runFrozenLegacyBilling` L31；`imageExecutionSizingModel` L35。
- 函数/类型：`ModelExecutionScope` L7–7；`ExecutionBundle` L9–9；`ResolvedExecutionBundle` L10–10；`currentModelExecution` L13–22；`runModelExecution` L28–28；`runExecutionBundle` L29–29；`runLegacyModelExecution` L30–30；`runFrozenLegacyBilling` L31–31；`imageExecutionSizingModel` L35–37。
- 仓内依赖：`src/lib/model-config/execution.ts` L3；`src/lib/model-config/types.ts` L4；`src/lib/billing/types.ts` L5。

### `src/lib/model-config/credential-reader.ts`

- 分类：core；行数：17；SHA256：`fa9056b6a24122c3f309dac4b3b5582541bcf5daa43567e2c91a3ed60dc31b52`。
- 导出：`createCredentialReader` L8；`CredentialReader` L16。
- 函数/类型：`createCredentialReader` L8–15；`CredentialReader` L16–16。
- 仓内依赖：`src/lib/settings.ts` L3；`src/lib/model-config/types.ts` L4。

### `src/lib/model-config/credentials.ts`

- 分类：core；行数：30；SHA256：`2d42168a3558b5eef086f329d199ba4c697156151475057514a9699bc122ec84`。
- 导出：`createCredentialStore` L10。
- 函数/类型：`createCredentialStore` L10–29。
- 仓内依赖：`src/lib/model-config/credential-reader.ts` L1；`src/lib/settings.ts` L5；`src/lib/model-config/storage-schema.ts` L6；`src/lib/model-config/types.ts` L8。

### `src/lib/model-config/credit-overrides.ts`

- 分类：core；行数：19；SHA256：`ec9a4bc0f3d4e42e59ca081f00ec2874814c69f82966c554fac20641f659c8d4`。
- 导出：`MANAGED_MODEL_CREDIT_PREFIX` L5；`managedModelCreditRule` L6；`applyCreditOverride` L9；`ManagedModelCreditPricing` L18。
- 函数/类型：`managedModelCreditRule` L6–8；`applyCreditOverride` L9–17；`ManagedModelCreditPricing` L18–18。
- 仓内依赖：`src/lib/billing/types.ts` L1；`src/lib/billing/rules/evaluate.ts` L2。

### `src/lib/model-config/cutout-quality.ts`

- 分类：core；行数：8；SHA256：`b1b8d9f995a3fed83c3f03507d9a19b4c11398badfadfe875a39924a49242937`。
- 导出：`CUTOUT_IMAGE_QUALITY` L4；`cutoutImageQuality` L5。
- 函数/类型：`cutoutImageQuality` L5–7。
- 仓内依赖：无静态仓内导入。

### `src/lib/model-config/draft-retention.ts`

- 分类：core；行数：21；SHA256：`f9eedff34af9d80cb4b96f1d1bb5c33d0b6953b49f93af0e49ac4060110a0513`。
- 导出：`pruneAppliedOperationDrafts` L10。
- 函数/类型：`pruneAppliedOperationDrafts` L10–20。
- 仓内依赖：无静态仓内导入。

### `src/lib/model-config/environment.ts`

- 分类：core；行数：3；SHA256：`780788b979605ed3a67bb54939240875124d416327b4655c4b28c5cc428c1113`。
- 导出：`modelTrustedOrigins` L2。
- 函数/类型：`modelTrustedOrigins` L2–2。
- 仓内依赖：无静态仓内导入。

### `src/lib/model-config/execution-audit-schema.ts`

- 分类：core；行数：22；SHA256：`738937f33f8df3222f75de19df0d7f41ddeae05774fb8d61dc13efa6d9b6b5b2`。
- 导出：`ensureExecutionAuditSchema` L5。
- 函数/类型：`ensureExecutionAuditSchema` L5–21。
- 仓内依赖：`src/platform/db/schema-readiness.ts` L2。

### `src/lib/model-config/execution-audit.ts`

- 分类：core；行数：46；SHA256：`213919a3f307331e9fe55624e912ba1b10635240508aff6bc68f86a490ea67fc`。
- 导出：`beginExecutionStage` L16；`finishExecutionStage` L40。
- 函数/类型：`beginExecutionStage` L16–39；`finishExecutionStage` L40–45。
- 仓内依赖：`src/lib/model-config/execution-audit-schema.ts` L1；`src/lib/model-config/image-plan-runtime.ts` L3；`src/platform/db/pool.ts` L6；`src/lib/billing/synchronous-operation.ts` L7；`src/lib/image-gateway.ts` L8；`src/lib/model-config/context.ts` L9；`src/lib/model-config/business.ts` L10；`src/lib/model-config/types.ts` L11；`src/lib/model-config/stage-cost.ts` L13；`src/lib/bi/context.ts` L20。

### `src/lib/model-config/execution-contract.ts`

- 分类：core；行数：9；SHA256：`352bf22633e29f5d396b491ef55e83975da45dc7ee1793de55caf9c5d1c37d44`。
- 导出：`factsSchema` L6；`imageUpstreamIdsSchema` L7；`executionSchema` L8。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：`src/lib/model-config/image-parameter-plan.ts` L1；`src/lib/imagegen/capabilities.ts` L3；`src/lib/video/frozen-capability-schema.ts` L4。

### `src/lib/model-config/execution-fetch.ts`

- 分类：core；行数：44；SHA256：`8f231cf734c0f85e698110f5569dd54a57981ac7f6279522b8b708ddc833d73c`。
- 导出：`executionFetch` L15；`channelRoutingFetch` L38；`stageRoutingFetch` L41。
- 函数/类型：`executionFetch` L15–32；`executionTransport` L33–37；`channelRoutingFetch` L38–40；`stageRoutingFetch` L41–43。
- 仓内依赖：`src/lib/model-config/image-plan-runtime.ts` L1；`src/lib/model-config/local-image-rejection.ts` L2；`src/lib/model-config/types.ts` L3；`src/lib/model-config/chat-completion-response.ts` L5；`src/lib/model-config/context.ts` L6；`src/lib/model-config/schema.ts` L7；`src/lib/model-health/observe.ts` L8；`src/lib/model-config/execution-transport.ts` L9；`src/lib/model-config/channel-routing.ts` L10；`src/lib/model-config/stage-routing-policy.ts` L11；`src/lib/saas/creation-writer.ts` L26。

### `src/lib/model-config/execution-projections.ts`

- 分类：core；行数：60；SHA256：`fa8804f73f1aa09256d972dbc3678f7a91eaa67d78052a1c9ecc0f0967e15d67`。
- 导出：`createExecutionProjectionService` L15。
- 函数/类型：`Dependencies` L13–13；`createExecutionProjectionService` L15–59。
- 仓内依赖：`src/lib/billing/types.ts` L4；`src/lib/model-config/credential-reader.ts` L5；`src/lib/model-config/router-client.ts` L6；`src/lib/model-config/projection.ts` L7；`src/lib/model-config/runtime-schema.ts` L8；`src/lib/model-config/snapshot-value.ts` L9；`src/lib/model-config/schema.ts` L10；`src/lib/model-config/types.ts` L11。

### `src/lib/model-config/execution-services.ts`

- 分类：core；行数：37；SHA256：`71f996103bdf565507b65cd34b13a033be5212a022d9ca66ca11526142078015`。
- 导出：`getModelExecutionServices` L36。
- 函数/类型：`assemble` L12–33；`getModelExecutionServices` L36–36。
- 仓内依赖：`src/platform/db/pool.ts` L2；`src/lib/billing/frozen-config.ts` L3；`src/lib/model-config/credential-reader.ts` L4；`src/lib/model-config/execution-projections.ts` L5；`src/lib/model-config/environment.ts` L6；`src/lib/model-config/published.ts` L7；`src/lib/model-config/router-client.ts` L8；`src/lib/model-config/types.ts` L9；`src/lib/billing/runtime.ts` L29。

### `src/lib/model-config/execution-transport.ts`

- 分类：core；行数：130；SHA256：`27a3a750eac94425ba13134a8f111cc3ff83887ed77d63d06663bfa15bfb296c`。
- 导出：`providerExecutionTransport` L18。
- 函数/类型：`providerExecutionTransport` L18–96；`flowImageFetch` L98–129。
- 仓内依赖：`src/lib/model-config/local-image-rejection.ts` L1；`src/lib/model-config/image-plan-runtime.ts` L2；`src/lib/model-config/image-parameter-plan.ts` L3；`src/lib/model-config/apimart-image-policy.ts` L5；`src/lib/imagegen/context.ts` L6；`src/lib/imagegen/parameters.ts` L7；`src/lib/imagegen/capabilities.ts` L8；`src/lib/model-config/apimart-preset.ts` L9；`src/lib/model-config/context.ts` L10；`src/lib/model-config/transport.ts` L11；`src/lib/model-config/schema.ts` L12；`src/lib/model-config/types.ts` L13；`src/lib/model-config/resolution-policy.ts` L14；`src/lib/model-config/quality-policy.ts` L15；`src/lib/model-config/reverse-hub-images.ts` L16；`src/lib/new-api-image.ts` L118。

### `src/lib/model-config/execution.ts`

- 分类：core；行数：201；SHA256：`cb4abe9ce97ac3764537e961a4d18801f6c309eef90b2040e5e640aeb91a7d37`。
- 导出：`ExecutionModel` L26；`ExecutionConnection` L27；`createModelExecutor` L30；`getModelExecutor` L190；`withExecutionModel` L196；`withFrozenExecutionBundle` L197。
- 函数/类型：`ExecutionModel` L26–26；`ExecutionConnection` L27–27；`Dependencies` L28–28；`createModelExecutor` L30–188；`getModelExecutor` L190–195；`withExecutionModel` L196–196；`withFrozenExecutionBundle` L197–200。
- 仓内依赖：`src/lib/model-config/public-identity.ts` L1；`src/lib/model-config/snapshot-value.ts` L2；`src/lib/model-config/image-parameter-plan.ts` L3；`src/lib/model-config/resolution-fallback.ts` L4；`src/lib/model-config/apimart-image-policy.ts` L5；`src/lib/model-config/frontend-selection.ts` L7；`src/lib/imagegen/capabilities.ts` L8；`src/lib/model-config/selection-policy.ts` L9；`src/lib/billing/types.ts` L10；`src/lib/model-config/credentials.ts` L11；`src/lib/model-config/runtime.ts` L12；`src/lib/model-config/simulation.ts` L13；`src/lib/model-config/bindings.ts` L14；`src/lib/model-config/schema.ts` L15；`src/lib/model-config/types.ts` L16；`src/lib/model-config/context.ts` L17；`src/lib/model-config/clients.ts` L18；`src/lib/model-config/business.ts` L19；`src/lib/model-config/image-preset.ts` L20；`src/lib/model-config/model-selection.ts` L21；`src/lib/model-config/prepared-image-contract.ts` L22；`src/lib/video/frozen-capability.ts` L23；`src/lib/video/frozen-capability-schema.ts` L24；`src/lib/model-config/execution-contract.ts` L29；`src/lib/model-config/execution-services.ts` L191；`src/lib/billing/frozen-config.ts` L198。

### `src/lib/model-config/feature-availability.ts`

- 分类：core；行数：28；SHA256：`cba0c2a98b7a450a414f3193c7dbda8ad8a8a107c1e6be26316d56fd89d727ad`。
- 导出：`FeatureExecutionBlock` L8；`featureExecutionBlock` L11；`featureExecutionMessage` L20。
- 函数/类型：`ExecutionCatalog` L1–6；`FeatureExecutionBlock` L8–8；`featureExecutionBlock` L11–18；`featureExecutionMessage` L20–27。
- 仓内依赖：无静态仓内导入。

### `src/lib/model-config/feature-catalog-browser.ts`

- 分类：core；行数：62；SHA256：`e706a1112e94299380f1eb4f7ecf43d51917b24d73bf5cca9a6e5c6d67e86eb4`。
- 导出：`FEATURE_MODEL_SELECTION` L8；`activeFeatureCatalog` L54；`activateFeatureCatalogIdentity` L57；`currentFeatureCatalogScope` L61。
- 函数/类型：`reloadObserved` L40–40；`reloadOnReturn` L43–43；`synchronize` L44–44；`install` L45–53；`activeFeatureCatalog` L54–54；`activateFeatureCatalogIdentity` L57–60。
- 仓内依赖：`src/lib/supabase.ts` L2；`src/lib/saas/workspace-client.ts` L3；`src/lib/model-config/public-client.ts` L4；`src/lib/model-config/feature-catalog.ts` L5；`src/lib/billing/rules/registry.ts` L6。

### `src/lib/model-config/feature-catalog.ts`

- 分类：core；行数：96；SHA256：`c780e9fb9d7b513f9670c1994850d4a1087e63bc7291005ff3bb55c0f0313072`。
- 导出：`FeatureCatalog` L6；`FeatureCatalogScope` L7；`FeatureCatalogSnapshot` L8；`EMPTY_FEATURE_CATALOG` L9；`featureCatalogScopeKey` L10；`createFeatureCatalog` L23。
- 函数/类型：`FeatureCatalog` L6–6；`FeatureCatalogScope` L7–7；`FeatureCatalogSnapshot` L8–8；`Ports` L11–18；`createFeatureCatalog` L23–95；`activate` L30–36；`chosen` L37–42；`accept` L43–60；`load` L61–70；`ensure` L71–78；`select` L79–87。
- 仓内依赖：`src/lib/model-config/public-identity.ts` L1；`src/lib/billing/rules/registry.ts` L2；`src/lib/image-model-routing.ts` L3；`src/lib/model-config/selection-policy.ts` L4。

### `src/lib/model-config/feature-client.ts`

- 分类：core；行数：29；SHA256：`38c966ad777ac8cb3dc382abfa84e4d9920de1eec9c7f3c75be72328ac883c8f`。
- 导出：`ensureFeatureModelSelection` L11；`chosenFeatureModel` L12；`featureModelManaged` L13；`selectFeatureModel` L14；`useFeatureCatalogScope` L15；`useFeatureModels` L18。
- 函数/类型：`useFeatureCatalogScope` L15–17；`useFeatureModels` L18–28。
- 仓内依赖：`src/lib/billing/rules/registry.ts` L3；`src/lib/model-config/feature-catalog.ts` L4；`src/lib/model-config/feature-catalog-browser.ts` L5；`src/lib/model-config/feature-catalog.ts` L6；`src/lib/model-config/feature-catalog-browser.ts` L7；`src/lib/model-config/feature-catalog-browser.ts` L8。

### `src/lib/model-config/feature-model-policy.ts`

- 分类：core；行数：46；SHA256：`2ad043a1a96af48d4e64a76ca67704158c0b9bf54cf56e5e6425d873bf096499`。
- 导出：`FEATURE_BINDINGS` L8；`modelAllowedForFeature` L17；`featureDefaultModel` L21；`upstreamSupportsFeature` L26；`compatiblePublicModels` L32；`assertToolScope` L41。
- 函数/类型：`modelAllowedForFeature` L17–19；`featureDefaultModel` L21–24；`upstreamSupportsFeature` L26–30；`compatiblePublicModels` L32–39；`assertToolScope` L41–45。
- 仓内依赖：`src/lib/billing/rules/registry.ts` L1；`src/lib/model-config/bindings.ts` L2；`src/lib/model-config/channel-policy.ts` L3；`src/lib/model-config/types.ts` L4。

### `src/lib/model-config/feature-path.ts`

- 分类：core；行数：19；SHA256：`a6f526e31dcda046047bdf791eb877f1d178a8c5bba3c010549fb89347800c84`。
- 导出：`featureForPath` L10；`featureForRequest` L16。
- 函数/类型：`featureForPath` L10–13；`featureForRequest` L16–18。
- 仓内依赖：`src/lib/billing/rules/registry.ts` L1。

### `src/lib/model-config/frame-fallback.ts`

- 分类：core；行数：44；SHA256：`3c70e52545a22594041c7424e0330f57688f963b89e9dfa85d17c129d116532f`。
- 导出：`ImageFrameChoice` L11；`nearestImageRatios` L15；`resolveImageFrame` L21。
- 函数/类型：`ImageFrameChoice` L11–11；`nearestImageRatios` L15–18；`resolveImageFrame` L21–43。
- 仓内依赖：`src/lib/model-config/public-identity.ts` L1；`src/lib/model-config/types.ts` L2；`src/lib/model-config/channel-policy.ts` L3；`src/lib/model-config/business.ts` L4；`src/lib/model-config/image-preset.ts` L5；`src/lib/model-config/resolution-fallback.ts` L6；`src/lib/model-config/simulation.ts` L7；`src/lib/imagegen/request-admission.ts` L8；`src/lib/imagegen/ratio-support.ts` L9。

### `src/lib/model-config/frontend-selection.ts`

- 分类：core；行数：15；SHA256：`8b92492860a917f0f13c8484016dc1f3edd81816a2b8994e1ae1c862c785b851`。
- 导出：`FrontendModelSelection` L3；`frontendModelSelection` L6。
- 函数/类型：`FrontendModelSelection` L3–3；`frontendModelSelection` L6–14。
- 仓内依赖：`src/lib/model-config/types.ts` L1；`src/lib/image-model-routing.ts` L2。

### `src/lib/model-config/gpt26-onboarding.ts`

- 分类：core；行数：26；SHA256：`1319f53e449ce0863bd76128525402d58828b12c8991a292a81abc41bfef56cc`。
- 导出：`GPT26_PROFILES` L5；`gpt26Upstream` L11。
- 函数/类型：`gpt26Upstream` L11–25。
- 仓内依赖：`docs/providers/apib-image26-preparation-20261110.json` L1；`src/lib/model-config/types.ts` L2。

### `src/lib/model-config/image-mapping-editor.ts`

- 分类：core；行数：29；SHA256：`303ccb2027b6fe32ec766af8c203a73dcd45da8bc4514d3f3df220d22c02f97c`。
- 导出：`imageMappingEditorSchema` L7；`ImageMappingEditorInput` L8；`applyImageMappingEditor` L9。
- 函数/类型：`ImageMappingEditorInput` L8–8；`applyImageMappingEditor` L9–28。
- 仓内依赖：`src/lib/model-config/image-parameter-plan.ts` L2；`src/lib/model-config/quality-policy.ts` L3；`src/lib/model-config/resolution-policy.ts` L4；`src/lib/model-config/types.ts` L5；`src/lib/model-config/parameter-contract.ts` L6。

### `src/lib/model-config/image-parameter-plan.ts`

- 分类：core；行数：99；SHA256：`8924358c728d6a889c096f99a97dce8229734dea202bdccdd32c46885b8ac5d3`。
- 导出：`imageParameterSelectionSchema` L12；`ImageParameterSelection` L13；`imageParameterPlanSchema` L14；`ImageParameterPlan` L15；`imageParameterPlansSchema` L16；`ImageParameterPlans` L17；`compileImageParameterPlan` L24；`applyImageParameterPlan` L76；`configuredImageCapabilities` L84；`imagePlanSelection` L90。
- 函数/类型：`ImageParameterSelection` L13–13；`ImageParameterPlan` L15–15；`ImageParameterPlans` L17–17；`compileImageParameterPlan` L24–72；`applyImageParameterPlan` L76–80；`configuredImageCapabilities` L84–88；`imagePlanSelection` L90–98。
- 仓内依赖：`src/lib/model-config/apimart-image-policy.ts` L2；`src/lib/model-config/types.ts` L3；`src/lib/model-config/quality-policy.ts` L4；`src/lib/model-config/parameter-contract.ts` L5；`src/lib/model-config/resolution-policy.ts` L6；`src/lib/imagegen/request-size.ts` L7；`src/lib/imagegen/capabilities.ts` L8；`src/lib/imagegen/types.ts` L9。

### `src/lib/model-config/image-plan-runtime.ts`

- 分类：core；行数：34；SHA256：`621e93f88496fb787bf9e9ed533b151b342bb7ba82a1a65b6972e597963a6a02`。
- 导出：`CUTOUT_TRANSPARENCY_UNMAPPED` L13；`assertCutoutTransparencyMapped` L15；`executionImageParameterPlan` L22。
- 函数/类型：`cutoutScope` L14–14；`assertCutoutTransparencyMapped` L15–18；`executionImageParameterPlan` L22–33。
- 仓内依赖：`src/lib/model-config/image-parameter-plan.ts` L2；`src/lib/model-config/context.ts` L3；`src/lib/imagegen/context.ts` L4；`src/lib/image-gateway.ts` L5；`src/lib/model-config/types.ts` L6。

### `src/lib/model-config/image-preparation.ts`

- 分类：core；行数：83；SHA256：`ffd60d1561e3252b8a51f96dee1e8b1762eba142d1f1d754da68ef683652559b`。
- 导出：`ImagePreparationInput` L20；`prepareImageOperation` L24。
- 函数/类型：`ImagePreparationInput` L20–20；`imageRatio` L21–21；`prepareImageOperation` L24–82。
- 仓内依赖：`src/lib/model-config/public-identity.ts` L1；`src/lib/model-config/resolution-fallback.ts` L2；`src/lib/model-config/image-quality-selection.ts` L3；`src/lib/model-config/model-selection.ts` L4；`src/lib/model-config/channel-policy.ts` L5；`src/lib/model-config/resolution-options.ts` L6；`src/lib/model-config/selection-policy.ts` L7；`src/lib/model-config/feature-model-policy.ts` L8；`src/lib/model-config/image-preset.ts` L9；`src/lib/mock-data.ts` L10；`src/lib/image-model-routing.ts` L11；`src/lib/imagegen/legacy-intent.ts` L12；`src/lib/model-config/types.ts` L13；`src/lib/model-config/bindings.ts` L14；`src/lib/billing/types.ts` L15；`src/lib/imagegen/types.ts` L16；`src/lib/model-config/prepared-image-contract.ts` L17；`src/lib/model-config/prepared-image-contract.ts` L18。

### `src/lib/model-config/image-preset.ts`

- 分类：core；行数：117；SHA256：`de50bdae4541dc6cc5050b68484e1c02d5d91252f89a2ee3d123e4f30d1e5a6b`。
- 导出：`imagePresetSchema` L13；`ImagePreset` L32；`ImageParameters` L33；`DISPLAY_QUALITIES` L34；`initializeImagePreset` L37；`existingCreditConversion` L44；`isDefaultImageFeature` L52；`selectedImagePreset` L56；`presetPublicId` L62；`effectiveImageParameters` L63；`validateImagePreset` L77；`installImagePresetAliases` L99。
- 函数/类型：`ImagePreset` L32–32；`ImageParameters` L33–33；`initializeImagePreset` L37–43；`existingCreditConversion` L44–51；`isDefaultImageFeature` L52–55；`selectedImagePreset` L56–61；`presetPublicId` L62–62；`effectiveImageParameters` L63–76；`validateImagePreset` L77–98；`installImagePresetAliases` L99–116。
- 仓内依赖：`src/lib/model-config/types.ts` L2；`src/lib/model-config/types.ts` L3；`src/lib/model-config/business-schema.ts` L4；`src/lib/model-config/feature-model-policy.ts` L5；`src/lib/billing/types.ts` L6；`src/lib/billing/types.ts` L7；`src/lib/model-config/bindings.ts` L8。

### `src/lib/model-config/image-quality-selection.ts`

- 分类：core；行数：26；SHA256：`45ad1ab08af6cfda5d1ffe2410f76a9f5b1ae470750196f8ff042c6bb72389fb`。
- 导出：`selectImageQuality` L11。
- 函数/类型：`selectImageQuality` L11–25。
- 仓内依赖：`src/lib/model-config/public-identity.ts` L1；`src/lib/image-quality.ts` L2；`src/lib/model-config/business.ts` L3；`src/lib/model-config/channel-policy.ts` L4；`src/lib/model-config/cutout-quality.ts` L5；`src/lib/model-config/image-preset.ts` L6；`src/lib/model-config/quality-policy.ts` L7；`src/lib/model-config/types.ts` L8。

### `src/lib/model-config/image-quality.ts`

- 分类：core；行数：27；SHA256：`acbdf7828eadaf83315ede3714bacc2da3e01658f8530258b88d4c58ca524c5d`。
- 导出：`resolveConfiguredImageQuality` L6。
- 函数/类型：`resolveConfiguredImageQuality` L6–26。
- 仓内依赖：`src/lib/image-quality.ts` L2；`src/lib/model-config/context.ts` L3；`src/lib/model-config/quality-policy.ts` L4；`src/lib/image-quality.ts` L5。

### `src/lib/model-config/image-rejection-evidence.ts`

- 分类：core；行数：16；SHA256：`cf9101d3334ca4dc90532196aa145d7e76160c9daa4687b4595a77dc26e5cfd9`。
- 导出：`readImageRejectionEvidence` L8。
- 函数/类型：`readImageRejectionEvidence` L8–15。
- 仓内依赖：`src/platform/db/pool.ts` L2；`src/lib/model-config/image-rejection-policy.ts` L3。

### `src/lib/model-config/image-rejection-policy.ts`

- 分类：core；行数：15；SHA256：`673f1ec80d55a1b1b09d8a732860425c85f0cf85519ea42d32c17fd225e13748`。
- 导出：`ImageRejectionStage` L3；`confirmsImageRejection` L4。
- 函数/类型：`ImageRejectionStage` L3–3；`confirmsImageRejection` L4–14。
- 仓内依赖：无静态仓内导入。

### `src/lib/model-config/image25-price-table.ts`

- 分类：core；行数：126；SHA256：`ba77ebbaf64d8d16024f4f6f2457b7fa2fd4eb4f1b3e7e001a1658a055d03a34`。
- 导出：`IMAGE25_SALE_MULTIPLIER` L4；`IMAGE25_QUALITIES` L5；`IMAGE25_TIERS` L6；`Image25Tier` L7；`Image25Quality` L8；`IMAGE25_NATIVE_MODELS` L9；`usdNanos` L13；`decimalNanos` L22；`TableConversion` L30；`IMAGE25_BUDGET_FX` L42；`validTableConversion` L50；`priceTableConversion` L60；`Image25PriceCell` L73；`Image25PriceRow` L74；`buildImage25PriceTable` L78；`image25TablePayload` L105；`Image25TablePayload` L125。
- 函数/类型：`Image25Tier` L7–7；`Image25Quality` L8–8；`usdNanos` L13–17；`positiveMicros` L18–21；`decimalNanos` L22–26；`round` L27–29；`TableConversion` L30–39；`validTableConversion` L50–58；`priceTableConversion` L60–72；`Image25PriceCell` L73–73；`Image25PriceRow` L74–77；`buildImage25PriceTable` L78–104；`image25TablePayload` L105–124；`Image25TablePayload` L125–125。
- 仓内依赖：`docs/apimart-image25-pricing-20261008.json` L1。

### `src/lib/model-config/imagegen-policy.ts`

- 分类：core；行数：18；SHA256：`ba331d32b20eefe68b7dc9e7ed1971f42568b88d86b33e39b3822a4d39ef5cd4`。
- 导出：`imagegenRoutePolicySchema` L5；`ImagegenRoutePolicy` L8；`applyImagegenModelParameters` L9。
- 函数/类型：`ImagegenRoutePolicy` L8–8；`applyImagegenModelParameters` L9–17。
- 仓内依赖：`src/lib/imagegen/capabilities.ts` L2；`src/lib/model-config/types.ts` L3；`src/lib/model-config/types.ts` L4。

### `src/lib/model-config/legacy-router.ts`

- 分类：core；行数：46；SHA256：`7b4841fbcf76229f9a9b790802c0547c478e332c57f23c7c6985c8ca8f6888b3`。
- 导出：`importLegacyRouter` L18。
- 函数/类型：`importLegacyRouter` L18–45。
- 仓内依赖：`src/lib/model-config/credentials.ts` L5；`src/lib/model-config/router-client.ts` L6；`src/lib/model-config/types.ts` L7。

### `src/lib/model-config/legacy-vision.ts`

- 分类：core；行数：7；SHA256：`692f4144a59afc01045ce4aefcb3105c1880f38277f7107503a17218fe3ddf3b`。
- 导出：`legacyAgentVision` L2。
- 函数/类型：`legacyAgentVision` L2–6。
- 仓内依赖：无静态仓内导入。

### `src/lib/model-config/lifecycle.ts`

- 分类：core；行数：44；SHA256：`d11095fe462eb681f6e61e622c808792bf2c78e15550b1cdb8709f80fa7d27b5`。
- 导出：`initializeModelRegistry` L40。
- 函数/类型：`initialize` L15–36；`initializeModelRegistry` L40–43。
- 仓内依赖：`src/platform/db/pool.ts` L2；`src/lib/persistence/schema.ts` L3；`src/lib/model-config/bootstrap.ts` L4；`src/lib/model-config/credentials.ts` L5；`src/lib/model-config/legacy-router.ts` L6；`src/lib/model-config/repository.ts` L7；`src/lib/model-config/router-client.ts` L8；`src/lib/model-config/storage-schema.ts` L9；`src/lib/model-config/environment.ts` L11；`src/lib/model-config/types.ts` L12。

### `src/lib/model-config/local-image-rejection.ts`

- 分类：core；行数：10；SHA256：`8ae149d6c45630b66555d8f9e41aab8d974dfa9acfaf5650ec98fc47e2109a22`。
- 导出：`localImageRejectionResponse` L3；`localImageRejection` L9。
- 函数/类型：`localImageRejectionResponse` L3–8。
- 仓内依赖：`src/lib/model-config/types.ts` L1。

### `src/lib/model-config/management-access.ts`

- 分类：core；行数：149；SHA256：`d7ca3654b7da52cf4495913b132cc200f348a7db813cff0f932514c4fe90d483`。
- 导出：`createModelManagementHandler` L27；`modelManagementHandler` L148。
- 函数/类型：`Administration` L24–24；`createModelManagementHandler` L27–147。
- 仓内依赖：`src/lib/model-config/draft-retention.ts` L1；`src/lib/model-config/video-capability-review.ts` L2；`src/lib/bi/access.ts` L7；`src/lib/supplier-cost/io.ts` L8；`src/lib/model-config/server.ts` L9；`src/lib/model-config/catalog-store.ts` L10；`src/lib/billing/rules/registry.ts` L11；`src/lib/billing/types.ts` L12；`src/lib/model-config/management-pricing.ts` L13；`src/lib/model-config/snapshot-value.ts` L14；`src/lib/model-config/schema.ts` L15；`src/lib/model-config/projection.ts` L16；`src/lib/model-config/types.ts` L17；`src/lib/model-config/availability.ts` L18；`src/lib/model-config/management-input.ts` L20；`src/lib/model-config/management-locks.ts` L21；`src/lib/model-config/management-read.ts` L22；`src/lib/model-config/management-actions.ts` L23。

### `src/lib/model-config/management-actions.ts`

- 分类：core；行数：97；SHA256：`d6183aa2e5c4097f36a1e47ba03881109b7562cbb45b33a2c69217dab520ecb2`。
- 导出：`applyManagementConfigAction` L28。
- 函数/类型：`ConfigAction` L25–25；`applyManagementConfigAction` L28–96。
- 仓内依赖：`src/lib/model-config/management-identity.ts` L1；`src/lib/model-config/onboarding.ts` L2；`src/lib/model-config/image-mapping-editor.ts` L4；`src/lib/model-config/resolution-policy.ts` L5；`src/lib/model-config/imagegen-policy.ts` L6；`src/lib/supplier-models/imagegen-access.ts` L7；`src/lib/supplier-models/resolution-access.ts` L8；`src/lib/model-config/resolution-options.ts` L9；`src/lib/model-config/video-policy.ts` L10；`src/lib/model-config/video-capability-review.ts` L11；`src/lib/model-config/channel-policy.ts` L12；`src/lib/supplier-models/quality-access.ts` L13；`src/lib/model-config/catalog-store.ts` L14；`src/lib/model-config/public-catalog.ts` L15；`src/lib/model-config/feature-model-policy.ts` L16；`src/lib/model-config/bindings.ts` L17；`src/lib/model-config/management.ts` L18；`src/lib/model-config/schema.ts` L19；`src/lib/model-config/types.ts` L20；`src/lib/image-model-legacy-catalog.ts` L21；`src/lib/model-config/types.ts` L22；`src/lib/model-config/management-input.ts` L23；`src/lib/model-config/management-read.ts` L24。

### `src/lib/model-config/management-identity.ts`

- 分类：core；行数：38；SHA256：`f1b89c008c6f941cdf9fba53073cafd1663bc4c6c38dd043951caa91b9a3f8d7`。
- 导出：`editManagedModelIdentity` L8。
- 函数/类型：`editManagedModelIdentity` L8–37。
- 仓内依赖：`src/lib/image-model-routing.ts` L1；`src/lib/model-config/management.ts` L2；`src/lib/model-config/types.ts` L3。

### `src/lib/model-config/management-input.ts`

- 分类：core；行数：43；SHA256：`af0d88dae5df5626ca68319b108285fbaedd250225c879f4e8dfa9f6deca7228`。
- 导出：`identifier` L16；`managementInput` L20；`ManagementInput` L41；`ManagementAdministration` L42。
- 函数/类型：`ManagementInput` L41–41；`ManagementAdministration` L42–42。
- 仓内依赖：`src/lib/model-config/image-mapping-editor.ts` L2；`src/lib/model-config/resolution-policy.ts` L3；`src/lib/model-config/imagegen-policy.ts` L4；`src/lib/video/capability-schema.ts` L5；`src/lib/model-config/video-policy.ts` L6；`src/lib/model-config/channel-policy.ts` L7；`src/lib/model-config/management.ts` L8；`src/lib/model-config/quality-policy.ts` L9；`src/lib/billing/rules/registry.ts` L10；`src/lib/model-config/onboarding-schema.ts` L12；`src/lib/model-config/server.ts` L13。

### `src/lib/model-config/management-locks.ts`

- 分类：core；行数：54；SHA256：`28eb4eeb3db31cff17bbde815c1c700fccc32579c17ee116fa5077917a35c950`。
- 导出：`acquireManagementMutationTurn` L11；`acquireManagementLock` L35。
- 函数/类型：`ManagementMutationTurn` L6–6；`acquireManagementMutationTurn` L11–26；`managementLockClient` L27–34；`acquireManagementLock` L35–53。
- 仓内依赖：`src/lib/model-config/types.ts` L3。

### `src/lib/model-config/management-pricing.ts`

- 分类：core；行数：77；SHA256：`7ee5ba59688021a1fdda011fe2a26871657a0cd7a92aaa63f9e901d0fc6e61c2`。
- 导出：`CreditSourceKind` L17；`CreditSource` L18；`creditSource` L22；`modelCreditView` L27；`managedModelPriceViews` L36；`modelCreditGrid` L39；`editManagedModelCredits` L51。
- 函数/类型：`CreditSourceKind` L17–17；`CreditSource` L18–18；`creditSource` L22–26；`modelCreditView` L27–35；`managedModelPriceViews` L36–38；`modelCreditGrid` L39–50；`editManagedModelCredits` L51–76。
- 仓内依赖：`src/lib/model-config/billing-identity.ts` L1；`src/lib/billing/types.ts` L4；`src/lib/billing/quote.ts` L5；`src/lib/billing/rules/schema.ts` L6；`src/lib/billing/rules/registry.ts` L7；`src/lib/model-config/types.ts` L8；`src/lib/model-config/business-billing.ts` L9；`src/lib/model-config/credit-overrides.ts` L10；`src/lib/model-config/management.ts` L11；`src/lib/model-config/public-catalog.ts` L12；`src/lib/model-config/image-preset.ts` L13；`src/lib/image-model-routing.ts` L14；`src/lib/model-config/business.ts` L15。

### `src/lib/model-config/management-provider-directory.ts`

- 分类：core；行数：56；SHA256：`011b5a39209f2b4b0c4d5b8bc6dba4175a06153e7aa115f109471798a0f4913a`。
- 导出：`createManagementProviderDirectory` L13。
- 函数/类型：`DirectoryPorts` L4–9；`createManagementProviderDirectory` L13–55；`cancel` L17–22；`pause` L23–30；`refresh` L31–53。
- 仓内依赖：`src/lib/model-config/catalog-store.ts` L1；`src/lib/model-config/management-session-contract.ts` L2。

### `src/lib/model-config/management-read.ts`

- 分类：core；行数：49；SHA256：`9dd806d9d322629832b19ef45721d934acc121eb60068ff04dfc3513538c9e03`。
- 导出：`managementRows` L19；`readManagementView` L22。
- 函数/类型：`managementRows` L19–21；`readManagementView` L22–48。
- 仓内依赖：`src/lib/model-config/public-catalog.ts` L2；`src/lib/supplier-models/image-model-metadata.ts` L3；`src/lib/supplier-models/imagegen-access.ts` L4；`src/lib/supplier-models/resolution-access.ts` L5；`src/lib/video/frozen-capability.ts` L6；`src/lib/model-config/channel-scheduler.ts` L7；`src/lib/model-config/capacity.ts` L8；`src/lib/supplier-models/quality-access.ts` L9；`src/lib/model-config/catalog-store.ts` L10；`src/lib/model-config/feature-model-policy.ts` L11；`src/lib/model-config/bindings.ts` L12；`src/lib/model-config/management.ts` L13；`src/lib/model-config/management-pricing.ts` L14；`src/lib/model-config/types.ts` L15；`src/lib/model-config/management-input.ts` L16；`src/lib/model-config/onboarding.ts` L17。

### `src/lib/model-config/management-session-contract.ts`

- 分类：core；行数：24；SHA256：`0b2f9ec2150822a52c1176b94be14611b135a2c3d1d3894714c461391a854c93`。
- 导出：`ManagementState` L5；`ManagementOperation` L6；`ManagementRequest` L7；`ManagementPublication` L8；`ManagementProjection` L9；`ManagementStorage` L10；`readManagementOperation` L14。
- 函数/类型：`ManagementState` L5–5；`ManagementOperation` L6–6；`ManagementRequest` L7–7；`ManagementPublication` L8–8；`ManagementProjection` L9–9；`ManagementStorage` L10–10；`readManagementOperation` L14–23。
- 仓内依赖：`src/lib/model-config/management.ts` L1；`src/lib/model-config/catalog-store.ts` L2。

### `src/lib/model-config/management-session.ts`

- 分类：core；行数：134；SHA256：`43bd87604efe5ebf559c9da6462e12dd792627a6416aec94e1829f517911115e`。
- 导出：`ManagementSessionPorts` L9；`createModelManagementSession` L33。
- 函数/类型：`Scope` L6–6；`Receipt` L7–7；`PublicationCallbacks` L8–8；`ManagementSessionPorts` L9–23；`appliedNotice` L26–29；`createModelManagementSession` L33–133；`load` L46–70；`clearPending` L71–76；`publish` L77–114；`mount` L115–128；`operation` L129–131。
- 仓内依赖：`src/lib/model-config/management-provider-directory.ts` L1；`src/lib/model-config/management-session-contract.ts` L2；`src/lib/model-config/catalog-store.ts` L4。

### `src/lib/model-config/management.ts`

- 分类：core；行数：225；SHA256：`c297065086791a74c69610c5fb043d473a7d52b24b4e970370128e66f552fab5`。
- 导出：`MODEL_MANAGEMENT_PROTOCOLS` L13；`featureNames` L14；`ManagedModelRow` L25；`ManagedModelCandidate` L40；`ManagedModelCreditGrid` L41；`ModelManagementState` L42；`managedModelCandidates` L48；`managedModelRows` L54；`applyModelQualityParameters` L105；`applyModelToolScope` L128；`orderManagedModels` L164；`switchManagedModel` L181；`renameManagedModel` L193；`assertManagedTarget` L202。
- 函数/类型：`ManagedModelRow` L25–39；`ManagedModelCandidate` L40–40；`ManagedModelCreditGrid` L41–41；`ModelManagementState` L42–46；`managedModelCandidates` L48–51；`managedModelRows` L54–103；`applyModelQualityParameters` L105–117；`managedModelScopeOptions` L120–125；`applyModelToolScope` L128–161；`orderManagedModels` L164–178；`switchManagedModel` L181–191；`renameManagedModel` L193–201；`assertManagedTarget` L202–223。
- 仓内依赖：`src/lib/model-config/channel-policy.ts` L1；`src/lib/model-config/types.ts` L2；`src/lib/model-config/types.ts` L3；`src/lib/model-config/feature-model-policy.ts` L4；`src/lib/model-config/bindings.ts` L5；`src/lib/image-model-routing.ts` L6；`src/lib/model-config/public-catalog.ts` L7；`src/lib/model-config/selection-policy.ts` L8；`src/lib/billing/rules/registry.ts` L9；`src/lib/model-config/resolution-policy.ts` L10；`src/lib/model-config/quality-policy.ts` L11。

### `src/lib/model-config/model-selection.ts`

- 分类：core；行数：23；SHA256：`8c95d90bbcee348ce2b23f7b38bcc00c10409c076ae85c17f1067ac34195fcde`。
- 导出：`selectFeatureModel` L10。
- 函数/类型：`selectFeatureModel` L10–22。
- 仓内依赖：`src/lib/model-config/public-identity.ts` L1；`src/lib/model-config/bindings.ts` L2；`src/lib/model-config/business.ts` L3；`src/lib/model-config/image-preset.ts` L4；`src/lib/model-config/selection-policy.ts` L5；`src/lib/model-config/feature-model-policy.ts` L6；`src/lib/model-config/types.ts` L7。

### `src/lib/model-config/onboarding-access.ts`

- 分类：core；行数：61；SHA256：`4ad51eca1571a84db5aad5432e45f64f171bf81fbf73c6bf0e7f03cc6d5e9b9d`。
- 导出：`createOnboardingHandler` L14；`modelOnboardingHandler` L60。
- 函数/类型：`createOnboardingHandler` L14–59。
- 仓内依赖：`src/lib/bi/access.ts` L4；`src/lib/model-config/server.ts` L5；`src/lib/model-config/onboarding-schema.ts` L6；`src/lib/model-config/onboarding.ts` L7；`src/lib/model-config/catalog-store.ts` L8；`src/lib/model-config/schema.ts` L9；`src/lib/model-config/types.ts` L10；`src/lib/supplier-cost/io.ts` L11；`src/lib/model-config/management-input.ts` L12。

### `src/lib/model-config/onboarding-contract.ts`

- 分类：core；行数：18；SHA256：`d7c2a4f730254f1b9c096aa588fc1943ff5d832652d12eaa76514a361ebc2d82`。
- 导出：`OnboardingPrice` L5；`OnboardingEntry` L6；`OnboardingInput` L12；`OnboardingDraft` L13；`OnboardingView` L14。
- 函数/类型：`OnboardingPrice` L5–5；`OnboardingEntry` L6–11；`OnboardingInput` L12–12；`OnboardingDraft` L13–13；`OnboardingView` L14–17。
- 仓内依赖：`src/lib/billing/rules/registry.ts` L1；`src/lib/billing/types.ts` L2；`src/lib/model-config/types.ts` L3。

### `src/lib/model-config/onboarding-schema.ts`

- 分类：core；行数：15；SHA256：`e7d077fa9ceada563c484616d37771805f05abbdeba9d433fd4d6712028381c4`。
- 导出：`onboardingFields` L14。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：`src/lib/model-config/schema.ts` L2；`src/lib/billing/rules/registry.ts` L3。

### `src/lib/model-config/onboarding.ts`

- 分类：core；行数：97；SHA256：`9b2859544d0bc289d7595b2bfdaba25d3ba805b371bc636b56f55b049079a32d`。
- 导出：`planModelOnboarding` L29；`onboardingView` L87；`onboardingDraftEntries` L88。
- 函数/类型：`copiedPrice` L15–25；`planModelOnboarding` L29–85；`onboardingView` L87–87；`onboardingDraftEntries` L88–96。
- 仓内依赖：`src/lib/billing/rules/registry.ts` L3；`src/lib/billing/types.ts` L4；`src/lib/model-config/types.ts` L5；`src/lib/model-config/onboarding-contract.ts` L6；`src/lib/image-model-routing.ts` L7；`src/lib/model-config/feature-model-policy.ts` L8；`src/lib/model-config/management-pricing.ts` L9；`src/lib/model-config/image-parameter-plan.ts` L10；`src/lib/model-config/catalog-store.ts` L11；`src/lib/model-config/public-catalog.ts` L12。

### `src/lib/model-config/parameter-contract.ts`

- 分类：core；行数：20；SHA256：`657ca8c7d535fdd010f2d52a91463ddb514c102fc9c909b226fc442d29181625`。
- 导出：`PARAMETER_CONTRACTS` L14；`ParameterContract` L15；`conventionalContract` L17。
- 函数/类型：`ParameterContract` L15–15；`conventionalContract` L17–19。
- 仓内依赖：无静态仓内导入。

### `src/lib/model-config/pi.ts`

- 分类：core；行数：19；SHA256：`0cb6ad3f0bc317699f188efe5147b00e2f5686fc32b3288fb4c4f4c6ea23b01b`。
- 导出：`configuredPiModels` L6。
- 函数/类型：`configuredPiModels` L6–18。
- 仓内依赖：`src/lib/model-config/context.ts` L2；`src/lib/model-config/execution-fetch.ts` L3。

### `src/lib/model-config/prepared-image-contract.ts`

- 分类：core；行数：13；SHA256：`5e91f9d3bff9818dd2eb35757af0595a227fad01640e74c06e7e324b8fcdda70`。
- 导出：`preparedImageSchema` L6；`PreparedImageOperation` L7；`validatePreparedImage` L8。
- 函数/类型：`PreparedImageOperation` L7–7；`validatePreparedImage` L8–12。
- 仓内依赖：`src/lib/model-config/execution-contract.ts` L2；`src/lib/model-config/types.ts` L3；`src/lib/billing/types.ts` L4。

### `src/lib/model-config/projection.ts`

- 分类：core；行数：91；SHA256：`586bb44f61c8dd1eb77917c16b86924fff9c7ae880bed2c2cbe8d0a1edd38cbf`。
- 导出：`MoneyPrice` L9；`RouterRoute` L10；`RouterPayload` L11；`RouterProjection` L12；`modelCostRate` L13；`monetaryCost` L20；`compileRouterProjection` L31。
- 函数/类型：`MoneyPrice` L9–9；`RouterRoute` L10–10；`RouterPayload` L11–11；`RouterProjection` L12–12；`modelCostRate` L13–19；`monetaryCost` L20–30；`compileRouterProjection` L31–90。
- 仓内依赖：`src/lib/model-config/apimart-image-policy.ts` L1；`src/lib/billing/types.ts` L4；`src/lib/model-config/snapshot-value.ts` L5；`src/lib/model-config/schema.ts` L6；`src/lib/model-config/types.ts` L7。

### `src/lib/model-config/provider-activity-contracts.ts`

- 分类：core；行数：14；SHA256：`5df584553a0f465d94456f2f1d4d0a15857238b4a9eab36f36cf33759027f2ad`。
- 导出：`activityErrorMessages` L1；`ActivityErrorCode` L6；`AcceptanceWindow` L7；`ProviderActivity` L8；`ProviderActivityOverview` L13。
- 函数/类型：`ActivityErrorCode` L6–6；`AcceptanceWindow` L7–7；`ProviderActivity` L8–12；`ProviderActivityOverview` L13–13。
- 仓内依赖：无静态仓内导入。

### `src/lib/model-config/provider-activity.ts`

- 分类：core；行数：72；SHA256：`78bbbb2bd998d08fb53be249d5d5aa2ee20f29a4b7ec73dddb22b8a6029da56a`。
- 导出：`readProviderActivity` L24。
- 函数/类型：`readOnly` L17–22；`readProviderActivity` L24–71。
- 仓内依赖：`src/lib/model-config/schema.ts` L3；`src/lib/model-config/channel-scheduler.ts` L4；`src/lib/model-config/types.ts` L5；`src/lib/model-config/provider-activity-contracts.ts` L6。

### `src/lib/model-config/provider-balance-access.ts`

- 分类：core；行数：23；SHA256：`1f09450d90e28325220a32c4b692a0e7c6f64fdf4d9057bc180cc2c726e7cab4`。
- 导出：`createProviderOpsHandler` L6；`providerOpsHandler` L22。
- 函数/类型：`createProviderOpsHandler` L6–21。
- 仓内依赖：`src/lib/bi/access.ts` L2；`src/lib/model-config/provider-balance.ts` L3；`src/lib/model-config/provider-balance-contracts.ts` L4。

### `src/lib/model-config/provider-balance-contracts.ts`

- 分类：core；行数：32；SHA256：`68e23197da4e9f6d1a5f4f67432898df4a963e0e2196a409434fbdd2edf6a65e`。
- 导出：`balanceErrorMessages` L4；`BalanceErrorCode` L11；`balanceMeasurementSchema` L12；`BalanceMeasurement` L18；`ProviderBalanceProbe` L19；`ProviderAccountBalance` L23；`ProviderBalanceOverview` L31。
- 函数/类型：`BalanceErrorCode` L11–11；`BalanceMeasurement` L18–18；`ProviderBalanceProbe` L19–22；`ProviderAccountBalance` L23–30；`ProviderBalanceOverview` L31–31。
- 仓内依赖：`src/lib/model-config/provider-activity-contracts.ts` L2。

### `src/lib/model-config/provider-balance.ts`

- 分类：core；行数：166；SHA256：`4f4bdfd3b180cdd63717cb3b76389ccf4a7aa3909a040c9ee21050b5ce3f0389`。
- 导出：`ProviderBalanceAdapter` L18；`documentedBalanceAdapters` L27；`createProviderBalanceService` L60；`ProviderBalanceFailure` L136；`readProviderBalanceCredential` L137；`createPublishedProviderBalanceReader` L141；`providerBalanceOverview` L154。
- 函数/类型：`Provider` L16–16；`ProviderBalanceAdapter` L18–22；`AccountTarget` L45–45；`CacheRecord` L51–51；`Dependencies` L52–57；`createProviderBalanceService` L60–134；`targets` L64–82；`probe` L83–105；`read` L106–126；`ProviderBalanceFailure` L136–136；`readProviderBalanceCredential` L137–140；`createPublishedProviderBalanceReader` L141–152；`providerBalanceOverview` L154–165。
- 仓内依赖：`src/platform/db/pool.ts` L5；`src/lib/settings/repository.ts` L6；`src/lib/settings.ts` L7；`src/lib/settings-secret.ts` L8；`src/lib/supplier-cost/io.ts` L9；`src/lib/model-config/transport.ts` L10；`src/lib/model-config/schema.ts` L11；`src/lib/model-config/provider-activity.ts` L12；`src/lib/model-config/provider-balance-contracts.ts` L13。

### `src/lib/model-config/public-catalog.ts`

- 分类：core；行数：54；SHA256：`a3cb8a00cc878cda47da0a192bf215b61fb72c3f8a2954b95d2d1862fa20b169`。
- 导出：`publicModelCatalog` L13。
- 函数/类型：`publicModelCatalog` L13–53。
- 仓内依赖：`src/lib/imagegen/capabilities.ts` L2；`src/lib/model-config/feature-model-policy.ts` L3；`src/lib/model-config/seedream-preflight.ts` L4；`src/lib/model-config/selection-policy.ts` L5；`src/lib/model-config/bindings.ts` L6；`src/lib/model-config/channel-policy.ts` L7；`src/lib/billing/rules/registry.ts` L8；`src/lib/model-config/types.ts` L9；`src/lib/model-config/image-preset.ts` L10；`src/lib/model-config/quality-policy.ts` L11。

### `src/lib/model-config/public-client.ts`

- 分类：core；行数：53；SHA256：`046171fefed2ddae93059db9465e4b2b2702846a2e0f803d6b69632b38c28c80`。
- 导出：`MODEL_CATALOG_REFRESH` L3；`PublicImageModel` L4；`PublicImageConfiguration` L17；`currentModelCatalogVersion` L27；`rememberModelCatalogVersion` L28；`availableImageQualities` L32。
- 函数/类型：`PublicImageModel` L4–16；`PublicImageConfiguration` L17–25；`rememberModelCatalogVersion` L28–31；`availableImageQualities` L32–52。
- 仓内依赖：`src/lib/image-quality.ts` L1。

### `src/lib/model-config/public-identity.ts`

- 分类：core；行数：18；SHA256：`51aea1f69b7cd4a7da827d13131a03390eb5a5870b8f92d5346d17f7faeb99a1`。
- 导出：`PublicIdentity` L3；`canonicalPublicModelId` L6；`canonicalPublicModelId` L7；`canonicalPublicModelId` L8；`parameterModelIdentity` L15。
- 函数/类型：`PublicIdentity` L3–3；`canonicalPublicModelId` L6–6；`canonicalPublicModelId` L7–7；`canonicalPublicModelId` L8–11；`parameterModelIdentity` L15–17。
- 仓内依赖：`src/lib/model-config/types.ts` L1。

### `src/lib/model-config/publication-result.ts`

- 分类：core；行数：5；SHA256：`5ba47fa684e78b7439a98fa58dd07d08c8f8bd98cbac62d771fe1886299e3915`。
- 导出：`publicationNotStaged` L2。
- 函数/类型：`publicationNotStaged` L2–4。
- 仓内依赖：无静态仓内导入。

### `src/lib/model-config/published-repository.ts`

- 分类：core；行数：33；SHA256：`9163d71a2fbe2857f3cf8245d422c027075857d14a40144f1e5845e0f1c02d5c`。
- 导出：`createPublishedModelReader` L9。
- 函数/类型：`createPublishedModelReader` L9–32。
- 仓内依赖：`src/lib/model-config/schema.ts` L3；`src/lib/model-config/snapshot-value.ts` L4；`src/lib/model-config/types.ts` L5。

### `src/lib/model-config/published.ts`

- 分类：core；行数：22；SHA256：`afea91ad87d4575689bf3a8ea0d2b66842e0638580a04430e6fd222bfb0a3d67`。
- 导出：`readPublishedModelSnapshot` L10。
- 函数/类型：`readPublishedModelSnapshot` L10–21。
- 仓内依赖：`src/platform/db/pool.ts` L2；`src/lib/model-config/published-repository.ts` L3；`src/lib/model-config/environment.ts` L4；`src/lib/model-config/types.ts` L5。

### `src/lib/model-config/quality-policy.ts`

- 分类：core；行数：48；SHA256：`f5bcb918ff43e87ff4e1f512d9b84218a3f5e010fdc7957f84f1e58b3639bf15`。
- 导出：`DISPLAY_QUALITY_IDS` L7；`DEFAULT_QUALITY_LABELS` L8；`qualityPolicySchema` L9；`QualityPolicy` L18；`policyQuality` L19；`qualityPresentation` L28；`qualityConfiguration` L32。
- 函数/类型：`QualityPolicy` L18–18；`policyQuality` L19–27；`qualityPresentation` L28–31；`qualityConfiguration` L32–47。
- 仓内依赖：`src/lib/model-config/apimart-image-policy.ts` L1；`src/lib/supplier-models/quality-defaults.ts` L2；`src/lib/model-config/types.ts` L4；`src/lib/model-config/parameter-contract.ts` L5。

### `src/lib/model-config/repository.ts`

- 分类：core；行数：217；SHA256：`aa56650779445cc8faed4606326ca56de50c4820545f25b937d8d92d6cac50c8`。
- 导出：`createModelRepository` L63。
- 函数/类型：`requireActor` L17–17；`requireUUID` L18–18；`requireVersion` L19–19；`publication` L20–20；`checkCredentials` L22–27；`writeDraft` L28–42；`readDraft` L43–61；`createModelRepository` L63–216。
- 仓内依赖：`src/lib/model-config/snapshot-value.ts` L1；`src/lib/model-config/snapshot-value.ts` L2；`src/lib/settings-secret.ts` L6；`src/lib/model-config/capacity.ts` L7；`src/lib/video/frozen-capability.ts` L8；`src/lib/video/model-defaults-schema.ts` L9；`src/lib/supplier-models/video-schema.ts` L11；`src/lib/model-config/schema.ts` L13；`src/lib/model-config/storage-schema.ts` L14；`src/lib/model-config/types.ts` L16。

### `src/lib/model-config/requests.ts`

- 分类：core；行数：158；SHA256：`51c32203bb60b9db3589c39fdd62e2407f834a10f72a9cbc49a16e7562d8d651`。
- 导出：`withModelRequest` L66；`ModelOperationInput` L98；`withModelOperation` L100。
- 函数/类型：`requestFacts` L20–51；`purposeFor` L52–65；`withModelRequest` L66–95；`ModelOperationInput` L98–99；`withModelOperation` L100–104；`runModelOperation` L105–157。
- 仓内依赖：`src/lib/imagegen/context.ts` L1；`src/lib/model-config/feature-path.ts` L2；`src/lib/billing/image-quotes.ts` L3；`src/lib/model-config/selection-policy.ts` L4；`src/lib/model-config/execution-services.ts` L6；`src/lib/model-config/feature-model-policy.ts` L7；`src/lib/model-config/execution.ts` L8；`src/lib/model-config/context.ts` L9；`src/lib/model-config/types.ts` L10；`src/lib/model-config/image-preparation.ts` L11；`src/lib/model-config/prepared-image-contract.ts` L12；`src/lib/model-config/bindings.ts` L13；`src/lib/model-config/accepted-context.ts` L14；`src/lib/canvas/generation-parameters.ts` L15；`src/lib/model-config/availability.ts` L17；`src/lib/model-config/availability.ts` L18；`src/lib/admin-auth.ts` L81；`src/lib/artworks/repository.ts` L84；`src/lib/settings.ts` L124。

### `src/lib/model-config/resolution-client.ts`

- 分类：core；行数：17；SHA256：`91c8a6acf76fa2f3e3f15b0a47a037b9c15493c90a1b9f69ecf5236497cc75f6`。
- 导出：`useImageResolutions` L8。
- 函数/类型：`useImageResolutions` L8–16。
- 仓内依赖：`src/lib/model-config/feature-client.ts` L3；`src/lib/image-model-routing.ts` L4；`src/lib/billing/rules/registry.ts` L5；`src/lib/mock-data.ts` L6。

### `src/lib/model-config/resolution-fallback.ts`

- 分类：core；行数：97；SHA256：`f347faf5b9ddb15636ca690662dee6d9ab6aac411aaab454b2729e9426a1f297`。
- 导出：`IMAGE_RESOLUTION_TIERS` L14；`ImageResolutionTier` L15；`ResolutionChoice` L16；`ResolutionContext` L17；`upstreamResolutionTiers` L21；`resolutionFacts` L40；`upstreamAcceptsResolution` L47；`resolveImageResolution` L57；`resolutionFallbackMessage` L94。
- 函数/类型：`ImageResolutionTier` L15–15；`ResolutionChoice` L16–16；`ResolutionContext` L17–17；`upstreamResolutionTiers` L21–38；`resolutionFacts` L40–43；`upstreamAcceptsResolution` L47–52；`resolveImageResolution` L57–92；`resolutionFallbackMessage` L94–96。
- 仓内依赖：`src/lib/model-config/public-identity.ts` L1；`src/lib/model-config/types.ts` L2；`src/lib/billing/types.ts` L3；`src/lib/model-config/schema.ts` L4；`src/lib/model-config/channel-policy.ts` L5；`src/lib/model-config/business.ts` L6；`src/lib/model-config/image-preset.ts` L7；`src/lib/model-config/simulation.ts` L8；`src/lib/imagegen/request-admission.ts` L9；`src/lib/imagegen/request-size.ts` L10；`src/lib/model-config/apimart-image-policy.ts` L11；`src/lib/model-config/parameter-contract.ts` L12。

### `src/lib/model-config/resolution-options.ts`

- 分类：core；行数：23；SHA256：`e2c6ac3fff52c83ec95d918800ece1b3a8a11b539c708898e011ef425740426d`。
- 导出：`DISPLAY_RESOLUTIONS` L4；`assertDisplayResolution` L5；`applyDisplayResolutions` L9。
- 函数/类型：`assertDisplayResolution` L5–8；`applyDisplayResolutions` L9–22。
- 仓内依赖：`src/lib/model-config/types.ts` L1；`src/lib/image-model-routing.ts` L2。

### `src/lib/model-config/resolution-policy.ts`

- 分类：core；行数：72；SHA256：`a9765e37efc46095ad0246ff0825dc90cc5deb1e8664152c6f061f8ced809411`。
- 导出：`RESOLUTION_FIELDS` L8；`RATIO_FIELDS` L9；`resolutionValue` L10；`resolutionPolicySchema` L11；`ResolutionPolicy` L16；`resolutionParametersSchema` L17；`ResolutionParameters` L22；`mapResolution` L25；`resolutionConfiguration` L42；`applyResolutionParameters` L56。
- 函数/类型：`ResolutionPolicy` L16–16；`ResolutionParameters` L22–22；`mapResolution` L25–40；`resolutionConfiguration` L42–54；`applyResolutionParameters` L56–71。
- 仓内依赖：`src/lib/model-config/apimart-image-policy.ts` L1；`src/lib/model-config/resolution-options.ts` L3；`src/lib/model-config/types.ts` L4；`src/lib/model-config/parameter-contract.ts` L5；`src/lib/supplier-models/resolution-defaults.ts` L6。

### `src/lib/model-config/reverse-hub-images.ts`

- 分类：core；行数：188；SHA256：`e2e5d3490993d4e0f6455d82e3955d7a37576cb936204154100e4021d4b7ecc2`。
- 导出：`reverseHubImageRequest` L34；`reverseHubImageFetch` L95。
- 函数/类型：`reference` L25–32；`reverseHubImageRequest` L34–90；`reverseHubImageFetch` L95–187。
- 仓内依赖：`src/lib/model-config/image-plan-runtime.ts` L1；`src/lib/model-config/image-parameter-plan.ts` L2；`src/lib/model-config/context.ts` L6；`src/lib/model-config/schema.ts` L7；`src/lib/model-config/types.ts` L8；`src/lib/model-config/transport.ts` L9；`src/lib/model-config/resolution-policy.ts` L10；`src/lib/image-gateway.ts` L11；`src/lib/billing/synchronous-operation.ts` L12；`src/lib/supplier-cost/collect.ts` L13；`src/lib/supplier-cost/runtime.ts` L14；`src/lib/supplier-cost/io.ts` L15；`src/lib/imagegen/ratio-support.ts` L16；`src/lib/competitor-image.ts` L17。

### `src/lib/model-config/router-capacity.ts`

- 分类：core；行数：41；SHA256：`76da27c32258e97c98dec2d271a8e920a2144badaf30f558faccb903e72b4f0c`。
- 导出：`routerCapacityHandler` L15。
- 函数/类型：`Administration` L12–12；`routerCapacityHandler` L15–40。
- 仓内依赖：`src/lib/model-config/capacity.ts` L4；`src/lib/model-config/server.ts` L5；`src/lib/model-config/types.ts` L6。

### `src/lib/model-config/router-client.ts`

- 分类：core；行数：52；SHA256：`4d6bacf1a01707d1ae2cea448f8beec721b1966e3c57fe3dd05db32d4ddc2fd7`。
- 导出：`SealedCredential` L8；`RouterStatus` L10；`RouterControl` L11；`createRouterControl` L20。
- 函数/类型：`SealedCredential` L8–8；`RouterStatus` L10–10；`RouterControl` L11–19；`createRouterControl` L20–51。
- 仓内依赖：`src/lib/model-config/schema.ts` L4；`src/lib/model-config/types.ts` L5；`src/lib/model-config/projection.ts` L6。

### `src/lib/model-config/runtime-schema.ts`

- 分类：core；行数：24；SHA256：`83703c39f798d6b5e04a5d4d3d167d4bc2c03d8991cc8592d3c0b039bc9d4442`。
- 导出：`ensureModelRuntimeSchema` L4。
- 函数/类型：`ensureModelRuntimeSchema` L4–23。
- 仓内依赖：`src/platform/db/schema-readiness.ts` L1。

### `src/lib/model-config/runtime.ts`

- 分类：core；行数：79；SHA256：`e060be0575122f40b1c4a053628bffde5cf9c7aa5758b8f184ae628f2fb94a76`。
- 导出：`createModelRuntime` L19；`ModelRuntime` L78。
- 函数/类型：`Dependencies` L17–17；`createModelRuntime` L19–77；`ModelRuntime` L78–78。
- 仓内依赖：`src/lib/model-config/execution-projections.ts` L1；`src/lib/model-config/types.ts` L3；`src/lib/billing/types.ts` L5；`src/lib/model-config/credentials.ts` L6；`src/lib/model-config/router-client.ts` L7；`src/lib/model-config/runtime-schema.ts` L8；`src/lib/model-config/schema.ts` L9；`src/lib/model-config/types.ts` L10；`src/lib/billing/rules/registry.ts` L11；`src/lib/model-config/catalog-pricing.ts` L12；`src/lib/model-config/simulation.ts` L13；`src/lib/model-config/public-catalog.ts` L14；`src/lib/model-config/simulation.ts` L15。

### `src/lib/model-config/schema.ts`

- 分类：core；行数：165；SHA256：`20eacd064ebd73f687d37f1b88b5543854f67b9f527471f5d43bb70baf4c8849`。
- 导出：`MODEL_PROTOCOLS` L30；`modelConfigSchema` L49；`ValidationOptions` L50；`modelMetadataHost` L55；`privateModelHost` L59；`validateModelEndpoint` L69；`validateModelConfig` L80。
- 函数/类型：`ValidationOptions` L50–50；`modelMetadataHost` L55–58；`privateModelHost` L59–68；`validateModelEndpoint` L69–77；`fail` L78–78；`unique` L79–79；`validateModelConfig` L80–164。
- 仓内依赖：`src/lib/model-config/storage-schema.ts` L1；`src/lib/model-config/apimart-image-policy.ts` L4；`src/lib/model-config/business-schema.ts` L5；`src/lib/imagegen/capabilities.ts` L6；`src/lib/model-config/business-validation.ts` L7；`src/lib/model-config/image-preset.ts` L8；`src/lib/model-config/channel-policy.ts` L10；`src/lib/model-config/bindings.ts` L13；`src/lib/model-config/types.ts` L14；`src/lib/billing/rules/registry.ts` L15；`src/lib/model-config/tool-scope.ts` L16；`src/lib/model-config/resolution-policy.ts` L17；`src/lib/model-config/quality-policy.ts` L18；`src/lib/model-config/parameter-contract.ts` L19；`src/lib/video/capability-schema.ts` L20；`src/lib/audio/model-capabilities.ts` L21；`src/lib/video/workflow-schema.ts` L22。

### `src/lib/model-config/seedream-preflight.ts`

- 分类：core；行数：32；SHA256：`3f6fef75377d56ac0c7a10197a993e2d76b416a1bd7e927fd881888bd47308ae`。
- 导出：`SEEDREAM_WIRE_IDS` L7；`isSeedreamWire` L8；`seedreamPreflight` L16。
- 函数/类型：`seedreamPreflight` L16–31。
- 仓内依赖：`src/lib/model-config/types.ts` L3。

### `src/lib/model-config/selection-policy.ts`

- 分类：core；行数：18；SHA256：`d5401bf426d62b6aab34ca2c3adba6c8119fa6dea8ed05d387b726cad2551d36`。
- 导出：`assertPlatformImageSelection` L4；`ADMIN_CONFIGURED_FEATURES` L11；`adminConfiguredFeature` L12；`requestedFeatureModel` L15。
- 函数/类型：`assertPlatformImageSelection` L4–7；`adminConfiguredFeature` L12–14；`requestedFeatureModel` L15–17。
- 仓内依赖：`src/lib/billing/rules/registry.ts` L1；`src/lib/model-config/types.ts` L2。

### `src/lib/model-config/server.ts`

- 分类：core；行数：19；SHA256：`b28dd6e94f61de500065ca67d59b9ef6ae02952749d3e7c0a7b8b0033d6f27c1`。
- 导出：`getModelAdministration` L14；`getModelRuntime` L18。
- 函数/类型：`assemble` L8–13；`getModelAdministration` L14–17；`getModelRuntime` L18–18。
- 仓内依赖：`src/lib/billing/runtime.ts` L2；`src/lib/model-config/lifecycle.ts` L3；`src/lib/model-config/runtime.ts` L4；`src/lib/model-config/environment.ts` L5。

### `src/lib/model-config/simulation.ts`

- 分类：core；行数：88；SHA256：`19c35584c8baa9fc7d44075a9b53e511896e5a863058e9421dcc765b2c5a3815`。
- 导出：`RoutingSimulation` L15；`simulateModel` L23。
- 函数/类型：`RoutingSimulation` L15–15；`rankFor` L17–17；`matchesRule` L19–21；`simulateModel` L23–87。
- 仓内依赖：`src/lib/model-config/public-identity.ts` L1；`src/lib/model-config/image-parameter-plan.ts` L2；`src/lib/imagegen/request-admission.ts` L4；`src/lib/billing/types.ts` L5；`src/lib/imagegen/capabilities.ts` L6；`src/lib/model-config/channel-policy.ts` L7；`src/lib/model-config/projection.ts` L8；`src/lib/model-config/schema.ts` L9；`src/lib/model-config/types.ts` L10；`src/lib/model-config/image-preset.ts` L11；`src/lib/model-config/quality-policy.ts` L12；`src/lib/model-config/parameter-contract.ts` L13。

### `src/lib/model-config/snapshot-reader.ts`

- 分类：core；行数：14；SHA256：`1fcdc42d3613d00fec9d71d81bf6caf61c48c5142a6881569df330c2e361b506`。
- 导出：`readManagedModelSnapshot` L7。
- 函数/类型：`readManagedModelSnapshot` L7–13。
- 仓内依赖：`src/lib/model-config/context.ts` L2；`src/lib/model-config/availability.ts` L3；`src/lib/model-config/published.ts` L4。

### `src/lib/model-config/snapshot-value.ts`

- 分类：core；行数：21；SHA256：`b44cfb80ad4049ec888b8daf8e6841880d24e501d47caa37c8d6850d0e1a41a2`。
- 导出：`canonicalConfig` L6；`modelConfigDigest` L12；`decodeModelSnapshot` L15。
- 函数/类型：`canonicalConfig` L6–10；`modelConfigDigest` L12–12；`decodeModelSnapshot` L15–20。
- 仓内依赖：`src/lib/model-config/schema.ts` L3；`src/lib/model-config/types.ts` L4。

### `src/lib/model-config/stage-cost.ts`

- 分类：core；行数：20；SHA256：`68feb57766c008c18105e8b138ce00ad1ef992ea568e8667d9d9239607df5ec3`。
- 导出：`stageCost` L6。
- 函数/类型：`stageCost` L6–19。
- 仓内依赖：`src/lib/model-config/business-schema.ts` L1；`src/lib/model-config/business.ts` L2；`src/lib/billing/money.ts` L3。

### `src/lib/model-config/stage-routing-policy.ts`

- 分类：core；行数：68；SHA256：`603068a1aaf727c6f49aa6efc5c7b20d122174765879c2427ae95b34cb508a95`。
- 导出：`createStageRoutingFetch` L22。
- 函数/类型：`auditStream` L10–19；`createStageRoutingFetch` L22–67。
- 仓内依赖：`src/lib/model-config/context.ts` L2；`src/lib/model-config/schema.ts` L3；`src/lib/model-config/business.ts` L4；`src/lib/model-config/types.ts` L5；`src/lib/model-config/execution-audit.ts` L6；`src/lib/supplier-cost/phase.ts` L7；`src/lib/image-gateway.ts` L8。

### `src/lib/model-config/stage-routing.ts`

- 分类：core；行数：3；SHA256：`65ac654ebed1ff49b5a863b73d923a38763cc8110fedc3a21b5240972e80abed`。
- 导出：无命名导出 / 数据或样式文件。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：`src/lib/model-config/execution-fetch.ts` L2。

### `src/lib/model-config/startup.ts`

- 分类：core；行数：32；SHA256：`bcf9277f9beeeb2290bd69efe97c72ba7d1fc8aedd8636072ad88a0d5b996cbf`。
- 导出：`ModelRegistryStartup` L7；`prepareModelRegistry` L15。
- 函数/类型：`ModelRegistryStartup` L7–10；`prepareModelRegistry` L15–31。
- 仓内依赖：`src/platform/db/pool.ts` L2；`src/lib/model-config/published-repository.ts` L3；`src/lib/model-config/environment.ts` L4；`src/lib/model-config/types.ts` L5；`src/lib/model-config/lifecycle.ts` L22。

### `src/lib/model-config/storage-schema.ts`

- 分类：core；行数：55；SHA256：`607664f9622facffef2fbb21c213ff537376fb2cb75f6a332b7b780c064028b0`。
- 导出：`ensureModelSchema` L5。
- 函数/类型：`ensureModelSchema` L5–54。
- 仓内依赖：`src/platform/db/schema-readiness.ts` L2。

### `src/lib/model-config/supplier-failure.ts`

- 分类：core；行数：32；SHA256：`8de7d61457b1d0bef03a405bcde76fa9a7d3d83bbb4564be3bb05db1e1a5e6ea`。
- 导出：`IMAGE_SUPPLIER_FAILURE_MESSAGES` L1；`ImageSupplierFailureCode` L10；`ImageSupplierFailure` L11；`imageSupplierFailure` L16。
- 函数/类型：`ImageSupplierFailureCode` L10–10；`ImageSupplierFailure` L11–11；`imageSupplierFailure` L16–31。
- 仓内依赖：无静态仓内导入。

### `src/lib/model-config/tool-scope.ts`

- 分类：core；行数：26；SHA256：`82aa149a72d81cbe7fd2bc24b3c66b9d185205cb1a76e411362b1a63712f6d45`。
- 导出：`validateToolScopes` L6。
- 函数/类型：`validateToolScopes` L6–23。
- 仓内依赖：`src/lib/model-config/types.ts` L1；`src/lib/model-config/types.ts` L2；`src/lib/model-config/feature-model-policy.ts` L3；`src/lib/model-config/bindings.ts` L4；`src/lib/model-config/feature-model-policy.ts` L25。

### `src/lib/model-config/transport.ts`

- 分类：core；行数：86；SHA256：`2293f449757533efb286b7b99be605d365f7dcbc9aef536d40f131001dc967bc`。
- 导出：`modelEndpointFetch` L19。
- 函数/类型：`modelEndpointFetch` L19–85。
- 仓内依赖：`src/lib/model-config/apimart-image-policy.ts` L1；`src/lib/model-config/channel-availability.ts` L3；`src/lib/model-config/schema.ts` L10；`src/lib/model-config/types.ts` L11；`src/lib/model-config/capacity.ts` L12；`src/platform/db/pool.ts` L13；`src/lib/supplier-cost/collect.ts` L14；`src/lib/image-gateway.ts` L15；`src/lib/model-config/context.ts` L16。

### `src/lib/model-config/types.ts`

- 分类：core；行数：33；SHA256：`4e41a196ca985da3fe5b19c4fb546c1750d3ee65facb724ed2ef8d5bc4d2daa2`。
- 导出：`Modality` L3；`ModelConfig` L4；`ModelProvider` L5；`UpstreamModel` L6；`PublicModel` L7；`ModelPool` L8；`ModelSnapshot` L9；`ModelDraft` L10；`ModelFacts` L11；`PublicationPhase` L12；`ModelPublication` L13；`ModelVersionSummary` L14；`StageInput` L15；`RestoreInput` L16；`ModelConfigRepository` L17；`ModelConfigError` L30。
- 函数/类型：`Modality` L3–3；`ModelConfig` L4–4；`ModelProvider` L5–5；`UpstreamModel` L6–6；`PublicModel` L7–7；`ModelPool` L8–8；`ModelSnapshot` L9–9；`ModelDraft` L10–10；`ModelFacts` L11–11；`PublicationPhase` L12–12；`ModelPublication` L13–13；`ModelVersionSummary` L14–14；`StageInput` L15–15；`RestoreInput` L16–16；`ModelConfigRepository` L17–29；`ModelConfigError` L30–32。
- 仓内依赖：`src/lib/model-config/schema.ts` L2。

### `src/lib/model-config/video-capability-review.ts`

- 分类：core；行数：43；SHA256：`4d8530ea684ff57b4f1dcfb097d47e20587bfbde5a0cea20d47ada0fbf1118ba`。
- 导出：`VideoCapabilityReviewRow` L6；`VideoCapabilityReview` L10；`reviewVideoCapabilityUpgrade` L13；`applyReviewedVideoCapabilityUpgrade` L36。
- 函数/类型：`VideoCapabilityReviewRow` L6–9；`VideoCapabilityReview` L10–10；`reviewVideoCapabilityUpgrade` L13–33；`applyReviewedVideoCapabilityUpgrade` L36–42。
- 仓内依赖：`src/lib/model-config/video-family-capabilities.ts` L2；`src/lib/model-config/video-family-capability-upgrade.ts` L3；`src/lib/model-config/types.ts` L4。

### `src/lib/model-config/video-family-capabilities.json`

- 分类：core；行数：3518；SHA256：`48c1a3f7500d755b45838c9dce6ec6486a3022e4d9208c9238110f9c0b542e86`。
- 导出：无命名导出 / 数据或样式文件。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：无静态仓内导入。

### `src/lib/model-config/video-family-capabilities.ts`

- 分类：core；行数：14；SHA256：`49ed711dfa5a6fb9b9726d7a8ca0fbcfa97270a20436ea3c6fcf6e6b3fe0b273`。
- 导出：`DOCUMENTED_VIDEO_FAMILIES` L7；`documentedVideoFamily` L11。
- 函数/类型：`documentedVideoFamily` L11–13。
- 仓内依赖：`src/lib/model-config/video-family-capabilities.json` L1；`src/lib/model-config/video-family-multimodal.ts` L2；`src/lib/model-config/video-family-storyboard.ts` L3；`src/lib/video/capability-schema.ts` L4。

### `src/lib/model-config/video-family-capability-upgrade.ts`

- 分类：core；行数：155；SHA256：`d3e61c4575365b7e6d998a7ec8dfaeb52142e08e79dfd66b4b446ec68275066e`。
- 导出：`VideoFamilyCapabilityUpgradeEntry` L8；`VideoFamilyCapabilityUpgradePatch` L17；`makeVideoFamilyCapabilityUpgradePlan` L62；`VideoFamilyCapabilityUpgradePlan` L134；`rollbackVideoFamilyCapabilityUpgradePlan` L136。
- 函数/类型：`VideoFamilyCapabilityUpgradeEntry` L8–14；`Identity` L16–16；`VideoFamilyCapabilityUpgradePatch` L17–21；`Field` L22–22；`Missing` L23–25；`conflict` L27–34；`canonical` L38–45；`same` L46–46；`read` L47–53；`write` L54–60；`makeVideoFamilyCapabilityUpgradePlan` L62–132；`VideoFamilyCapabilityUpgradePlan` L134–134；`rollbackVideoFamilyCapabilityUpgradePlan` L136–154。
- 仓内依赖：`src/lib/model-config/video-family-presets.json` L1；`src/lib/model-config/video-family-capabilities.json` L2；`src/lib/model-config/video-family-multimodal.json` L3；`src/lib/video/capability-schema.ts` L4；`src/lib/model-config/types.ts` L5。

### `src/lib/model-config/video-family-multimodal.json`

- 分类：core；行数：1466；SHA256：`7587026e5c959fdae3046787660fef0e6a4953f74d966bc9ef7faf6986f45e82`。
- 导出：无命名导出 / 数据或样式文件。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：无静态仓内导入。

### `src/lib/model-config/video-family-multimodal.ts`

- 分类：core；行数：7；SHA256：`5273ae289917693a5be8728f896a78c6775b53205f192835617b21af8a27e74b`。
- 导出：`MULTIMODAL_VIDEO_FAMILIES` L5。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：`src/lib/model-config/video-family-multimodal.json` L1；`src/lib/video/capability-schema.ts` L2。

### `src/lib/model-config/video-family-preset.ts`

- 分类：core；行数：93；SHA256：`db5d70235f642be8447832aa35e59d5ecc2b21200d69174ea8f4ad096b4202a8`。
- 导出：`VERIFIED_VIDEO_FAMILIES` L7；`VERIFIED_VIDEO_PROFILES` L8；`DOCUMENTED_VIDEO_PROFILES` L9；`VIDEO_FAMILY_ACTIVATION_EXCLUSIONS` L13；`videoFamilyActivationEnabled` L14；`ACTIVE_VIDEO_FAMILY_ITEMS` L17；`makeVideoFamilyPlan` L22；`VideoFamilyPlan` L78；`rollbackVideoFamilyPlan` L79。
- 函数/类型：`videoFamilyActivationEnabled` L14–16；`Patch` L18–18；`CredentialRefs` L19–19；`fail` L20–20；`canonical` L21–21；`makeVideoFamilyPlan` L22–77；`VideoFamilyPlan` L78–78；`rollbackVideoFamilyPlan` L79–92。
- 仓内依赖：`src/lib/model-config/video-family-presets.json` L1；`src/lib/model-config/types.ts` L2；`src/lib/video/capability-schema.ts` L3；`src/lib/model-config/types.ts` L4；`src/lib/model-config/video-family-capabilities.ts` L5。

### `src/lib/model-config/video-family-presets.json`

- 分类：core；行数：2206；SHA256：`51eacf1de200bae94ffbe52e38ba49d1454ae8ba5f727a8e2fe64c4315062a39`。
- 导出：无命名导出 / 数据或样式文件。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：无静态仓内导入。

### `src/lib/model-config/video-family-storyboard.json`

- 分类：core；行数：238；SHA256：`23e21f4d8d049f597144f5ad522c520bf8d2789b43e57d7c26abc5e8c64a7e77`。
- 导出：无命名导出 / 数据或样式文件。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：无静态仓内导入。

### `src/lib/model-config/video-family-storyboard.ts`

- 分类：core；行数：8；SHA256：`addc17529c04f9778be3f26a5749d2e76c3a2590351d0a904011ce0aa82c3845`。
- 导出：`STORYBOARD_VIDEO_FAMILIES` L5。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：`src/lib/model-config/video-family-storyboard.json` L1；`src/lib/video/capability-schema.ts` L2。

### `src/lib/model-config/video-policy.ts`

- 分类：core；行数：27；SHA256：`678ccab1a376055850a358a94c147e9de4ebf7fdf774b9e0e0c4b433ec408fef`。
- 导出：`videoParametersSchema` L6；`VideoParameters` L9；`VideoConfiguration` L10；`applyVideoParameters` L13。
- 函数/类型：`VideoParameters` L9–9；`VideoConfiguration` L10–11；`applyVideoParameters` L13–26。
- 仓内依赖：`src/lib/video/capability-schema.ts` L2；`src/lib/model-config/types.ts` L3；`src/lib/model-config/management.ts` L4。

### `src/lib/model-health/access.ts`

- 分类：core；行数：45；SHA256：`bc4291479bba9a38c585ad63f646060b5579b8fb3dd0bd40ac91aa9dcb5f784a`。
- 导出：`createHealthHandler` L16；`modelHealthHandler` L39；`healthWorkerAuthorized` L40。
- 函数/类型：`createHealthHandler` L16–38；`healthWorkerAuthorized` L40–44。
- 仓内依赖：`src/lib/bi/access.ts` L4；`src/lib/supplier-cost/io.ts` L5；`src/lib/model-config/server.ts` L6；`src/lib/model-health/repository.ts` L7；`src/lib/model-health/service.ts` L8；`src/lib/model-health/targets.ts` L9。

### `src/lib/model-health/contracts.ts`

- 分类：core；行数：8；SHA256：`0b63236ac37c6ca3c6f484924e6fa9a9daccd171df5e8f66f89df4af11144801`。
- 导出：`HealthPolicy` L1；`DEFAULT_HEALTH_POLICY` L2；`HealthState` L3；`HealthReason` L4；`HealthResult` L5；`HealthModelView` L6；`HealthOverview` L7。
- 函数/类型：`HealthPolicy` L1–1；`HealthState` L3–3；`HealthReason` L4–4；`HealthResult` L5–5；`HealthModelView` L6–6；`HealthOverview` L7–7。
- 仓内依赖：无静态仓内导入。

### `src/lib/model-health/executor.ts`

- 分类：core；行数：48；SHA256：`79510d3018cb70082cda95b617aa7f85e3632f4258820cbc73b0da92dcd072e4`。
- 导出：`healthExecutionScope` L14；`executeHealthProbe` L22。
- 函数/类型：`healthExecutionScope` L14–21；`executeHealthProbe` L22–47。
- 仓内依赖：`src/lib/model-config/types.ts` L3；`src/lib/model-config/context.ts` L4；`src/lib/model-config/context.ts` L5；`src/lib/model-config/execution-fetch.ts` L6；`src/lib/model-config/channel-image-response.ts` L7；`src/lib/model-config/capacity.ts` L8；`src/lib/image-gateway.ts` L9；`src/lib/model-health/targets.ts` L10；`src/lib/model-health/contracts.ts` L11；`src/lib/model-health/outcomes.ts` L12。

### `src/lib/model-health/observe.ts`

- 分类：core；行数：67；SHA256：`e869f25143403de962f83df69b3a9eb0580c74342c3cab245653105c72d62c7e`。
- 导出：`observeBusinessHealth` L17；`healthObservedFetch` L25。
- 函数/类型：`observeBusinessHealth` L17–22；`healthObservedFetch` L25–66。
- 仓内依赖：`src/lib/model-config/local-image-rejection.ts` L1；`src/platform/db/pool.ts` L3；`src/lib/model-config/context.ts` L4；`src/lib/model-config/schema.ts` L5；`src/lib/model-config/channel-image-response.ts` L6；`src/lib/model-config/types.ts` L7；`src/lib/image-gateway.ts` L8；`src/lib/imagegen/failure-evidence.ts` L9；`src/lib/model-config/channel-text-response.ts` L10；`src/lib/model-health/repository.ts` L11；`src/lib/model-health/targets.ts` L12；`src/lib/model-health/outcomes.ts` L13；`src/lib/model-health/contracts.ts` L14；`src/lib/supplier-cost/response-diagnostics.ts` L15。

### `src/lib/model-health/outcomes.ts`

- 分类：core；行数：17；SHA256：`3215abdc37f66e0e2f3c21082a9570466bbcf2c50e698b670799853ea8750f9f`。
- 导出：`classifyHealthFailure` L3。
- 函数/类型：`classifyHealthFailure` L3–16。
- 仓内依赖：`src/lib/model-health/contracts.ts` L1。

### `src/lib/model-health/repository.ts`

- 分类：core；行数：119；SHA256：`f3bb17472e342b859a5cc6bd1291e4736d42f15717b5b63796d326b6416218f0`。
- 导出：`createHealthRepository` L12。
- 函数/类型：`createHealthRepository` L12–118。
- 仓内依赖：`src/lib/model-config/types.ts` L4；`src/lib/model-health/contracts.ts` L5；`src/lib/model-health/targets.ts` L6；`src/lib/model-health/schema.ts` L7。

### `src/lib/model-health/schema.ts`

- 分类：core；行数：42；SHA256：`5d5bb722bb89f9c15113250791a38625437e84a91bca1a144748ad88ca7dc585`。
- 导出：`ensureHealthSchema` L5。
- 函数/类型：`ensureHealthSchema` L5–41。
- 仓内依赖：`src/platform/db/schema-readiness.ts` L1。

### `src/lib/model-health/service.ts`

- 分类：core；行数：20；SHA256：`f10f24cfd28a4b3c658730390390b4f64b226e3114fcb46db54c131ca1a70544`。
- 导出：`scanModelHealthOnce` L7。
- 函数/类型：`scanModelHealthOnce` L7–19。
- 仓内依赖：`src/lib/model-config/server.ts` L2；`src/lib/model-health/targets.ts` L3；`src/lib/model-health/repository.ts` L4；`src/lib/model-health/executor.ts` L5。

### `src/lib/model-health/targets.ts`

- 分类：core；行数：27；SHA256：`d2fcff012e11f2e5fb3805ff06004bcdfa5ad9d57feb3cd29fa434d9061faeac`。
- 导出：`healthTargetKey` L6；`HealthTarget` L11；`configuredHealthTargets` L12。
- 函数/类型：`healthTargetKey` L6–10；`HealthTarget` L11–11；`configuredHealthTargets` L12–26。
- 仓内依赖：`src/lib/model-config/types.ts` L2；`src/lib/model-config/context.ts` L3。

### `src/lib/settings.ts`

- 分类：related；行数：747；SHA256：`1e8e33924cbf42c3ffbb72d25a85fde8c23ae201276c40dc973eef594038c4b6`。
- 导出：`encryptAtRest` L81；`decryptAtRest` L90；`getPublicKeyPem` L120；`decryptFromClient` L129；`maskKey` L148；`OpenAISettings` L153；`getLegacyOpenAISettings` L196；`getOpenAISettings` L229；`saveOpenAIKey` L238；`saveOpenAIModel` L242；`saveOpenAIModels` L246；`saveOpenAIBaseUrl` L253；`readOpenAIBaseUrlPlain` L260；`saveCutoutModel` L270；`CutoutBackend` L279；`CutoutSettings` L280；`getCutoutSettings` L291；`saveCutoutBackend` L318；`saveReplicateToken` L324；`saveReplicateModel` L329；`WechatSettings` L339；`getWechatSettings` L347；`saveWechatLogin` L378；`saveWechatSecret` L395；`saveBrand` L404；`saveSitePages` L420；`saveMultiUser` L434；`saveCreditsMetering` L439；`SmtpConfig` L444；`getSmtpConfig` L453；`saveSmtp` L475；`getSitePage` L492；`PaymentSettings` L515；`getPaymentSettings` L527；`savePayEnabled` L583；`getPaymentStatus` L594；`saveAlipay` L612；`saveAlipayPrivateKey` L625；`saveWxpay` L630；`saveWxpayApiv3` L637；`saveWxpayCert` L642；`saveWxpayCertSerial` L647；`saveWxpayAppid` L652；`getAdminView` L680。
- 函数/类型：`aesKey` L76–79；`encryptAtRest` L81–88；`decryptAtRest` L90–101；`ensureKeypair` L103–118；`getPublicKeyPem` L120–122；`decryptFromClient` L129–145；`maskKey` L148–151；`OpenAISettings` L153–159；`normalizeImageModels` L161–183；`imageModelCatalog` L185–194；`getLegacyOpenAISettings` L196–227；`getOpenAISettings` L229–234；`saveOpenAIKey` L238–240；`saveOpenAIModel` L242–244；`saveOpenAIModels` L246–249；`saveOpenAIBaseUrl` L253–257；`readOpenAIBaseUrlPlain` L260–268；`saveCutoutModel` L270–272；`CutoutBackend` L279–279；`CutoutSettings` L280–289；`getCutoutSettings` L291–316；`saveCutoutBackend` L318–321；`saveReplicateToken` L324–326；`saveReplicateModel` L329–331；`WechatSettings` L339–345；`getWechatSettings` L347–375；`saveWechatLogin` L378–392；`saveWechatSecret` L395–397；`saveBrand` L404–414；`saveSitePages` L420–431；`saveMultiUser` L434–436；`saveCreditsMetering` L439–442；`SmtpConfig` L444–450；`getSmtpConfig` L453–472；`saveSmtp` L475–489；`getSitePage` L492–506；`PaymentSettings` L515–525；`getPaymentSettings` L527–580；`savePayEnabled` L583–586；`getPaymentStatus` L594–609；`saveAlipay` L612–622；`saveAlipayPrivateKey` L625–627；`saveWxpay` L630–634；`saveWxpayApiv3` L637–639；`saveWxpayCert` L642–644；`saveWxpayCertSerial` L647–649；`saveWxpayAppid` L652–654；`deriveAlipayPublicKey` L661–677；`getAdminView` L680–746。
- 仓内依赖：`src/platform/db/pool.ts` L3；`src/lib/settings/repository.ts` L4；`src/lib/billing/signup.ts` L5；`src/lib/settings-secret.ts` L6；`src/lib/staging-history.ts` L7；`src/lib/model-config/context.ts` L230；`src/lib/model-config/context.ts` L292；`src/lib/billing/runtime.ts` L440；`src/lib/billing/runtime.ts` L546；`src/lib/billing/runtime.ts` L584。

### `src/lib/settings/repository.ts`

- 分类：related；行数：59；SHA256：`20123e3dc903a69931c8d2525aa5b1695cd48bb4c8ad9224ac8547a2386f99b2`。
- 导出：`getSetting` L8；`setSetting` L18；`getSettings` L28；`setSettingsAtomically` L43。
- 函数/类型：`getSetting` L8–16；`setSetting` L18–25；`getSettings` L28–40；`setSettingsAtomically` L43–58。
- 仓内依赖：`src/platform/db/pool.ts` L2；`src/lib/persistence/schema.ts` L3。

### `src/lib/supplier-cost/adapter-failure.ts`

- 分类：core；行数：37；SHA256：`17c9f91b846654b0c5f2c4cb7262b188e602b51490c7b4234759be9ad02f32ba`。
- 导出：`SupplierAdapterResponseError` L7；`adapterFailureEvidence` L23；`recordSupplierAdapterFailure` L32。
- 函数/类型：`SupplierAdapterResponseError` L7–21；`adapterFailureEvidence` L23–29；`recordSupplierAdapterFailure` L32–36。
- 仓内依赖：`src/lib/supplier-cost/failure-evidence.ts` L3；`src/lib/model-config/supplier-failure.ts` L4。

### `src/lib/supplier-cost/adapters.ts`

- 分类：core；行数：78；SHA256：`13ae8fd53f7106061448deb090221ca387071a620841feccf70bfb5806ae92df`。
- 导出：`validTaskId` L7；`safeUsage` L13；`evidence` L24；`submittedAPIMartTask` L25；`apimartTask` L32；`genericReceipt` L41；`UsageItem` L65；`apimartUsage` L66。
- 函数/类型：`safeUsage` L13–23；`evidence` L24–24；`submittedAPIMartTask` L25–30；`apimartTask` L32–40；`genericReceipt` L41–63；`UsageItem` L65–65；`apimartUsage` L66–77。
- 仓内依赖：`src/lib/supplier-cost/money.ts` L2；`src/lib/supplier-cost/types.ts` L3；`src/lib/model-config/business-schema.ts` L4；`src/lib/billing/money.ts` L5。

### `src/lib/supplier-cost/admin.ts`

- 分类：core；行数：66；SHA256：`62c6e956288f028b53428a3b28da70bda99acf4a8eeaacf668975f377eed7f75`。
- 导出：`costWhere` L9；`costsSummary` L15；`accountOverview` L50；`updateAccount` L57。
- 函数/类型：`costWhere` L9–14；`costsSummary` L15–49；`accountOverview` L50–56；`updateAccount` L57–65。
- 仓内依赖：`src/lib/supplier-cost/repository.ts` L3；`src/lib/supplier-cost/types.ts` L4；`src/lib/supplier-cost/schema.ts` L5；`src/lib/supplier-cost/policy.ts` L6；`src/lib/supplier-cost/money.ts` L7。

### `src/lib/supplier-cost/apimart.ts`

- 分类：core；行数：16；SHA256：`bf349dd8544a38584f15b483e941de0e85aeba12c21ac518eae86ac95bda60b4`。
- 导出：`getAPIMartTask` L5；`queryAPIMartUsage` L9。
- 函数/类型：`getAPIMartTask` L5–8；`queryAPIMartUsage` L9–15。
- 仓内依赖：`src/lib/supplier-cost/adapters.ts` L2；`src/lib/supplier-cost/io.ts` L3。

### `src/lib/supplier-cost/callback.ts`

- 分类：core；行数：19；SHA256：`8768c6a8317e7e0641bdfa323ca0ea28cfc6a742b0d478cba5aa777ecfa9dbe3`。
- 导出：`enqueueCallback` L7。
- 函数/类型：`enqueueCallback` L7–18。
- 仓内依赖：`src/lib/supplier-cost/repository.ts` L3；`src/lib/supplier-cost/adapters.ts` L4；`src/lib/supplier-cost/money.ts` L5。

### `src/lib/supplier-cost/collect.ts`

- 分类：core；行数：111；SHA256：`8d761a65d0c5cf82ab1be8fcc867d2166c8f87b32105770d6a5aebc8a597ab2e`。
- 导出：`supplierContext` L20；`supplierCostFetch` L27。
- 函数/类型：`supplierContext` L20–24；`supplierCostFetch` L27–110。
- 仓内依赖：`src/lib/model-config/image-plan-runtime.ts` L1；`src/lib/bi/call-scope.ts` L3；`src/platform/db/pool.ts` L5；`src/lib/model-config/context.ts` L6；`src/lib/billing/synchronous-operation.ts` L7；`src/lib/image-gateway.ts` L8；`src/lib/supplier-cost/runtime.ts` L9；`src/lib/supplier-cost/adapters.ts` L10；`src/lib/supplier-cost/receipt-buffer.ts` L11；`src/lib/supplier-cost/phase.ts` L12；`src/lib/supplier-cost/money.ts` L13；`src/lib/supplier-cost/types.ts` L14；`src/lib/model-config/types.ts` L15；`src/lib/model-config/supplier-failure.ts` L16；`src/lib/supplier-cost/failure-evidence.ts` L17；`src/lib/supplier-cost/response-diagnostics.ts` L18；`src/lib/bi/context.ts` L21。

### `src/lib/supplier-cost/failure-evidence.ts`

- 分类：core；行数：23；SHA256：`c2ba9c8aebb9e85781559e00011ee11a2a497a369fec643196163b08ac602a3d`。
- 导出：`supplierFailureEvidence` L3。
- 函数/类型：`supplierFailureEvidence` L3–22。
- 仓内依赖：无静态仓内导入。

### `src/lib/supplier-cost/io.ts`

- 分类：core；行数：19；SHA256：`d300ef775d53d75b26f10ba8d727bc42a276c439f88a646c324e1525d86d4a03`。
- 导出：`readBounded` L4；`readBoundedBytes` L7；`queryReceipt` L13。
- 函数/类型：`readBounded` L4–6；`readBoundedBytes` L7–12；`queryReceipt` L13–18。
- 仓内依赖：`src/lib/supplier-cost/money.ts` L2；`src/lib/model-config/transport.ts` L3。

### `src/lib/supplier-cost/money.ts`

- 分类：core；行数：35；SHA256：`78dad1c8ada5f15086cbe8014bd32e3c5aa2bde88ca198b4db0dd104024fc5ff`。
- 导出：`MICRO` L2；`decimalMicros` L3；`fixed` L15；`multiplyMicros` L22；`abs` L23；`parseReceiptJson` L26。
- 函数/类型：`decimalMicros` L3–14；`fixed` L15–21；`multiplyMicros` L22–22；`abs` L23–23；`parseReceiptJson` L26–34。
- 仓内依赖：无静态仓内导入。

### `src/lib/supplier-cost/phase.ts`

- 分类：core；行数：11；SHA256：`467191f3af10f9c80fd1d82e5909eb06cb4152de72ac06c4f2c0f82df0b2fdf0`。
- 导出：`modelCostPhase` L1。
- 函数/类型：`modelCostPhase` L1–10。
- 仓内依赖：无静态仓内导入。

### `src/lib/supplier-cost/policy.ts`

- 分类：core；行数：12；SHA256：`2db04706f817dbed73f48360c7008a1ae575be44eca78c9838669bce46723c47`。
- 导出：`fxSchema` L3；`policySchema` L4；`costPolicy` L11。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：无静态仓内导入。

### `src/lib/supplier-cost/receipt-buffer.ts`

- 分类：core；行数：34；SHA256：`3badb1eca7b524c0473eb4390b717967b1fb67a9761f5a315c6bf7b7cd992f20`。
- 导出：`ReceiptBuffer` L3。
- 函数/类型：`ReceiptBuffer` L3–33。
- 仓内依赖：无静态仓内导入。

### `src/lib/supplier-cost/reconciliation.ts`

- 分类：core；行数：37；SHA256：`d19b08d28c6c0174e62cce443527c91784e824218bd5821304af0a2ab9882950`。
- 导出：`reconcileUsage` L8。
- 函数/类型：`reconcileUsage` L8–36。
- 仓内依赖：`src/lib/supplier-cost/money.ts` L3；`src/lib/supplier-cost/adapters.ts` L4；`src/lib/supplier-cost/repository.ts` L5；`src/lib/supplier-cost/policy.ts` L6；`src/lib/staging-history.ts` L7。

### `src/lib/supplier-cost/repository.ts`

- 分类：core；行数：96；SHA256：`a248e82a8c3d4779cd80294f9c7ec77abbf910ec6daab494e14e3b89e6690037`。
- 导出：`createSupplierLedger` L9。
- 函数/类型：`createSupplierLedger` L9–95。
- 仓内依赖：`src/lib/supplier-cost/schema.ts` L4；`src/lib/supplier-cost/money.ts` L5；`src/lib/staging-history.ts` L6；`src/lib/supplier-cost/types.ts` L7。

### `src/lib/supplier-cost/response-diagnostics.ts`

- 分类：core；行数：8；SHA256：`efc5921b35b0bc50c3d674af04bff9732f3fab105741414a36c370be2e37a27f`。
- 导出：`ImageResponseFailure` L2；`bindResponseDiagnostics` L4；`recordImageResponseFailure` L5。
- 函数/类型：`ImageResponseFailure` L2–2；`bindResponseDiagnostics` L4–4；`recordImageResponseFailure` L5–7。
- 仓内依赖：无静态仓内导入。

### `src/lib/supplier-cost/router.ts`

- 分类：core；行数：41；SHA256：`a23b0c6e6355c1c09d04c5114204a7a367c63265b4ffb07e4b24a04f16908c00`。
- 导出：`importRouterOperation` L12。
- 函数/类型：`importRouterOperation` L12–40。
- 仓内依赖：`src/lib/supplier-cost/io.ts` L2；`src/lib/supplier-cost/runtime.ts` L3；`src/lib/model-config/credentials.ts` L4；`src/lib/supplier-cost/money.ts` L5；`src/lib/supplier-cost/repository.ts` L6；`src/lib/supplier-cost/types.ts` L7；`src/lib/model-config/storage-schema.ts` L8。

### `src/lib/supplier-cost/runtime.ts`

- 分类：core；行数：7；SHA256：`ea7505bb252d4fb5736693d91246ee1940b2a81731c3d819ec1ea7c3bc63a912`。
- 导出：`accountIdentity` L5；`supplierLedger` L6。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：`src/platform/db/pool.ts` L3；`src/lib/supplier-cost/repository.ts` L4。

### `src/lib/supplier-cost/scan.ts`

- 分类：core；行数：83；SHA256：`3089508955a23bae4db01117773a8769cba9f2e000cb497b8804ffc5578e26d7`。
- 导出：`scanSupplierCostJobs` L22。
- 函数/类型：`usageJobKey` L18–21；`scanSupplierCostJobs` L22–82。
- 仓内依赖：`src/lib/release-runtime/background-activity.ts` L1；`src/lib/supplier-cost/runtime.ts` L4；`src/lib/supplier-cost/runtime.ts` L5；`src/lib/supplier-cost/repository.ts` L6；`src/lib/supplier-cost/schema.ts` L7；`src/lib/model-config/credentials.ts` L8；`src/lib/supplier-cost/apimart.ts` L9；`src/lib/supplier-cost/router.ts` L10；`src/lib/supplier-cost/reconciliation.ts` L11；`src/lib/supplier-cost/policy.ts` L12；`src/lib/staging-history.ts` L13。

### `src/lib/supplier-cost/schema.ts`

- 分类：core；行数：77；SHA256：`ba14dd36b7a5998a29363ae5815b7872e9ee72a73c597c3f392ec101c125eb31`。
- 导出：`SUPPLIER_COST_SQL` L5；`ensureSupplierSchema` L68。
- 函数/类型：`ensureSupplierSchema` L68–76。
- 仓内依赖：`src/platform/db/schema-readiness.ts` L1。

### `src/lib/supplier-cost/types.ts`

- 分类：core；行数：15；SHA256：`1a0e57c448d6953ad505dbb47a396fbb06ac4de940f44a224b0424c503815a19`。
- 导出：`CostStatus` L2；`FxSnapshot` L3；`CostContext` L4；`CostReceipt` L5；`AccountInput` L12；`CallInput` L13；`CostFilter` L14。
- 函数/类型：`CostStatus` L2–2；`FxSnapshot` L3–3；`CostContext` L4–4；`CostReceipt` L5–11；`AccountInput` L12–12；`CallInput` L13–13；`CostFilter` L14–14。
- 仓内依赖：`src/lib/model-config/business-schema.ts` L1。

### `src/lib/supplier-cost/video.ts`

- 分类：core；行数：14；SHA256：`6cb789ab45357ed25e13151ec21c9aef1dcfe7a6d7e2fa773f7fa423f4ec0625`。
- 导出：`videoSupplierReceipt` L7。
- 函数/类型：`videoSupplierReceipt` L7–13。
- 仓内依赖：`src/platform/db/pool.ts` L2；`src/lib/supplier-cost/runtime.ts` L3；`src/lib/supplier-cost/adapters.ts` L4；`src/lib/supplier-cost/schema.ts` L5。

### `src/lib/supplier-cost/worker.ts`

- 分类：core；行数：4；SHA256：`8270daf518c522d8b67d0d95440043e9d0a3021c2f5f2721d94b33f870bf9a36`。
- 导出：无命名导出 / 数据或样式文件。
- 函数/类型：见数据、样式或导出变量。
- 仓内依赖：`src/lib/application/supplier-cost-recovery.ts` L3。

### `src/lib/supplier-models/access.ts`

- 分类：core；行数：46；SHA256：`00533820191a90a26371b41ccaa70cd100c1f8e712c88ee703c4fef6865fa335`。
- 导出：`createSupplierModelsHandler` L13；`supplierModelsHandler` L45。
- 函数/类型：`createSupplierModelsHandler` L13–44。
- 仓内依赖：`src/lib/bi/access.ts` L3；`src/lib/supplier-cost/io.ts` L4；`src/lib/model-config/server.ts` L5；`src/lib/model-config/catalog-store.ts` L6；`src/lib/supplier-models/types.ts` L7；`src/lib/supplier-models/repository.ts` L8。

### `src/lib/supplier-models/discovery.ts`

- 分类：core；行数：125；SHA256：`e00262ceb88f99cd4c3feaa6fa0b102a249248dce28d1107d14c737115a5b556`。
- 导出：`documentedVideoDefinition` L13；`cleanSource` L35；`sourceHash` L41；`reverseHubCatalogMetadata` L46；`PublicSupplierDirectory` L64；`discoverPublicSupplierDirectory` L65；`documentedMetadata` L93。
- 函数/类型：`documentedVideoDefinition` L13–32；`cleanSource` L35–40；`reverseHubCatalogMetadata` L46–63；`PublicSupplierDirectory` L64–64；`discoverPublicSupplierDirectory` L65–87；`documentedMetadata` L93–124。
- 仓内依赖：`src/lib/supplier-models/specifications.ts` L2；`src/lib/model-config/transport.ts` L4；`src/lib/model-config/schema.ts` L5；`src/lib/supplier-cost/io.ts` L6；`src/lib/supplier-cost/money.ts` L7；`src/lib/supplier-models/types.ts` L8；`src/lib/model-config/types.ts` L9；`src/lib/video/capability-schema.ts` L10。

### `src/lib/supplier-models/image-model-metadata.ts`

- 分类：core；行数：14；SHA256：`28a1c144f2d61322c1873d61a2e151a33f4c6d6c1ebb64421b3a7e3bc4278579`。
- 导出：`readImageModelMetadata` L7。
- 函数/类型：`readImageModelMetadata` L7–13。
- 仓内依赖：`src/lib/model-config/types.ts` L3；`src/lib/supplier-models/schema.ts` L4。

### `src/lib/supplier-models/imagegen-access.ts`

- 分类：core；行数：19；SHA256：`963f66712ed29612e7ae607ae0285d2046cc5fd8f54e38774417be649b72f33f`。
- 导出：`readImagegenDefaults` L9。
- 函数/类型：`readImagegenDefaults` L9–18。
- 仓内依赖：`src/lib/supplier-models/image-model-metadata.ts` L1；`src/lib/model-config/types.ts` L5；`src/lib/supplier-models/types.ts` L6；`src/lib/imagegen/capabilities.ts` L7；`src/lib/supplier-models/specifications.ts` L8。

### `src/lib/supplier-models/imagegen-observations.ts`

- 分类：core；行数：51；SHA256：`0cfb9009d6ebb687fa35bc7290733e542110d61f69fca8a12912d6ca3fac6214`。
- 导出：`imagegenEditObservationSchema` L9；`ImagegenEditObservation` L17；`addImagegenEditObservation` L19；`recordImagegenEditObservation` L32；`removeImagegenEditObservation` L41。
- 函数/类型：`ImagegenEditObservation` L17–17；`addImagegenEditObservation` L19–29；`recordImagegenEditObservation` L32–39；`removeImagegenEditObservation` L41–50。
- 仓内依赖：`src/lib/imagegen/capabilities.ts` L3；`src/lib/supplier-models/repository.ts` L4；`src/lib/supplier-models/types.ts` L5。

### `src/lib/supplier-models/quality-access.ts`

- 分类：core；行数：13；SHA256：`b9ccb3f0c22583fc146abbd1588f00456a791ef904fd26e78491a0dcd088d443`。
- 导出：`readQualityDefaults` L8。
- 函数/类型：`readQualityDefaults` L8–12。
- 仓内依赖：`src/lib/supplier-models/image-model-metadata.ts` L1；`src/lib/model-config/types.ts` L5；`src/lib/supplier-models/types.ts` L6；`src/lib/supplier-models/quality-defaults.ts` L7。

### `src/lib/supplier-models/quality-defaults.ts`

- 分类：core；行数：29；SHA256：`4359a5de0c88b8750b24e4446782148290d56aff66553bea7912deaf40a7c0b2`。
- 导出：`metadataQualitySchema` L6；`MetadataQualityDefaults` L10；`metadataQualityDefaults` L11。
- 函数/类型：`MetadataQualityDefaults` L10–10；`metadataQualityDefaults` L11–28。
- 仓内依赖：`src/lib/model-config/quality-policy.ts` L2；`src/lib/supplier-models/types.ts` L3。

### `src/lib/supplier-models/repository.ts`

- 分类：core；行数：151；SHA256：`38efec78a60c8862e6a7880bf8c1edb1c57e5a92b1ba29b8ee6ca2a05eaa1151`。
- 导出：`SupplierMetadataError` L16；`ingestSupplierDirectory` L37；`ingestSupplierSources` L42；`importConfiguredSupplierModels` L98；`listSupplierModels` L117；`readSupplierModel` L129；`saveSupplierModel` L132；`supplierModelHistory` L148。
- 函数/类型：`SupplierMetadataError` L16–16；`writePrices` L19–22；`insert` L23–36；`ingestSupplierDirectory` L37–41；`ingestSupplierSources` L42–97；`importConfiguredSupplierModels` L98–116；`listSupplierModels` L117–128；`readSupplierModel` L129–131；`saveSupplierModel` L132–147；`supplierModelHistory` L148–150。
- 仓内依赖：`src/lib/supplier-models/schema.ts` L4；`src/lib/supplier-models/types.ts` L5；`src/lib/model-config/types.ts` L6；`src/lib/model-config/catalog.ts` L7；`src/lib/supplier-models/specifications.ts` L8；`src/lib/image-model-routing.ts` L9；`src/lib/supplier-models/discovery.ts` L10；`src/lib/supplier-models/discovery.ts` L11；`src/lib/supplier-models/video-access.ts` L12；`src/lib/supplier-models/video-schema.ts` L13。

### `src/lib/supplier-models/resolution-access.ts`

- 分类：core；行数：13；SHA256：`fa4b073fb7732756ba6a7165a8c18c0ade81e49515b3edc44e22297cc815c2ae`。
- 导出：`readResolutionDefaults` L8。
- 函数/类型：`readResolutionDefaults` L8–12。
- 仓内依赖：`src/lib/supplier-models/image-model-metadata.ts` L1；`src/lib/model-config/types.ts` L5；`src/lib/supplier-models/types.ts` L6；`src/lib/supplier-models/resolution-defaults.ts` L7。

### `src/lib/supplier-models/resolution-defaults.ts`

- 分类：core；行数：21；SHA256：`2c28b3b1fea2175e660b0f1fc41d0f141a70803391b97c1188eac7b0a2022bc0`。
- 导出：`metadataResolutionSchema` L6；`MetadataResolutionDefaults` L7；`metadataResolutionDefaults` L8。
- 函数/类型：`MetadataResolutionDefaults` L7–7；`metadataResolutionDefaults` L8–20。
- 仓内依赖：`src/lib/supplier-models/specifications.ts` L1；`src/lib/model-config/resolution-policy.ts` L3；`src/lib/supplier-models/types.ts` L4。

### `src/lib/supplier-models/schema.ts`

- 分类：core；行数：33；SHA256：`3ee0ea46985c84a0483ee19baada984b1e83041185bedfa2d1d5cffda7ec75de`。
- 导出：`SUPPLIER_MODELS_SQL` L4；`ensureSupplierModels` L29。
- 函数/类型：`ensureSupplierModels` L29–32。
- 仓内依赖：`src/platform/db/schema-readiness.ts` L1。

### `src/lib/supplier-models/specifications.ts`

- 分类：core；行数：52；SHA256：`ca18ec0a56635a5e162dcaff26dd0b8f8caf7da82bab5ab465c79a66370e3c71`。
- 导出：`SupplierSpecificationCatalog` L6；`collectedImagegenDefaults` L9；`specificationImagegen` L16；`specificationResolution` L36。
- 函数/类型：`SupplierSpecificationCatalog` L6–6；`collectedImagegenDefaults` L9–13；`specificationImagegen` L16–33；`specificationResolution` L36–51。
- 仓内依赖：`src/lib/model-config/resolution-options.ts` L1；`src/lib/model-config/resolution-policy.ts` L2；`src/lib/imagegen/types.ts` L3；`src/lib/imagegen/capabilities.ts` L4。

### `src/lib/supplier-models/types.ts`

- 分类：core；行数：58；SHA256：`a7c42ebaea2daed54321de879aa4aa5ca57a8039f00f779076a591c6e4202456`。
- 导出：`CAPABILITY_STATES` L7；`PRICE_BASES` L8；`supplierCapabilitiesSchema` L16；`supplierPriceSchema` L22；`supplierMetadataSchema` L34；`SupplierMetadata` L52；`SupplierPrice` L53；`SupplierModelRecord` L54；`SupplierModelSummary` L56；`unknownSupplierMetadata` L57。
- 函数/类型：`hasCredentialFields` L14–14；`SupplierMetadata` L52–52；`SupplierPrice` L53–53；`SupplierModelRecord` L54–54；`SupplierModelSummary` L56–56；`unknownSupplierMetadata` L57–57。
- 仓内依赖：`src/lib/supplier-models/resolution-defaults.ts` L1；`src/lib/supplier-models/quality-defaults.ts` L2；`src/lib/video/capability-schema.ts` L4；`src/lib/imagegen/capabilities.ts` L6。

### `src/lib/supplier-models/video-access.ts`

- 分类：core；行数：51；SHA256：`0a8271350abb0facc1a9f9390fbfbf7854a92550c44f8db30ef5612dac91df01`。
- 导出：`SupplierVideoDefinition` L11；`recordSupplierVideoDefinition` L13；`supplierVideoDefinition` L39；`readVideoDefaults` L44。
- 函数/类型：`SupplierVideoDefinition` L11–11；`recordSupplierVideoDefinition` L13–33；`parseRow` L34–38；`supplierVideoDefinition` L39–43；`readVideoDefaults` L44–50。
- 仓内依赖：`src/lib/supplier-models/video-schema.ts` L1；`src/platform/db/pool.ts` L7；`src/lib/video/capability-schema.ts` L8；`src/lib/model-config/types.ts` L9。

### `src/lib/supplier-models/video-schema.ts`

- 分类：core；行数：18；SHA256：`4253498572185ab2edc562b051f24f1e04a4a6d2c289357a8c8bb52f4b8d2db8`。
- 导出：`ensureSupplierVideoSchema` L5。
- 函数/类型：`ensureSupplierVideoSchema` L5–17。
- 仓内依赖：`src/platform/db/schema-readiness.ts` L2。

### `src/lib/worker/scan.ts`

- 分类：related；行数：36；SHA256：`0ee106e52519a4446289a829037f1f9f8ff57aaff1c03009bad8e04c2f7f8d29`。
- 导出：`scanApplicationWorkerOnce` L11。
- 函数/类型：`scanApplicationWorkerOnce` L11–35；`phase` L13–13。
- 仓内依赖：`src/lib/video/worker.ts` L2；`src/lib/canvas-image-tasks.ts` L3；`src/lib/worker/image-recovery.ts` L4；`src/lib/supplier-cost/worker.ts` L5；`src/lib/worker/media-recovery.ts` L6；`src/lib/reference-workbench/service.ts` L17。

## 外部消费者与递归依赖

上述源码全部列于 SOURCE_COVERAGE.csv，不以边界索引声称已审阅每个消费者的全部业务。

## 非字面量 dynamic import
