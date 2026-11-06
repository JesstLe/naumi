# 图片提示词项目锚点误报修复

## 问题与原因

上传图片使用 `source=canvas-add`，其 `parent_id` 可能只是项目归属锚点；显式图片输入另外保存在 `parent_ids`。当项目根图 A 引用同项目上传图 B 时，可能形成物理 `A.parent_id=B / B.parent_id=A`，但显式输入只有 B 作为 A 的参考。

图连线服务已经区分这两种关系，图片提示词服务却一律追踪物理 parent，导致 GET/POST 报 `IMAGE_PROMPT_PROJECT_AMBIGUOUS / 图片项目关系异常，请重新整理`。这还会影响参考图上传、节点复制及生成前的提示词保存。

## 模块、职责与边界

- `canvas/parent-link.ts`：提取既有主父节点是否属于显式输入的纯规则，图防环和提示词服务共同使用；不改变已有图输入语义。
- `canvas/image-prompt-service.ts`：仍读取并锁定同 owner 的完整有界物理祖先，保留全部 group/batch/创建归属证据。只对**稳定 group 一致且包含隐藏上传锚点**的物理环承认其稳定项目身份；真正显式环、无稳定 group 的环、跨 group 环及原有深度边界仍拒绝。
- 源快照校验增加隐藏锚点标志及 `parent_ids`，防止读取到祖先后、加锁前，关系语义被并发改变。
- owner、tenant、创建记录、节点锁、revision CAS、operation fingerprint 和历史无 group 的兼容路径保持原样。不改图、不删边，不迁移既有数据，不重新执行已接受任务。
- `canvas/image-prompt-client.ts`：明确选择“使用已保存版本”时，先读取有效服务器回执，成功且当前草稿/账号未变化后再替换本地队列；失败保留原草稿、原操作 ID 及 tab-local pending。并发 reload 合并，flush 等待读取，已观察到的新编辑优先。

## 回归

- 新增 `scripts/verify-image-prompt-project-anchor.ts`：实际 PostgreSQL、原生签名身份、真实提示词 GET/POST、参考图上传及节点复制路由；供应商/外网请求被禁用。
- 支持绝对 source/output root；`--baseline` 在未修源码真实复现 409 并预期 exit 1。
- 现场形态的 12 张原节点、保存/刷新、幂等、并发 CAS、跨 owner/project/tenant、祖先 suite 归属、锁定、历史无 group、缺失/已删除父节点、真正输入回边和不同类型的环均覆盖。
- 客户端新增失败读取保草稿、原 ACK 未知操作恢复、成功弃用冲突草稿、新编辑优先、并发 reload/flush、账号切换、在途保存和初始读取等回归。
- 两个入口登记到既有 `scripts/verification/refactor-cases.mjs`，不另建测试框架。

## 交付状态

集中验证结果：锚点真实 PG/原生路由 35 项、客户端 20 项、原有提示词持久化/复制/企业分享 25 项、参考上传 17 项、画布交互 34 case/92 checks 全部通过；全量 `tsc --noEmit` 与变更产品文件 eslint exit 0。基线原码 GET/POST 409 及失败读取丢草稿均真实复现，预期 exit 1。

本机曾借用了旧版 node_modules；首次类型检查暴露其 TypeScript/Sharp/Node 类型与 package-lock 不一致。随后使用锁定版本的独立依赖（TypeScript 5.9.3、Sharp 0.35.5、@types/node 24.19.2），在逐文件匹配的独立源码副本重跑上述集中模块与类型检查，全部通过；没有改动原共享依赖目录。

本地模块验证、依赖锁定核验和副本回滚的最终结果记录在本任务 `output/yueyao-project-fix-20261106/artifacts/VERIFICATION.txt`。本地 fixture 成功与线上发布分别登记。

本次不修改生产数据库、供应商配置或用户图关系；未执行 47 发布，既有发布 HOLD 保持。上线之后才可对实际用户页面做恢复验收。
