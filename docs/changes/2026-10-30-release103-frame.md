# 103 画幅适配修复：直接更新与真实端测

## 本次授权与固定对象

用户明确要求：更新103，不使用蓝绿，打包、构建、上传后直接端测，以效率为主。本轮仅103.30.76.93，不操作47，不复制站点数据库/用户/凭据，不回灌数据。

最终候选 main `98611762af5cab398c35884a51da87dc841292b8`，BUILD_VERSION `1793330285`，镜像 OCI index `sha256:d1bb562b77c46791f13b48a1bb207349a47c973ddff5fde9c9a103f490c5665b`。构建期已整合同事完成的画布主题到3029468f，再补本轮实际发现的初始化同连接修复。固定后不继续收无关业务以反复构建。

## 实施与调研

- 原103实际运行26ecb4f / 1793281509，Web/Worker同镜像f00f1ae；公网投向本机13107，独立Hub/NewAPI/PG/Redis保持。实际模型115、billing8；没有pending publication、活动图片lease0。
- 原SSH helper文件已缺失；按用户要求查询历史会话找回此前提供的103连接资料。实际SSH认证及machine-id hash核对成功；凭据只保留在ACL私密目录，不入Git/公开报告。
- 原103已上线single-pass质量映射不在main，发布前窄补回版本化语义质量权威，避免high→medium→low二次映射。63检查和X6链通过，独立副本回滚恢复反例。
- 生产构建/类型检查/91静态页/standalone完成；独占network-none镜像检查主页、Canvas、37静态资源、版本、公开说明、Worker/media，均通过。上传包按SHA及35成员逐项校验；后两次候选使用内容地址blob差分，未再次上传完整旧层。
- 本轮按两把现有103部署锁保护备份/替换/端测；保留旧容器及镜像回退。数据库pg_dump -Fc已生成且pg_restore -l实际读回，原配置/nginx/生命周期记录及容器配置保存在服务器私密证据目录。

## 真实失败与修正，不省略

1. 首次导入核验把本机config ID当成103的镜像ID。103同为OCI store，实际是index ID，首次停旧前终止；依据实际docker inspect修正，不重传包。
2. 直接创建容器时Docker API 1.41低于服务器最低1.44，触发程序回退；旧Web/Worker恢复，未回灌数据库。脚本改用已核1.44，并先创建**不启动**的新容器验证配置后再停旧，未启动蓝绿双Web。
3. 旧Web重启后，核心初始化事务已经持有app_users DDL锁，providerPk检测却再次getPool().query；认证并发占满其余普通连接，实际出现一条idle in transaction和四条app_users锁等待。按PID、SQL和本次boot后的启动时间，精确中止该未提交初始化事务，业务行零修改。
4. 源码providerPk改用schemaDb.query。真实独占PG pool max1：原版4检查复现第二checkout，修复28检查通过，含legacy主键迁移和8路同时初始化；副本回滚复现原状态。
5. 前述等待使旧worker tick超时UNKNOWN。仅用原tick GET查询到持久completed回执，全部processed为0，通过原reconcile接口恢复QUIESCENT；未删除状态、伪造零值或重放供应商任务。

## 端测计划与边界

复用此前授权管理员会话（不创建账号、不补积分），读取验证通过且余额充足。输入为用户本次941×1672原图，SHA256 `d4eb86b94b6b30bf88b22dde77bbd7cc5d35c04c722ddd19322e6b514a1a132e`，提示词“换成红色”。

三例串行各一张medium/1K：即梦auto→9:16；Banana Pro显式16:9；Banana2显式9:21→1:2。先实际plan冻结三份报价，各6积分/共18；start marker在唯一POST前落盘，未知只查原ID。验收核真实HTTP、供应商task/wire、原图字节、作品、单条-6账本、reservation0及原operation重复读取无新增消费。

上述为执行前计划。最终实测先出现Flash供应商400，随后窄修比例配置并使用独立新计划通过，完整结果见下节；初次失败证据没有删除。

## 证据与回退

- 本地：`output/release103-frame-20261030/`，含build、preserve-single-pass、schema-bootstrap-client、e2e及实际远端命令输出。
- 服务器：`/opt/naumi-staging/evidence/release103-frame-20261030/`；Web/Worker状态挂载在对应`releases/release103-frame-20261030/`。
- 镜像回退仅恢复旧程序/兼容入口；配置若已发布则先按窄字段逆变换和expectedVersion发布回退，不恢复整库、不重放已受理操作。原始失败、UNKNOWN与回滚过程均留档。


## 2026-10-30 最终上线与验收（北京时间12:34收尾）

### 程序与配置

- 程序于12:10:49实际切换为 main `98611762af5cab398c35884a51da87dc841292b8`，版本 `1793330285`（UI `v2026.10.30-111805`）。Web/Worker同前述OCI镜像，旧二者exited、restart=no，数据库与媒体未回灌。
- 三模型auto/edit/即梦旧HOLD配置115→116：publication `649c54df-5056-4fd8-9142-187d1fb57f92`，billing v8及其digest不变。
- Flash首笔遇HTTP400，进一步发现其旧参数表与GPT专用表整表相同。APIB公开`/api/status`自指APImart文档；Flash精确文档不包含1:2/2:1。只删除精确历史Flash列表的这两项，质量、分辨率、像素表、其他通道与价格保持。运维脚本已合main `e70bec13`，不改程序镜像；配置116→117：publication `f9fa252d-e914-4a06-ae2b-a011b3eb264b`，billing不变。
- Flash规则源码集中18项、基线2项反例及副本回滚均实际通过；后来编辑guard exit73/WRITES0。详情见[Flash目录纠正](2026-10-30-x6-flash-ratio-catalog.md)。

