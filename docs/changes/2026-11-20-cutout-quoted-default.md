# 2026-11-20 画布抠图报价模型回显修复

## 模块与根因

画布直接抠图复用浏览器报价、实际multipart `/api/cutout`、模型执行与同步计费。线上模型v157的隐藏默认抠图处理器已启用，报价正确选中它。浏览器submit按既有契约将报价modelId回显到`x-naumi-feature-model`；参数准备把该回显再次当作用户显式选择，隐藏可见性校验返回MODEL_UNAVAILABLE/409。09:25:34及09:26:40CST的实际请求对应此入口，未进入新增tool.cutout账务操作；不是供应商拒绝、通道未配置或画布当前GPT图像模型失效。

## 最小实现与边界

只修改`image-preparation.ts`的quotedDefault分支：经过账号/工作空间绑定读取的服务器报价，在其冻结模型版本中恰为配置默认、body没有显式model/modelId、header为空或与报价一致时，header是报价身份回显，保留隐式默认语义。无报价隐藏ID、其他默认/隐藏报价、不同header、body显式隐藏选择、停用/用途不匹配仍拒绝。不公开内部模型、不删除visibility校验、不改模型/计费/凭据配置，不重放既有任务。

## 集中验证

- 真实planner/preparation/executor/describe及选择约束36项通过。原源码副本使用`--quoted-header-baseline`稳定复现MODEL_UNAVAILABLE/HTTP409、供应商调用0；修改后通过，另副本hash-guard回滚后恢复同原错误。
- `verify-cutout-quoted-default.ts`：独立PG随机schema、实际billing quote POST→返回隐藏默认→带回显header的multipart cutout POST→loopback供应商→真实作品/alpha/账本→同操作重查。16断言通过：quote200、submit200、replay200、供应商仅1次、固定3积分一次；错owner/无报价隐藏/body显式隐藏/不同header均拒绝且无额外供应商调用。外部供应商调用0，schema/连接池/loopback/临时媒体清理完成。
- 完整Linux构建、固定版本蓝绿与公网受影响链路尚待本节后续追加，不能把本地fixture当作线上成功。

## 协作与保护

独立工作树从origin/main48949916开始，共享dirty不改；不修改同事尚未提交的生成进度模块。只47目标，保持同版本Web/Worker、三锁、备份、自然排空/旧槽restart=no与监督恢复。既有待核查任务保留，不自动重新提交收费抠图。生产当前仍为PSD试用版本71e54e07/镜像bc3a238d，部署完成后另记实际版本。

## 47 实际发布与封存

- 修复提交`41217a7d837254d7616b205c251a5ee4804d917a`已合main；构建前整合同事完成的生成进度修复，固定应用source`fd5160778fd337513ca5b81acbc576e0e26fb3a1`、build`1795138583`、Web/Worker同Image`sha256:ca4d331b16f7a6a44d07c606d5111eeff4f83c396f2038dfd59bce7dd16d1934`。6734个tracked输入逐SHA匹配固定archive，只有`.dockerignore`追加传输包/日志排除；Linux完整Next编译、内置类型检查、100页、Worker/identity和standalone包校验通过。同事本机共享依赖上的89项基线诊断未顺手改动，不以固定Linux门禁通过冒称其本机全绿。
- 初始41217镜像虽然完整构建通过，但未导入47、未创建候选；只把整合后的fd516077作为本轮唯一候选。切流前origin/main新增e81c0368仅清理文档、runtime diff0，未遗漏已完成应用工作。
- 持三部署锁+lifecycle锁：实际887338940字节DB dump、完整SHA读回及pg_restore列表验证；新Web旁路、同Image暂停Worker、真实只读应用/管理/企业链路200；MemAvailable11844MiB对4096MiB双槽/主机预算，不计Swap。根盘切流前27394641920字节，无本任务服务器清理。备份函数返回的309字节是JSON回执元数据，不是dump；本轮journal使用读回的真实dump内容/大小/hash，不回灌DB。
- 旁路实际认证报价200，model157/billing8正确选中既有抠图绑定。将同一真实服务器报价和冻结配置送入候选Node内的纯准备探针：原源码精确复现MODEL_UNAVAILABLE/409，修改源码正确返回image.cutout与同一模型/版本。该探针不提交生成、不预占积分、不上传原图、不调用供应商，不冒称线上真实出图。首次内部探针误带浏览器Origin而被回环地址校验正确拒绝403，原回执保留；用既有server-to-server契约重新诊断的独立label07d通过，没有重放业务操作或消除UNKNOWN。
- 公网固定版本/health、discovery/JWKS/认证projection、认证抠图报价及本轮公开说明均200。模型配置、价格、签名/客户端秘密、名册保持；PSD试用账号限制保持，消费app/DB/ingress不改。
- 完成整站平滑切流，保持旧Worker工作直至原域任务自然结束；旧Web传输自然等待239秒，双重transport/owners/activities/domain/worker排空证明后，旧PSD Web/Worker优雅停止且restart=no，新Worker恢复完成实际tick。没有强杀、重放收费任务、删除UNKNOWN或强刷用户页面。702次跨切流version/health/既有session HTTPS探测全200、0错误，7763份静态资源union与旧alias保持。
- 本轮`release47-cutout-quoted-20261120-r1` COMPLETE。主publisher三锁+lifecycle于01:58:15.739UTC释放；实际锁后systemd09:58:50～09:58:52CST Resultsuccess/ExecMainStatus0，readiness全true、unresolvedTicks0，timer active/enabled；postflight元数据事务退出。实际lifecycle status exit0、revision2742、TIMER_ACTIVE_SERVICE_POSTFLIGHT_VERIFIED。根历史MIGRATED_CLEANUP_PENDING/legacyDrainProvenfalse原样保留，不与当前轮完成混写；本次未做故障注入，不把正常监督写成崩溃恢复实测。
- 当前真实消费ACK仍sequence205/members204/errornull，源授权不改。原失败抠图卡片保留，不自动重提。发布验收没有拿用户原图新增收费调用；完整出图/alpha/账务证据来自前述独立PG+实际HTTP+loopback供应商回归。
- 持久发布回执：`/opt/naumi-staging/evidence/release47-cutout-quoted-20261120-r1/PUBLICATION_RECEIPT.json`；监督回执同目录`postflight/SUPERVISOR_POSTFLIGHT.json`；真实配置边界对照`07d-cutout-quoted-boundary.json`。本机四份交付在`E:/tmp/cutout-model-20261120/`：MODIFIED_FILE.ts、DIFF_FILE.patch、VERIFICATION.txt、ROLLBACK.sh。原始/修改hash保留，另副本回滚恢复原409，修改副本保持。独立fixture容器exited0；成功导入后的344470604字节RAM临时包已SHA核对删除，本机固定镜像原包保留。
