# 47 主线更新：未决执行收尾与固定版本发布

## 授权、目标与固定基线

- 用户先要求“上线一版”，随后明确：“我让你上线，你就把全部问题都清完，最后给我上线，听不听得懂话？”本轮继续同一大陆站发布，先完成发布前置问题的真实处置，再完成上线，不以预检作为最终交付。
- 目标仅为 `47.105.59.142`；103 模型映射独立验证线及其后继实验分支保持隔离，不合入 main，不发布到 47。重构分支同样不整合。本轮不操作其他站点。
- 源码基线：`e2f562556ea6e71370619686e1fc8d4c634ef5e7`。父隔离工作区：`E:/Workspace/naumi-release47-main-20261101-r1`，分支 `codex/release47-main-20261101-r1`。
- 本轮固定 `BUILD_VERSION=1793544987`；实际运行源码 `67bbcddfe056a51739d5d5b954d9fb05c55e0479`，Image ID `sha256:614e934cdad055d5e6f5abe39afd29b61bb231f7d41a10419e967b5842fad48e`。
- 前次预检保存的线上程序为 `b79c8c397a33cfb3b636acbbe2edfa976f534c39 / 1793281629`。该值是此前现场证据，不代替重启续跑后的最新在线核验。

## 模块职责与数据归属

- 本文记录发布事务、版本与验收，不拥有生成、账务或任务状态的写入规则。
- 公开目录 `src/content/public-release-notes.json` 只维护双语用户可见说明，通过现有版号上限过滤；不读取内部发布文档，不包含后台改造、供应商、用户、地址或凭据信息。
- 未决 tick、扫描观察、业务任务、供应商原任务和账务分别按原身份核验。协调过程的失败终止证明不等于供应商成功或未受理；原始未知结果及证据保留，不重发收费生成、不回灌数据库或媒体。

## 当前处理项与状态

以下为开始时的处理清单；截至 11 月 2 日凌晨，固定镜像已构建、旁路验收并于 11 月 1 日 23:59 左右切入公网，新 Worker 已恢复扫描，旧槽已退役。最终监督器和验收结果见文末，不以开始阶段的待办描述覆盖后续实测。

1. 重新核对现役 Web/Worker、三把发布锁、实际入口及 canonical；重启前未完成命令先对账，不重复执行不明状态操作。
2. 核验原 Worker tick 及当前 boot 的扫描 UNKNOWN：保存原回执、失败阶段、后继动作、业务租约和未知付费结果；必要处置须以精确证明为依据，不删除观察或伪写原 tick 完成来通过门禁。
3. 处理旧发布收尾、任务保全及存储验收缺口；复核双槽内存与磁盘余量，仅处理确认无运行/回退引用的可回收资源。
4. 把本轮必要改动与说明整合到 main 后固定 SHA 构建；Web/Worker 采用同一镜像，原鉴权、数据媒体、配置和已受理任务语义保持。
5. 完成旧静态资源兼容、真实就绪、原任务读取、Worker 交接、旧槽退役与公网版本核对；只有真实终态证据满足后才记录完整上线。

## 本次公开说明

绑定 `1793544987`，人工复核后通过维护脚本追加。内容聚焦：

- 多图生成保留源图并创建独立子节点与来源连线；图片组持续显示底板并支持整体移动。
- 文字创作与反推入口区分，提示词优化预览/应用/取消，以及点击多选上传和当前会话参考草稿保留。
- 画布工具栏、弹层及生成状态的亮暗主题接线。
- 图片缓存异常后的有界读取、单资源恢复和已授权热图复用，减少重复加载及闪白。
- 原任务结果查询的单次期限与连接异常后继续查原任务；自适应/显式画幅优先级与最近可用比例匹配。
- 部分抠图已有结果的原操作恢复显示。

音频剪辑 `815603cb`、完整多轨 `50fc7d07` 及原位生成/引用显示 `1dd23fbb` 均已是保存的线上基线 `b79c8c39` 的祖先；原公开目录已有音频、多轨条目。本轮保留这些功能及原历史说明，不再次包装成新功能，不补造发布历史。上述能力在最终候选的可用性仍随受影响功能验收核对。

## 本切片验证与未完成项

