# G72：真实图片预览与本机文件缓存

## 本轮交付

原入口保持 `http://127.0.0.1:18482/preview.html?v=4`；进入「素材与交付 → Naumi 创作记录 → 图片与提示词」。首批25条真实作品均已取得真实预览图，可点击大图、按人员筛选、分页、刷新，在390px手机页面内查看。原亮色外壳、30个addon和来源日志/提示词/积分口径保留。

本轮为本机模块交付：没有发布47、启动企业独立服务或配置员工SSO。47仅接受一次性限额只读查询和对象GET，原Web/Worker不承载本次采集与解码。

| 项目 | 真实观察 |
|---|---|
| 作品授权时间 | 2026-10-23 17:17:19 +08:00 |
| 请求／精确授权／成功读取 | 25／25／25 |
| 来源对象 | 25个已登记、精确owner的preview变体，不是原始全尺寸文件 |
| 来源下载字节 | 1,682,352 |
| 本机WebP缓存 | 25项，1,321,602字节 |
| 来源解码／源业务写入 | 0／0 |
| 47可用内存，前／后 | 3319／3374 MiB，瞬时观察，不是容量验收 |
| 47Web | 同一容器、StartedAt及RestartCount前后一致，前后health200、db.ok=true |
| 原日志集合 | 仍为G71的1000图片记录、1000生成任务、1000积分流水；不是全量实时同步 |

页面明确显示「图片已缓存 25/1000」。第2页未采集图片仍显示无可预览图片，不用示例图替代。记录快照时间仍是G71的16:43:28，媒体本轮单独复验；页面刷新读取本机快照，不向47重新采集。

## 最小实现与数据流

1. `scripts/lib/enterprise-records-snapshot.mjs`：新增`inspectMedia`；共享`readSourceSnapshot`的RR READ ONLY、企业有效期、成员/账号有效性及最近30天时间窗。复用原`scopes + artworks`，精确配对JOIN `(id,email)`，不是两个独立ANY，不从分页结果推授权。排除已删除、明确personal及其他企业产物。
2. 作品通过后仅解析受管`/media/<key>`或运行配置明确登记的HTTPS publicBase；直查`app_media_assets`。原资产和每个preview/thumbnail分别要求精确key、owner、driver；每个实际GET对象还必须remote_ready。原图尚未远端镜像时，可以从同owner原图元数据展开独立就绪的预览图，但不会下载未就绪原图或回退本机媒体。不调用带ensure的生产包装，不以public标志绕过账号归属。
3. `scripts/collect-enterprise-media47.py`：显式操作员CLI，从本机当前enabled完整source tuple选择首批作品；只inspect当前Web元数据以定位固定镜像、DB网络与必要env。独立128MiB、0.25CPU、32pids、只读rootfs、cap-drop=ALL、no-new-privileges临时容器，无业务挂载、无端口、无Worker。只传DB和存储所需env名，不输出秘密值；90秒超时只清本次唯一容器。
4. `scripts/lib/enterprise-media-read.mjs`：GET-only AWS签名；固定存储endpoint，禁重定向，串行下载，单请求10秒、对象2MiB、总下载32MiB、整批65秒；按登记bytes与SHA校验，返回原样字节。优先preview以保证大图体验，缺失时才回退已授权thumbnail或原对象；不在源主机运行sharp。
5. `scripts/cache-enterprise-media.mjs`：仅Windows本机解码，sharp单并发、关闭cache、最多16,777,216输入像素；拒绝动画，保留比例、最长1600px、不放大、WebP≤1MiB。私有目录按输出SHA256命名；快照保存`file:sha256`，不把base64或源URL塞入页面。
6. `LocalSourceSnapshot`：兼容base64和磁盘引用，两者严格互斥，最多1000媒体项；每项对应同账号同id的artwork。每次请求再查enabled及完整source tuple；GET检查非符号链接、realpath边界、大小、SHA与WebP签名。context/members/records只返回计数和受保护本机href，不透出磁盘路径、文件名、base64或存储URL。
7. 原`source-ui.js`增加缓存小计；已有会话、同源媒体GET、Blob、点击overlay、取消/epoch与URL回收逻辑继续使用。构建原`preview.html`，没有另造入口或/admin页面。

## 授权和归属口径

