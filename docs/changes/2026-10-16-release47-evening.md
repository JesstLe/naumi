# 47主站今晚18:30单次上线 / 2026-10-16

## 用户授权与调度
- 用户2026-10-16北京时间13:32明确：今晚18:30直接上线，届时无人使用，并要求解决本轮全部已列待解决问题。
- 目标仅47.105.59.142。授权覆盖本轮修复后的发布，无需再次请求发布确认；不扩大至其他站点、购买资源或破坏性数据迁移。
- T3调度已创建，绑定当前线程3e153cf4-dc4a-4aab-853b-0bccd1905a87。
- scheduledTaskId: scheduled-task:command:mcp:653ace73-a7fb-4307-b5b9-a247be31d240:schedule-task:release47-20261016-1830-bjt-once
- nextRunAt: 2026-10-16T10:30:00.000Z，即北京时间2026-10-16 18:30。
- 调度器底层按周五18:30触发，任务提示词限定2026-10-16当晚且要求第一次执行立即禁用本调度；不是每周发布授权。过期不执行，不创建第二个同目标调度。

## 本轮问题清单及完成标准
1. 内存：以最新MemAvailable、cgroup anon/file/peak、候选真实业务峰值核算；47不构建，保留至少1GiB主机余量。受控旁路一个Web+同image Worker；无序增加实例或依赖Swap不通过。
2. 旧槽：逐容器固定ID/image/启动时间、Nginx动态及内部引用、系统服务/Worker调用图。只退役证据充分且自然排空的槽；没有引用不等于会话/任务已结束。
3. Worker：新领取与已接受工作分开；旧tick自然完成，新Worker暂停启动，持久控制CAS/幂等，UNKNOWN使用原operation回执核对，不重复发送tick/供应商任务。
4. Agent与App：活动请求、Agent会话、App后台任务及租约可核实；SSE/steer/stop继续归属原实例。旧实例无控制端点时标legacy/unknown，需迁移方案实证，不以数据库历史或TCP0冒充完整排空。
5. 旧客户端：静态JS/CSS原字节保留，RSC/ServerAction兼容验证，原画布保存和任务查询跨切流可用，不强刷。
6. 统一执行器：完整计划/三锁/基线CAS/备份/旁路就绪/切流/故障切回/排空/收敛状态闭合；不是只安装门禁再报告阻断。
7. 用户功能：Skills账号隔离/点击拖放/独立包装页/画布布局进度批次/BI作品权限和模型链/比例完整画幅/禁用通道与原路GET恢复，受影响功能集中验收。

## 已有产物复用
- worktree E:/Workspace/naumi-release47-20261016；branch codex/release47-integrated-20261016。
- 固定业务source5405d23，BUILD_VERSION1792127247，image sha256:8f2b379b386f3b910dfa7cff93ddbfa7403558c4285c1d48aea54650c5c9f857；后续代码改变须重新固定SHA、构建及相应验收。
- 最新文档ae95750；源码/镜像/patch/原始hash/BASELINE100-MODIFIED118-ROLLBACK100位于E:/Workspace/naumi/output/release47-integrated-20261016。
- 上轮26项集中回归及本机新镜像密码登录/导入/保存/390px通过；不是正式生产验收。
- 13:23实时基线只是历史快照：13容器；MemAvailable2119MiB；公网f4b3df1/1791989816；active模型配置117。18:30全部重读。
- 共享主目录18项未提交后台UI仍受保护；吉祥物仅设计及他人暂存Dock不擅自导入。

## 执行原则
- 用户预期无人使用不是后台已排空证据；18:30仍核查实际活动。
- 每次服务器变更蓝绿、共持三锁：/opt/naumi-staging/releases/deploy.lock、/opt/naumi-reverse-hub/releases/deploy.lock、/opt/reference-workbench/deploy.lock。
- 不原地重启在线槽、不回灌DB/媒体、不重放已接受或未知付费任务、不并行清退、不输出秘密。
- 当前生产未变更。后续每个模块记录实现/测试/未完，最终记录实际生产版本、Web/Worker image、内存、连续性、旧槽停止与回滚证据。
