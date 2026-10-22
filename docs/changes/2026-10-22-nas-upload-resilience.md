# NAS间歇超时下的上传降级修复（2026-10-22）

## 范围与状态

用户授权“如果是，则修复”，承接47再次上传失败。本机不在NAS局域网，192.168.5.6管理页不可达不能证明NAS本体故障；只通过47已有受限隧道检查，不增开NAS管理端口、扩展SSH权限或猜测磁盘/宽带根因。

状态：代码及隔离回归已完成，尚未构建完整发布镜像、蓝绿切流或验收线上新版。现有NAS健康监控继续运行；不将此次代码提交记为线上已修复。

## 已确认的问题与实现

1. 原图、两档预览在NAS无响应时可分别等待120秒，用户请求可能在本地兜底前断开。仅对private S3 proxy路径增加共享短期写入探测：新目标HEAD可200或404，3秒内无响应即保存本地；同进程并发探测合并，成功缓存15秒、失败冷却30秒，随后允许探测恢复。R2与公开直传不增加这项HEAD。这个探测仅判断响应能力，不把404当作上传成功或写权限验证。
2. 探测之后NAS仍可能卡住。私有S3写入尝试按字节数设置8秒基础+每256KiB一秒、上限120秒的总预算，小图8192字节为9秒；这是总预算，不是基于TCP进展的空闲检测。64MiB保留原两分钟上限，合理较慢大图不会被套用统一3秒/9秒限制。超时原PUT被取消，保存原字节后才返回本地成功；后续预览走冷却降级。没有放任未跟踪上传在后台运行。
3. 原代码只把取消信号交给签名Request，再由aws4fetch执行fetch。初次真实HTTP fixture里出现信号已触发、fetch仍未及时结束的情况；改为先签名，向fetch显式传原signal，实际黑洞回归通过。未证明该fixture现象就是此前线上根因。
4. 已落本地、remote_ready=false的素材，原readManagedObject仍先尝试远程GET，作为后续模型输入时继续等待NAS。改为先读取并校验本地大小/SHA，保留目录MIME；本地确实缺失才尝试远程。已确认remote_ready的对象仍以远程内容为准，不改为无条件本地优先。
5. 补传任务原先也先读远端，再重传，并可能让一个坏文件导致整批回滚、持续占住队首。改为优先读待补传本地文件，核对目录SHA和字节数；历史缺少本地副本才尝试旧远程路径。单项缺失/损坏或存储异常保持remote_ready=false、持久延后5分钟，其他项继续；只上传原有字节，不调用模型、不重放扣费。

本地落盘/目录队列继续负责进程重启后的恢复，进程内冷却只是限流提示，不充当持久任务队列；remote_ready仅在PUT真实成功后标记。没有在远程成功时额外写本地镜像，没有自动删除旧媒体、切换整站存储或改供应商/积分。

## 集中验收

- scripts/verify-storage-resilience.cjs：20项，实际本机HTTP服务器+真实临时文件，模拟TCP接受但HEAD不响应、健康缓存后PUT卡住、并发探测合并、两档预览快速落本地、待补传素材不访问故障远端、大小限制、正常较慢3MiB上传、恢复后同key写入、远端权威读取及R2无NAS探测。目录/Worker部分为明确fixture，核对损坏项不上传、不饿死下一项、重试状态持久更新；不冒称真实数据库事务验收。
- Windows Node24.11.1与本机WSL隔离Linux deps镜像7a676ea9a184中均通过同组20项。Linux容器network=none，只允许自身loopback、只读源码、256MiB/1CPU/64PID和32MiB临时目录；没有生产挂载或秘密。临时文件及测试容器已退出清理，供应商调用0。
- scripts/verify-storage-s3first.cjs原20项通过；TypeScript全量noEmit通过。没有重复生图/视频全套或收费请求。

## 线上状态与未完成

只读核验47根状态/opt/naumi-staging/releases/release-lifecycle/current.json：revision545、根phase=MIGRATED_CLEANUP_PENDING/status=CLEANUP_PENDING。历史blueGreenSuccessor虽COMPLETE、runtimeRecovery为ACKNOWLEDGED，不能据此将根状态清零或改目录绕过尚未收尾记录。代码中的旧normal successor机制保留了历史异常边界，不把其存在当成最新统一发布门禁已经通过。

