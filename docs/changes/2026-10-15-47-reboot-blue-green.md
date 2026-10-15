# 47重启后只读检查与每次更新蓝绿约定（2026-10-15）

## 本轮完成
- 用户正在重启47；本任务未重复重启、未发布、未停容器、未改运行环境或供应商配置。
- 16:19–16:20 CST：SSH banner/认证正常，公网 `/api/health` 与 `/api/version` 均200；DB健康。实例16:17重启。
- 内存7270MiB、可用3170MiB、无swap；4核，采样CPU空闲91%–97%；根盘54%/可用31GiB；无failed systemd unit。
- 当前/上一启动内核日志未命中OOM、killed process或lockup；watchdog匹配只有开机Perf NMI watchdog disabled。Docker OOMKilled均false。这些证据不等于故障原因已排除，也不代替云监控告警历史。
- 阿里云ECS控制台跳转到登录页，云端实例状态及CPU/内存告警尚未核验。用户可在协作浏览器自行登录后继续只读核验。
- Nginx基线SHA256 `36d0616498b620a20a2c6c44c7d2969702c01720f1010f4966fcd7870730d160` 保持；13070/13071在线，鉴权13063、兼容17847路由保持。公开version仍为1791989816/f4b3df127f2fcaf37f9cd866a480f3c6fd4b2358，未把该业务源SHA误称新发布。
- 多个历史App槽仍自启动且占用内存，后续须结合全量路由、活动会话和任务归属确认排空后逐个退役；本次未停止任何槽位。
- AGENTS.md与发布手册置顶记录每次更新必须蓝绿，含环境/供应商适配更新、三锁、双槽资源、真实就绪、切流、排空及回退。

## 本轮未完成
- APImart接入及不限并发尚未实现/发布，本轮没有付费生成调用；Geeknow配置保持。
- 云控制台CPU/内存历史告警、故障根因待查；不从重启后资源正常推断重启前状态正常。
- 蓝绿规则更新不代表活动会话归属或全部连续性验收已完成。

## Git、测试与证据
- 独立任务worktree，刷新origin/main仍a703f82e3e66b53bb10436253162777494245c87，共享checkout不改。
- 文档模块集中检查：baseline显式每次更新规则0 → modified1 → 独立副本回滚0且SHA一致，正式修改副本保留；仅文档回滚，不是服务器回滚演练。
- 本轮发布次数0、功能迭代次数0，未触发构建或清理。
- 证据目录：`E:/Workspace/naumi/output/apimart-channel47-20261015`；含reboot-connectivity.json、reboot-readonly.sh/log、MODIFIED_FILE.md、DIFF_FILE.patch、VERIFICATION.txt和可执行ROLLBACK.sh。

## 后续执行提示词
```text
仅处理47.105.59.142。先复核重启后在线基线、资源、路由和任务归属；每次服务器更新必须蓝绿，三锁/备份/真实就绪/平滑切流/排空/兼容回退齐备。APImart待验证异步协议并接入原生通道，不重提已接受或状态未知的付费任务，不改变Geeknow不限并发和历史价格/参数。
```
