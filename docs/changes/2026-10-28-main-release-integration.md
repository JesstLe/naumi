# 非重构分支整合与新版发布准备

## 请求与固定基线

用户要求将重构线之外的分支合入 main，准备新版。本轮执行 Git 整合、集中验证、固定版本构建及回滚材料准备；服务器切流不属于本轮已完成状态。

- 初次全量 fetch 盘点：main `07fca6137aafe8cef1f4907706eb5e0322d1893f`，305 个本地/远端引用，287 个引用已是主线祖先。
- 盘点期间音频负责人已完成普通合入并推送：main `815603cb0fe5496473d0854fc87b4c38b1d6d3f8`。本任务独立工作树实际基于该新 main，不重复搬运、遗漏或回退其音频实现。
- 独立工作树 `E:/Workspace/naumi-release-integration-20261028`，分支 `codex/release-integration-no-refactor-20261028`。共享 checkout 的管理 UI、规则和 Canvas action menu 等未提交文件保持原样。

## 纳入与排除核对

- 原生音频完整候选：`516768a21cda30f49936aea28fb64f04d6fc8c65`，已由主线 `815603cb` 包含；其先前原位图片版本、报价、坐标、Gemini 修复均保留。
- 四条旧任务分支 `t3/benchmark-case-evidence`、`t3/supplier-quota-health`、`t3/verify-original-image-continuation`、`t3/video-capability-upgrade` 的唯一补丁均 patch-equivalent。逐条普通 merge 补齐 ancestry，并核验每次 tree ID 完全不变。
- benchmark 文档 add/add 冲突只发生在主线后补的“父整合接线”段落，保留该更新；没有重置主线文件到旧稿。
- 排除 `codex/core-refactor-20261024`、`codex/modular-refactor-20261024`、`codex/excluded-refactor-attempt-20261026`、`origin/codex/release103-refactor-20261027` 及对应别名。音频新增 ancestry 与这些分支在初始 main 之外的提交交集为零；末次覆盖核对继续检查重构头未成为候选祖先。
- 历史 `*-rollback-compat`、`backup-4087-before-dock-split`、`canvas-parameter-baseline` 是回滚/对照引用，不重新引入旧实现。parameter-baseline 只剩历史 merge 节点，没有新的独立功能提交。
- 已废弃的执行架构原型和其他工作树未提交稿未收编。多轨仍属于音频后续模块，不作为此次已交付功能开放。
- 首次镜像构建期间出现多轨纯模块检查点 `c8b36fde8ee58132c242d6641758a090dcb2b286`，并已由负责人普通同步 main 为 `e6b1c6d1e06e44a2fb7b1a9e7f2999280b203c56`。本轮以该固定提交为最终追加截止，普通合入其 6 个已提交文件；新增 ancestry 与所有已识别重构引用的独立提交交集为零。没有搬运该工作树继续开发中的 `creation-context`、节点 API、持久化与服务文件。
- 多轨只纳入工程规则、预览计划及既有媒体引擎的 FFmpeg 配方，新增源码没有运行入口调用；菜单继续禁用。74 组规则和真实本机 FFmpeg 成片采样集中复验通过，完整多轨编辑器/持久化/任务闭环仍未完成。原检查点文档中的“未合 main”是提交当时状态，以本整合记录和最终 SHA 为准。

## 模块、接口与数据归属

本整合任务不新增队列、业务事务、服务接口或供应商参数规则。业务实现继续由各原模块拥有；本任务编写的内容仅为固定候选的公开更新说明和本交接记录，追加合入上述已验收的多轨纯模块切片。其计划层只依赖 zod，配方层单向使用现有 MediaJobRequest 契约，不拥有数据库或计费事务。Git 引用覆盖、源树校验、构建制品与本地副本回滚由本任务证据目录维护。

## 公开候选说明与构建

- 固定 BUILD_VERSION：`1793164841`。
- 首轮 `e68fbd2b` 镜像只是本地未发布候选；追加切片后重新从最终 main 完整构建，以最终 `RELEASE_READY.json` 的 source/image 为准，不将首轮镜像冒充包含新增切片。该候选版号没有上线，公开功能文案不包含尚未开放的多轨。
- 公开说明只写音频剪辑、图片原位版本、报价显示、位置与生成稳定性，不公开内部地址、供应商、提交号、用户数据或排障细节。
- 先提交/普通合入 main，再从固定 main SHA 构建；具体 source/image/version 与构建结果以 ignored 目录 `RELEASE_READY.json` 为准。
- 本机预检 C/D/E 占用均超过 80%，可用分别约 58.5/23.5/21.9 GiB。构建前只按精确 ID 尝试清理已标记可回收、非共享、非可变且超过 7 天的 Next 构建缓存；未删除容器、镜像、volume、数据库、媒体或别人的工作树。实际回收量由清理日志记录，不把命令 exit0 当作已释放空间。
- 构建使用本地 Linux Docker，限制编译并发和 Node 堆；不把本地构建或健康检查当成线上发布。配置和数据仍按站点独立维护。

## 验证与回滚

基线、集中回归、真实媒体/数据库测试、类型/构建、静态入口和候选版号检查的完整命令、字面输出、退出码写入 `VERIFICATION.txt`；既有历史失败保留，不冒称全仓库测试全绿。

首轮集中验证覆盖报价真实组件、画布冻结回执、位置、Gemini 异步、图片版本真实 PG 与本地完整生成管线，以及真实 App/PG/媒体 Worker 的音频非零计费、取消退款、未知 ACK、并发 CAS 和原子历史。追加切片没有修改这些实现；保留首次完整结果并验证这些路径内容未变，追加执行多轨 74 组、音频 53 组、scoped history 12 组、公开目录和最终 Linux 构建/镜像验收，不为无关改动重复发起真实供应商调用。

原 main 全量归档及 hash 保留。四产物 `MODIFIED_FILE.tar`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh` 均留在 `E:/Workspace/naumi/output/release-integration-no-refactor-20261028/`。回滚仅对标记的本地副本进行，验证原 hash/公开目录与行为恢复，保留修改包；不回灌业务数据库、不重放已受理任务。

## 未完成项与交接

最终 main/远端 SHA、构建镜像 ID、未提交工作保留情况、任务工作树清理和准备状态以 `DELIVERY.json` / `RELEASE_READY.json` 为准。服务器上线仍需在指定站点核对真实当前入口、Web/Worker、锁/未排空状态、配置、备份与固定候选的现场验收；本轮不把这些项目伪记为已执行。