遵循AGENTS.md“上次未完成先协调处理”与RELEASE_LIFECYCLE.md的根状态约定，本轮未增加候选Web、持有长时间发布锁、改根状态、替换在线程序或原地重启。需要先真实收敛/协调原未完成发布记录，再固定完整commit/Image ID、绑定真实版号及用户公开更新说明、完成整站蓝绿与实际HTTP上传/补传/读回验收。用户授权修复没有被解释为允许跳过这些门禁。

NAS内部存储引擎/磁盘延迟与链路利用率根因仍待故障期间管理端证据；此修复降低短暂不可用对新上传的影响，不能让仅存NAS且无副本的历史文件在NAS离线时凭空下载。没有修改旧监控“仅回收已证明失联会话”的条件。

本轮不增加应用成功发布与空间维护计数；共享checkout及同事未提交内容保持，未操作103/废弃120/179/101。

## 用户明确授权上线后的继续处理

用户要求处理未收尾并蓝绿上线。进一步阅读既有正常发布日志后纠正前一结论：最新正式publication为release47-admin-query-20261021 COMPLETE，前驱两槽已停止；根MIGRATED_CLEANUP_PENDING是被明确保留的更早两笔历史事故，不能清成成功。沿用同一canonical journal中的normalBlueGreenReleases及原三锁/CAS/当前执行排空验证，新增统一入口`deploy-release.sh --lifecycle publish47-nas --config ...`；该适配器先验证上一publication及退役事实，任何新未知操作仍阻断。没有降低通用lifecycle状态机的未知状态保护。

只读发现当前进程多次重启留下18条旧boot观测，涉及14笔generate和一笔imagegen父任务，其中3笔已有完整data图片。准备逐笔原结果续交付和未知提交隔离，原付费意图/冻结参数/账务不清零，不重新发生成请求。线上修改与实际验收结果在后续追加；当前仍未切流。

固定候选公开版号1792674911，公开文案仅说明图片上传等待优化，不包含内部NAS、地址、供应商或后台信息。

## 真实恢复、构建与候选验收（继续）

- 内核日志确认当天现役Web三次内存不足被杀，RSS约1.74–1.79GB；Docker当前OOMKilled=false不能否认此前被外部恢复器拉起的旧进程事实。旧限额1792MiB。整机实际约7270MiB RAM，Swap不计入发布容量。
- 18条已证明旧boot死亡的观测完成逐项CAS核对。11笔上游是否接受未知的generate任务隔离为needs_attention，保留完整原付费意图、冻结参数、租约令牌与账务；3笔已有真实完整图片的原任务完成原结果续交付，billingSettled=true、无新增供应商生成请求。未重放状态未知请求，旧历史两笔事故继续保留。
- 固定应用0a572167448a91a5a9e2cfc4c73a3b557eb6406c，版号1792674911/v2026.10.22-211511；Linux完整构建通过，镜像sha256:600320c4d08b5093e3d27efa91e31bc4cc81596ce0d788e0d01c85bd198a0652。GitHub两项工作流在前置阶段失败，不能记为CI测试通过；采用本地已有固定依赖构建，无生产构建、无新增费用。
- 同一canonical journal、同一三锁下创建唯一候选Web/同镜像Worker，前者2048MiB启动，后者暂停。等旧槽真实退役后才提高新Web到3072MiB，要求真实MemAvailable覆盖新增可用额度、1024MiB主机及128MiB Worker余量；原进程不重启，监督器内存静态指纹同步绑定。
- 候选首次BI验收404属于已有验收管理员会话失效。只生成主机私有的一小时管理员验收会话，不修改账号密码/授权；三个BI查询真实200。恢复入口绑定该证据SHA、私有cookie SHA、canonical revision和原6项operation UUID；不重建候选、不重做备份，不把未知操作标已完成。前驱退役证明只核对原证据，保持不可覆盖。
- 候选实际上传9381字节PNG、两档缩略、NAS直读/私有HTTP读回SHA、附件下载、Range206与匿名401通过，验证素材精确清理。正常远程成功无本地重复，供应商调用0。旧公网画布和候选画布原生账号登录、项目读取、可见主区域与真实版号均通过，保留旧公网页面用于切流兼容核验。
- 当前仅达到READY，尚未声明发布完成。全部证据在47 /opt/naumi-staging/evidence/nas-upload-release47-20261022，私有凭据不提交。收尾后另追加实际切流、旧槽退役、3GiB限额、Worker完成tick和三锁释放结果。

### 排空阶段的旧扫描记录

