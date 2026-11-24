# 中央历史备份归档 NAS（2026-11-24）

## 授权与冻结范围

用户选择“中央历史备份归档 NAS”：保留备份，逐份完整 SHA 读回后释放精确本地副本，数据库、业务媒体及其他项目对象保持。此任务不是中央程序发布，不调整身份、名册、密码、DB、Nginx、环境变量、systemd 或监督 timer；已有中央 rendering 候选和原任务租约保持。

固定归档六个 release 的 `database-988fcfe5d343.dump`：

| release | 原始字节数 |
|---|---:|
| release47-main-20261118-admin-local-r1 | 870789718 |
| release47-main-20261118-admin-local-r2 | 871542750 |
| release47-central-identity-20261119-r1 | 872470100 |
| release47-central-ack-20261119-r1 | 873598047 |
| release47-central-resume-20261119-r1 | 882538424 |
| release47-cutout-quoted-20261120-r1 | 887338940 |
| 合计 | 5258277979 |

当前线上 `release47-layer-export-20261120-r1` 的 893571864 B 备份、本轮 `release47-central-rendering-20261124-r1` 的 954503969 B 备份继续留在本地。六份旧备份仍保留在 NAS，不因本地副本释放而到期删除。

## 实现

- 专用一次性工具 `scripts/ops/central_backup_archive.py`，精确固定 47 主机指纹、路径、六 release allowlist 与私有任务根目录；没有 cron/unit/hook 或自动清理计划。主机原有 boto3 已安装，本轮没有安装依赖。
- `plan` 逐份验证 PGDMP 原始头、实际 dump 字节数与原 backup-readable.json 完全一致、完整 SHA、真实 `pg_restore --list`；识别的是 dump 本体，不把历史 312 B 备份描述文件当成备份。
- 现有 NAS 私有 S3 隧道/凭据保持，使用独立备份对象前缀 `backups/naumi47-central-identity/v1/`，对象名包含原 release 与内容 SHA。原 credentials 仍在 root 私有 0600 文件，不写 Git/聊天/回执；bucket ACL、权限、隧道及服务保持。
- PUT 使用条件创建，不覆盖既有对象；ETag 仅作为版本 pin，不能充当内容 SHA。每份都完整 GET 读回，逐字节计数与 SHA 比对，再次 HEAD 校验 ETag/长度/metadata 未变，确认匿名读取 401/403 后保存 REMOTE_VERIFIED 回执。
- 上传/完整读回只持本任务 archive.lock，不占用三部署锁或暂停中央监督；归档作业仅自身 nice=10、idle I/O。六份全部确认后，才非抢占取得三部署锁与 lifecycle lock，刷新 canonical/Nginx、核对原文件 inode/mtime/size/SHA 与原证明 SHA，写 intent/恢复 locator 后释放六个本地副本。
- 每个原路径旁新增 `.nas.json` 私有 locator；原 backup-readable.json、原发布/失败证据保持不变。locator 给出 NAS 对象、原始 SHA/字节数、完整 GET 证明和恢复命令，不包含秘密。
- 六份都进入 NAS 状态后，实际 ARCHIVE_RECEIPT.json / MODIFIED_FILE.json 才记录完成。锁忙、异常上传、不完整 GET、哈希或 ETag 变化均保留本地副本/真实未完成状态，不自动重放发布或业务任务。

## 集中回归与恢复副本边界

- 六项纯 guard 探针已通过；八项集中 fixture 回归已通过，覆盖缺少完整读回、SHA/长度/metadata 错误、ETag 变化、匿名可访问、外项目/路径穿越、私有原子回执。fixture 不连接 S3 或生产 DB，只创建并移除自己的临时 fixture 文件。
- 基线实际 `verify`：`LOCAL_COPY_RETAINED_REMOTE_NOT_VERIFIED` / exit 1，六个原始本地文件保持。该拒绝证明未将 PUT/ETag/metadata 当作完整内容验证。
- 归档完成后另执行 `ROLLBACK.sh`：只从 NAS 取回第一份备份到本任务另一个 `ROLLBACK_TEST.dump`，hash-guard、重新打开原字节、`pg_restore --list` 与原 list SHA 一致后记录成功；不向任何数据库执行 restore，不覆盖六个原始路径。测试前单独实测 10 GiB + 完整复制大小 + 512 MiB 余量。
- 恢复副本验证后可用明确 `--cleanup` 仅删除其自己的测试副本；NAS 备份与归档状态保持。业务数据恢复不是本任务验收项。

