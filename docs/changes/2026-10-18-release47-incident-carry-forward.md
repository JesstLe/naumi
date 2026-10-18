# 47蓝绿继续：保留历史未结事件

用户明确选择“保留未结事件，继续新版蓝绿”。该授权不抹掉旧排空缺口，不确认未知付费产物，不授权任务重试/退款或数据库回灌。

## 状态边界

原canonical保留releaseId、plan hash、MIGRATED_CLEANUP_PENDING、legacyDrainProven=false、原操作回执。先保存原文件精确hash和可读副本，在同一current.json登记blueGreenSuccessor，逐阶段CAS；不换状态目录、不伪造旧COMPLETE。新槽验收、入口切换、旧当前槽排空、恢复控制重绑定单独记录。历史活动两行及付费任务/账务原字节不变。

新策略只认可精确两项：已死亡旧boot的付费needs_attention/hold；当前boot未绑定业务租约且promise已抛错的supplier-scan观察。新请求/Agent执行/其他未知观察、真实Worker未知、数据库执行租约/事务/advisory锁任一非零，仍阻止旧当前槽退役。原partial覆盖如实保留，综合证据明确命名为当前执行排空（带未结事件），不称历史完全排空。

## 执行边界

47全程三锁。先基线、可读DB备份、固定镜像；旁路一Web/同镜像暂停Worker；真实登录/DB/画布/媒体、客户端资源/旧页面保存、浏览器与业务只读验收；nginx -t后平滑reload。旧Worker停止领取且tick确认完成，新Worker直连新Web且有服务端完成回执。旧Web停止接新执行，重复采样当前执行排空后无限期优雅停止，不SIGKILL。旧镜像/媒体/配置/最近两版回滚保留。

恢复supervisor沿用原已测试实现，但manifest必须重新绑定新Web/Worker/镜像及网关hash；原manifest/unit保留供切回。新候选失败保留旧槽；切流后失败只切兼容入口/程序，不恢复旧DB，不重放任务。未知IO用原操作UUID核对，不新建同一操作。

## 源码刷新

2026-10-18已刷新并纳入企业分支8d9d08f7已推送模块，独立服务/公司身份/第三方配置不自动启用。本轮重新构建完整Web；后续分支新增不无休止混入已固定的当前切流事务。实际候选SHA、镜像、版号及最终上线/未上线以输出证据为准。

## 验收与剩余

策略9项回归覆盖精确授权、过期授权、未知扩展拒绝、付费状态/原字节保护、当前非零执行拒绝、Worker未知拒绝及原canonical不重标完成。线上结果另追加本文件或运维证据；此文档本身不代表已切流。

## 线上执行完成（2026-10-18 12:42:24）

实际SOURCE_COMMIT=1852b21c5db9ff40332e25d840d98086761209c5，BUILD_VERSION=1792297790，Web/Worker同sha256:d036e1d14f631f167df953b660df97d57e1b866ce37323af5b26839e6afb6932。新blueGreenSuccessor.phase=COMPLETE，原根历史phase仍MIGRATED_CLEANUP_PENDING/legacyDrainProven=false，revision74，未知活动/付费needs_attention/hold原样保留。Web切流UUID38ea674f-b379-41e9-a50b-db8a9015bf46。

真实旁路及公网既有登录/DB/画布/3D WebGL、旧页跨切流document保留和编辑保存/读回、16旧JS CSS逐hash、390px及私有媒体200/匿名401通过；pageerror0。Worker直连新Web，真实服务端tick完成；任务快照preservationVerified=true、unknownTables/violations为空、无原供应商变更。两当前旧槽已优雅停止restart=no，连历史共10槽停止，运行7容器。基础服务/原独立工作台保持，供应商生成提交0，临时测试节点已删除。

真实/api/imagegen/plan：目录IDgemini-3.0-pro-image-three-four，单张实际有权参考、medium/1K/3:4/png，HTTP200、modelVersion117/billingVersion8、报价6，eligible=[geeknow-nano-banana-pro]；未创建任务。模型配置基线及当前117不变；既有publication47b785a6-d653-4376-b23b-1126937abb49 phase=applied属于2026-10-16，不归因本次。未执行repair APPLY。

可读DB备份47,232,956字节；新版、7bd、f4b三版镜像及两版回退材料保留，actual nginx-t候选/回退均通过；服务器可执行ROLLBACK.sh默认只读check通过，--apply未执行，不宣称生产实切回。源副本实际685路径/2622原hash回退通过；配置副本原hash回退通过。恢复timer重绑定新两个槽且实际success。结束可用RAM约4.77GiB/Swap0/磁盘79%15GiB。

执行器与回退程序保存scripts/ops/release47_successor_controller.py及release47_successor_rollback.py，固定本轮主机/目录/身份，不能盲用于下一版本。此发布后运维归档提交及企业仅离线来源审计工具167f2daa不改变1852运行镜像；企业独立服务/公司身份/第三方尚未配置启用。

证据output/all-dev-release47-20261017/REPORT-20261018.md及VERIFICATION.txt；服务器/opt/naumi-staging/evidence/all-dev-release47-20261018。跨线程结果send返回parent_not_active，结果留handoff-banana-result.txt，未声称送达。本机临时会话/隧道密钥与服务器临时browser-private已清理，supervisor原受保护会话材料保留。