切流前还核对出旧Worker在2026-10-21留下的一条UNKNOWN扫描tick。服务端无对应tick回执，Worker无活动tick但保持暂停；没有将缺少回执推断成请求未接受或扫描已完成。关联本轮已审查14笔任务，其中11笔保持needs_attention、3笔原有结果done，租约均已到期。保存原扫描未知状态及主机私有审查证据SHA，最终退役仍要求旧Web当前请求/Agent/接受任务/未知租约归零、全业务域fence/事务/锁归零。

原控制器尝试恢复旧Worker时在发送前因UNKNOWN状态被拒绝。保留原operation UUID、原UNKNOWN记录与源文件SHA；核实对应handoff意图文件不存在和原明确前置异常后，登记NOT_DISPATCHED_PRECONDITION_REJECTED，不冒称resume执行成功。随后从原READY恢复，沿用原镜像、备份、网关预映像、任务快照及已启动候选，未重复执行create/import/backup或重放付费任务。

真实浏览器工具中原会话被外部重置，未声称持续保留原浏览器会话。补验采用现役旧槽真实HTML，在同一公网源下加载真实旧JS资源（只拦截测试浏览器首文档），其9个旧script与新后端项目/文字节点/节点设置/登录查询均200；另开公网新版真实页面，26个script均200、390px无横向溢出、无pageerror。该证据是旧bundle兼容检查，不是长时间活跃编辑/收费生成不中断的压力验收。

## 最终实际交付（2026-10-22 22:06后，北京时间）

47 的 release47-nas-upload-20261022 已COMPLETE，实际应用仍固定0a572167 / v2026.10.22-211511 / image600320c4d08b…。Web和独立Worker同镜像、Worker直连新版Web，旧admin-query Web/Worker均已排空停止且restart=no。最终回滚只读检查PASS、原模型/账务配置保持、未回灌数据库，原操作UUID全部ACK，三锁已释放。根历史MIGRATED_CLEANUP_PENDING及旧两笔事故仍明确保留，不称为历史全部恢复。

新Web最终限额3072MiB（3GiB）、Worker128MiB；提高新Web额度时StartedAt保持不变。最终采样Web当前566MiB、峰值712MiB、oom/oom_kill均0；Worker30MiB/峰值47MiB；整机MemAvailable4209MiB。以上为本轮真实验收窗口，未做高并发容量承诺，3GiB不是“永不OOM”的保证。监督器已绑定新的限额与配置指纹并active。

正常Worker还恢复了4笔既有stored-delivery任务：error→done、原冻结digest及供应商绑定不变。任务保护最初因其预占记录释放而HOLD，入口安全切回旧站；随后逐笔以作品所属账号在进程内短时鉴权，读回真实图片并sharp解码，确认各一条账单（6/12/12/12积分）、无剩余预占、无重复结算，保留初次差异证据，只接受这4笔已证明完成的预占释放，不放宽其他缺失/未知/供应商变更。管理员验收账号读取他人私有素材404属于权限保护，未将其误判为图片丢失。

重用原事务/候选继续发布时，旧gateway意图文件的排他写入曾阻断重复切流；保留原UNKNOWN及原UUID，核对现场完整网关仍为旧预映像后，在该UUID专属证据子目录完成同一操作并ACK，没有删除/改名canonical状态目录冒充空闲。已核对的切回与差异闭合记入reconciledFailure，最新publication不再残留未闭合lastError/PENDING_RECONCILIATION。

最终又对真实公网HTTPS入口执行一组完整上传、NAS直读SHA、缩略、HTTP读回、Range206、附件下载与匿名401验收，全部通过，测试对象精确清理，供应商生成调用0；此前故障隔离11笔未知提交继续保留待核查，不重放、不声称其都已出图。

证据：/opt/naumi-staging/evidence/nas-upload-release47-20261022/transaction/PUBLICATION_RECEIPT.json、FINAL_PUBLIC_STORAGE_ACCEPTANCE.json、normal-rollback-check.json、FINAL_CAPACITY_AND_LOCKS.json及scanner/settlement审查文件。固定程序与后续ops/docs提交区分；未操作103/120/179/101。源码后继运维仅恢复本次精确事务，不代表支持任意失败自动蓝绿恢复。

空间维护：本轮成功程序发布+1，并已执行本机/47空间盘点；47最终可用34.2GiB，没有确认可删且不被回滚引用的生产缓存，因此释放0字节，保护当前与最近两版镜像/配置/静态资源和最近7天备份；本次盘点后维护计数0。未对生产媒体/volume/用户数据执行清理。功能模块1，结束再次fetch整合远端，迭代同步计数归零。
