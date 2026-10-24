# 核心链路重构专用工作区

建立日期：2026-10-24。

## 工作区与基线

- 目录：`E:/Workspace/naumi-refactor-20261024`
- 分支：`codex/core-refactor-20261024`
- 起点：刷新后的 `origin/main`，固定提交 `905c8c635e41ff3f4443d43db9776d1db3aab469`。
- 原工作区 `codex/imagegen-simplify-release47-20261023` 保留，原提交 `e1ee8442443f4593c3220d4d7c9ae6729f0cb6dd` 不变。
- 本目录是同一仓库的独立 Git worktree，拥有独立工作文件、index 和任务分支；共享 Git 对象库。

## 重构方向

1. 参数与模型选择集中处理一次，执行既定方案，减少各层重复判断。
2. 画布、Agent、参考工作台复用生成任务执行与原结果续交，不增加平行执行框架。
3. 报价冻结、真实余额、幂等结算与交付状态保持明确的唯一职责。
4. 按完整模块替换并删除被替代的旧路径，复用已有 benchmark，集中验收。

保留现有界面、账号、数据库、媒体、素材归属和历史任务；不因重构新增用户侧审批或业务限额。新增需求按实际运营情况确认。

## 当前完成与未完成

- 已建立独立工作树和重构说明。
- 已完成固定源码目录/静态依赖盘点及核心调用链审视；主方案见 [REFACTOR_ARCHITECTURE.md](REFACTOR_ARCHITECTURE.md)，实际证据和阶段迁移台账在 `docs/architecture/`。
- 选择模块化单体、单一准备/执行/交付用例、按数据所有者拆分；不先拆微服务或全站重写。首个建议实施闭环为消除 imagegen 对 HTTP route 的反向调用。
- `9fc284514aeaed740cdf55cc49b611445676b517`（包含质量回退 `0fbdd5a8`）已在用户要求开始实施后普通合入，R1基线为 `4478cdca88a6e52b5db186d30ace4ef8724263c7`；不重复开发该修复。
- 2026-10-24已实施R1A1生图与R1A2抠图/同步账务/任务读取切片，生产业务对HTTP route的两条反向调用均已移除；49项真实PG对照保留原价与原回执，并修复并发创作记录503。见 [R1A1](changes/2026-10-24-image-generation-boundary-r1a.md)、[R1A2](changes/2026-10-24-cutout-billing-boundary-r1a2.md)。R1B核心图片准备与报价也已实施，见 [R1B记录](changes/2026-10-24-image-preparation-r1b.md)；R2已统一交付/恢复，见 [R2记录](changes/2026-10-24-image-delivery-r2.md)；R3A图片任务controller已迁移，见 [R3A记录](changes/2026-10-24-canvas-image-task-r3a.md)；R3B/R3C、R4—R6及最终整体验收仍未完成。
- 未复制 `.env`、业务凭据/数据库/媒体。验收使用现有node_modules的只读依赖引用、本任务loopback PG和PNG供应商fixture；不启动产品Web，不构建或调用外部供应商。
- 质量回退已通过 `9fc2845` 保留；其他同事新提交后续按固定SHA逐项核对整合，不自动覆盖未提交工作。
- 47 暂缓发布约定保持；本工作区建立不触发配置发布或服务器更新。

## 开发约定

2026-10-24 R4A4：作品查询/写入/后台、Canvas布局/文字/项目/混合删除归属已迁入真实owner；BI上下文、SDK/stream观测、HTTP包装和managed-client身份分离，主迁移144文件358绑定。db4793→3769行、静态消费者130→87，旧67文件动态大环拆开，全项目最大动态环20；旧19静态模型环拆开，残留transport/client3环。原/新观测21/141、真实PG108→176、Canvas20/14/32、私有媒体、BI、钱包、creation、交付27、溯源、tsc与lint通过。见 [R4A4](changes/2026-10-24-artwork-observation-owners-r4a4.md)。本轮第3模块，收尾普通整合main后计数归零，整合与推送SHA见本轮DELIVERY；整体继续，不合main、不部署。

2026-10-24 R4A3：账户访问事实、SessionUser/注册、钱包余额、支付历史和历史provider记录已迁入五个owner；实际71文件126绑定迁移，计费runtime直连真实owner。db5321→4793行，静态消费者144→130且db退出静态环；报价/执行环24→19，视频20仍在，动态最大66→67（session随原runtime链进入）未掩盖。函数对照各28/88、完整源码PG88→146、195实际登录handler及wallet/entitlements/creation/platform29/tsc/lint通过。见 [R4A3](changes/2026-10-24-account-owners-r4a3.md)。同步后第2模块；继续完整候选及R4B组装/DDL，不合main、不部署。

2026-10-24 R4A2：schema兼容初始化、settings raw repository和signup账务策略已有真实owner，43调用文件/102绑定切换；旧门面同函数兼容。db5928→5321行，静态消费者178→144、最大静态SCC56→24，动态最大环70→66仍未关闭。原29/89→新29/90、真实PG6类61→78、35表380列及既有入口通过；原schema第二连接自等待已复现并改同事务。见 [R4A2](changes/2026-10-24-persistence-owners-r4a2.md)。同步后第1模块；继续身份/钱包/资产owner及R4B运行DDL，不合main、不部署。

