# 47画布修复：授权切流已上线，旧媒体实例保留

## 模块与职责

用户先确认仅对固定96a2393d解除47 HOLD，随后明确“强行直接发布”。本次执行该指定程序的47授权蓝绿切流：旁路唯一Web、同镜像Worker、站点入口与恢复监督器切换；不修改产品源码、模型/计费配置或历史业务数据，不连接103或废弃站点。

**结果：公网已上线；不是全部旧槽退役完成。** 发布记录保留`ONLINE_OLD_MEDIA_CLEANUP_PENDING`、`publicTrafficSwitched=true`、`releaseCompleted=false`。不能把本次授权推广为以后发布可无条件跳过生命周期或资源门禁。

## 固定程序与真实现场

- 指定/实际程序：`96a2393da654e26b67d1e32139bc223354bd257b`，build `1794795806`（页面v2026.11.16-102326）。
- Web和Worker同不可变image：`sha256:62b2332d007508e86bb958bbac385c04fb7655ca2db7596e36d6ca84b2074202`。
- 发布轮：`release47-canvas-fixes-20261116-r2`；Web `naumi47-web-canvas-fixes-20261116-r2`，回环13138；Worker同轮名称。
- 前驱：19d98385 / 1794718498，回环13137。前一Agent的r1手写启动脚本未执行；端口/挂载路径/第二bypass候选错误未带入实际操作。
- 本轮Git文档基线742bcbc6；96之后至该基线只有清理记录，实际src/Dockerfile/package无差异。文档提交不是另一个应用镜像版本。

## 根因、授权边界与接续

此前普通发布阻断属实：根和11/15子记录均CLEANUP_PENDING；现行normal controller不消费reconciledMainReleases；固定10GiB磁盘条件不满足。

本次以用户后续明确强行发布为有限例外，新增本轮独立reconciled记录和原UUID操作回执，不删除/更换状态目录、不回填normal journal、不把前驱或根状态改COMPLETE。历史前驱逐字段和canonical原像SHA保留；原root status/phase/legacyDrainProven保持。

真实磁盘检查取固定镜像实测Size1,112,694,584B；00d执行器实际强制1倍Size+备份预留+静态并集+2GiB主机余量，合计4,937,899,832B。独立审查另按2倍Size复算为6,050,594,416B，仍低于当时6,498,729,984B空闲；该2倍数值是独立复算，不冒称执行器当时已强制2倍断言。新备份840,511,002B，真实pg_restore --list通过；导入和静态并集后仍约4.74GB，并实际执行不少于2GiB的检查。没有删除业务媒体、volume、近七天备份或五轮恢复材料凑空间，未按固定10GiB条件伪称通过。

## 公共接口、依赖与数据/事务归属

同一HostTransaction全程持Naumi/Hub/参考工作台三部署锁与lifecycle锁。复用已上线固定运维模块的控制、Worker克隆和完整Nginx闭包CAS；Web通过Docker API复制真实资源、安全、网络和业务挂载，独立state/scratch/控制secret，HOSTNAME明确0.0.0.0。候选Web先draining、Worker先paused。

模型/计费配置只读前后hash一致；QA任务/账本/预占/计费操作计数不变。本次不发生成请求，不重放已受理/未知任务，不恢复DB。业务媒体仍使用原本站挂载。新Web内部App origin为127.0.0.1:3000，新Worker App origin精确指新Web容器；新Web媒体origin指新Worker，不分裂到旧版。

## 实际操作及旧媒体保全

1. 在四锁内保存真实在线实例、canonical原像、原UNKNOWN行与本次授权；新建一致性dump并读回验证。
2. 导入已上传固定归档，核对源码/build/RootFS，实际Image ID与本机构建一致。归档传输SHA为`98767f1758dc91a625330b3c67c00e372ceebf0994b6b6896b40eccb5d154f83`。
3. 新建唯一旁路Web及同镜像沙箱Worker；共享业务挂载和并发参数保持，独立运行状态不共享旧boot。
4. 建立6869份静态资源并集，保留旧alias；完整candidate与rollback配置隔离语法检查通过，新旧Server Action数量均0，API/视频协议/账务/Worker源码无本次变化。
5. 暂停旧scanner的3003 durable tick入口，但保持旧media3002健康可用；新Web开放、Nginx闭包CAS+nginx -t+平滑reload、新Worker恢复，并读取原真实complete tick。
6. 旧Web关闭新准入但保留现有请求。旧Web有125条本boot media-variant UNKNOWN及2个media-mirror在途，observer、DB instance/boot及scope逐项绑定；原总133条UNKNOWN逐行保持。旧双槽不停止、不伪造自然排空，旧媒体仍服务已有请求。
7. 恢复监督器绑定新pair，真实Supervisor.once与systemd service均成功。2026-11-16 13:12:14北京复核canonical2323，公网新版本、新Web UNKNOWN0、新Worker未知tick0、运行正常；四锁释放。

