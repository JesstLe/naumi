# 企业协作集成状态

## 当前固定点

- 实现与父修复：`21e7f1b6c45be390ee5229e69cea4f41d99cd867`。
- 2026-11-02 刷新 origin/main=`8a893c00`，包含同事 admin usage 与公开说明等8个新提交；普通合入本任务分支后 `648de382f7efaa966afa5f96438c36dda20a9ff3`，无冲突、tracked clean。未切换或覆盖main工作树。
- 三功能模块已合当前任务分支，全部已确认独立复核问题完成父修复；实际完整Canvas双账号浏览器联调仍在原任务进行，未新开替代任务。
- 主实现记录：[企业协作](2026-11-02-enterprise-collaboration.md)。共享4项修复四产物固定于21e7f1b6，后续独立状态文档不改变该封包证据。

## 本轮已验证

1. 共享独立复核原4反例及补充健康对照：12组，真实企业schema/原生密码登录/实际handler与native存储。修复版12组按修复预期通过，基线/回滚12组按原缺陷预期复现。
2. 原共享native 23组回归通过；完整项目tsc通过。上述执行点在同步最新main前，最终UI回交后还需一次集中构建检查。
3. 后改hashguard全量预检exit73、零写入；copy rollback恢复3文件、移除4新增文件，source保持修复版；四产物重开。
4. 所有本轮自有PG均按完整ID和label停止移除（含volume），无生产连接/部署/供应商调用。

## 剩余交付

- 原版Canvas、Desktop的真实组件＋真实后端双账号浏览器端测；全量跨页未读闭环由原E2E任务处理。
- 将E2E修复固定提交与本次最新main串行整合；只提交本任务差异，保留同事改动。
- 固定main候选、构建、目标站发布/版本/功能/旧槽资源/回滚材料验收。
- 当前没有把本任务源码整合写成main已合或线上已完成。47既有发布决定不由本功能开发自动改变。

## 最终浏览器回交与发布准备

- E2E交接 `bd5b67a88fb4dc79f61bb9b24be946559ac07c36` 已普通合入任务分支；完整CanvasClient/ReactFlow＋真实口令登录＋真实双方服务/PG/private storage的16组浏览器通过（框架导航/图片为测试适配，非Next生产SSR）。全量未读和末页会话定向GET、作品深链、未存占位选择、同账号文字生成切项目保存已补齐。全文档见对应E2E模块记录。
- 448个E2E证据文件共197638790字节已逐SHA归档到 `E:/Workspace/naumi-task-evidence/enterprise-collaboration-20261102/e2e/`；四产物重开。原现场保留。本机C盘13.3GiB可用且占用超过80%，新增大包/构建与验收证据转E盘（106.7GiB可用），不清共享Docker缓存、运行容器或他人依赖。
- 合入E2E及当前main后全项目tsc再跑一次，stdout/stderr空、exit0。
- 103只读现场确认当前实际版本 `0fcbbc8084b1c483cb66be541643142e90283da7` / build1793587166，Web/Worker来自独立 `codex/model-mapping-103-20261029`，canonical activeSiteControlReleaseId对应COMPLETE，revision339，双部署锁当前无持有。
- 当前103包含未合main的后台并行生成/像素Dock修复，且该验证线AGENTS明确禁止反合main。不得用较旧主线制品覆盖掉在线增量；企业协作先合main，若发布103则仅main→103隔离线单向整合，遵循原103固定分支蓝绿特例。隔离线不推广47，不删除其worktree。
- 新公开候选说明绑定BUILD_VERSION=1793594332，仅含同事聊天/文件/经批准独立画布/跨路由草稿与上传体验，无内部信息；本节不是已上线声明。线上认证、任务/账务、模型配置和蓝绿验收仍须刷新实测。

## 2026-11-02 main已推、固定生产镜像已上传（未切流）

- main普通合并后推送固定 `80ec8e5c14050942dd4501c7bdaf0f77c7633619`。首次push因同事刚推47验收文档而被拒，刷新并普通合入 `7ec5844d` 后正常push；没有强推或覆盖对方文档。
- 103验证线工作树clean后，只做 `main → codex/model-mapping-103-20261029` 普通merge，得到并推送 `9d687bf07c244050c0b5423e36282225ac717654`。main没有接收隔离增量；当前103后台生成及像素Dock逻辑保持，其5项提交组件和6项像素接线检查通过。
- 固定Linux生产build127.96秒exit0；SOURCE=9d687bf0、BUILD_VERSION=1793594332。Docker Desktop OCI index `sha256:17c32177250aafb1a3139127953c4a8a1f937d083d1e69c64a208077364993bb`，运行config `sha256:5889829df8f6d3e14efea3e1cca4a153310148c4072dcc95128e4b00823f24e4`，两者区别保留。
- 完整镜像包260324954字节，SHA256 `432d5b62fbd7792b7b2b21de3ee17e7733d2078d0e67dc05284b3dd2d4c58a78`；35成员/30 OCI blob重开验证。构建与镜像大文件在E盘，不清理共享Docker资源。
- 实际生产镜像新增验收8项：真实Next production SSR/JS hydration、原生口令登录、双context消息/SSE、真实UI分享→申请→批准→独立画布编辑重载、Desktop同Provider；pageerror0、外部浏览器请求0、账本0。不是原esbuild框架适配测试。准确命令 `node output/release103-collaboration-20261102/production-image-smoke/run.mjs`，`PRODUCTION_NEXT_COLLABORATION=PASS checks=8 cleanup_owned=2`、exit0；自有Web/PG/匿名卷/network/browser均清理。初始网络/定位脚手架差异保留日志，无产品改动凑通过。
- 候选包和1521个固定运维脚本已上传103并经远端hash校验，结果 `STAGED_NOT_DEPLOYED`。准备spec结果 `PREPARED_NOT_DEPLOYED`，RID `release103-mapping-collaboration-20261102-r1`，新回环port13110；未调用run，不启动候选、不drain旧槽、不切网关、不更新canonical活动指针。
- 最新只读103现场仍为0fcbbc80/build1793587166、model117、pending publication0、live lease0、当前Worker lastTick complete/unknown0；当前siteControl前任COMPLETE/revision339，双锁无持有只是观测，不作发布持锁证明。
- 已向用户给出两个异步选择：本批继续叠加103验证线或仅合main；公开说明文案取舍。尚未收到选择时，线上继续原版本。后续实际发布须取得全程双锁、刷新canonical/实例/任务、候选真实浏览器前后验收、切流/排空/旧槽停止与最终版本核对，不能拿本地8项替代线上门禁。
- 本次准备与验证汇总在 `output/release103-collaboration-20261102/`；对应生产截图在 `E:/Workspace/naumi-task-evidence/enterprise-collaboration-20261102/production-image/3feddb94-df42-4d3e-9456-40dad1dd72e9/`，父已打开两张并核对。
