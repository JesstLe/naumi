# R6K：固定依赖与实际运行兼容

基线 `ec0f37c9392a437c9e058e79ea746a044ccd143b`，4541原文件hash与归档位于 `output/refactor-r6k-20261027/`。独立工作区依赖目录为本地普通目录，未改其他工作树依赖或发布现场。

## 实施

- 根据实际registry/audit，固定Next15.5.28、MCP SDK1.32.0、Nodemailer10.1.4、Sharp0.35.5、Zod4.6.6；eslint-config-next同步15.5.28，PostCSS8.5.23。
- Next仍精确要求旧PostCSS8.4.31，使用单个明确override引用本项目同一PostCSS8.x版本；不升级Next大版本，不执行auditfix --force。
- 在独立候选目录用原lock解析，定向刷新兼容范围内的body-parser/proxy-addr/fast-uri/hono/ip-address/nanoid/source-map-js。53个lock节点改变，其中包含Sharp跨平台原生包。
- 独立原依赖目录由原package/lock安装，旧新均运行同一份实际imagegen postprocess、mailer和MCP stdio宿主；语义及协议对照，外部供应商/真实邮件0。
- Next15.5.28仍未await body.finalize，已有CJS/ESM补丁核对相同调用点后扩大明确支持版本；不移除原多图请求体修复。

## 必要兼容调整

Sharp0.35改为明确ESM default构造器类型，18个原动态加载点只改类型声明，运行表达式保持。Node24新类型需要TS5.9及@types/node24，同实际Node24运行时对齐；由此显式区分SharedArrayBuffer与DOM ArrayBuffer。浏览器hash、Agent素材和ZIP使用一个零拷贝webBytes边界（仅共享底层才复制），缓存chunk数组及chroma变量仅补精确类型；测试fixture的File/Blob/Request输入改为显式字节视图，没有用any/关闭检查。

第一次类型检查保留原Sharp namespace/默认导出错误，第二次保留TypedArray/DOM差异，后续按真实字段修正。既有Next专项harness不再硬写15.5.27，改记录实际安装版本。全量开发依赖audit原还5项，定向兼容刷新后当前完整lock审计total0；不把这一点当作所有可达安全风险关闭。

## 集中验收

被测应用提交 `7f3116e443c322aa5e71ce863940d1d1224f3e52`；core 与完整 Linux 镜像绑定同一实际文件摘要 `24d56bbfccf47f845cbfe7ddc2bb26238a9fbd8978c5fea01fa3b2f8c10d7917`。随后只更新本记录、工作区说明及迁移台账三个文档，不借文档提交冒充应用重新构建。

| 层次 | 实际结果 | 证据 |
|---|---|---|
| 原源码＋原依赖 | 31 检查通过，Sharp0.34.5/SMTP9.0.3/MCP1.30.0/Next15.5.27/Zod4.6.5 | `dependency-original-source/RESULT.json` |
| 新源码＋新依赖 | 36 检查通过；实际产品后处理、mailer 与旧 MCP stdio 宿主的业务观察与原版相同 | `dependency-ready/RESULT.json` |
| 结构 | 1526 原 src 文件字节不变；20 个纯类型修改经 TS 擦除后输出相同；仅三个原生产文件接入明确字节边界，新增一个纯 helper | `STRUCTURE.json` |
| 固定 core | 31/31、failed0、notRun0；真实隔离 PG，原价、回执、UNKNOWN 不重放等沿原验收链 | `core-fixed-sha/REPORT.json` |
| 完整镜像 | 原生产 Dockerfile 构建，Web/Worker 同 Image ID，Worker hash 精确，原生媒体依赖打包 | `image-fixed-sha/BUILD_RESULT.json` |
| 同镜像运行 | 125 检查通过：登录、HTTP 提交、Worker 执行、原价6/current17、父子回执/单次扣款、图片文字 CAS、工作台、原生 FFmpeg、SIGTERM 排空 | `runtime-fixed-image/RESULT.json` |
| 完整产品浏览器 | 9 组通过；两个真实登录 context、无路由 mock；实际持续302.1865198秒/25轮读取，2次交付、2笔扣款合计12积分，确认弹窗0、页面异常0 | `browser-fixed-image/BROWSER_RESULT.json` |
| 类型/规范 | 全项目 tsc exit0；24 个改动 src 文件 ESLint exit0，均无字面输出 | `FIXED_TYPE_RUNS.json` |
| 已知依赖审计 | 原生产13（critical2/high8/moderate3）→最终生产0/全部0；audit exit1→0 | `AUDIT_PROD_BASELINE.json`、`AUDIT_PROD_FIXED.json`、`AUDIT_ALL_FIXED.json` |

实际固定镜像 `sha256:f20bdbe86a2f1513d72cf889b9f9c22f40965ba8ab71edd629e09045ca4ec90f`；浏览器与运行套件均记录同一 Image ID、应用源码未变及 `DEPLOY=0`。旧 MCP 宿主不是当前生产 Agent 路径：桥接器仍显式 `BACKEND_DISABLED`，此次兼容测试不把已停用的 shell callback 加回镜像。

## 保留失败与边界

- 原依赖测试首次使用32像素下采样，违反原产品最小64规则；修正 fixture 后再用完整原源码/依赖通过31项，原失败日志保留。
- Sharp ESM、TypedArray/DOM 和测试二进制 body 类型错误已显式修正，最终 tsc0；不采用 any、忽略错误或关闭检查。
- 原完整浏览器缓存专项先后缺隔离环境、MEDIA_DIR、正确 sidecar 路径及运行中的13086 Next，准备失败日志全部保留。未启动/接管该端口，**不称该旧专项通过**。本轮私有媒体真实 PG、产品浏览器及类型验证分别有独立结果，不能互相冒充。
- 65488 已有占用者未操作；失败启动的本任务容器经标签核验后删除，后续自有 PG 改 Docker 分配的63327。
- 本轮没有真实外部供应商、外部邮件、远端部署、生产容量或远端 required CI 验收。302秒两浏览器 fixture 不外推为10万活跃容量。

## 交付与后续

- 原4541文件 hash、原源码与原 lock 安装目录保留；四产物、完整命令/输入/literal/exit、独立副本文件及原依赖行为回滚、本轮夹具清理与远端分支核对统一封存在 `output/refactor-r6k-20261027/DELIVERY.json`、`VERIFICATION.txt`。
- npm 写入的两个 JSON 为 CRLF，已测 core/镜像摘要包含该字节；归档保留原字节，diff 对这两项使用 raw-byte patch，实际复放后逐文件 hash 必须精确相同，不在封版阶段 normalize 后冒用原测结果。
- 整体目标保持 active；本轮为上次 main 普通同步后的第2模块。下一模块完成后刷新并普通整合 main、重新核验受影响链路；完整重构最终整合、性能容量和发布仍分开执行。
- 此目录仍是独立完整重构工作树，本模块不合回 main、不发布、不操作发布锁。
