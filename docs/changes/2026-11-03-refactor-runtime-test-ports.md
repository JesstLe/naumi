# PR8 Core：runtime 验收端口自碰撞

## 输入与真实失败

- 当前基线2bd54020480c5483d68b7cb7983033c38b33c49d；通知对应旧3c1aee90 / Core41612388654 / job125837255423，执行快照5397cfaf。
- 原Core42PASS / 1FAIL / 194NOT_RUN，在enterprise runtime的catalog-disabled-peer启动报 `RUNTIME_ERROR: {"code":"RUNTIME_PORT_COLLISION"}`。
- 原acceptance每次listen(0)立即close，却未记已发放号码；catalog派生配置仅重新分配apiPort，继承avConfig.workerPort。OS若复用该已释放Worker端口，两个配置字段相同，生产校验正确拒绝。这不是EADDRINUSE。

## 职责与实现

产品runtime-config、runtime、API/Worker、schema、锁和业务均不改。仅test fixture port()全程保存已发放Set，重复探测候选不发布，100次均重复则显式 `RUNTIME_TEST_PORT_EXHAUSTED`。所有55个port()调用统一生效，不在后续slot关闭时复用号码，不局部绕过catalog case。

新增脚本从actual acceptance AST提取真正allocator执行，不复制一份算法；确定性输入52001→52002→52002→52003在基线实际复现继承Worker自碰撞exit1，新版跳过重复使用52003。正式verify-runtime在原完整验收前运行同一回归，不增加case预算、不删业务断言或启动检查。

6项覆盖：实际生产配置同端口拒绝、确定性OS候选复用与4次probe、继承Worker合法配置、20并发发放唯一、100次重复上界、24个真实loopback探测。无PG连接、无供应调用。

## 验证与证据

精确commands/input/stdout/stderr/exit、初始CI日志、输入hash与最终四产物归 `output/pr8-core-runtime-ports-20261103/`。完整runtime仍沿原240秒预算，实际进程/自有PostgreSQL16，不用6项窄合同代替业务验收。独立副本baseline/modified/rollback使用同一实际allocator oracle，原生产同端口保护始终保留。

已发放Set仅解决本fixture自重复，不持有socket；其他OS进程在释放到bind间抢占的TOCTOU仍可能存在，不宣称生产端口reservation或容量证明。整体重构ACTIVE，新头CI独立验收，未合main/未部署、47 HOLD。

## 最终集中结果

- 确定性actual allocator/config validator：6项PASS，显式同端口仍RUNTIME_PORT_COLLISION；24次真实loopback探测唯一，20并发发放、100次重复上界保持。
- 原verify-runtime完整脚本exit0：实际bundled CLI/API/Worker、schema39、自有PostgreSQL16，45项检查、requests64/errors0/providerCalls0；原容器清理PASS。build记录source_dirty=1，因为在本隔离候选提交前执行，未冒称干净release或固定生产镜像。
- enterprise-workflow service tsc exit0；本轮三文件lint exit0。集中批次4087输入pre/post无漂移；最终新增oracle仅加基线异常的实际config验证，运行harness再次通过、产品hash始终不变。

新头CI与237目录完整执行仍独立；原Core42/1/194失败证据不改写。
