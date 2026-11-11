# 模型与供应商工作区：103 发布与配置对齐

日期：2026-11-11。

## 模块与职责

将已合 main 的模型／供应商工作区及 UI 精修发布到 103，并根据用户后续明确要求，让该站模型配置对齐 47 当时已发布的 v153。47 仅只读提取模型配置，未发布、改配置、重启或写入业务数据库。

## 公共接口、依赖方向、数据与事务归属

- 模型、供应商、定价、运行四区复用既有管理接口与权限；模型草稿、校验、CAS 发布、历史版本和 Router 激活仍归原 model-config 模块。
- 应用发布复用原 HostTransaction、双部署锁、生命周期锁、原子 revision CAS、Web/Worker 控制与完整 Nginx closure。仅一个新版 Web 和一个同镜像 Worker。
- 配置对齐通过原生 `/api/admin/bi/model-config` 的 draft/validate/publish 链路完成，不直接改 active_version、供应商凭据或账务表。
- 两站密钥和数据库保持独立；匹配 provider ID、base URL、协议后，九个供应商的 credentialRef 全部绑定回 103 自己的原凭据。未复制密钥、用户、积分、账本、任务或媒体。

## 实际部署

| 项目 | 结果 |
| --- | --- |
| 部署源 | main `d00eac996ecf5a204f047ef929d17d625c3ac61d` |
| Build | `1794375310` / v2026.11.11-133510 |
| 运行 OCI Image ID | `sha256:c80c2dc8a3771fc4f80df12ed64e3cab90c3f404f2ff621ba8bc31c2134df30c` |
| 发布记录 | `release103-refactor-model-supplier-20261111-r2` |
| 生命周期 | COMPLETE；配置对齐后 revision592 |
| Worker | 同版同镜像、未暂停、unresolvedTicks=0、真实 completed tick |
| 原 Web / Worker | 已排空停止，restart=no |
| 公网入口 | `/admin/model-management`；模型／供应商／定价／运行均真实读取本站数据 |

构建后远端 main 增加 `cab726c8`、`ca751d59`：已审阅完整差异，只有文档清理、一个注释和一条错误说明文字变更，不含路由、计费、状态或执行语义变更。保留已经固定的 UI 镜像源，不把后续文档 SHA 冒充实际部署源。

## 配置对齐

- 47 来源 v153；103 v117 → **v118**，publication phase=applied。
- 9 个供应商、95 个上游定义、50 个前端模型定义（含隐藏／停用／比例分支）；新工作区聚合为26行。
- 启用供给为 APIB Images、APIB Video、APIB 文本；其他禁用状态与47来源一致。
- 模型、参数映射、通道策略、绑定和顺序与47来源一致，只有 credentialRef 保持103本站绑定。
- 计费 **v8 原样保持**，未应用此前讨论中的新积分方案。原v117仍能通过历史版本接口精确读回，不修改既有任务冻结报价／供应商。
- 生图目录12条、文字目录1条、视频目录21条，原生 HTTP 均200；它们与聚合后台行数不是同一统计口径。

## 验证、失败保留与恢复

- 固定 Linux Next/Worker 镜像构建 exit0；原生普通账户密码登录200，用户亲自登录的公网页面管理会话200。候选只读代理使用短时部署管理会话，未冒称后台密码登录。
- 四区切换、模型列表、生效价格表、真实后台接口、公网版本及新页面回读通过。模型配置对齐后，UI显示v118／计费v8／26行／9供应商，三个启用来源均configured=true，页面无错误提示。
- 保持原浏览器文档跨切换、不强制刷新。每2秒版本探测 **1012次，全部200，错误0**；原页面22份JS/CSS重新读取200且原字节SHA保持。
- r1因归档config摘要与该主机Docker实际可引用OCI身份不同，在创建候选前ABORTED；备份及导入回执保留，未切流。r2核实实际镜像字节并作为合法后继，只创建一次候选、切流一次。
- r2原控制器遗漏了预切流任务快照变量，在切流后的任务保全阶段报错。保留原exit1和CLEANUP_PENDING；先按同一发布记录恢复已确认排空的Worker，真实tick通过，再用**原预候选可读pg_dump**在隔离无网络PostgreSQL副本重建基线。首个tmpfs副本OOM，仅隔离副本受影响；改用独立磁盘bind副本，完整任务／账本比较通过，无违规、无未知表。
- 原现场没有的live快照未被补写冒充；比较明确记录备份来源、实际副本身份和逻辑源身份归一化。未恢复生产数据库。隔离副本容器已移除。
- 持锁继续原事务完成任务保全、启动恢复标记及restart策略，不重新创建候选、切流或重放任务。遗漏变量已在本任务控制器副本补齐，原执行字节和错误日志均保留；产品代码未因此修改。
- 静态closure副本回退、原字节恢复、后续修改拒绝且零写入、隔离nginx语法检查通过。COMPLETE后的runtime rollback-check只读核验真实身份、原备份和网关后像，不是线上实际回切，也不证明更新配置后的旧程序全业务兼容。
- 两部署锁和生命周期锁最终均FREE，所有发布operation ACKNOWLEDGED。

## 验证命令与证据层

证据根：`E:/Workspace/naumi-task-evidence/model-supplier-release103-20261111`。

- `python -X utf8 .../build-fixed.py` → `FIXED_LINUX_BUILD=PASS SOURCE=d00eac996ecf5a204f047ef929d17d625c3ac61d EXIT=0`。
- `python -X utf8 .../r2/test-controller.py` → `CONTROLLER_TEST=PASS CHECKS=14 BASELINE_EXIT=1 COPY_ROLLBACK=PASS`。
- `python -X utf8 .../r2/finish-original-release.py` → `PHASE=COMPLETE`；revision591；Worker未暂停、未知tick0、任务保全通过。
- `python -X utf8 .../publish47-config103.py` → publication applied / targetAfterVersion118 / billingUnchanged=true / credentialsCopied=false。
- `python -X utf8 .../r2/verify-final.py` → revision592 / COMPLETE / 三锁FREE / operationsAcknowledged=true。

精确BASELINE／MODIFIED／ROLLBACK命令、输入、literal输出、退出状态和四制品路径见证据根 `artifacts/VERIFICATION.txt`。本轮供应商收费生成调用0；目录只读发现不是生图质量／付费端到端验收。

## 未完成项与下一步

用户可直接在103后台验收视觉与实际数据。新的积分售价仍待用户定稿和独立发布；本次保持103原价。真实供应商付费生成质量不因后台和配置发布通过自动完成。配置若需回退，走原版本restore发布，expectedVersion绑定当前版本；不回灌业务数据库、不删除历史模型版本、不重放已受理任务。