首批记录仍是`legacy-unconfirmed`。当前成员范围和真实人员映射仅提供可见性，不证明历史公司业务归属，不自动写任务归属，不进入正式绩效。G70的58人／56稳定来源账号保持；花名不是持久主键。

本机快照是操作员采集的读取模型，不是实时来源撤权服务。每次访问会检查本机enabled/source tuple；来源侧后续撤权与删除需下一次采集/有效期机制处理，正式员工上线前还需要实时权限接入。当前本机项目管理员会话不冒充Naumi原生登录。

原库状态与G71逐项精确比对一致：58 profiles、56 bindings、676 links、677 members、364 rows、292 assets、audit5、commands5；workflow accounts/teams/identities/orders均0。没有创建伪账号或业务任务来绕过正式权限。

## 集中验收

- 精确授权离线19组：输入、managed URL、配对参数、metadata ACL、RR只读、错误脱敏和事务回滚。
- 真实隔离PostgreSQL23项：原records归属/账务回归，精确媒体pairs、错账号、personal/foreign、变体owner、deleted、原图未就绪而预览就绪及撤权。
- 字节/本机解码35项：GET-only、禁重定向、对象大小、真实超限流、时限、源SHA、WebP文件缓存、外来pair拒绝。
- 原产品HTTP59项：会话、跨域/跨企业、磁盘hash/大小/缺失、非法WebP、未知人员、source tuple、1000上限、base64兼容、撤权、不泄漏磁盘信息。Windows当前不允许创建文件symlink，该子测试明确skip；目录junction拒绝真测通过。
- 前端104项VM/合同；真实浏览器12项：原18482、25真实图片、点击大图、分页、筛选、刷新、390px、外部请求0、pageerror0、localStorage不变。
- TypeScript、原Demo构建与release-check通过。协作浏览器两次返回原错误`Preview automation snapshot timed out after 15000ms.`；按仓库既有fallback使用独立无头Playwright，不接日常Chrome/CDP。
- 基线文件引用不支持但base64可用；修改版支持两者；对独立完整模块副本按本轮文件清单真实回滚后，恢复原SHA及旧行为。工作区和18482保留修改版，不回灌数据库、不删除真实数据。
- 独立静态审查发现1个P2：原图未remote_ready时错误地连带排除已就绪预览图。已拆分原图引用授权与候选GET就绪，补离线、真实PG及下载器回归；未放宽跨账号/driver或未就绪对象下载条件。

## 运行与回滚

显式采集与本机转换（输入/输出均私有；不会自动执行）：

```powershell
$R = 'E:/Workspace/naumi-enterprise-workflow-20261016'
$E = 'E:/Workspace/naumi/output/enterprise-source-media-g72-20261023'
$S = 'E:/Workspace/naumi/output/enterprise-source-records-g71-20261023/live-final/SOURCE_SNAPSHOT.private.json'
Set-Location $R
$env:PYTHONUTF8 = '1'
python scripts/collect-enterprise-media47.py --output "$E/live" --snapshot $S --count 25
node scripts/cache-enterprise-media.mjs $S "$E/live/SOURCE_MEDIA.private.json" "$E/cache" "$E/SOURCE_SNAPSHOT.private.json"
```

本机配置`data/enterprise-sheet-workspace/connection.json`只切换`sourceSnapshotFile`，旧配置完整保留私有证据。恢复旧快照时恢复该字段并仅重启本机数据API，原数据库不变。47没有新增持久配置或服务需要回退。

私有证据：`E:/Workspace/naumi/output/enterprise-source-media-g72-20261023/`。四项`MODIFIED_FILE.ts`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行`ROLLBACK.sh`和原哈希、真实媒体、Web前后运行回执、业务状态对比、浏览器截图留存；私有账号、提示词和图片不提交Git。

## 后续优先级

1. 从真实来源记录显式关联需求/任务/交付，保留来源scope证据与人工业务认定；不按花名或时间相近猜关联。
2. 在资源限额和断点基础上补剩余预览图、增量同步和来源撤权机制；当前首批25不代表1000全部有图。
3. 正式员工登录、独立验收和有效绩效指标另做真实闭环；47企业服务激活仍遵守历史事件先解决及4核8GiB目标机容量门禁。

Git：本轮基线e4f81562；开工刷新后普通合并origin/main形成d5c1e7de，收尾再次fetch无新增待合main；没有切换或覆盖共享根工作区。G72为一个功能模块，开工同步后累计1；本机交付不计服务器成功发布次数。
