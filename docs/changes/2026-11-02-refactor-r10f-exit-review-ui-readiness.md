# R10F：整体语义退出审阅与原账务 UI 就绪观察

## 模块与职责

固定审阅源码 `3775c5e8ba30fe09b4908d1a2a699a131bb7b6cd`，独立工作树 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。整体仍 ACTIVE，未合 main、本线程未部署。

本轮产品代码零修改。测试仍归原 `scripts/billing-ui.spec.ts`；只在已有价格断言之前增加唯一控件就绪断言，不新增通用 helper，不用 first()/nth() 跳过重复控件。

## 当前 CI 的实际反例

精确 PR head `3775c5e8` 对应 Image run `41342516875`，job `124955340419`。真实 GitHub annotation：16 项中 15 PASS / 1 FAIL；失败是原 `publish preserves the user's frozen price, conflict draft and restore` 在原第 123 行 `getByTestId("billing-estimate").toContainText("6")` 严格解析到两个按钮，尚未进入该 case 的 paid POST。不是 R10E 原第 315 行密码按钮问题。annotation 确认两个匹配，但本轮不据此认定重复 DOM 的唯一产品根因。

完整日志和 artifact 下载均遭 blob EOF；原失败位置来自实际 check annotations，原 run 保持失败，不取消重启。CodeRabbit 因 1637 文件超过 300 上限而 SKIPPED，不当作 approval。

## 实现与验收合同

1. 先对同一 `billing-estimate` 执行 `toHaveCount(1)`，再执行原价格 `toContainText("6")`。这是等待唯一控件就绪，不是筛掉一个重复元素；永久重复仍失败。
2. 原 16 个 test、顺序、所有既有断言、90s 单 case / 30s 普通 test / 5s expect 预算、配置和产品文件保持不变；原 supplier POST1、原冻结6/current8/charge6、一笔账本、作品与 PNG 回读等全部保留。
3. 独立真实 Chromium fixture 执行实际 spec 的原表达式，四 case：单个6、500ms后退出的临时第二控件、永久第二控件、单个错误8。baseline 必须复现临时/永久 strict failure；modified 只允许临时重复等到唯一后通过，永久重复和错价仍失败。这个 fixture 是定位语义控制实验，不冒充产品运行。
4. 产品完整模块沿原 `verify-billing-ui.mjs`、独立 PG、原 16 项集中验证。复用 R10E 生产 standalone 前逐项绑定全部 2152 产品文件 raw hash；不为测试源码单行变更重建相同产品，也不将此称为新 Linux Web/Worker 整版验证。

## 验证状态

- 基线真实Chromium控件语义实验：4/4符合旧行为，exit0，临时重复明确复现 strict failure；不是重新运行旧产品整版。
- 新版同4case：4/4符合预期，exit0；临时第二控件退休后通过，永久重复/错误8仍拒绝，expect预算5000ms不变。
- 原完整生产UI16/16 PASS，exit0，28.4s；实际原价6/current8/charge6、consume1、browser paidPOST1、supplierPOST1、nativeDialogs0，PNG与作品回读保留。2152产品raw及依赖锁与复用的R10E standalone逐项相同。
- 初次夹具在本轮新PG刚启动时连接被终止，尚未执行test，exit1原样保留为SETUP_ATTEMPT1；明确pg_isready后单次完整执行上述16项，没有改产品或重试掩盖业务失败。
- fixture随机schema/连接/App/HTTP均清理；自有PG核对CID/label/port、其他连接0、fixture schema0后已停止删除。
- 本轮源码/精确patch、副本回滚及later-edit零写的最终命令与hash见 `output/refactor-r10f-20261102/VERIFICATION.txt` / `DELIVERY.json`；当前远端CI按最终SHA单独记录，不以本地16PASS代替。

## 整体退出审阅（固定原 3775）

本轮 5404 tracked 文件逐项 raw hash 相同后完成审阅。不是每条 computed SQL 的运行穷举。20 个退出要求和9类故障×五列真实证据分开登记；旧报告不改标当前整版。

- 当前 AST 图：1794 个 src 代码文件、294 API routes；语法 runtime import 7401 sites、7264 unique edges、emitted7356 sites。语法静态/all-literal和类型擦除静态/all-literal四类 SCC 均0；217 computed import线索另列。SCC0不等于业务owner通过。
- lib→UI/scripts均0；lib→app两条均release fixture，图中无生产incoming。db兼容 re-export 壳生产consumer0、scripts248，保留真实兼容调用。
- SQL扫描1680sites、651writes、166tables、105computed query包含tests/fixtures，只是候选库存，不是生产违规数。
- F01会话/目录/附件、F02旧生成页会话、F03后台发布恢复已迁移，不重复做。Canvas4133行/48state/31effect/fanOut181不作为机械拆分理由。

