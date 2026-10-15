# 47 Geeknow 不限本地并发

## 要求与基线

用户明确要求Geeknow不设置并发上限。只对`geeknow-images`取消本地容量拒绝，其他供应商、供应链权重/优先级、模型参数、客户积分不改。

开工刷新`origin/main=cf738207bcd63d916a6df5df848a26a1cb4393ea`，独立worktree/分支`codex/geeknow-unlimited-47-20261015`。47当前主槽13068、原生工作台API13069、登录13063；两槽保留R2图片代理，原生槽已包含聊天计划修复。网关SHA `40d9061c3cba288f6bf1150b7afc0b289d32e8d9d7b6472ee91cd72ba101849c`；模型v114；53%磁盘、31GiB可用。

## 实现

- 服务器运行策略`NAUMI_UNLIMITED_CONCURRENCY_PROVIDERS=geeknow-images`，只由服务器配置，不接受调用参数；精确匹配provider ID。
- `createProviderCapacity.acquire`仍登记/释放实际执行lease，但该ID不再因`count>=budget.max_concurrent`拒绝。不是把4改为一个很大的数；冻结旧任务同样读取当前策略。
- 既有数据库预算、模型配置及历史快照原样保留，启用策略不迁移表/不改预算。取消策略或切回旧槽即恢复历史最低上限4。非目标供应商仍按原预算执行。
- 管理API `providerCapacity["geeknow-images"]`返回`unlimited:true,maxConcurrent:0`；0仅为容量摘要的“不限”标记，不写入模型schema。后台显示“不限并发”，受运行策略管理的数字输入只读，避免填数字假装覆盖运行策略。
- 只在精确线上5552 bundle中替换容量模块64643的策略判断和摘要，其他模块内容保持。两个管理UI chunk新URL；更新入口/manifest的hash引用，webpack存在对应映射时才更新运行时URL，保留旧资产供已开页面加载。
- 由两种实际运行镜像派生两个候选；保留全部env（仅新增上述策略）、R2 origin、挂载/网络/鉴权、native-bridge overlay及聊天修复8385 chunk。只切主槽和原生API，登录13063/旧兼容17847不改。

## 集中测试

精确运行时模块+独立内网PostgreSQL命名卷，真实供应商调用0：
- 原版80个并行claim仅4个成功。
- 修改版80个claim全部成功，实际lease占用80，释放与重复释放正确；其他供应商第5个仍PROVIDER_BUSY。
- 去掉策略后仍恢复4；保留原数据库预算不影响不限策略生效。
- 回滚副本真实恢复原模块，回滚fixture再次仅4/80成功。

本地证据`E:/Workspace/naumi/output/geeknow-unlimited47-20261015`；远端`/opt/naumi-staging/evidence/geeknow-unlimited47-20261015`。80个为本地容量准入测试，不是80笔付费上游生图。

## 发布/回滚

已集中验收并发布47，未连接103/120/179/101。三把deploy锁覆盖基线/可读DB备份/候选健康/容量API/切换/最终验收。expected网关与chunk SHA不符时停止，先刷新同事进度。所有模型、价格和草稿指纹保持。

`ROLLBACK.sh --copy`恢复副本；`ROLLBACK.sh`取得三锁并校验当前网关是本轮candidate后切回原13068/13069，不回灌DB/媒体，不停止用户任务。

本功能迭代1/3；成功发布才记增量+1，文档提交不计；不虚记全局维护计数。原镜像/旧槽和最近有效回滚材料保留。

## 已完成交付

- 固定发布代码`afc6fe7`；主槽13070、原生槽13071，实际镜像分别`sha256:1b17271582369bdf9797b3d893227fc73387aa64c1ae2d2898d0a42dc8083f64`、`sha256:6ce6950aa52fa5e711cc7258ec044a803787c1cbf7eceb1c28409a71cd39b526`。
- 新网关SHA `36d0616498b620a20a2c6c44c7d2969702c01720f1010f4966fcd7870730d160`；登录与旧兼容路由不改。切换健康12次/错误0；三锁已释放，所有旧容器的ID/镜像/启动时间/运行状态保持。
- 两个实际候选和公网管理API均返回Geeknow `unlimited:true,maxConcurrent:0`；其他所有供应商`unlimited:false`。新管理JS URL均HTTP200，入口引用更新7处；完成JS语法检查，不把未登录浏览器当作管理页视觉验收。
- 模型保持`114:f2adc9b53f4632fee134969088af38b1`；模型/价格/草稿10表指纹逐项一致。原数据库预算4仍保留，用服务器策略明确覆盖容量拒绝；不是写成256或其他伪无限大值。
- baseline4/80、modified80/80、rollback4/80真实隔离PostgreSQL准入通过；回滚脚本确实在另一份副本恢复原模块SHA `3b884db020c5fdc95902343da204b0ae4deed6dfd12b037a64eab3909bf04dd1`。其他供应商上限4、lease统计/释放、关闭策略恢复4均通过。
- 本次真实供应商调用0，不把80个本地准入测试描述成80笔真实上游生图。未修改任何客户任务/余额，未回灌数据库。
- 准备阶段一次重hash构建断言失败，未创建候选或切流；修正入口chunk引用情况后成功。线上没有实施回滚，当前仍为不限策略。
- 已合入同事完成的聊天计划与R2图片输出分支（仅.env.example注释冲突，保留双方内容），发布包仍从两种实际运行镜像最小派生，不整包覆盖运行中的其他模块。最终验收后刷新main再普通推送，未切换共享checkout分支。
- 本次成功发布增量+1；隔离PostgreSQL fixture已停止、命名卷保留；磁盘未达80%/10GiB门槛，没有删除业务媒体、他人目录、有效镜像或回滚材料。
