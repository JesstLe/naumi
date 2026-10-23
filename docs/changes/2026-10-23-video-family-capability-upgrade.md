# 视频家族能力字段升级规划（2026-10-23）

## 本模块完成内容

- 新增 `makeVideoFamilyCapabilityUpgradePlan(source, entries)` 纯函数。`entries` 的类型为 `VideoFamilyCapabilityUpgradeEntry[]`，包含 `providerId/model/publicId/definition: VideoModelDefinition/profile: VideoWireProfile`；文档核验由调用方完成。本函数没有 DB、网络或供应商调用，也不发布配置。
- **唯一旧基线直接读取 `video-family-presets.json.items`**。不调用 `makeVideoFamilyPlan` 推导基线，避免父模块改为用 `video-family-capabilities.json` 安装完整声明后污染旧 smoke 比较。
- 定位严格按 `publicId → 已存 public.target.id → upstream`，核对视频模态和 `providerId/model`；不按 label 或 provider/model 搜索替代目标，也不假设上游 ID 为 `verified:*`。
- 唯一写集为 `upstream.capabilities.video`、`upstream.capabilities.maxReferenceImages`、`upstream.parameterMap.videoProfile`。逐字段比较：当前等于目标即 no-op；否则仅当前深值等于旧 smoke 才写入。其他值抛 `ModelConfigError`，code=`VIDEO_FAMILY_CAPABILITY_UPGRADE_CONFLICT`，status=409，错误包含 publicId 和冲突字段。
- 返回 `{config, patches, missing, skipped}`。`patches` 按实际变化字段记录 upstream 身份、字段、before/after；缺 public/直接 upstream/provider 时列入 `missing`，不创建实体；错误目标类型/模态/身份以及重复条目报冲突。`wan2.7-videoedit` 无条件列入 `skipped`，整行保持原状。
- 新增 `rollbackVideoFamilyCapabilityUpgradePlan(current, {patches})`：仅核对原 upstream 身份和本轮实际改动字段仍等于 after，然后恢复 before。保留同事后来修改的其他 capability 字段、映射、label、采购价、客户价等；本轮字段后续变化则整次抛冲突。两个函数均深拷贝输入，失败不留下部分原对象修改，config、entry、patch 定义不共享可变对象。

深比较忽略对象键顺序，保留数组顺序，区分缺失、null、false、0；不填补默认、不将缺失管理员字段视为旧 smoke。管理员显式值若与旧 smoke 完全相同，仅凭当前存储值无法区分来源；本轮严格执行约定的值比较，不另加来源存储。

## 调用与发布边界

```ts
const plan = makeVideoFamilyCapabilityUpgradePlan(snapshot.config, verifiedEntries);
// 审查 plan.patches / plan.missing / plan.skipped 后，经现有草稿与 publishCAS 发布。
// expectedVersion、digest、revision 由既有调用链校验，不属于此纯函数。
const restored = rollbackVideoFamilyCapabilityUpgradePlan(latest.config, plan);
```

不创建 provider、凭据、public model；不调整 enabled、visible、verified/generate、默认绑定、toolScope、business、价格；不写旧 versions/default rows/历史任务。普通禁用模型允许仅升级能力，但禁用状态不变。rollback 不还原整行、public 路由或整个配置。

父任务维护新完整声明 JSON、默认常量/wrapper、安装器、v2 profile/schema、modeParameters/resolutionAspectRatios、UI/protocols。本模块不编辑这些独占文件；类型随父任务扩展 `VideoModelDefinition/VideoWireProfile` 自动兼容。

## 定向验收

测试：`node node_modules/tsx/dist/cli.mjs --conditions react-server scripts/verify-video-family-capability-upgrade.ts`。

fixture 直接以旧 JSON 建造 33 个旧安装项；使用现有合法 profile 和扩展 definition，不依赖父任务新 profile/schema，测试声明不等同于供应商证据。覆盖严格写集、32 个普通目标升级/特殊禁用项保留、稳定目标与同 provider/model 干扰项、幂等、混合旧/目标字段、管理员改动/字段缺失冲突、missing 不创建、普通禁用不启用、输入与 patches 无别名、来源优先级保持，以及完整/选择性 rollback、同事字段保留、changed-after 冲突与失败原子性。

集中定向验收通过：`BASELINE PASS oldSmoke=33 source=immutable-preset-items`；`MODIFIED PASS upgradedTargets=32 patches=95 idempotent=true missing=reported disabled=preserved`；`ROLLBACK PASS original=restored colleagueFields=preserved changedAfter=conflict sourceMutation=false`；`VIDEO_FAMILY_CAPABILITY_UPGRADE PASS assertions=66 db=0 network=0 supplier=0`，exit=0。不运行全量 tsc/build，由父任务集中验收。未 push、SSH、publish 或调用供应商；47 继续 **HOLD**。

开工远端刷新 `git fetch origin main` 返回 exit=1：`schannel: failed to receive handshake, SSL/TLS connection failed`；本地基线为 `9ae4edff57efdaf34d1418ae58fcc12e1c4c1582`，没有替换他人内容或自行合入其他分支。