### W1：账务写入归属、费用补查与原任务恢复（下一完整产品工作包）

确定源码边界：

- `billing/service.ts:116-124` 费用补查直接更新 `app_image_jobs.billing_settled`；实际调用在 `supplier-cost/worker.ts:76-80`。
- `image-job-repository.ts:256` 解释账务 quote 的 unknown policy 并写 `app_billing_operations`；`canvas/image-task-repository.ts:103-107` 同 CTE 写 Canvas 和 billing 状态。
- `image-job-repository.ts:181-188`、`canvas/image-task-transitions.ts:101-115`、`competitor/completion.ts:20-25`、`video/task-transitions.ts:278-293` 的真实旧 row 分支各自写钱包/ledger。不能删除旧 row、重报价或替换原 ledger 身份。
- `billing/repository.ts:85-93` 穿透 SaaS evidence 表；原 savepoint/creationEvidencePending 已明确让账务提交权威，不能为模块化而回退该语义。
- 管理账务 route `:27-29` 先提交 reconcile 再独立连接恢复 Canvas task，存在真实跨事务窗口；本轮没有注入复现，不把它认定线上事故。

实施：billing拥有钱包/operation/legacy扣款，task owner拥有任务标记；应用边界用窄Tx接口编排，保留同PoolClient、原锁顺序、fencing、冻结报价和单次结算。证据owner自己写evidence；COMMIT后的投影可原ID恢复，后续失败不撤销已提交账务。验收覆盖 manual/hold/settled、费用升降、重复人工核对、legacy无quote、证据故障、账务提交后恢复失败，供应POST增量0、重复consume0。

### W2：媒体元数据单一写入 owner

`canvas-original-upload.ts:51-64` 直接注册原图及预览；`video/media-inspection.ts:35-37` 直接改媒体宽高。这里已有 owner/hash 冲突与同Tx注册，不是越权证明。收敛到现有 media-assets 的窄Tx API，保留原图/预览原子性、key+sha CAS、mirror状态及事务外远端I/O。集中验证同key并发冲突、旧sha probe零更新、整组失败回滚和原字节/权限。

### W3：协议入口与应用规则归位

工作台 route `:62-76` 仍决定 chat 生命周期/模板冻结；Agent `billing/agent.ts:69-71` 仍构造内存伪 Request 转移 cookie/header，非实际内部网络请求。工作台迁一个内聚document/template用例owner；Agent复用现有typed报价端口。两者是各自业务owner，不为共性而造通用manager。保持聊天锁、active保护、真实内容方案确认/取消、模板原版本、Actor/scope、原operation和报价准备次数。

### 故障覆盖纠正

- M02 schema早拒绝怀疑已被实际旧runtime反证：最小quoteId envelope合法，9ba镜像该次提交200，之后原GET失败且poor消费0。但旧assert允许200/400/402，未严格绑定余额错误与真实页面；仍是覆盖缺口，不是schema缺陷。
- M03明确not_charged、M04 accepted socket loss：db3a完整产品/PG/实际Canvas同case原op、POST1、consume0、原stage/提示与reload0POST，供应unknown和客户释放/0结算分开。
- M05 first checkpoint五case已通过实际handler/PG；瞬时失败/COMMITACK丢失保持原bytes与单笔6，持续失败hold6/consume0。M06六case实际签名回环S3 PUT断点/原任务恢复/补传已验，不是本地fs替代。两者actual browser仍未证明。
- M07/M08沿原73检查的seed paid done交付恢复验证，作品写失败/manual不丢图与真实settlement保持；不能改标供应第一次结果全链，也尚缺同case实际页面。
- M09 db3a真实Canvas offline→原Worker完成→联网检查原任务→第二reload0新增，原bytes/一POST/一笔6已闭合普通客户端断线；不凭空加物理拔网线、真实云和生产容量为重构新门槛。
- M01准备失败的同op零供应/零账务/实际页面仍需沿已有fixture补证，不跨case拼绿。

详细固定审阅：`output/refactor-exit-3775c5e8-20261102/AUDIT.md`、`AUDIT.json`、`SOURCE_REFERENCES.json`、`FAULT_MATRIX.json`、`WORK_PACKAGES.json`，均已创建重开。后续以W1完整业务切片继续，不再以拆helper增加轮次。