### 真实原图、原提示词与完整交付

用户原图941×1672、提示词“换成红色”，各一张medium/1K。以下均真实HTTP、实际供应商、PG、私有媒体下载及作品归属，不是fixture：

| 模型/案例 | requested→wire | 实际输出 | 用户账本 | 结果 |
|---|---|---|---|---|
| 即梦 | auto→9:16 | 736×1312 JPEG，319598 bytes | 一条-6 | 成功 |
| 香蕉Pro | 16:9→16:9 | 1376×768 JPEG，737401 bytes | 一条-6 | 成功 |
| 香蕉2首次旧表 | 9:21→1:2 | submit HTTP400，无task ID | 0，释放预占6 | 失败保留 |
| 香蕉2目录纠正后独立新计划 | 9:21→9:16 | 768×1376 JPEG，772296 bytes | 一条-6 | 成功 |

总共4笔独立测试，3笔成功，用户实际总扣18积分。三笔成功分别只有一个supplier task和一条-6；reservation均0。成功原operation重复提交验证新增supplier行0、账本行0。没有借“重试”重发首笔未知受理请求。

肉眼打开三份原始输出检查：即梦与香蕉Pro背景、包装重点转红；香蕉2背景转红，但包装仍有蓝色细节，因此不宣称其完全遵从改色。原生像素略偏目标比例时保留整图，不裁剪、不拉伸、不丢弃。

- `jimeng-auto`：operation `2808102e-b6d2-4bf1-a637-43c02d560f48`；SHA256 `daf856798bd0e55ef56e289c35d96dbad9411e9647df80f8a9b2ffb7cef4d0ed`。
- `banana-pro-explicit`：operation `f7978aac-d521-446f-a3e5-1560aa229b1d`；SHA256 `c3f2f1ffd5119cdc45b6595e4731009b62cafc6f4622910e264897b2be73b4df`。
- `banana2-corrected-config`：operation `dd6da9b1-756d-4a4f-80a1-cedeffc5096d`；SHA256 `0583a447b79767963679badb42e50a01281908ca8cb7be249e169e51ba1e3d17`。

### 初次失败与保留边界

首次Flash operation `3927df36-5682-44a6-a4b7-c0d2df070a56`，供应商HTTP400只持久化有限类别与响应hash，没有具体参数message；来源纠正和新计划成功不等于供应商明确确认旧400具体字段。旧supplier保持unknown/pending、paid intent replayable=false；客户侧released、charge0、reservation0。配置发布不修改旧报价/任务，不将其伪造成not_charged。供应商成本待核仍记账，其他历史X6无结果报告未逐笔关闭。

### 公开入口与静态资源

真实公网浏览器发现新版CSS/JS四项404：Nginx仍引用上一轮兼容目录，App直连同资源200。新建本轮兼容目录，逐hash并入新版文件并保留3925个旧文件，只将三个static alias指向新目录。最终507个新版文件逐一经Nginx HTTP读取并核SHA一致，总3967文件，冲突0；nginx -t及reload通过。

首次reload后立即探测曾命中旧worker 404，后续重读确认200；全目录curl首次因`[[...segments]]`URL glob失败，加入--globoff重跑507项通过。两项准备偏差留档，没有省略失败。

共享浏览器重开首页与Canvas：新版可加载；Canvas匿名登录门禁正常；36项画布静态资源无404。唯一401为匿名billing catalog，未把它写成已登录浏览器生成。真实已授权认证、生成、媒体与计费验收使用原生HTTP；未新建账号或补余额。

### 收尾状态与证据

- `/api/version`、`/api/health`、对应公开更新说明真实读取通过；Worker正常运行，最近tick HTTP200/complete、unresolvedTicks0，Web内部origin与Worker指向统一新实例。
- 发布器实际写入canonical revision253、`direct103Releases.release103-frame-20261030.phase=COMPLETE`。历史状态原样保留。部署器exit0、字面`DEPLOY_LOCKS_RELEASED`；随后两把锁都实际非阻塞acquire/release验证FREE。
- 初始4项矩阵并非全绿：程序/比例/真实交付最终通过与首次Flash失败、视觉遵从差异分别记录。47与其他站点没有操作；全台账/10万活跃容量不据此关闭。
- 本地汇总`output/release103-frame-20261030/VERIFICATION.txt`；服务器`FINAL_ACCEPTANCE.json`、`PROGRAM_FINAL_VERIFIED.json`、`STATIC_ACCEPTANCE.json`与`FINAL_STATUS.json`均下载读回。
- 源码copy-only回滚四产物位于`preserve-single-pass/`、`schema-bootstrap-client/`、`flash-ratios/`；静态alias配置副本四产物位于`static-artifacts/`。副本回滚恢复原hash/行为，modified归档保持修改。它们不是线上数据库回灌入口。

最终新增运维源码完整项目类型检查：`node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit --incremental false`，stdout/stderr为空，exit0。增量记录与总台账单独提交合main，不重建已验证的98611762程序镜像。