## 当前执行入口

- 私有冻结计划与持久作业：`/opt/naumi-staging/evidence/central-backup-archive-20261124-r1/`。
- `PLAN.json` 包含六个原始 SHA/stat/路径、字节数、原 pg_restore list SHA、两个保留的最新本地备份和审计授权。
- 六份实际上传/完整 GET、精确本地副本释放与独立恢复文件校验均已完成。收尾发现中央原 Worker 的原 tick 保持 UNKNOWN，监督 postflight 真实失败；该状态单独保留，不把归档完成当成中央发布 ready。实际 receipt、df 与原 tick GET 证明在下方记录。

## 实际完成与另行保留的中央运行待办

- 六份 NAS 对象均有完整 GET 原 SHA/字节数证明、二次 HEAD 版本 pin 与匿名读取 403 证明；六个本地副本已在三部署锁/lifecycle 保护下释放，旁置 `.nas.json` 为 0600。两个最新本地备份实际完整 SHA/字节数保持。
- 870789718 B 第一份备份已从 NAS 取回至另一个 `ROLLBACK_TEST.dump`，重新打开的 SHA 与原文件相同，真实 `pg_restore --list` 输出 SHA 也与原始一致。没有向任何数据库执行 restore；随后仅移除这一个受 SHA guard 保护的测试副本，NAS 备份和修改后的归档索引保持。
- 原 frozen PLAN、完整归档 receipt、独立恢复文件测试 receipt 共三份元数据也已上传 NAS，逐份完整 GET SHA 校验及匿名拒绝通过。对象都在独立备份前缀，未改变 bucket ACL/权限或建立应用媒体记录。
- 后台 `finish-archive.sh` 的归档/恢复/目录验证通过后，实际 `systemctl start naumi47-recovery.service` 失败，原 `FINISH_EXIT.json exit1` 和日志保留；不是把失败盖成全链 PASS。后续 archive-only finalize 独立记录归档验收，未重做 S3 上传或恢复副本测试。
- 原 Worker tick `faf00ffb-bf74-4a7a-b696-e0652019c3f3` 在 09:39:00Z 发起、09:39:33Z 收到 503 后为 UNKNOWN；早于本次 09:57Z 归档检查。服务端使用原 worker instance/boot/commit/tickId 的 GET 实测 HTTP200，但 receipt.phase=unknown、completedAt=null、result=null。Worker 当前 paused=true、unresolvedTicks=1，既有 Supervisor 因 `RECOVERY_HTTP_CHECK_FAILED` HOLD。没有取消、清除、伪造完成、创建替代 tick 或重放扫描/收费任务。
- 原 timer 仍 active/enabled，本任务从未暂停它；unit、manifest、current.json、gateway、应用/Worker/DB 程序及凭据未由归档任务修改。canonical 仍 2864；其中旧 supervisionStatus 的历史 VERIFIED 文本不是当前成功的替代证据，私有最终回执明确记录本次真实 HOLD。
- 这一监督待办与备份归档完成分开。新中央 rendering 候选仍未切流，孙疆普通组织事务仍 NOT_EXECUTED；其他人员/角色/技能保持。根盘实际可用空间及精确释放值以最终私有 FINAL_RECEIPT.json 为准，不把归档原始字节数当作 df 净增量。

### 最终空间与交付实测

- 计划时 rootFree=8033800192 B；释放本地副本前 7971254272 B，释放后 13238231040 B，释放事务净值 5266976768 B。恢复副本测试/清理后最终 13245026304 B（观测 2026-11-24T10:43:10.981656+00:00）。这些是各阶段实测，不跨阶段相减冒充归档净值。
- 归档与独立文件恢复验收完成，canonical 2864 / gateway d7cd4700a02f38a894f2d811975c5a0c0c399d326402b33a6a95b2e1c6ef6b14 保持。监督实际 HOLD 和原 UNKNOWN 仍单列待办，未写为通过。
- 本机重开制品位于 `E:/tmp/central-backup-archive-20261124/sealed/`：MODIFIED_FILE.json、DIFF_FILE.patch、VERIFICATION.txt、executable-on-47 ROLLBACK.sh。原始哈希、基线拒绝/修改通过/另一副本取回校验的精确命令、输入、字面输出与 exit 全在 VERIFICATION.txt；另一副本测试后清理，修改归档索引保持。
- 未把原始 dump 下载到开发机；本机只保留代码、元数据与证明。
