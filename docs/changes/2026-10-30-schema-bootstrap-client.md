# 103启动初始化：主键查询复用DDL事务连接

## 模块与职责

`db.ts::ensureSchema`拥有核心兼容DDL和旧用户图片通道迁移；`schema-initialization.ts::withSchemaInitialization`拥有单连接事务、命名空间锁与归还。调用方不应在该事务内部再从同一池借另一连接。

## 实际问题与窄修复

103直接更新前的原运行版本重启后，父线程观察到一条`app_users`兼容DDL事务处于idle in transaction，四条认证查询等待其关系锁。源码在DDL后使用`getPool().query`读取旧`app_user_image_providers`主键，池满时等待第二次checkout，自身持有DDL锁导致其他借出连接也不能完成。

本次只有一行业务源码变化：`providerPk`查询从`getPool().query`改为当前`schemaDb.query`。DDL、主键探测、条件迁移及billing DDL都在原事务连接内执行。迁移字段、条件、SQL、命名空间锁、事务提交和已受理任务语义保持。

## 集中验收

`node scripts/verify-schema-bootstrap-client.cjs`通过TypeScript AST提取实际`ensureSchema`、实际事务包装和billing DDL，在独占PostgreSQL16、pool max=1执行：

- 原版第二次checkout因池满超时：`SCHEMA_BOOTSTRAP_CLIENT=REPRODUCED CHECKS=4 PG=REAL POOL_MAX=1 SECOND_CHECKOUT=1 SUPPLIER_CALLS=0`，exit0表示反例成功复现。
- 修改版：`SCHEMA_BOOTSTRAP_CLIENT=PASS CHECKS=28 PG=REAL POOL_MAX=1 SECOND_CHECKOUT=0 SUPPLIER_CALLS=0`，exit0。
- 新schema创建、8路同时ensure共用一次初始化、重复ensure无新SQL、BEGIN/DDL/PK/billing/COMMIT同backend PID、一次release。
- legacy email主键真实迁移后变为id，原email、名称默认、false/active、协议、加密字节、模型数组、默认模型和时间保持。
- 每轮独占256MiB/1CPU、随机回环端口容器，目标数据库真实TCP SELECT1就绪后开始；finally核完整ID/label再移除容器与匿名volume。未SSH/生产操作/供应商请求。

父线上故障恢复、程序发布及端测另行记录；本记录只证明该初始化连接修复和本地真实PG验收。没有本切片全项目构建或生产容量结论。

## 交付

源码、测试和本文档交父统一提交。证据及四产物位于`output/release103-frame-20261030/schema-bootstrap-client/`；回滚仅独立副本，源码保持修复。
