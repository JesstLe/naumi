# 旧机 502 恢复记录 — 2026-10-12

## 结果
已恢复101.133.166.67原版本应用。公网健康/首页/画布/作品页均HTTP200；回环与Nginx健康连续三轮、间隔15秒HTTP200；真实next-server进程存活，DB可查询。

## 原因
北京时间10月10日23:58:20，宿主机global OOM杀死App PID1806；内核cgroup与naumi-app-1一致。随后Docker事件流出现EOF，Docker仍标running、containerd实际STOPPED，未自动恢复。业务级内存增长来源尚未定位。

## 本轮变更
持/opt/naumi/releases/deploy.lock，先保存私有inspect、原Compose/.env及可读pg_dump；仅执行docker restart --time 10 naumi-app-1。镜像仍为84e1afdee61013f3d5320b00bf688ae125b98179 / sha256:888b156a7d77fcd3a0cea9f4c8cdb01d6a728f494041ac7397227d48e34135c1。没有更新旧机代码或导入新机数据；配置sha256核验一致。

## 验证命令与字面结果
- BASELINE: curl -sS --max-time 8 -o baseline-health.txt -w 'BASELINE_HTTP=%{http_code}\n' http://127.0.0.1:3012/api/health -> BASELINE_HTTP=000，exit56，Connection reset by peer。
- MODIFIED: docker restart --time 10 naumi-app-1 -> naumi-app-1，exit0；curl回环健康 -> RECOVERED_HTTP=200；真实PID1652611。恢复脚本整体exit0。原配置/镜像及其他容器当时不变。
- PUBLIC: curl.exe --noproxy '*' -fsS --max-time 15 -o NUL -w 'PUBLIC_HEALTH=%{http_code}\n' http://101.133.166.67/api/health -> PUBLIC_HEALTH=200，exit0；/works -> PUBLIC_WORKS=200，exit0。此前普通代理路径曾Empty reply，未将此判为服务稳定。
- ROLLBACK: bash /opt/naumi/evidence/old-server-502-20261012/ROLLBACK.sh --check -> 原docker-compose.yml: OK、.env: OK、ROLLBACK_MATERIAL_CHECK=PASS，exit0。仅校验原版本/配置/备份；没有回滚成故障状态，没有执行数据库恢复。
- STABILITY: stability.sh -> LOCAL_HEALTH=200 / NGINX_HEALTH=200，各三轮；POST_BOOT_STABILITY=PASS，exit0；真实PID1925，restarting=false。

## 重启期间的外部事件
09:25:34观察到宿主机新boot，APP/DB/Worker于09:25:50重新启动。本任务没有执行reboot、shutdown或重启Docker/containerd命令；触发来源未核实，不能将最终状态仅归因于本轮容器restart。重启后已重新核验原版本、配置、进程及公网。新boot日志未见新的OOM条目。

## 数据和回滚
78用户、787图片任务可读；作品立即恢复后3188，最后3189，线上仍有业务写入。本任务未创建作品或覆盖生产数据。备份和700权限回滚脚本在/opt/naumi/evidence/old-server-502-20261012。ROLLBACK.sh --apply仅在镜像仍匹配时锁内重启相同App，不回灌DB；这不是发布回滚。

## 四个本地交付路径
- E:/Workspace/naumi/output/old-server-502-20261012/MODIFIED_FILE.sh
- E:/Workspace/naumi/output/old-server-502-20261012/DIFF_FILE.txt
- E:/Workspace/naumi/output/old-server-502-20261012/VERIFICATION.txt
- E:/Workspace/naumi/output/old-server-502-20261012/ROLLBACK.sh

## 后续
低内存复发风险尚未消除，内存增长来源需专项排查；本次未新增限额、调整swap或停止其他项目。禁止自动回传旧机仍有效。只提交故障记录到独立分支，不发布新机、不改共享main。
