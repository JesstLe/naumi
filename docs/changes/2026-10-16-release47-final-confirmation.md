# 47最新整合版发布确认（2026-10-16 19:50）

## 用户要求与本次操作
用户要求“发布，一步到位，所有用户已下线”。本次读取原发布线程和交付记录后，发现19:14已由原事务切流到用户要求的整合main，不重新构建/创建候选/切流。只操作47，未连接其他服务器，不改共享checkout，不代提交他人18项未提交内容。

原实际维护19:00:05—19:14:23，为此前用户接受的短维护迁移，不重新描述成零重载蓝绿。本轮刷新origin，origin/main仍7bdcd8b644e8771646003f68055585f257df40f0；现场两次三锁获取成功，最后释放。

## 当前实测
2026-10-16T11:50:07.945793+00:00（北京时间19:50:07）完成25项线上核验：
- https://47.105.59.142/api/version：{"version":"1792146767","commit":"7bdcd8b644e8771646003f68055585f257df40f0"}。
- Web/Worker同image sha256:14a8d2ab2c76068569a8c9fe9dde81fc581166f9d108e8dbf8b347ca09cd7375。
- 原canonical release47-window-20261016-main7bd / MIGRATED_CLEANUP_PENDING / revision34，SHA474c436d9d097b05e4e6feab075d4040ce68ce974847f0e7d881d573ae0c561e不变。15个原operations全部ACKNOWLEDGED。
- 新Web原boot5bddd90b-355c-4b3d-ac59-eae52d4f3806开放接单；新Worker原boot35005a02-7a04-4ea4-bca3-0118144810e0、IDLE、paused=false、activeTicks0、unresolvedTicks0；lastTick.phase=complete且有serverReceiptSha256。Worker直连新Web，Web INTERNAL_APP_ORIGIN=127.0.0.1:3000。
- 数据库健康、既有登录、画布、独立包装页、Skills目录、已有媒体可读；匿名私有媒体被拒绝。仅native用户cookie访问真实BI接口404，与管理员口令保护一致；本轮未提升权限，也未声称后台管理员200验收。
- 原23表任务proof比较preservationVerified/noMissingJobs/noOriginalSupplierMutation=true，violations=[]，unknownTables=[]，新增1行允许，原状态转换0，drainProven=false。没有重放供应商或用户任务。
- MemAvailable1813MiB；新Web当前399.29MiB/峰416.66MiB，Worker当前32.78MiB/峰50.14MiB。两者swap0，memory.events全0，OOMfalse。没有为了重复发布再加实例。
- 精确可执行服务器回退脚本和sh -n通过，生产回退未执行；未回灌数据库/媒体。

## 已上线与仍未完成
上线代码为全部已整合开发分支main7bd；此前原发布事务119项生产API/真实浏览器及1029静态字节验证见原发布结果，本轮不重冒称这119项为刚重新执行。

未收尾：七个原baseline对象保留，旧caller暂停，旧Agent/内存后台完整排空未证明；新Web/Worker仍restart=no，新boot自动恢复未验收。因此不是COMPLETE，不把用户下线解释成后台排空，不批停旧进程、不临时改policy破坏原identity绑定。

新协调任务codex/canvas-node-entry-models-20261016：新增节点文字/图片/视频三选一、视频模型选择与图片对齐仍在独立开发，尚无完成SHA，不在main7bd，不声称本次已修复。当前线程不并行改canvas-client。

## 命令和证据
本次命令（本机）：
```powershell
python E:/Workspace/naumi/output/release47-evening-20261016/window-1830/ssh47-readonly.py E:/Workspace/naumi/output/release47-publish-final-20261016/verify47.sh E:/Workspace/naumi/output/release47-publish-final-20261016/verify47.log
```
输入：固定47身份、原事务/manifest/基线任务proof、既有账号私有cookie；无新供应商调用。字面输出：
```
LIVE_VERIFICATION=PASS CHECKS=25
THREE_LOCKS_RELEASED=YES
REMOTE_EXIT=0
```
原始失败日志保留：第一次误用lastTick.phase=completed（实际Worker协议complete），第二次包装页漏/tools前缀，第三次误期待native-only cookie访问BI200。核对协议/路由/管理员口令边界后更正验收脚本，未改产品放行或创建提权会话。

本机根E:/Workspace/naumi/output/release47-publish-final-20261016：LIVE_VERIFICATION.json、verify47.log、REOPENED_ARTIFACTS.json均重新读取。远端追加私有PUBLISH_FINAL_READONLY_20261016_1943.json，不改canonical。

原四件产物已重开并hash，沿用而非重复创建：
- E:/Workspace/naumi/output/release47-evening-20261016/window-1830/handoff/MODIFIED_FILE.json SHA256 11c85b6f066247186f66b0720a0f6f42fe12579cb15e8f9c6d2a77044bc3741a
- E:/Workspace/naumi/output/release47-evening-20261016/window-1830/handoff/DIFF_FILE.patch SHA256 57321c7316a69996b90f437988b257b801e68ed6796f74a7d3d28c16b8a5928f
- E:/Workspace/naumi/output/release47-evening-20261016/window-1830/handoff/VERIFICATION.txt SHA256 33b2dd37bc112339f10dc719f68afbc07ac073e120aa97c053478845ab181a7f
- E:/Workspace/naumi/output/release47-evening-20261016/window-1830/handoff/ROLLBACK.sh SHA256 35279ba81b69e7f38cb9dddf511300e3db18f9cc6c462b42521bf7d6fb290f30

原变更字段：网关original→maintenance→open、canonical.phase=MIGRATED_CLEANUP_PENDING/revision34、原caller.paused=true、Web/Worker.image14a8d2ab/source7bd/build1792146767。本次没有再次改这些字段。

已重开原隔离副本测试日志（本轮未重跑，不冒称生产回退）：同命令`python -m unittest discover -s scripts/ops -p test_release_maintenance_session.py -q`。
- BASELINE输入handoff/baseline-ops-copy，literal `Ran 35 tests in 1.825s`、`OK (skipped=2)`，exit0。
- MODIFIED输入handoff/modified-ops-copy，literal `Ran 46 tests in 1.876s`、`OK (skipped=2)`，exit0。
- ROLLBACK输入handoff/rollback-ops-copy，literal `Ran 35 tests in 1.448s`、`OK (skipped=2)`，exit0；22路径恢复原hash/基线行为，修改副本和线上新版保留不变。
- 真实可执行服务器回退/opt/naumi-staging/evidence/release47-window-20261016-main7bd/ROLLBACK-main7bd.sh SHA35279ba81b69e7f38cb9dddf511300e3db18f9cc6c462b42521bf7d6fb290f30，syntax0；生产回退未执行。
