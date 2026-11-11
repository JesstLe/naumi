# 移除来源标注相关文档与审计材料（2026-11-11）

## 模块与职责

文档与审计材料清理：专项许可记录、融合分析包、来源对比/审计记录、融合阶段审计工具脚本。业务实现、共享测试基建（`scripts/video-fusion/` 的 harness/fixture/media-engine 等被数十个活跃 verify 脚本引用）与功能性引用不变。

## 判定规则

按用户指示：含外部参考项目标识且已进 git 的文档 → 移除；未进 git 的文档一律不动（本轮未发现含标识的未跟踪文档）。

## 本次实现

删除（30 个文件，全部已跟踪）：

- `docs/licenses/` 两个外部参考项目的专项许可记录（5 个文件，目录移除）；
- `docs/superpowers/` 融合设计与 18 项实施计划（2 个文件）；
- `docs/changes/` 来源审计、演示对比、上游对比、融合盘点索引（4 个文件）；
- `docs/analysis/canvas-fusion-20261027/` 融合能力分析包（8 个文件，目录移除）；
- `audit-artifacts/` 2026-09 视频改造证据中含来源本地路径的 3 个文档/补丁及引用它们的 ROLLBACK/VERIFICATION（8 个文件，目录移除）；
- 融合阶段审计工具：`scripts/video-fusion/` 的 `comparison.json`、`coverage.json`、`verify-reference-native.mts` 及 `scripts/verify-video-fusion-{comparison,e2e,protection,safety}.mjs`（无 package.json/CI/代码调用方；e2e/protection/safety 仅读取被删的清单与设计文档）。

改写（21 个文件，来源标识改为通用表述，记录本体与 Naumi 侧事实保留）：`AGENT_COLLABORATION`、`CANVAS_CAPABILITY_ADAPTATION`、`NAUMI_STAGING_MIGRATION_README`、`VIDEO_SUBSYSTEM_REWRITE_PLAN`、`docs/changes/` 2026-10-13～10-28 的 15 份模块记录、前一轮移除记录；所有指向已删材料的链接同步改为"已随来源标注清理移除"。

保留项：根 `LICENSE` 与 `README.md` 的本仓库 AGPL-3.0 许可声明（项目自身许可，不含外部项目名）；`package-lock.json`（integrity 哈希随机撞中"AGPL"字样，误匹配）；`output/` 一张 PNG（二进制误匹配）；`source-dialogs.tsx` 的参考供应商网关功能性地址；`scripts/video-fusion/` 其余共享测试基建；`docs/changes/` 中与外部项目无关的 `source-manifest`/nginx `upstream` 等同名概念。

## 验证命令、结果及证据层级

- 全仓库大小写不敏感 grep（项目名/仓库路径/固定提交哈希/网关域名/词条）：仅剩功能性网关地址 1 处。
- 已删路径悬空引用 grep：0 命中（首轮发现的 audit 残留文件、fusion-progress 长行、rollback/canvas-native-progress 引用已二次修复）。
- 证据层级：本地静态核验；纯文档/审计材料变更，不触发业务发布，不增加功能迭代或成功发布计数。

## 未完成项与下一步

- git 历史旧提交仍含这些文件；按现行规则不改写历史、不强推。如需彻底清除历史需另行专项任务。
- 若相关代码确为外部许可证衍生，对外分发时按许可证要求保留声明；根 LICENSE 是否调整由用户决定。