- 公开说明由现有 `maintain-public-release-notes.cjs append --input <本地临时审核JSON> --reviewed` 追加，临时输入已清理；没有修改维护脚本或校验规则。
- `node scripts/maintain-public-release-notes.cjs check --version 1793544987`：`PUBLIC_NOTES=PASS RECORDS=33 NO_GIT_IMPORT=TRUE`，exit 0。
- 原目录 32 条历史条目保持原内容；本切片只新增本轮条目和当前内部发布记录。候选说明在运行制品版号到达本版前不会被旧版接口提前显示。
- 上述是本地说明校验，不是生产镜像构建、真实浏览器、服务器切换、Worker 恢复或业务验收证明。
- 上述说明编辑子任务没有执行 commit/push/merge、构建、SSH 或生产请求。以下为父任务随后实际执行的证据，二者执行归属分开记录。

## 父执行：实际构建、切流与版本一致性

- 实现 `0e6c0d55` 普通合并至 main `67bbcddf` 后固定构建，Linux 完整构建 132.16 秒，exit 0。运行 Web、独立 combined Worker、媒体子服务均来自同一固定镜像；后补指纹运维工具及验收文档不重建运行程序。
- 新 Web：`naumi47-web-main-20261101-r1`，容器 `0522609f2490dca013b4cd4b717df2b4feaa227439f4e4902779f73aab234bdf`，回环端口 `13127`。
- 新 Worker：`naumi47-worker-main-20261101-r1`，容器 `17f1d4cf4d042832aed6328fc570a581c3368413e3843e4fc7654869f4eb23bf`。`NAUMI_APP_ORIGIN` 精确指新 Web，Web 内部恢复指自身，内置重复扫描关闭。
- 完整 nginx closure CAS、候选及回退语法检查通过；4,830 项新旧静态资源 union 保留。两分钟公网采样 516 请求，0 错误，实测覆盖旧 `b79c8c39` 和新 `67bbcddf` 两个版本；这不是所有未来用户请求永不失败的保证。
- 备份 1,184,448,944 bytes，SHA-256 `70a13eb92c635f25e07e32d2091810252666a897fc7d718588341b8064968b3d`；`pg_restore --list` 可读性通过，未恢复生产数据库。

## 原 UNKNOWN 的精确处置与实例收敛

- 四条旧扫描观察按两个原版本的真实源码、原实例/boot、异常写入顺序、两轮更新的 HTTP/Agent/领域/数据库状态核对，证明协调 action 已 settled-with-error；没有以 unknown 本身推断付费未受理，也没有删记录或伪写原 tick completed。
- 两项窄审问题已修：本槽 `INTERNAL_APP_ORIGIN` 绑定、第二轮各内部观察时间必须真正更新。该模块 27 项测试通过。
- r1、r2 旧 Web 均退出 0、`restart=no`；r2 旧 Worker 自然退出 2、`restart=no`。退出 2 是原 UNKNOWN 保留语义，不写成健康退出 0；没有发送强杀。r1 旧 Worker 原已停止，未再拉起。
- 现役为一个完整 Web 加一个同镜像 Worker。当前观察新 Worker `paused=false`、`unresolvedTicks=0`，媒体 `draining=false`；11 月 2 日 00:40 已实测 153 个 completed tick。图片 pending/running 为 0、新 Web UNKNOWN 为 0、数据库超过 30 秒 idle-in-transaction 为 0、锁等待为 0。这些是带时点的状态，不替代长期容量验收。
- 历史根 `MIGRATED_CLEANUP_PENDING` 和历史操作对象保留；本轮使用独立 `reconciledMainReleases` 记录，不篡改历史报告。

## 数据保全：完整原行，而非只比任务数量

- 原图闭包 collector 真实超时保留；V1 整表 hash 在真实首表 15 秒超时也保留。V2 在同一个只读 RR 快照中采用 128 行原生 PK keyset 分页，先取窄 PK，再 hash 完整原行；未提高 60 秒总期限、15 秒单句期限或缩减字段/表范围。
- 20 张业务表，上线前 90,170 行／50.869 秒，切流前 90,170 行／46.579 秒；missing、changed、added、schemaChanged 均为 0。
- Worker 恢复后的收尾比较 41.420 秒，90,166 条原行相同；3 行变化、1 条预占删除、1 条 reconciliation 新增经过原身份逐字段复核。没有把合法业务进展掩写为全行未变。
- 指纹模块 28/28 通过，含独立真实 PG 的 1 GiB payload：整表 hash 达到 1 秒期限失败，分页在同样期限下通过。该合成验证不是生产容量证明；生产三次采集另列。

## 原遗留任务的真实结果

