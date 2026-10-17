# 47 502紧急恢复：公网恢复，Worker原未知tick未闭合

## 实际结论
2026-10-17北京时间09:30:00，47统一Web被容器cgroup OOM杀死，Exit137。kernel明确CONSTRAINT_MEMCG，anon-rss905224KiB；不是整台7GiB主机内存耗尽，故障时MemAvailable约5GiB。原896MiB额度低于实际生产负载，restart=no使已死Web未自动拉起。

09:32:53在原三把deploy.lock内将精确原CID的Memory/MemorySwap从896MiB提升2048MiB（不允许额外swap），启动原已退出Web，同镜像/环境/heap512不变。验证新boot后使用原控制协议resume/open。原image14a8d2ab/source7bd/build1792146767；没有发布2d3新业务，没有改nginx，没有重启活着的其他容器，没有回灌DB/媒体或重POST任务。

第一次恢复流程在末尾误将匿名feature-access401判失败；现场已恢复后核对鉴权规范更正断言，没有放开鉴权。第二次证据O_EXCL已存在触发退出，保留原证据改独立文件名完成确认；没有重复start或新UUID绕行。

## 当前实测
09:33后版本、健康、canvas、dashboard200；匿名feature-access401正确。09:35:26—09:35:46三轮既有登录/项目/Skills/版本/健康共15检查全部200；真实用户Chrome独立标签访问canvas完成权限加载/React水合/图片和文字节点/工具栏可见，不是200HTML空壳。仅阅读页面，不点击生成或改节点。T3 preview status/open均返回Authentication required，改用现有Chrome扩展API独立标签，无CDP。截图recovered-canvas.png实际生成并打开检查。

09:37:26末次版本/健康/画布200。新boot内存约673.2MiB，峰709.5MiB，memory.events全0；主机可用约4.59GiB。扩大限额只是止血，内存峰成因/长期增长尚未定位，不能声称根治泄漏或高并发容量充分。

## 明确未完成
Worker原boot保持UNKNOWN/paused=true/unresolvedTicks1。只GET原tick9fb445c5-b92f-4ec6-8579-451235fa0850，数据库回执phase=running且绑定已死旧Webboot，completedAt/result为空。不能将其改completed或盲目resume/重新POST；后台任务恢复/轮询仍受影响，不将公网恢复说成所有生成恢复。

restartPolicy仍no。只改自动restart会在新boot默认draining，不等于自愈；正式恢复控制/监护需补。canonical仍MIGRATED_CLEANUP_PENDING/rev34，保留旧startedAt/boot和896MiB计划，已与当前实体漂移，未手改凑PASS；旧release回滚可能因pin不符被阻断，不能宣称原回滚脚本当前可直接执行。新证据绑定原CID/image/新boot/资源，后续需正式rebind和更新回退基线。

上一步退役只做版本/健康检查，并未覆盖之后生产大图/后台负载；此前“全程无感/全部收尾”的表述不足。此次故障证据指向统一Web内存额度与无自愈，不据时间先后单独断言停止旧容器直接导致OOM。

## 证据与回退边界
本机证据根E:/Workspace/naumi/output/server47-502-emergency-20261017。远端私有原inspect/intent/ACK/新boot控制receipt位于/opt/naumi-staging/evidence/release47-window-20261016-main7bd/emergency-20261017-0932（原inspect不输出凭据）。originalPrivateInspectSha256=f2dbff5cb3eec55ca429bb673ee8b29415958221c66a2979e3d8ceb2051bb0d7。

BASELINE/MODIFIED/ROLLBACK以下只测试脱敏已观测运行快照副本，不模拟供应商或声称实际生产回退。生产没有恢复896MiB危险额度，也没有重现线上OOM；新Web保留2048MiB并开放。

BASELINE COMMAND=python E:\Workspace\naumi\output\server47-502-emergency-20261017\verify_snapshot.py BASELINE
INPUT=isolated sanitized observed snapshot, no server calls
LITERAL_OUTPUT=BASELINE_SNAPSHOT=PASS OBSERVED_OOM137 PUBLIC=502 ORIGINAL_HASH=VERIFIED EXIT=0
EXIT_STATUS=0

MODIFIED COMMAND=python E:\Workspace\naumi\output\server47-502-emergency-20261017\verify_snapshot.py MODIFIED
INPUT=isolated sanitized observed snapshot, no server calls
LITERAL_OUTPUT=MODIFIED_SNAPSHOT=PASS MEMORY=2048MiB PUBLIC=200 ADMISSION=OPEN EXIT=0
EXIT_STATUS=0

ROLLBACK_EXECUTE COMMAND=D:/DEV/Git/bin/bash.exe -lc "chmod +x E:/Workspace/naumi/output/server47-502-emergency-20261017/ROLLBACK.sh && E:/Workspace/naumi/output/server47-502-emergency-20261017/ROLLBACK.sh E:/Workspace/naumi/output/server47-502-emergency-20261017/rollback-copy"
INPUT=isolated sanitized observed snapshot, no server calls
LITERAL_OUTPUT=ROLLBACK_SNAPSHOT=RESTORED ORIGINAL_SHA256=MATCH EXIT=0
EXIT_STATUS=0

ROLLBACK COMMAND=python E:\Workspace\naumi\output\server47-502-emergency-20261017\verify_snapshot.py ROLLBACK
INPUT=isolated sanitized observed snapshot, no server calls
LITERAL_OUTPUT=ROLLBACK_SNAPSHOT=PASS OBSERVED_OOM137 PUBLIC=502 ORIGINAL_HASH=VERIFIED EXIT=0
EXIT_STATUS=0

LIVE_COMMAND=python E:/Workspace/naumi/output/release47-evening-20261016/window-1830/ssh47-readonly.py E:/Workspace/naumi/output/server47-502-emergency-20261017/stable.sh E:/Workspace/naumi/output/server47-502-emergency-20261017/stable.log
LIVE_INPUT=exact47 host/CID, existing account session, actual cgroup, original three locks
LIVE_LITERAL=STABLE_RECOVERY=PASS SAMPLES=3 AUTHENTICATED_CHECKS=15; THREE_LOCKS_RELEASED=YES; REMOTE_EXIT=0
FINAL_LITERAL=FINAL_RECOVERY=PASS PUBLIC=200 NEW_OOM=0; ALL_THREE_LOCKS_RELEASED=YES; REMOTE_EXIT=0
CHANGED_FIELDS=HostConfig.Memory/MemorySwap939524096→2147483648; stopped OOM CID→sameCID newboot running; admission.draining→open. image/env/heap unchanged.
MODIFIED_FILE.json=E:\Workspace\naumi\output\server47-502-emergency-20261017\MODIFIED_FILE.json
DIFF_FILE.patch=E:\Workspace\naumi\output\server47-502-emergency-20261017\DIFF_FILE.patch
VERIFICATION.txt=E:\Workspace\naumi\output\server47-502-emergency-20261017\VERIFICATION.txt
ROLLBACK.sh=E:\Workspace\naumi\output\server47-502-emergency-20261017\ROLLBACK.sh
