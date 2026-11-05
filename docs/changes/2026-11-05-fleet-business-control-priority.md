# Fleet：控制命令优先于排队及持租约的业务读

## 复审与基线

- PR #11，分支 `codex/fleet-business-data-103-20261104`，产品基线 `f19a9fbcb4708ea4e5680e1af88ac685a0056c79`。
- CodeRabbit review `5772519001` 新增 diff 外 Major：中央 poll 的单槽 FIFO 会先派发旧 `business.query`；读 ACK 丢失时，旧读的五分钟活跃租约也阻塞后续 ban/credit 控制。此前文档保留的读压控制风险在本轮补入真实 PG/HTTP 专项，不把 UI/token 过期当作已撤销 command。
- 原 `server.ts` 与队列 verifier 的 SHA256、完整通知及真实运行输出保留在 `output/fleet-business-control-priority-20261105/`。

## 模块职责与最小变更

`src/lib/fleet/server.ts` 的 `connectorExchange()` 拥有实例认证、中央派发、租约和 ACK；本次只调整 pending SELECT 的排序：

```sql
ORDER BY (COALESCE(operation->>'type','')='business.query'),created_at,id
```

全部既有非 `business.query` 命令组成控制类，排序在业务读之前。每类内部仍按原 `created_at,id` FIFO。原 instance/state/business-capability eligibility、事务锁、派发时权限复核、签名、五分钟租约和 ACK 分支保持原样。

- 活跃业务读不再占住控制的派发槽；原读仍保有原 lease，迟到 ACK 继续按原 lease 和首份终态结果处理。
- 活跃控制租约仍让后续控制及读等待，不跳过它去执行第二个控制。
- mutation 的执行事务、源收据、lost-ACK 幂等和账务代码均未修改。
- 不因 UI 超时伪造 failed，不删除旧读或收据，不引入 TTL、取消协议、抢占或额外 worker。

## 正式集中回归

新 `scripts/verify-fleet-business-control-priority.ts` 由既有 queue compatibility verifier 调用，因此自动进入原 `fleet-business` CI 的完整 protocol 步骤，不另起工作流或替换旧断言。

真实隔离中央/源 PostgreSQL、原生 loopback HTTP、独立 connector 子进程覆盖 23 项：

1. 两个旧读与较新 ban：ban 先实际生效；同时间读仍按 id 保持 FIFO。
2. 实际丢失业务读 ACK、原租约仍有效：ban 在读 ACK 返回前生效；读 lease 不变；错 lease 409、原晚 ACK 200、重复 ACK 不改结果、冲突结果 409。
3. 实际丢失控制 ACK：活跃控制保持队头等待；只在自有 fixture 中推进租约后重发原命令，源用户完整字段不二次修改；第二个控制仍排在中间业务读前。
4. 派发前撤销 delegated users grant：控制被原鉴权分支拒绝、源用户字段不变，仍被授权的业务读可继续。
5. 较新 `credits.adjust` 的真实签名派发优先于旧读；只验证 dispatch/HMAC，不执行积分调整，`CREDITS_APPLY=0`、付费调用 0。

原缺表/缺列读阶段先独立完成失败 ACK，再排入后续控制；它原有 16 个只读/后续 ban/lost-ACK/history 断言全部保留。控制与读同时在队时的优先级由新增矩阵专门验证，不再隐含要求业务读先于控制。

## 实际结果与证据层级

- 同一最终回归 harness + 原 f19 产品 server：`FLEET_CONTROL_PRIORITY=REPRODUCED assertions=23 failures=6`，exit 1。读 FIFO、活跃控制、晚 ACK 和撤权对照仍通过；失败集中在控制排在旧读及持租约读之后。
- 修改版：新矩阵 23/23、queue compatibility 39/39、完整 protocol **124/124**，exit 0。保留真实 200ms 物理断开故障注入与无强制拆库清理。
- 既有完整中央响应预算：73 项通过，exit 0，仍为真实中央/客户端加有限 I/O fixture，不标成真实 PG/HTTP。
- 全库 `tsc --noEmit --incremental false` 无输出、exit 0。
- 最初 harness 的 global fetch 干扰及 JSONB 键顺序比较已留存原始失败，分别改用原生 loopback HTTP 和既有 canonical 比较；最终基线与修改版使用同一 harness hash，不将这些测试工具问题计为产品回归。

四产物 `MODIFIED_FILE.zip`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh` 位于本任务证据目录的 `final/`。回滚只操作独立副本，恢复原 server/queue 字节并移除新增文件；专项 harness 另放 evaluation 目录、加载实际恢复后的产品字节，确认旧优先级反例重新出现。后续编辑须在首写前零写拒绝，修改版工作树及 ZIP 保持新实现。具体命令、输入、字面输出及退出码以最终验证记录为准。

## 其他通知与待完成项

- 通知中的 `issuecomment-6635897059` 是旧轮结束回执，不作为本次当前 SHA 通过证明。
- f19 主评论另有 ESLint 解析 CSS 的工具异常。原 CSS 由实际 PostCSS 成功解析（117 个顶层节点）；本轮不改 CSS、不关 ESLint、不添加无关依赖，也不以单次语法检查代替页面验收。
- f19 的 Docstring Coverage 为 18.48% / 80% 提示；保留该提示，不将其描述为通过，不批量改动无关函数来掩盖本次派发修复。
- f19 的 core/fleet-business/verify 均因 GitHub Billing & plans 在 steps=0 时失败；新提交必须重新核对实际 CI 与复审覆盖，不能用本地通过冒充远端通过。
- 当前未合 main、未发布本修复到 103/47、未进行生产独立 SQL 核对或用户验收。控制被业务读压住的派发问题已取得本地修复证据；业务读 age/retention/cleanup 所有权仍是独立后续议题，不宣称已完成持久取消或全队列治理。
