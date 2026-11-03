# 企业站标签页图标遗漏修复

## 模块与职责

根布局负责页面 metadata；品牌模块继续拥有默认图标与显式白标配置的回退顺序。此次仅修复企业站分支漏传 icons，不引入新配置、资源或服务。

## 调研结论

- 修复基线：`c4b1e2670ea2aebbd056fbf012f2c2ba0a93c513`。
- 前轮对 47 的实际读验收：运行 `806603fd12213543dd8f7122d822fd4d51c4b417` / `1793620641`，企业模式页面没有 icon link；`/brand/naumi/app-dark.png` 返回 200 PNG，`/favicon.ico` 为 404。此为前轮观测，不当作本轮发布证据。
- `src/app/layout.tsx` 的 platformMetadata 已有 icons，generateMetadata 的 enterprise 分支遗漏；该问题仍存在于本轮刷新后的 origin/main。

## 本次实现与接口

企业分支增加 `icons: platformMetadata.icons`，复用现有 BRAND_FAVICON。企业 title、description、noindex/nofollow 不变；平台 SEO 不扩散到企业站。没有改变数据库、身份、画布、任务、计费或在线运行配置。

## 集中验证

`node scripts/verify-enterprise-favicon.cjs [source-root]` 从真实 root layout AST 提取 metadata 声明和 generateMetadata，执行真实 brand.ts，再调用实际 Next icon resolver/renderer 与 React SSR。仅 siteProfile 为受控 fixture，不启动整站、不访问 DB/网络。

- 基线：10 项中 4 项企业图标用例失败，输出 `ENTERPRISE_FAVICON=FAIL CASES=10 FAILED=4 NEXT_ICON_RENDER=1 NETWORK=0`，exit 1。
- 修复版：10/10，输出 `ENTERPRISE_FAVICON=PASS CASES=10 FAILED=0 NEXT_ICON_RENDER=1 NETWORK=0`，exit 0。
- 覆盖平台/企业两模式、默认 PNG、显式 favicon 优先、custom logo 回退、空白配置回退、企业 SEO 隔离、原 siteProfile 异常传播和 PNG 存在。
- `node scripts/verify-brand-config.mjs`：`BRAND_CONFIG=PASS checks=50`，exit 0。
- `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`：stdout/stderr 空，exit 0。
- 独立副本回滚及最后文件后改保护记录保存在外部 VERIFICATION.txt；工作源码和 MODIFIED_FILE 保留修复状态。

## 交付与未完成项

证据目录：`E:/Workspace/naumi-task-evidence/enterprise-favicon-20261103/`，含原/改 SHA256、完整命令/输入/stdout/stderr/exit、MODIFIED_FILE.zip、DIFF_FILE.patch、VERIFICATION.txt、可执行 ROLLBACK.sh。

本次源码修复普通合并/推送 main，固定提交与整合回执见 DELIVERY.json。本轮不部署 47 或 103，不变更公开说明。47 的在线图标恢复须在发布此修复后另行核对；本地 metadata 渲染通过不等于线上已更新。
