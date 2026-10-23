# 47 NAS健康检查与有界自动恢复（2026-10-22，已启用）

## 范围与版本

基线main7dce7fee。用户授权补齐自动检测/恢复并验收，要求不影响正在使用的用户。仅更新47 NAS基础设施：独立旁路observer先prepare/shadow再启用，不替换Web/Worker，不改应用运行环境、模型或计费，不切断健康NAS连接；共享checkout及同事未提交工作保留。

原Naumi程序保持4ec60ef5/build1792565197，Web/Worker同80f3885d6526镜像。监控初次固定源604e698d，随后b5d97f83补严TCP ACK进展保护并只更新observer程序；前驱安装记录、预算状态及SSH备份全部保留，不能把初始源写成最终运行源。

## 已完成机制

- 在原sshd_config末尾追加仅匹配naumi-nas47的ClientAliveInterval30、ClientAliveCountMax3。sshd -t、完整effective配置对照通过才平滑reload，root完整SSH策略不变，NAS转发权限/原authorized_keys/密钥保持。新连接约90秒无响应时回收；当前健康旧会话不强制重连，由observer保护。依据[OpenSSH官方说明](https://man.openbsd.org/sshd_config#ClientAliveInterval)。
- 独立systemd oneshot+timer，每次完成后约20秒再次检查；真实签名GET固定不足100字节的专用对象，同时校验回环和Docker桥接路径的HTTP200、完整SHA。每次仅两次小读取，不扫描业务目录、不持续写大图、不调用供应商。
- 区分S3权限/404/内容错误、桥接失败、存储/网络无响应、缺少可证明的SSH会话。匿名403仅说明能回应，绝不当作健康证据；重定向不跟随、不把凭据发送到其他地址。
- 自动恢复必须同时满足：同一会话连续3次探针失败；两条路径均为网络/超时类错误；只有一个回环13947监听；uid1001、精确sshd进程名/可执行文件/启动tick和22端口SSH传输能核验；TCP响应数据与ACK均超过180秒没有进展。大图上传仍有ACK时不判失联。
- 恢复前获取原三把deploy.lock，再次做健康检查并复核会话身份/进展。仅以pidfd向精确失效会话发一次SIGTERM，不用按名称批量杀进程，不重启ssh主服务、socat、Web、Worker、数据库或NAS。
- 冷却5分钟、每小时最多2次；在发信号之前原子fsync保存预算，进程重启不能清零。PID变化、锁忙、时钟回退、损坏状态/配置、权限错误均不自动操作。恢复后实际读取再次确认，否则保留告警，不冒称成功。
- 告警写systemd journal及私有持久status.json；未向任何外部IM/邮件发送消息，也没有创建额外Codex自动化。

## 隔离验收

23项集中Python/真实本机HTTP检查通过（约0.6秒），包括网络黑洞、断连、服务503、403/404、错误字节、拒绝重定向、健康无动作、连续失败、仍在传输、桥接单点异常、无会话、PID复用、二次检查恢复、三锁冲突、预算持久化/冷却/小时上限、时钟倒退、状态损坏及符号链接拒绝。

pidfd实际系统调用只作用于本测试自己创建的一次性sleep子进程，确认仅该子进程收到SIGTERM；SSH会话发现/故障恢复策略为隔离fixture。没有在生产制造断网、暂停NAS、杀健康隧道或拿真实用户请求测试误杀。生产权限限制下的额外observe进程实际读到了原SSH会话身份和两条鉴权健康读取。

初次prepare发现47的OpenSSH9.6不允许在Match块内设置TCPKeepAlive，语法门禁在修改任何在线文件前拦截；保留e47284a5原候选/失败语法材料，只保留该版本支持的两个ClientAlive指令后重新验证通过。原全局TCPKeepAlive=yes保持，不能把失败准备记作成功应用。

## 线上安装与验收

原三锁下保存全部运行容器身份/镜像/StartedAt、完整Nginx -T SHA、原SSH字节与mode、root/NAS完整effective策略、原凭据SHA和当前NAS会话；创建一个全新专用健康对象，鉴权GET两路径200且SHA一致后才允许activate。没有覆盖用户媒体，也不在业务目录创建探针。

15:50左右初次observer启用通过；15:51多轮timer实际读取200，取样耗时约20–111ms。15:55左右仅更新observer加入TCP ACK保护，停止/启动的只是observer和它的timer，原状态预算保留。运行中的健康NAS会话仍PID3323091/start60200058，从此前15:31恢复到本轮结束始终同一会话。业务容器、网关和凭据SHA保持；生产恢复动作0。

实际业务HTTP验证一次：经现有admin身份仅内存认证，画布/api/artworks/add上传48×64随机PNG；原图9381字节、SHA=c7402cd12e59eb1f83de0dd5ccb7d0e6fed05b3733b9dcc9e435b4c0026e8629，原图/两档变体均写NAS并真实GET核对各自SHA，无本地重复镜像；已鉴权HTTP读回及附件下载200/SHA一致，Range206且片段相符，匿名401。仅本轮专用作品、3个对象和目录行精确清理；supplierCalls0，无账号/权限变化、不重放任何生图。

公网网关/API版本连续15份样本保持4ec60ef5/1792565197；这里只证明当次HTTP连续性，未声称所有用户浏览器已逐个验证。既有本地落盘兜底/输入保留及下载重试沿用，本轮未改应用120秒对象存储超时，不借基础设施监控更新原地重启Web；若后续调整应用超时/UI则另走固定候选蓝绿。

## 运维与回滚

部署证据根：/opt/naumi-staging/evidence/nas47-watchdog-20261022。

- PREPARED.json、ACTIVATED.json：最初安装基线、签名shadow、已安装SHA和不变证明。
- PROGRAM_UPDATE_INTENT.json、PROGRAM_UPDATED.json：ACK保护更新前驱/实际程序SHA及预算保留；watchdog.before-update.py保留初版。
- FINAL_INFRA_ACCEPTANCE.json及FINAL_INFRA_ACCEPTANCE_AFTER_UPDATE.json：实际timer状态、完整容器/网关/凭据/SSH保护、公网取样、最终b5d97f83程序SHA和恢复次数0。
- 运行代码：/usr/local/lib/naumi-nas47-watchdog/nas47_watchdog.py；私有配置/etc/naumi/nas47-watchdog.json；沿用原/root/.nas47-garage.json，不把秘密写仓库或日志。
- 状态/恢复次数：/var/lib/naumi-nas47-watchdog/status.json。journalctl -u naumi-nas47-watchdog.service查看结果，systemctl status naumi-nas47-watchdog.timer查看调度。
- 当前回滚工具：python3 /opt/naumi-staging/evidence/nas47-watchdog-20261022/program-update/install_nas47_watchdog.py check-rollback。实际语法和原字节/已安装SHA校验通过，仅验证准备就绪，没有实际撤回有效监控。
- 若明确要撤回，将上述末尾改成rollback；工具共持三锁、CAS核对安装文件和SSH字节，停本observer、恢复原SSH并平滑reload，保留预算状态、凭据、小探针和所有业务数据。不要删除status文件冒充新预算；不要手工重启Web/Worker。

## 限制

心跳设置只对之后新SSH会话生效，未为证明它生效而断开当前健康连接。observer覆盖现有旧会话；只有180秒以上数据与ACK均无进展的专用会话才可自动回收。NAS断电、磁盘/存储引擎挂死但SSH仍活跃等情况只告警，不冒险自动重启整台NAS。

本轮为独立运维组件启用，不是Naumi应用发布，不增加成功应用发布/空间维护计数；不构建/投放新Web镜像、不回灌DB或修改已有用户媒体、不操作103/120/旧179/101，不归档会话。最后刷新主线、普通整合后推送，具体最终监控源/运维记录SHA分别保留。