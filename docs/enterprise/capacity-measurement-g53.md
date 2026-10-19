# G53 真实资源测量：47短时窗口与固定生产组合

## 目标和不变项

用户选择47同机独立工作流；此前只有瞬时MemAvailable和容器上限预算，缺少连续实测。本轮补齐只读观测与隔离组合测量工具，不通过调低门槛宣布4核8G足够，不向正在使用的47注入负载，不改变原18482产品UI、真实用户/原表或生产服务。

G52核实最近继任发布已完成、历史事件保留的结论继续有效。下一次发布的事件处理约定、实际峰值/双槽容量、镜像导入和真实员工应用未因本轮测量自动完成。

## 工具与实现

### 47只读窗口

`scripts/enterprise-production/observe47-window.py`通过既有受保护SSH以stdin执行。最多120秒，间隔至少5秒；默认120秒/10秒。读取/proc/meminfo、内存PSI、load、各运行容器实际PID对应cgroup v2的memory.current/peak/events及pids。Docker只做inspect/ps，源业务DB不查询、不连接供应商、不发测试请求。

开始/结束核对全部运行容器集合、原容器ID/Image/PID与canonical原字节hash；变化时在输出明确记录，不能把混合版本样本作为同一个稳定窗口。缺失cgroup记错误，不当0。记录Swap但不计为可启动RAM。120秒静态观测不是日高峰，availableSwing是窗口内差值，不伪装为可接受的业务增长预算。

### 隔离生产组合

`verify-enterprise-production.mjs --measure-resources true`保留完整41组业务验收，加两个真实Worker进程：工作流Worker standby、Naumi原video-worker paused。仍用G50固定完整Web及独立runtime镜像、隔离PG和内部网络，所有账号与数据合成，供应商调用0。

resource-metrics.mjs独立有界子进程采样，不被主进程同步docker wait阻塞；Windows windowsHide=true。仅接受本次fixture标签、固定容器ID/image，原始cgroup总量含缓存与采样进程本身，不将docker stats的cache扣减显示量混作总量。记录memory.current、memory.peak、memory.max、memory.events、cpu.stat、pids.current；丢样/身份改变/非法时间线/重复容器令聚合失效，未知不填0。最多15分钟，结束标记后完成最后样本并退出；清理前先结束采样器。

两个指标分别保留：

- `maxSampledSumBytes`：同一轮依次读取的各容器当前用量总和最大值，不宣称精确同时采样。
- `sumOfContainerLifetimePeaksBytes`：各容器从启动以来的最高用量之和，各自峰值可能不同时发生；不能写成组合同时峰值。

组合测试结束时先验证采样完整和OOM=0，再正常排空/停止两个Worker及API/Web，最后仅清理本次合成资源。测试驱动自身不计入拟部署5容器总量；宿主干扰和驱动开销不因此不存在。

### 请求测量

给原组合request helper添加耗时统计，记录每次尝试到响应头的时间和状态分布，不输出URL、cookie或身份。只测helper，不覆盖原始流式上传/响应体消费；429冷却61秒不混入单次请求耗时，重试作为另一个attempt。包含预期401/403/409等负例，不算全是业务成功；不据此声明并发SLA。

## 实际结果

### 47窗口

- 120.236秒，13个样本。
- 最低MemAvailable4496MiB；窗口内最大最小差91MiB。
- canonical前后SHA相同，容器ID/Image/PID和运行集合未变，样本无缺失。
- 原先预算下界4736MiB仍高于可用值240MiB，尚未计未实测的业务增长/代表性峰值。

### 本地固定镜像组合

41组原生登录/原HTML/源与工作流库隔离/完整任务模块验收通过。5容器28轮、75.721秒采样，OOM kill均0。

|进程|cgroup生命周期最高用量MiB|
|---|---:|
|完整Naumi Web|417.953|
|工作流API|123.242|
|工作流Worker待命|55.930|
|Naumi Worker暂停|24.090|
|PG测试容器，含独立source/workflow两个数据库|156.992|

依次采样总和最高715.148MiB；各容器生命周期峰值和778.207MiB。41项回归包含33MiB附件，但不涵盖500MiB并发上传、生产大目录、活跃Worker、供应商任务或长时段负载。

helper401次请求尝试：响应头p50=20.23ms、p95=34.49ms、max=258.17ms。包含338次200、预期权限/冲突/重定向/限流负例；429一次按原策略冷却重试，没有更改生产限流。

使用`--allow-development true`只为以新增测试驱动复用G50干净固定镜像；两个应用镜像各自sourceDirty=false、同commit12d3f8a8且镜像ID/标签经验证。不要将本轮工具提交冒充已进入旧镜像或已发布。完整资源记录、原始jsonl及摘要位于本轮证据目录。

## 容量判断

本轮证明测量链路可执行、轻量顺序回归下5容器用量不高；不证明47全站双槽容量足够。两个Worker暂停、源与工作流测试库在同一个隔离PG进程、缺少高峰并发/真实公司工作负载。未把778MiB写入正式候选峰值门禁，未自动降低Web/API/Worker上限，正式candidateTargetPeakAccepted/existingGrowthBudgetAccepted/capacityAccepted仍false。

下一容量试验应使用活跃Worker的合成非付费队列、较大附件/任务数量、代表性并发与长时间窗口，结合47实际高峰读数或升级后的资源复核；未经证据不选择一个较小数字绕过原门禁。现有用户工作和付费任务不作为压测流量。

## 类型检查与验收记录

资源解析/汇总6项单元通过，实际组合41项通过，28轮原始样本使用最终汇总代码复算一致，47窗口原字节/容器身份复核通过。

本机全仓tsc exit2，报告35条诊断，包含工作区共用依赖的pg类型不一致、缺失three及React ref类型。以TypeScript compiler host只替换本轮改动的TS文件为原提交内容，保留完全相同依赖和其他源文件进行基线对照，不改工作树；最终是否同35条及新增0以TYPECHECK_DIFFERENTIAL.log为准。全仓类型检查不记为通过。实际生产镜像依赖和运行结果独立于本机依赖状态。

```powershell
node --test scripts/test-enterprise-resources.mjs
node scripts/verify-enterprise-production.mjs --allow-development true --measure-resources true --web-report FIXED_WEB_REPORT --runtime-report FIXED_RUNTIME_REPORT --output NEW_OUTPUT_DIRECTORY
# observe47-window.py 经已配置受保护SSH只读执行，不在生产安装守护服务。
```

证据目录：E:/Workspace/naumi/output/enterprise-capacity-measurement-g53-20261018。原数据保持、Git、原hash/副本回滚与最终四件产物见VERIFICATION.txt。本轮模块计数从1到2；整体目标ACTIVE，不把观测工具或局部资源回归当作真实员工交付。
