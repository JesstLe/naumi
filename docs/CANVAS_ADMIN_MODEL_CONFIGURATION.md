# 画布操作模型由管理员统一配置（2026-10-09）

## 范围与实现

- 用户画布移除“图片编辑操作模型”面板和扩图“执行模型”选择。普通生图、视频及其他工具的用户模型选择保留。
- 七个操作 `canvas.image / expand / text-edit / annotate / ocr / assistant / text-generate` 使用管理员已发布业务配置中的 `defaultModelId`；未配置业务项时沿用对应用途绑定。比例、尺寸、质量仍是用户操作参数，不与模型配置混为一谈。
- 管理入口复用现有后台“模型管理 → 工具/画布操作”业务编辑器，选择操作后设置“统一执行模型”，保存草稿并发布。供应商凭据、路由和价格仍复用原版本发布流程，本次没有变更任何真实供应商配置。
- 共享 `selection-policy.ts` 在报价、Request解析、fresh executor解析以及客户端选择层收口；body的 `model/modelId`、`x-naumi-feature-model/x-naumi-text-model` 和旧 localStorage均不得替换这七项管理员默认。功能目录返回 `selectionMode=admin`，仅返回当前统一模型。
- 新请求在接收时冻结配置；`describe/runBundle` 不重新选默认。管理员后续发布不改变既有异步任务/已接受账务操作。过期报价版本返回409，既有历史来源保护、幂等和消费规则保留。
- TypeScript补充 `target=es2017`，修复交接分支已有顶层await脚本在默认ES5 target下导致的全量类型检查失败；不是关闭类型检查。

## 集中验证

- `verify-canvas-admin-models.ts`：四类图像操作执行默认、切换默认、冻结记录、目录收口、普通生图选择保留；支持 `--baseline` 验证原用户可覆盖行为。
- `verify-canvas-admin-runtime.ts`：一次性空数据库/独立schema/本地Router协议fixture，七功能body/header覆盖、报价与执行一致、管理员发布默认切换、21份冻结bundle和旧版本409。不访问真实供应商、生产库或克隆工作库。
- `verify-canvas-admin-client.tsx`：七功能选择组件SSR为空、用户缓存选择失效。
- 新机 `verify-canvas-admin-module.sh`集中执行上述检查及既有business-routing完整回归。baseline/modified均已exit0；完整business-routing包含本地供应商HTTP协议fixture，不是真实模型消费。
- 本机干净非增量全量类型检查exit0、修改组件/策略的ESLint exit0；早期增量缓存错误已以非增量结果区分。构建与运行发布另见迁移README最新状态。

## 交接与回滚

本次只发布新机 `120.27.162.85`。用户此前“先不回传，除非明确要求”的约定继续有效；旧机不连接，不将新机测试数据回灌生产。视频和OSS仍延期，媒体local、不接NAS。

基线源码hash和四件套保存在 `E:\Workspace\naumi\output\canvas-admin-models-20261009` 与新机 `/opt/naumi-staging/evidence/canvas-admin-models-20261009`；主 `MODIFIED_FILE.tsx`是画布修改后副本，完整代码改动见DIFF与Git。`ROLLBACK.sh --fixture`恢复另一份源码副本并重新验证基线行为，不改变主服务。真实服务回滚只使用 `--apply`，恢复本次部署前受保护env及原固定镜像；不恢复/覆盖数据库和媒体。

```text
接手先读AGENTS.md、迁移README第20—22节和本文件。画布七操作的模型由后台
defaultModelId统一决定，普通生图/视频选择保留。只在fresh request/quote/resolve
应用选择策略，不改历史冻结执行记录。更新新机固定源码/镜像，不连接旧机，
不重放历史任务，不重复真实收费验收。检查当前commit/image/health及四件套后
再推进。修改模块文档，集中测试，选择性中文提交推送。
```