## 验证命令、结果与证据层级

本机证据根：`E:/Workspace/naumi/output/release47-canvas-force-20261116/`；服务器同轮证据根：`/opt/naumi-staging/evidence/release47-canvas-fixes-20261116-r2/`。SOURCE/RESULT保持实际执行原文、字面结果和exit，并按原字节hash重新打开核验。

- 00/01/02：真实dump/pg_restore list、镜像导入及原生候选创建均exit0；物理空间/内存预算不使用Swap充数。
- 03d：11条登录态真实读取200、21模型使用真实自有且原文件SHA匹配的QA图编译200，匿名401、缺媒体422；QA任务0、ledger2、reservation0、billingOperations2保持，生成提交/付费调用0。
- `node browser-check.cjs baseline http://127.0.0.1:19137`、candidate19138、public公网：真实生产React/登录QA账号，Canvas/Video、平铺分辨率/画幅、时长键盘4→5、390px无横向溢出、零JS/5xx；均exit0。未点生成；presence及compile-preview请求单独记录，不声称完全无写入。
- 切流后额外执行`node browser-check.cjs public-controls https://47.105.59.142`，exit0：真实点击720p及9:16并核对aria-pressed，时长4→5，断言按钮即时估价20积分；参数编辑未请求billing/quote，生成提交0。该追加结果见PUBLIC_CONTROLS.log及public-controls-browser.json；它不是付费生成或所有工具验收。
- 30条公网version/health采样全200，实际返回96。该采样时段从切流后开始，不伪称全切流时段零错误证明。
- 04/04a：实际网关切换与原Worker resume均已ACK；观察器遇初始lastTick=null报AttributeError，原失败保留；04a核对原ACK/网关后只继续读原tick，未重复切流或重新提交任务。
- 05/06/postflight：公开页面实测回执绑定实际commit/build；新旧配置hash、原UNKNOWN行、原前驱记录保持；真实监督器systemd Result=success/ExecMainStatus=0，exit0。
- `bash .../ROLLBACK.sh --check`：实际旧实例/新实例/程序/网关/备份可用性核验exit0。`--apply` **NOT EXECUTED**，未做生产程序切回。
- BASELINE/MODIFIED/ROLLBACK复制描述符测试：独立副本恢复旧字节/版本，新上线描述符仍保持新版本；该测试不是生产回滚，精确命令/输入/输出/exit在VERIFICATION.txt。

原失败未隐藏：初次诊断过严要求旧本boot UNKNOWN0而阻断，后续仅对逐行确认的media-variant保留旧进程，不清理行；首次媒体选择使用本地原件已缺失的旧676650B作品，旧新均422，换真实存在且SHA匹配的7625B QA图后通过；原浏览器Cookie头注入被Chromium忽略，仅验到登录壳，改用真实cookie jar后重新完成登录验收；初次匿名页面一次React418保留，后续旧新实际登录检查均零JS错误。这些都没有通过改变产品代码、权限或正确断言来换通过。

## 独立审查、回滚与剩余项

独立Reviewer检查候选隔离、实际源码、19d→96兼容差异和切流/监督器边界；指出的pre-switch恢复try范围、监督器unit/runtime原像恢复、回执版本绑定、回退失败scanner恢复、空scope/镜像峰值预算均按具体意见修正。审查不是生产操作执行者，不将PARTIAL写成完整生命周期PASS。

ROLLBACK.sh为实际可执行有锁入口，默认只读check；apply要求当前实例、网关、备份与版本匹配，保留新旧静态并集和已受理任务，不stop、不恢复数据库。独立描述符复制测试入口与生产apply明确分开。

未完成：旧25→7条HTTP请求仍在自然结束、2个媒体镜像Promise与125旧variant UNKNOWN保留，NAS隧道/历史原件事故未由本次修复。真实上游付费成片链路本轮NOT TESTED。旧浏览器原窗口跨切流旅程没有保持到切换瞬间，只有旧静态并集/协议差异与新旧真实页面检查，不能冒称该项完成。旧双槽后续需独立收尾，未取得可信证明前不停止、不扩张下一轮普通发布；本次成功发布计数不因只切流擅自增加为标准COMPLETE。

本轮交付边界：**指定画布修复已经在47公网实际服务；保留旧媒体工作和事故记录，标准整站收敛仍待完成。**
