# 47 独立运维 SSH 密钥

## 职责、归属与基线

用户明确授权建立不依赖 root 密码及云控制台 root 绑定密钥的长期 SSH 登录入口。本任务仅负责 47 系统运维身份；分支 `codex/ssh47-maintenance-key-20261120`，独立目录 `E:/workspace/naumi-ssh47-maintenance-key-20261120`，基线 `0b2c5c6925f3bfbe192b114a6fb95a25fac9bd7c`。保留共享 checkout、原 root 入口和其他站点，不修改业务程序、供应商配置、数据库或媒体，不进行应用发布。

## 实现与权限边界

- 新建 `naumi-ops`（现场 UID 1002），独立 home 与 Ed25519 公钥，账号和公钥均无到期限制。密码为锁定状态；现场 SSH 已禁止密码与键盘交互登录，无需修改 sshd 配置或重启服务。
- 公钥位于 `/home/naumi-ops/.ssh/authorized_keys`，home 0750、SSH 目录 0700、公钥授权文件 0600，目录和文件归属该账号。
- `/etc/sudoers.d/90-naumi-ops` 为 0440，显式授予 `NOPASSWD: ALL`，可通过 sudo 管理服务器；正常 SSH/sudo 审计保留。这是独立、可撤销的管理员凭据，不是规避删除、禁用或审计的隐藏入口。
- 私钥只保存在本机受保护的 `E:/workspace/naumi/output/server-connections/47.105.59.142/maintenance-ssh/id_ed25519`，目录与私钥 NTFS ACL 限当前用户和 SYSTEM。私钥无口令，须按最高权限凭据保护，不上服务器、不进入 Git。原 `connection.json` 及原部署私钥保持。
- 同目录维护独立 `connection.json`、`connect.ps1` 和操作说明，后续 root 绑定密钥更换时可使用该独立身份。正常连接不依赖旧 root 私钥；尚未自动替换已有部署工具的 root 身份假设。

普通重启不删除本地账号或 authorized_keys；修改 root 密码不修改此账号的公钥。阿里云仅替换 root/ecs-user 的绑定密钥时，该独立账号与公钥不在对应文件中。参考[阿里云凭据管理](https://www.alibabacloud.com/help/en/ecs/user-guide/instance-logon-credential-management)。重装系统、覆盖磁盘、主动删除账号/公钥、修改 SSH 准入策略或网络规则仍可撤销或阻断访问，不承诺永久不可撤销，不设置重新植入密钥的机制。

## 验证、故障与证据

- 原始连接在 SSH banner 前被关闭，HTTPS 同样 EOF，未发生密钥校验；核对本机 Meta 与 WLAN 接口后，使用实际 WLAN 地址绑定直连，原 root 密钥正常登录。不能把这一网络问题写成原密钥失效。
- 四锁内创建身份，核对 root authorized_keys、root shadow 行与 sshd 主配置摘要保持；SSH 主进程 PID/启动时间、业务容器 ID/镜像/启动时间保持；`visudo -c` 和 `sshd -t` 均退出 0。
- 禁用 SSH agent、密码及其他身份回退，只指定新私钥，两次独立 SSH 登录均为 `naumi-ops`；`sudo -n id -u` 返回 0。`chage -l` 确认账号和密码期限 never，`passwd -S` 确认密码锁定。
- 最后以新密钥登录并 sudo 完成持锁验收，现场状态 `COMPLETE`。没有为了测试而重启服务器、修改 root 密码或操作控制台密钥，因此不把这三项写成已实操的轮换/重启验收。
- 服务器私有证据 `/opt/naumi-staging/evidence/ssh47-maintenance-key-20261120/`：`BASELINE.private.json`、`RESULT.json`；凭据、公钥内容及密码摘要原文不提交。任务锁均已释放，无新增常驻进程。

## 撤销与交接

连接及撤销步骤位于受保护本机目录的 `README.md`。撤销应先保留另一个有效管理员入口，再移除该账号的指定公钥，按需移除 sudo 授权与禁用账号；单独锁密码不会撤销公钥。原 root 凭据、业务数据和已有运行配置保持，可继续原方式维护。

本次仅系统身份配置及文档，不构建或发布应用，不增加功能模块或成功发布计数。
