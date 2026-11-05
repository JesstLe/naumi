# R8W：原生完整链的固定 Linux 运行边界

## 基线与问题

基线`3af2d24c8ff066ffb7bba866693840246c950bba`，完整5323个原始raw哈希和副本保存在`output/refactor-r8w-20261031`。前轮完整回归155PASS/1FAIL/49NOT_RUN，失败在场景切换导演节点；Next开发态media静态路径worker异常与Windows虚拟内存不足事件同时出现。固定Linux完整镜像、92项产品浏览器和450秒混合校准通过，不替代该原生全链失败，也不构成10万活跃容量结论。

## 责任、接口与依赖方向

原生业务验收继续由原有audio/timeline/scene/character/director脚本及交互脚本拥有，原业务动作、断言、报价冻结、真实PG、媒体哈希、原任务恢复和账务检查不删减。新增SDK只拥有运行与资源组装：原正式Dockerfile构建固定完整App；验收SDK保留应用server/BUILD_ID/Worker字节，另附精确源码和锁定版本的Linux开发依赖/浏览器。SDK运行时network=none，不挂Docker socket；父级PG仅共享其私有网络空间，不发布端口。

`native-parent-database`是已有数据库fixture guard的窄适配：仅固定Linux夹具显式借用父PG，保留数据库名/owner marker的实际SQL检查；案例只关闭借用pool，父运行器在原案例退出后清理自身PG。原开发者直接执行案例的自有PG路径保留，不把“借用”变成另建数据库或越权清理。

完整core中五个脚本的七个原生入口要求同源码SDK manifest；不静默回落Windows开发服务。源码前后全量哈希、原日志、原marker、退出码和resume守卫继续生效；SDK身份进入环境指纹。CI使用同一固定源码的完整App和SDK，再执行原完整catalog，不新增发布路径或改变产品。

## 实测与退出条件

先集中验证父PG边界、原案例正文保持、类型与orchestrator，再构建固定App/SDK并执行原场景—导演完整链；成功后才发起同源完整206项门禁。实际命令、失败与cleanup、baseline/modified/独立副本rollback及四产物记录在本轮证据目录，不拼接旧结果或改写失败。

整体重构ACTIVE；固定完整runtime、配对性能、有效CI与最终main整合仍按实际证据推进。47 HOLD，未操作生产。本轮属于验收边界改造，不增加产品功能模块计数。

## 集中控制验证

原5脚本自有PG启动轨迹10用例24检查采集；新父PG边界10用例30检查通过，原自有路径轨迹EXACT，五份案例正文和四份交互脚本保持。父PG纯校验与现有SQL guard端口18用例21检查通过；真实SQL和原业务端到端由固定SDK全链验证，不把端口控制冒充真实PG。runner16用例271检查通过，新增缺SDK/错源码/SDK切换resume拒绝及实际命令输出路径绑定控制。TypeScript exit0。

首轮runner仅因旧CI命令精确预期不含新增SDK参数而失败，已更新为必须先同SHA镜像和SDK、再core的精确顺序与指令；原失败输出保留。首轮trace比较受JSON把undefined序列化为null影响，已统一用原采集的JSON编码比较，没有更改案例或产品断言。