原父 `imagegen-32616b1c-e8a8-40e7-bdba-2f44073a4e4a`、子 `job-6e94c4e0-e4e9-4733-9bb7-d36d648811fc` 在新版 Worker 沿原身份恢复后，按已有失败逻辑结束为 error。客户预占 6 → 0，实际扣费 0，没有新增扣款 ledger；原供应商 call/taskId 和 pending/unknown 保留，没有重发生成。

因此只能称“遗留等待已失败收尾、6 积分预占释放”，不能称该任务成功出图、供应商取消、未受理或已退款。原 tick 与四条 scan 完整原行保持。

## 真正存储与后台页面验收

- 新槽同一 NAS 验收脚本实际通过：随机 48×64 PNG，9,381 bytes，原图/变体三份 local→NAS 补传；NAS 直接 GET、HTTP 原图、下载字节 SHA、Range 206 和匿名 401 通过。测试数据清理已核验，供应商调用 0。
- 旧槽同脚本 `DEFERRED_NAS_QUEUE_NOT_DELIVERED` 失败保留：当时 Worker 暂停，补传未推进，未覆盖旧失败报告。
- 公网浏览器真实会话共 14 个唯一检查点：版本、dashboard、公告、canvas 项目区及后台各主要侧栏。最终后台 30/30 缩略图实际解码；最终未见 pageerror/console error/HTTP ≥400。
- 首轮空 Next live region、Windows 报告文件 rename 争用、第二轮重复 locator、只读测试器误拦企业图片 descriptor POST 均保留原报告；修正测试器后定向复验，不修改产品或放宽真实错误判断。
- 第三轮精确放行一笔仅企业媒体 source 的只读 manifest 查询；不发送生成、上传或管理写操作。31 个浏览器 ERR_ABORTED 保留并分类为 RSC 预取/已被替换请求，不宣称网络没有中止。浏览器已关闭，本地临时 cookie 已删除。

## 恢复监督、空间和回退材料

- supervisor manifest、unit ExecStart、Web/Worker identity、当前运行指针及 journalDir 均绑定本轮新 pair；原 manifest/unit 保存。没有把监督器绑回旧 Worker。
- 新 pair 的实际 `Supervisor.once()` 已执行通过。父释放三锁后，11 月 2 日 00:47 实跑 systemd service，原文 `RECOVERY_SUPERVISOR=PASS WEB_OPEN=YES WORKER=IDLE`，`Result=success / ExecMainStatus=0`；timer 为 active/enabled。本轮未做 crash 注入，`workerCrashRecoveryVerified=false`，不继承旧 crash 演练结论。
- 仅删除 4 个无容器/回退引用且不属最近五轮的旧镜像及 3 个已核对内容的重复传输包，实际释放约 2.07 GB。未清 volume、业务媒体、数据库或近七天备份。观察剩余约 13.46 GB、占用 81%，保留真实数字。
- 生产回切材料为旧 upstream 加新旧静态 union 的完整 closure，以及精确原前像；没有实际回切当前在线版本。源码四制品的副本回滚与生产回切分别记录，不混称。
- 原预检 HOLD 报告保留，最终成功记录使用 `FINAL_ACCEPTANCE.json`、`LIVE_FINAL.json` 与四制品 `artifacts/VERIFICATION.txt`。
- 本地证据根：`E:/Workspace/naumi/output/release47-main-20261101-r1`；远端私有证据根：`/opt/naumi-staging/evidence/release47-main-20261101-r1`。私密 cookie、manifest 原像及完整 Docker 环境不进入 Git 或公开制品。

## 最终完成回执（2026-11-02 00:47 北京时间）

- 本轮发布记录已在持锁 CAS 后记为 **COMPLETE**，canonical revision `1375`；历史根 phase 保持原值。原 Web/Worker 运行指针已经更新到新 pair，旧创建/验收记录未覆盖。
- 最终实测 completed tick **179**，原回执有 HTTP 200 及 serverReceiptSha256；图片 pending/running、新实例 UNKNOWN、新 Worker unknown tick、长事务、锁等待均为 **0**。
- 三锁释放后独立重新取得并释放，`locksFree=3 / released=true`。服务日志、manifest hash、新 pair 身份和公共入口 hash 均在 `FINAL_ACCEPTANCE.json`。
- 公开浏览器验收为只读页面和图片链路，未执行本轮新的付费生成或后台 CRUD 写测试；NAS 验收是新槽的真实存取与清理。两种证据各按实际内容记录。
- 源码副本封存随后由父独立执行，结果及精确命令登记 `artifacts/VERIFICATION.txt`，不把编写此文档本身算作回滚验证。
