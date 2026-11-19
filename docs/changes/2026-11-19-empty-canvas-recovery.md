# 删除最后节点后的上传恢复

## 范围与职责

本线程负责空画布上传恢复、限定项目登记修复脚本；仅修改 `canvas-client.tsx` 的 `canvasImportContext()`，不改提示词编辑器、快捷键或他人的撤销补丁。工作目录 `E:/workspace/naumi-repair-empty-canvas-20261119`，分支 `codex/repair-empty-canvas-20261119`，基线 `9c8fc057c70bdf729af2bfa96f790eb2da9189c8`。开工和整合前刷新 `origin/main`；共享 checkout 保持原状。

原画布通过作品/文字/原生节点及 `app_canvas_video_projects` 证明物理归属，`app_creation_contexts` 固定工作空间。浏览器的导航 ID 只是视图状态，不能作为服务端授权证据。导入模块继续负责上传队列、冻结身份、回执和同步。

## 问题与实现

删除最后一个图片节点时，导航 `empty()` 保留旧 key，以支持当前画布撤销；同时进入 creatingNew。上传使用 document scope 的旧 key，服务端在上传前要求该项目仍然存在。对于没有登记的旧图片画布，最后一个节点软删除后已无物理证据，得到“画布项目不存在或无权访问”。

前端在 creatingNew 且没有实际活动项目时，仅将上传上下文 project 设为 null，让首张新图通过已有新根创建链路进入画布。旧导航 key 与撤销保持，正常活动项目和加载期间的作用域不变；服务端权限不放宽。没有自动重试收费任务。

对于已经卡住的旧页面，用户授权后可补回一个经核实的空项目登记：原始软删除根必须属于同一账号、删除时间必须与计划一致、已有工作空间必须明确、没有其他账号冲突、没有项目级删除墓碑，且 APPLY 时仍为空。仅 INSERT 一条 registry，不恢复图片、不修改工作空间/账号/权限/积分/媒体。PLAN 和原始记录保存在权限 0700 的生产证据目录，不提交用户资料。

修复使用账号和节点图事务锁，生产操作额外持 Naumi、Hub、参考工作台三锁。APPLY 请求先持久化，存在请求时禁止盲目重放；未知结果先 VERIFY 原项目。回滚仅删除本次精确登记，发现新上传/新节点即拒绝，不损害修复后的新写入。

## 验证

- `node scripts/verify-empty-canvas-import.cjs`：退出 0，4 个实际页面上下文捕获用例；保留空视图撤销 key、正常项目、加载 guard 和账号/空间 guard。
- `node scripts/verify-canvas-image-imports.cjs --output .../import-regression`：退出 0，19 场景/102 检查，包括原图、并发、账号/空间切换、已保存回执只读重试和占位节点挂载；无网络/供应商调用。
- `python scripts/verify-empty-canvas-repair.py`：独立 PostgreSQL + 固定运行镜像，退出 0，10 次执行覆盖本人空项目计划/写入/读回/回滚、他人账号、项目删除墓碑、重复写入、新内容保护；测试容器已清理。第一次重复 VERIFY 的证据文件冲突已修复并保留失败日志。
- Node 语法、Python 编译、完整 TypeScript `tsc --noEmit --incremental --tsBuildInfoFile .../typecheck.tsbuildinfo` 和 `git diff --check` 均退出 0。

以上为隔离与源码检查，不代表前端补丁已经部署或真实用户上传已验收。

## 第二张截图：Agent 无完整回复

生产只读回执核对到 2026-11-19 01:30 UTC 的原会话：文字模型上游 HTTP 200，但约 61 秒后 SDK 以 error 结束；有效文字 0、输入/输出 usage 都为 0，未出现 tool_start 或图片供应商调用。供应商调用仍为 unknown，不能把 usage 0 解释为未收费。不是图片模型的 14 图上限触发。

当前留存证据只有安全分类/摘要，没有上游原始错误正文，无法进一步确定是供应商空流、错误包或协议结束异常。保留原会话与素材；本任务没有重放请求、切换供应商或伪造成功。会话级识别资料仅留在忽略目录的私有诊断中。

## 生产状态与下一步

另一项发布 `release47-central-identity-20261119-r1` 于 01:46:37 UTC 完成 `99-end` 并释放锁。本任务没有抢锁或更改其服务。刷新在线绑定后，目标项目生产 PLAN 已通过：原工作空间明确、最后图片仍保持原删除时间、无项目级墓碑、仍为空且没有登记。尚未执行 APPLY。

恢复证据目录预计 `/opt/naumi-staging/evidence/repair-empty-canvas-20261119-r2/`。前端补丁合入主线和实际构建/部署分别记录；不以登记修复冒称前端新版已经上线。
