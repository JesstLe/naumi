# Nano Banana 参考图编辑能力修复（47）

## 现象

47 原生画布选择 Nano Banana Pro、1 张参考图、3:4、1K 时，计划阶段提示“所选模型没有已核实支持本次参数的通道”。

## 根因

两个已启用的 Geeknow 香蕉通道只有旧版 `capabilities.edit=true`，整体 `verified=false`，新图像能力校验因此把独立的 `imagegen.edit` 判为 `unknown`。全局改 `verified=true` 会错误放开身份保持、质量、分辨率等尚未逐项核验的能力，未采用。

## 真实证据（只读）

- `geeknow-nano-banana-pro` / `gemini-3-pro-image-preview`：supplier call `fdd50214-3389-4eac-888b-cae521448598`，`phase=edit`、HTTP 200、`delivered=1`、输出 delivered；对应作业完成，私有媒体 1024×1024。
- `geeknow-nano-banana-2` / `gemini-nano-banana-2.1`：supplier call `7cd9a47e-632a-4e9d-b863-9a008293d9ca`，同样为真实单图编辑交付；对应作业完成，私有媒体 1024×1024。
- 两个作业均为完成态、同一用户归属、模型配置版本 112；参数快照含参考图列表字段 `images`，未输出提示词、邮箱、签名 URL 或凭据。

## 修复边界

仅给以上两个 upstream 增加 `capabilities.imagegen.edit` 的 `supported` 证据，日期 `2026-10-15`。保持 `verified=false`、`preserveIdentity=false`、质量/分辨率/透明/蒙版等未核验能力、价格、供应商权重和启停状态不变。Prompt Hubs 和其他供应商保持 unknown；管理员已显式维护的 `imagegen.edit` 不覆盖。

## 本地验证

`scripts/verify-banana-edit-evidence.ts` 已通过：基线 10 个比例入口均 0 个候选；修改后每个入口恰好 Geeknow 1 个候选，未知通道仍排除；参考图数量 2、蒙版、透明背景和未声明参数仍被拦；生成路径、路由投影与价格不变；独立副本回滚恢复原 SHA 和原拒绝行为。`scripts/verify-imagegen-capabilities.ts`、`scripts/verify-model-publication.ts`、TypeScript 全量检查均通过，供应商调用 0。

证据目录：`output/banana-edit-evidence-20261015/`（仅本地忽略产物）。

## 发布状态

未改线上。候选需纳入 2026-10-15 19:00 47 统一蓝绿窗口，持三把部署锁并先重核配置版本、资源余量和在线任务；不新增并行候选、不原地重启、不影响正在使用的用户。
