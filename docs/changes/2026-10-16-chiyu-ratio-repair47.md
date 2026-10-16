# 赤羽比例截断修复 / 2026-10-16

## 现象与确认

- 用户截图对应09:32:45提交的9:16/4K/medium、3参考图任务；保存PNG2304×4096本身已截断，非画布CSS单独造成。上游裁前原图未留存，不臆测丢失内容可以恢复。
- 主App与Worker恢复App都仍有旧attention/cover裁切。复用5357091/618cac0，而非另写一套或重复发起供应商诊断。
- 独立`codex/chiyu-ratio-repair47-20261016`从最新origin/main c2634fb建立，再快进整合618cac0。共享checkout的管理UI改动未碰；布局152d402、进度d869736、BI3787b75等独立工作不整支覆盖。

## 修复内容

- 无显式像素尺寸时，比例仅指导上游构图；返回后不裁边、不拉伸、不自动补边，保留实际返回比例。
- 显式像素尺寸使用contain，完整保留画面；透明图补透明，不透明图补白。现有分辨率档位的等比放大保留，故不声称整个链路字节不变。
- 结果宽高/实际约分比例落库与查询一致；legacy auto沿用第一输入标准比例，显式选择优先。
- 增强构图指令：标题、产品和信息在画布内并留安全边距，空间不足时缩小/重排；OpenAI及chat-completions路径均收到指令。提示词不能保证模型永不构图失误。
- 不改canvas-client、不改报价/参数能力/模型配置、不改原作品和冻结任务。不为了验证而重新执行用户作业。

## 集中验收设计

- 原像素测试：完整四边、透明、显式contain、EXIF方向、auto及显式覆盖。
- 新增`verify-chiyu-ratio-routes.ts`：独立本机PG、真实App路由handler、仅回环HTTP供应商fixture和私有媒体；与生产隔离，不是线上验收，也不是完整Next server或浏览器测试。
- 验证`/api/imagegen/plan`只读、提交与查询、旧generate-image查询、直接ratiogen提交；重试同operation不新增供应商请求。
- 建立独立合成的供应商完成/父任务待恢复checkpoint，调用真实`recoverDurableImageJobs`经`INTERNAL_APP_ORIGIN`HTTP恢复generate及imagegen；不使用生产payload、不重复供应商POST。该项证明恢复代码路径使用同一修复模块，不等于旧线上Worker已完成可控交接。
- 基线/修改/副本回退使用同一fixture，4K旧输出2304×4096，新输出2731×4096（上游fixture为2:3）；显式显示真实比例，不以裁边冒充9:16。模型原生精确比例能力不在本次补证范围。

## 线上门槛与阶段

- 10:22只读：47仍13容器，active配置已经117，不再将昨日115当实时基线；generate pending11/有效租约3，imagegen pending4/有效租约3（父子计数不能当独立用户数量）。MemAvailable2248MiB，swap未用，盘64%。
- Worker仍直连13052旧App，旧runner没有已部署的pause/drain控制；Agent和App活动请求归属尚未形成完整可核验排空证据。
- 本轮不原地改bundle、不只切单一路径、不停止在途任务、不安装只有阻断没有完整执行器的治理脚本。
- 达到全链路同版本、回滚、旧客户端兼容及排空条件才持三锁蓝绿。实现/本地验收/代码推送与生产上线分开记录。

## 最终本地结果

- BASELINE/MODIFIED/ROLLBACK真实路由矩阵均通过；旧/回退2304×4096，新2731×4096，四边像素检查通过。每轮仅2次本机假供应商响应，真实供应商0；Worker完成checkpoint恢复不增加POST。
- 像素原函数旧/新/回退、透明和contain、EXIF、实际metadata、8比例字节保留通过；运行chunk的chat分支完整构图及冻结prompt保留通过。
- imagegen contract/intent/capabilities/postprocess集中回归通过，正确Next15.5.27/React19.3.0依赖的全量tsc exit0；未把根目录旧Next14/React18依赖用于验收。
- 副本ROLLBACK.sh实际执行且恢复原runtime哈希/移除新增helper，回退后路由再次复现旧裁切；修改源和交付文件保持修复。
- 线上未发布，未占三锁/未建47候选/未重启/未切流/未改配置/未重放用户任务。当前未接受项仍是旧Worker可控交接、真实活动归属排空和统一蓝绿连续性，不宣称已恢复生产功能。
- 10:38最终只读：13容器身份/启动时间与保护基线一致；generate/imagegen/provider有效租约这一刻均0，但Agent活动归属未知，不据此宣称排空完成。主/恢复chunk原SHA未变、旧Worker仍legacy runner直连13052，配置117，网关原SHA未变。没有执行生产回滚。
- 本地辅助PG最终停止，测试媒体和原始快照仅存本轮私有本地证据。远端main收尾仍c2634fb；功能迭代1/3，发布计数不增加。

最终命令、字面结果、原哈希、四件材料及实时复核见`E:/Workspace/naumi/output/chiyu-ratio-repair47-20261016/VERIFICATION.txt`。本地handler/PG测试不是完整Next server/浏览器或线上真实供应商验收。
