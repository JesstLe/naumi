# R6J：既有模型管理 UI 回归生命周期

基线 `b0ba32c54872ebdb28977bfe791d74f5f64cf6b3`，4538 原文件hash与归档保存在 `output/refactor-r6j-20261027/`。

## 实施边界

- 九个既有 `.mjs` UI 命令重复启动相同 fixture、轮询、运行 checker、清理，并在 finally 整份恢复 `tsconfig.json`。这会覆盖运行期间的后续修改；Next另外写入next-env.d.ts没有对应恢复。
- 共用原 fixture 的单一 runner：完整复制当前 Git 源字节、只链接既有依赖，Next和checker在副本运行。所有输出留于自有run目录，不复制env或凭据文件，不在源工作树写回配置。
- runner只清理自己持有的child句柄及runId匹配的IPC，不根据“碰巧存在”的metadata去停止别的fixture。保留原checker入口、退出码与退休端点环境开关。
- fixture创建后即登记cleanup，后续设置失败也关闭本次PG/schema/HTTP；原model配置和账务准备不改。产品src/services/数据库schema不改。

## 验收计划

原wrapper配受控进程端口复现后写覆盖；新runner用真实子进程验证成功、checker7、startup失败、超时和他人fixture。完整模块后运行一次实际Next+真实隔离PG的供应商资料UI检查；不把受控进程或静态检查当作Next通过。固定core、原字节回滚、四产物和Git在封版时记录。

## 当前依赖调查

本轮实际 `npm audit --omit=dev --json` 返回exit1：13项（2critical/8high/3moderate），原始JSON保留。Next报告有15.5.28修复，sharp报告跨版本升级；本模块不顺手auditfix，也不把审计条目全部当成可达漏洞。后续依赖模块按实际调用/构建验证更新。

实施中，整体active，不合main、不部署；这是三模块同步后第1模块。

## 集中验证观察

- 完整旧wrapper在受控process/file端口下3检查复现：checker返回7后仍覆盖后续开发者tsconfig修改；next-env写入留在源目录。此为实际旧wrapper代码，不称原生Next运行。
- 新runner真实子进程42检查、9命令映射：success/checker7/setup失败/timeout/他人fixture与端口占用全部按实际状态返回，源配置后写保留、Next types源字节不改、自有锁释放。不将内部故障样本的FAIL输出改为PASS。
- 真实Next15.5.27+隔离PG与Edge完整资料库流程通过：真实登录、路由、5维筛选/金额/JSON保存、导出、同步保留人工资料、修订历史、390px、普通成员404、模型配置/草稿/积分不变，paid0。源码tsconfig与ignored next-env运行前后hash均精确相同。
- 初次actual Next运行暴露旧checker误用expect.configure（返回的配置对象未使用，实际仍5秒），只修observer为真正45秒expect后通过；没放宽产品约束。首次新runner的--import绝对Windows路径缺file URL、微型fixture缺ESM type造成TLA准备失败均已修，原日志保留。
- 最终runner新增sourceIdentity/逐文件复制后hash核对，绑定完整原输入；固定源码后集中core与一次最终Next证据另列，不把之前过程SHA冒作最终SHA。