2026-10-24 R4A1：纯 `src/platform/db/pool`/`transaction` 已接真实消费者，旧入口同实例/函数兼容；79处纯基础import及3混合字段迁出。旧db静态消费者251→178，最大SCC60→56，基础层业务import/环为0，535个非目标函数正文未变。基线27/157→新版28/166、真实PG25→29、wallet/creation A/B及画布PG32/32通过，tsc/lint通过。见 [R4A1](changes/2026-10-24-platform-db-r4a1.md)。本轮第3模块，收尾普通整合main并归零，精确结果见本轮SYNC；R4A2数据owner与DDL/组装环继续，不合main、不部署。

2026-10-24 R3E：图片/空白节点共用创作栏与参数控件，文字创作栏独立持有菜单/尺寸呈现状态。Canvas **8534行**；174个保留执行函数正文不变，58组SSR对照一致，真实控件15项及文字6/图片5/历史12通过，最终tsc通过。见 [R3E](changes/2026-10-24-canvas-composers-r3e.md)。同步后第2模块；下一模块R4A基础DB/事务，R3外围UI、跨请求CAS与R4B—R6继续，不合main/不部署。

2026-10-24 R3D：普通文字/反推/帮写共用 retained text task，已知答案续存不再生成，unknown 保留原 operation/报价；初次请求复用原 BillingProvider 持久 intent。Canvas **9342 行**；基线 3/15、新版 18/77、真实 PG24、实际 Next6 及最终 tsc 通过。见 [R3D](changes/2026-10-24-canvas-text-tasks-r3d.md)。本轮为同步后第1模块；原无 node-slot intent 升级、多 tab/CAS、UI 组合及 R4—R6 仍在后续。不合 main、不部署，整体目标 active。

2026-10-24 R3C3：节点复制/历史添加/删除/项目删除及批运行 owner 已接入。Canvas **9575行**；旧4/9→新19/59，真实PG24→32，真实控件11及相邻12＋12＋5＋5通过。单图/混合复制共用原复制事务，已知结果不再重复创建，删除保留原operation，批运行沿用原任务。见 [R3C3](changes/2026-10-24-canvas-node-operations-r3c3.md)。本轮第3模块，main刷新与普通整合后计数归零；整体继续R3后续及R4—R6，不合main/不部署。

2026-10-24 R3C2 增量：选择快照、单/多/组拖动和连线命令已迁移；原子 history/回执队列覆盖新交互及既有整理/属性/undo，三处 parent 语义统一。Canvas **9800行**，基线10/28→新版34/92，真实PG26→28、相邻PG20，真实控件12＋12＋5＋5通过；详见 [R3C2记录](changes/2026-10-24-canvas-interactions-r3c2.md)。同步后第2模块，继续节点操作和R4—R6；未合main、未部署，整体目标active。

2026-10-24 R3C1 增量：typed scene projection、独立节点renderer、稳定命令代理与完整值reconciliation已接入；Canvas **10300行**，30场景98检查、32组SSR HTML对照、真实Next 6＋12＋5＋5通过。见 [R3C1记录](changes/2026-10-24-canvas-scene-r3c1.md)。本轮为同步后第1模块，继续R3C2选择/连线/拖动命令及R4—R6；未合main或发布。

2026-10-24 R3B4 增量：详情与同步编辑任务 owner 已迁移，普通生图/详情/编辑共享结果落地；未知提交保留原 operation/报价、已知任务只查询、已知结果只续接。Canvas 11576 行，74 场景 369 检查、真实 PG 21、Next 新控件 5/相邻生图 5 通过，见 [R3B4记录](changes/2026-10-24-canvas-task-boundaries-r3b4.md)。本轮是同步后第3模块；完成后刷新/普通整合 main 并归零，不合入 main、不发布。整体重构继续 R3C。

2026-10-24 R3B3 增量：作品文档 owner 已迁移，读取错误/局部补取/迟到合并/回收站统一，Canvas 11747行；26场景49检查、真实PG14、真实Next8及浏览器缓存20检查通过，见 [R3B3记录](changes/2026-10-24-canvas-artwork-document-r3b3.md)。本轮是main同步后第2模块，未合main或部署；继续详情/编辑任务与整体重构。

2026-10-24 R3B2 增量：文字文档、草稿缓存与恢复、保存队列归独立 owner；历史写入排队并保留后来字段修改，真实Next控件12项和PG16检查通过，见 [R3B2记录](changes/2026-10-24-canvas-text-document-r3b2.md)。Canvas主组件11872行。整体重构继续，后续文档写入CAS、作品/编辑任务与R3C—R6仍在台账；本轮为main同步后第1模块。

2026-10-24 R3B1 增量：原子历史/文档编辑已实施，Canvas 减至11936行；22类动作共享编译、持久化和回执重试，详见 [R3B1记录](changes/2026-10-24-canvas-history-r3b1.md)。真实本地 Next Canvas fixture 已运行并停止，PG 随机 schema 及本轮自有容器已清理；没有启动生产 Web 或接管部署。下一轮继续 R3B2，不将模块完成标成整体重构结束。

- 后续重构命令显式以本目录为 cwd，只提交本任务文件。
- 每个完整模块更新实现记录，再集中测试；合并前刷新远端 main。
- Git 分支推送不代表应用部署；部署另走现有蓝绿和实例收敛流程。
- 建立证据：`output/refactor-workspace-setup-20261024/VERIFICATION.txt`。

R3B4 三模块同步已执行：`git fetch origin main` 与 `git merge --no-edit origin/main` 均 exit 0，origin/main=`905c8c635e41ff3f4443d43db9776d1db3aab469`，普通 merge 返回 `Already up to date.`；累计计数归零。本轮没有把候选合入 main。
