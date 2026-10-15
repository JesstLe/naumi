# 47花名登录与旧工作台Cookie路由修复

## 现象与真实原因
用户截图为47 `/dashboard?auth=sign-in`，花名“玄策”登录报通用“登录失败”。原生数据库密码并非错误：天地合大健康195账号均匹配用户指定密码，老板/员工公网API登录200；只验证无Cookie API没有覆盖旧工作台会话共存，上一轮验收遗漏此分支。

生产Nginx兼容map只把根页面Referer显式分到Naumi，其余未命中旧页面且无nv_user的请求会根据wb_session回退旧17847后端。老浏览器带wb_session时，从dashboard弹窗发出的原生登录被交给旧账号库，返回401/detail而不是原生error/user结构，前端因此只显示通用错误。

## 精确修复
- 新分支codex/login47-legacy-cookie-20261015，独立托管worktree，开工main9b429b3，共享codex/labs-workbench保持。
- scripts/fix-naumi47-auth-routing.py只调整兼容map中一行：同源Referer从“仅根页面”扩展为任意新页面；旧/legacy-workbench及/workbench、/single、/chat-image、/login、/admin的明确匹配仍排在前面，保持旧路径和无Referer旧客户端Cookie fallback。
- 不使用Referer/Cookie作为鉴权放行，只选择原认证后端；各自密码、会话签名、账号状态检查保持。新旧数据库不合并、不改密码/积分/权限、不删除浏览器cookie。
- 渲染器对map数量/原始行/优先级做CAS式结构检查；已修改或未知布局拒绝。离线CLI只生成新文件，不覆盖原配置或reload。

## 集中验收与发布
- 真实Nginx隔离fixture：baseline确实把dashboard+wb_session路由legacy；modified覆盖15组新路径/旧路径/无Referer/原生Cookie共存，全部正确；实际reload回退恢复原路由。固定测试端口只在独立容器内，不使用生产端口；不是纯正则静态断言。
- 实机47三把锁（Naumi/Hub/旧工作台）、保存原完整gateway/SHA、运行容器ID/Image/StartedAt，独立五temp目录Nginx语法通过后，只替换该一行并平滑reload。
- 7次连续真实HTTPS version样本全部成功且版本保持f4b3df127f2fcaf37f9cd866a480f3c6fd4b2358 / 1791989816；原全部容器ID/Image/StartedAt/Running保持。真实gateway独立copy恢复原SHA；失败路径自动恢复gateway，不回灌业务DB或停止原服务。
- 实机直接API对比：无旧Cookie原生花名/完整内部账号均200，携带旧Cookie时原来401。修复后必须通过实际浏览器dashboard弹窗、旧Cookie共存、玄策花名、返回user、nv_user下发、刷新保留；结果以本轮browser-result.json和VERIFICATION.txt为准。
- 103/120/101/旧香港均未连接或更改，NAS/自动发布不涉及。此为网关一行修复，没有重建App、替换业务版本或发起模型调用。

## 交接
47 `/opt/naumi-staging/evidence/tdh-login47-20261015` 保存gateway.before/after、逐行diff、运行基线和结果。回退只在当前gateway仍等于本次after SHA时、持原三锁平滑恢复before；拒绝覆盖同事后来变更，不恢复DB/媒体/积分。后续生成网关时必须保留此map修复，不能重跑旧output/public47脚本覆盖。

用户密码不进入源码/文档/日志。此前统一密码的核查证据在本机output/tdh-password-20261015和47对应受保护目录，195用户行实际未修改，现有会话未失效。

功能同步计数本模块1次，合main前刷新远端并普通整合后归零；本轮47网关发布1次、103发布0次。最终Git/浏览器结果以本轮真实回执为准。
