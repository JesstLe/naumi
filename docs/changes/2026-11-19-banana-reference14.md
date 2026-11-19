# 两个香蕉模型支持 14 张参考图

## 范围与基线

用户要求 Nano Banana Pro、Nano Banana 2 支持 14 张参考图。负责人为本线程；任务分支 `codex/banana-reference14-20261119`，工作目录 `E:/workspace/naumi-banana-reference14-20261119`，基线及首次刷新 `origin/main` 为 `2778285e15ca66f0082e16f6e4270a2622b8f1e3`。

模型注册表是能力上限真源；前端目录、路由模拟、执行快照和 APIMart 适配器消费该配置。画布总上限为 16，适配器逐张上传并按原顺序发送 `image_urls`，没有另一个固定单图限制。此次通过既有 repository draft → runtime publish → Router 确认 → markApplied 发布配置，不直接改数据库，不更换 Web/Worker 镜像。

仅修改两个启用的 APIB 上游 `capabilities.maxReferenceImages`，由 1 改为 14：

- `apib:gemini-3-pro-image-preview`
- `apib:gemini-3.1-flash-image-preview`

保留其他供应商、禁用通道、售价、采购价、权重、参数映射、认证、已接受任务与历史执行快照。没有把 `verified` 提升为 true，也没有执行付费供应商调用。

## 依据与验证

APIB 关联的 APIMart 文档分别声明最多 14 张；关联契约不等同于 APIB 当前账号多图真实输出验收：

- https://docs.apimart.ai/en/api-reference/images/gemini-3-pro/generation
- https://docs.apimart.ai/en/api-reference/images/gemini-3.1-flash/generation

`node scripts/verify-banana-reference-limit.mjs` 退出 0：精确两字段修改、不修改输入、选择性回滚保留后续其他配置、异常基线拒绝。

47 在三锁下读取模型 v155，候选完整 schema 校验及前端目录投影通过。10 个画幅别名 × 1/2/14/15 张 × 1K/2K/4K，共 120 例路由模拟通过：1/2/14 张存在目标候选，15 张通过 `REFERENCE_LIMIT` 排除。供应商调用为 0；这属于生产配置的模拟验证，不是实际 14 图输出验收。

初始运维包运行被精简镜像缺少 `server-only`、`lucide-react` 与 React server 条件入口阻断，均发生在创建计划或发布配置之前。最终包捆绑所需纯 JS 依赖并保留生产 pg/sharp/Next/React，PLAN 已通过。失败证据保留在服务器同名 r1/r2/r3 目录。

## 发布与恢复

发布前后持 Naumi、Hub、参考工作台三锁，校验绑定的在线 Web/Worker、镜像一致性和前次发布 COMPLETE 回执。独立运维 actor 避免覆盖管理员未发布草稿。PLAN、原配置和计费快照、固定 publication UUID、请求和发布回执保存在权限 0700 的证据目录。存在请求后禁止另建编号盲目重放；不明确的结果核对原 publication。

恢复使用 `ROLLBACK` 模式，仅对当前两个仍为 14 的自有字段恢复为 1；保留之后无关配置，遇到字段冲突停止。程序镜像、入口、业务数据库和媒体不回滚。

已发布配置 **v156**，publication `703dc309-9eea-498b-a9cf-faa390772596`，phase `applied`，digest `9d331d4a1f1e70f066071e8930d40efa672f143b82c2b084adef0bca6477f022`。VERIFY 再次通过上述 120 例，计费快照完整相等。公网 `/api/models?feature=canvas.image` HTTP 200、version 156，10 个香蕉别名均返回 `maxReferenceImages:14`；公网 `/api/health` 和 `/api/version` HTTP 200。

工具已普通 merge 并推送 main，整合提交 `8f17df8382305ad6152faf71ff0d1093068f01ef`。当前运行程序仍为基线 `2778285e15ca66f0082e16f6e4270a2622b8f1e3`，构建版本 `1794993463`；本次属于后台配置发布，无 CI、无新应用构建或容器重启。

最终服务器恢复材料位于 `/opt/naumi-staging/evidence/banana-reference14-20261119-r4/`，容器内 `/tmp/banana-reference14-20261119-r4/` 保留当前 PLAN、请求及回执以供选择性恢复；不含明文凭据。初始失败包为纯 JS 依赖打包问题，第三次仍因 React server 条件入口缺失失败，最终包使用默认 React 入口后通过。旧失败容器临时包按精确路径清理，失败日志及服务器证据保留。三把部署锁已在每次操作退出时释放；没有测试宿主、额外容器、服务或付费任务需要关闭。

本机公开读回及操作日志位于 `E:/workspace/naumi/output/banana-reference14-20261119/`。未完成项仅为 APIB 当前通道真实 14 图输出验收；当前发布依据关联供应商契约，保留能力未实测标记。
