# 47 Geeknow 不限本地并发

## 要求与基线

用户明确要求Geeknow不设置并发上限。只对`geeknow-images`取消本地容量拒绝，其他供应商、供应链权重/优先级、模型参数、客户积分不改。

开工刷新`origin/main=cf738207bcd63d916a6df5df848a26a1cb4393ea`，独立worktree/分支`codex/geeknow-unlimited-47-20261015`。47当前主槽13068、原生工作台API13069、登录13063；两槽保留R2图片代理，原生槽已包含聊天计划修复。网关SHA `40d9061c3cba288f6bf1150b7afc0b289d32e8d9d7b6472ee91cd72ba101849c`；模型v114；53%磁盘、31GiB可用。

## 实现

- 服务器运行策略`NAUMI_UNLIMITED_CONCURRENCY_PROVIDERS=geeknow-images`，只由服务器配置，不接受调用参数；精确匹配provider ID。
- `createProviderCapacity.acquire`仍登记/释放实际执行lease，但该ID不再因`count>=budget.max_concurrent`拒绝。不是把4改为一个很大的数；冻结旧任务同样读取当前策略。
- 既有数据库预算、模型配置及历史快照原样保留，启用策略不迁移表/不改预算。取消策略或切回旧槽即恢复历史最低上限4。非目标供应商仍按原预算执行。
- 管理API `providerCapacity["geeknow-images"]`返回`unlimited:true,maxConcurrent:0`；0仅为容量摘要的“不限”标记，不写入模型schema。后台显示“不限并发”，受运行策略管理的数字输入只读，避免填数字假装覆盖运行策略。
- 只在精确线上5552 bundle中替换容量模块64643的策略判断和摘要，其他模块内容保持。两个管理UI chunk新URL；webpack运行时及引用也重新hash，保留旧资产供已开页面加载。
- 由两种实际运行镜像派生两个候选；保留全部env（仅新增上述策略）、R2 origin、挂载/网络/鉴权、native-bridge overlay及聊天修复8385 chunk。只切主槽和原生API，登录13063/旧兼容17847不改。

## 集中测试

精确运行时模块+独立内网PostgreSQL命名卷，真实供应商调用0：
- 原版80个并行claim仅4个成功。
- 修改版80个claim全部成功，实际lease占用80，释放与重复释放正确；其他供应商第5个仍PROVIDER_BUSY。
- 去掉策略后仍恢复4；保留原数据库预算不影响不限策略生效。
- 回滚副本真实恢复原模块，回滚fixture再次仅4/80成功。

本地证据`E:/Workspace/naumi/output/geeknow-unlimited47-20261015`；远端`/opt/naumi-staging/evidence/geeknow-unlimited47-20261015`。80个为本地容量准入测试，不是80笔付费上游生图。

## 发布/回滚

待集中验收后发布47，不连接103/120/179/101。三把deploy锁覆盖基线/可读DB备份/候选健康/容量API/切换/最终验收。expected网关与chunk SHA不符时停止，先刷新同事进度。所有模型、价格和草稿指纹保持。

`ROLLBACK.sh --copy`恢复副本；`ROLLBACK.sh`取得三锁并校验当前网关是本轮candidate后切回原13068/13069，不回灌DB/媒体，不停止用户任务。

本功能迭代1/3；成功发布才记增量+1，文档提交不计；不虚记全局维护计数。原镜像/旧槽和最近有效回滚材料保留。
