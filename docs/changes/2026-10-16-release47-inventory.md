# 47 统一执行器只读现场 Collector

## 实现与边界

新增 `scripts/ops/release47_inventory.py`，基于 `f6432841a35fffcc64ea297ec7f7f4a0ba3a0234` 独立分支 `codex/release47-inventory-20261016`；没有连接 47、执行生产命令或改部署/停服务。

复用 `release47_host.public_identity` 及 `HostTransaction.run/save` 契约；根现有 `verify_live` 只有最小身份/RAM/nginx 复核，因此本模块补全观测，不替换根 host 执行器和生命周期门禁。

```python
from release47_inventory import collect_inventory
inventory = collect_inventory(
    command=transaction.run,
    private_save=transaction.save,
    expected_host_sha256=plan['hostIdentitySha256'],
    roles={row['id']: row['role'] for row in plan['baseline']},
    controlled_instances=[candidate_full_container_id],
)
transaction.save('inventory-public.json', inventory)
```

- `command(args, *, stdin=None, timeout=...)` 接受现有 HostTransaction 的成功 bytes 返回，或 CompletedProcess（同时核验 returncode/stdout/stderr）。命令异常不打印 argv/env/原始 stdout/stderr/异常消息。
- 不传 command 时仅本机 Linux subprocess；无 SSH、shell、sudo、docker exec、构建/启动/停止、reload 或数据库查询。native subprocess 同时流式读取 stdout/stderr，合计 ≤16MiB，最长单步30秒；收集总限默认90秒、最大300秒，超时保留 unknown。仅超时的本 collector 读命令子进程被终止。
- `private_save(name, bytes)` 可交给根私有 HostTransaction.save：原 inspect、nginx-T、unit show/cat、mem/cgroup/socket 输出逐项保存；返回的路径/内容不进入 public。public 只带原始字节 SHA256/长度/状态；默认 stdout 永不输出 raw inspect/env/unit 内容。

## 采集内容

1. `/etc/machine-id` 仅 SHA256，与可选 expected hash 精确比较；不输出原 machine-id。
2. `/proc/meminfo` 已知字段及 MemAvailable MiB，不加 Swap。
3. Docker `ps -aq --no-trunc` 全实例（含停止实例）及 inspect，32条一批；前后完整清单与 inspect 二次比较 image/name/PID/running/startedAt/restart/env/network，变化或缺失不记 stable/complete。默认最多512个实例，超过上限明确未知。
4. public 实例仅 allowlist ID/name/固定image/commit/build/restart/running/端口/内部地址别名及资源；Cmd 只作已知 shape 角色分类并保存 hash，Mount source/destination 只 hash，不输出 Env/label/凭据/原始命令。敏感 env 值及 URL user/password 再对 public 字符串脱敏。
5. cgroup v2 与 v1：由运行 PID 的 `/proc/PID/cgroup` 安全路径读取 current/peak/max/stat，分别输出 anon/file，绝不写 peak/reset。`controlled_instances` 只表示根指定观测范围；生命周期 peak **不是业务压力验收峰值**，`businessPeakAcceptance:false`。
6. nginx `-T` 前后完整 stdout SHA256，逐个 `# configuration file` 读取原文件独立 SHA256；动态变量/map、非标准协议、凭据 URL、无法解析或歧义 upstream 均 unknown。静态 proxy_pass 与 literal upstream server 映射只针对精确 Docker 名/别名/IP/已发布loopback端口，不执行 DNS；对外未知hostname只 hash。图始终 partial，不声称完成 location 优先级/请求归属/RSC/回调验收。
7. systemd 已加载 service 与 `list-unit-files` 未加载 service 合集，读取 show/cat；公开仅单元名/状态/hash/精确容器ID引用/安全endpoint及mayControlContainers。不会执行 ExecStart、source EnvironmentFile、解析 shell变量或递归运行服务。默认最多256条service，超限显式报错；coverage 始终 partial。
8. `ss -H -lntup` 仅公开监听地址/端口/协议/PID，不带进程命令。`listenerCoverage=listening-only-not-drain`，绝不由 TCP0 推导任务结束。

所有 Web/Worker 默认且始终 `legacy-partial`：connections/agentSessions/acceptedTasks/workerLeases/newAdmissions 均 null、complete=false。`retirementApproved:false, drainCoverage:unknown`；即使根传 controlled_instances/角色，也不能把 inventory 升格为完整 drain 回执。

## 测试

隔离 Linux Docker：只读脚本挂载、无网络/无 Docker socket、128MiB内存/1CPU/16MiB tmpfs。

```text
python -m unittest test_release47_inventory -v
Ran 27 tests
OK
exit 0
```

覆盖完整/停止容器、敏感值不泄露、真实私有raw捕获、swap不计、v1/v2peak、legacy partial、原nginx/source hash、静态upstream/动态map/凭据endpoint拒绝、原Worker origin、systemd/端口脱敏、命令失败/非0状态、容器/配置并发变化、cgroup traversal、输出/服务数/总时限、Linux实际子进程 stdout/stderr/超时/16MiB限制。Windows运行25通过、2个Linux子进程项跳过；最终Linux27项全部通过。

原 HostTransaction 复制 baseline：`python -m unittest discover -s output/release47-inventory-20261016/baseline -p test_release47_host.py -v`，9 tests / OK / exit0。不改根 host 文件。

四件复制回滚证据在本 worktree 的 `output/release47-inventory-20261016/`：MODIFIED_FILE、DIFF_FILE、VERIFICATION.txt、executable ROLLBACK.sh。回滚只针对标记的副本，将新增 collector 移为 disabled、恢复原 host 字节并通过原9项测试；不操作线上、不清 UNKNOWN、不回灌DB，修改版产物保持。

## 未完成/主控集成

本模块只供根判断身份/余量/引用线索。18:30仍需根持三锁在真实目标采集、私有保存、审核 unknown、与计划绑定，并通过业务活动/新领取/租约/Agent/旧客户端/Worker回执验收后执行蓝绿；单次 inventory 无法授权自动清退任何未知槽位。
