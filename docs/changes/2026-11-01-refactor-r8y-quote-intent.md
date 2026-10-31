# R8Y：报价意图保存与原预览读取归属

## 基线与已复现问题

基线 `4d8a1160d28a28f93cfea78a2263407dcd26f20c`，完整5329个原始文件/hash/tar在 `output/refactor-r8y-20261031`。首个真实隔离PG基线复现：同一owner/operation/输入/作用域8个并发预览，产生8行报价及两种售价；实际原报价预览HTTP入口加载同一行3次。baseline31检查通过只是复现，不是正常业务验收。

诊断中的账号/权限/项目读取并非全都可删：归属插入前后核对仍有时序意义，本轮保留。没有将上一轮UI负载下prepare尾延迟+17.98%擅认成这些读取的根因。

## 模块职责与公共接口

- `imagegen/quotes.ts`唯一拥有报价保存、原合同读取、完整性/当前权限及素材检查、公开报价投影。新增`readOriginalImagegenQuote`让plan route只解析/鉴权、优先复用原报价，缺失才进current planner；读取或授权错误不回退重报价。
- `imagegen/operation-id.ts`作为现有持久身份叶模块，为**新报价**派生owner/operation/fingerprint/scope绑定的opaque UUID，复用原hash-UUID算法；原`imagegenStepId`正文和历史子任务ID不改。
- 新报价用已有主键与`ON CONFLICT(id) DO NOTHING`选择并发胜出合同；冲突读取并校验完整原行，而不是更新价格/plan。现有随机quote ID仍优先读取，历史重复行不删除、不改写；显式旧quote引用继续按原合同恢复。
- 计划与私有完整BillingQuote在首次await前clone，调用者后续对象变更不改变本次冻结内容。内存路径同步check/insert，同一意图也只产生一个新报价ID。
- 无新增schema、事务、advisory lock、配置、业务限额或用户确认；不持连接跨planner/素材I/O，也不改钱包、真实余额、任务、lease、供应商和UNKNOWN。

曾考虑的事务锁草稿会增加SQL往返和legacy proof连接传递；在modified验收前已删去，`creation-scope.ts`恢复原始raw字节。最终只改3个产品文件，并非新增一层护栏。

## 集中验证与证据边界

新增 `scripts/verify-imagegen-quote-intent.ts` 并接原refactor catalog。真实PG/实际quote owner、原始HTTP handler正文、当前feature policy/素材repository和内存实现执行；plan对象、handler鉴权与current planner为明确fixture ports，不冒称完整产品或供应商验收。原price verifier的current plan route依赖改跟随真实current quote owner；OWNED_FIVE历史投影与业务断言保留，不复制helper实现。

先做完整职责切片，再集中跑基线/修改/normal trace、原价/权限/输入/显式取消、并发/对象变更/SQL故障/读失败、历史随机ID与单连接legacy proof。后续完整固定源码验收已执行，结果见下方；注册数量与实际执行仍分别记录。

准备阶段三次失败原日志留存：CJS顶层await、fixture账号owner路径/文字列名、初始signup赠额两行operation未按前后增量比较。它们均已独立清理自有PG，不写成产品缺陷或成功业务。

当前产品实现完成：原/新19用例50检查通过，normal轨迹一致；真实PG并发8行→1行、内存8ID→1ID、原报价读取3→1、调用者迟到改价99→原6完整冻结。

原价--simplify实入口/真实PG已通过：5笔真实结算、62 fixture积分、5次loopback PNG供应商POST、预占归零；另2个已受理batch仅验证冻结计划，4个item保持queued，未冒充其交付。初次调用未带--simplify进入历史确认协议而失败，保留原日志。当前协议另在原4d完整副本复现旧fixture同actor复用v1草稿、向v2发布被正确拒绝；仅使用新fixture actor创建当前基线草稿，未改生产stale draft保护。旧脚本硬编码3笔/38积分、expired-not-accepted及缺失账单默认12的假证据已改成真实5笔/62积分读回和明确接受状态。新增断言最初误把发布后预览的批次28写成24，失败保留；最终绑定原server preview28，不信客户端宣称24。

实际命令、literal、exit及未完成项以本轮证据为准；完整固定源码208/runtime/browser与本轮5轮配对性能已实际执行。实际命令、literal、exit、全量hash、copy-only回滚及四产物以本轮VERIFICATION/DELIVERY为准。整体ACTIVE，PR8仍draft，未合main/未部署，47 HOLD。生产容量、历史事故与有效CI继续独立保留。


## 首轮固定候选完整门禁

`beea691909356bad1a4506f6576d873b9c275dd6`完整App/SDK构建与字节核对通过；首次core208实际147PASS/1FAIL/60NOT_RUN，fullCorePass=false。失败`scope-receipt`为窄VM夹具未绑定新增纯`operation-id`叶模块，原日志/报告保留；只补实际叶模块加载，不扩展默认import放行，不改23个receipt业务断言。定向23PASS后重新固定验证源码，完整门禁重新执行，不拼接147；runtime/browser/mixed在首轮门槛失败后没有启动。父PG已按精确ID/标签清理。


## 第二轮固定完整源码验收与测量

- applicationSource：`f0b30bc5e240e4e00118beb45c307bb0603bc047`；完整App/Worker镜像同一Image ID，SDK完整App字节EXACT；版本1793466316。
- 完整core **208 PASS/0 FAIL/0 NOT_RUN/0 reuse**；重新执行全部目录，不沿用首轮147。
- tsc exit0、实际5089类型输入hash一致；lint exit0、37既有warning；当前四类SCC=0，原2条release fixture/1条dist例外单列。
- 同镜像runtime177检查、产品浏览器92检查/180秒、route mocks=0；450秒calibration交付165图片＋12媒体，177consume/1014 fixture积分，一operation一次提交，业务不变量PASS。供应商为自有隔离loopback/媒体执行；不是生产上游质量或10万容量证明。
- 实际旧/新quote owner＋隔离PG互通PASS：新确定性ID被旧读取，旧随机ID被新读取，旧重预览保留新ID/原价，完整私有合同与子任务ID保持，paid mutations=0/external=0。

| 指标 | 3e90完整基线 | 当前f0b完整镜像 | 变化 |
|---|---:|---:|---:|
| 页面可视就绪 p95 | 7826.55 ms | 7197.77 ms | -8.03% |
| 实验交互估计 p95 | 1992.00 ms | 752.00 ms | -62.25% |
| 报价准备 p95 | 19.19 ms | 21.22 ms | +10.57% |
| 只读请求 p95 | 21.14 ms | 19.10 ms | -9.63% |
| Web采样RSS p95 | 414.46 MiB | 413.48 MiB | -0.24% |

性能条件：3e90原完整镜像对当前f0b完整镜像，全部源码/依赖lock/实际Node24.22.2、React19.3.0、Next15.5.28和glibc2.36核对一致；5轮10栈交替顺序，每侧15页面/150prepare/300read，320节点/12张相同1024px图片、private1、同Edge/4xCPU/5Mbps/80ms。结论：**OPEN: prepareMs**。所有实际交互耗时与session估计分开；无真实供应调用/付费提交/生产容量声明。旧R8X +17.98%观测与API-only未复现继续保留，不把本轮报价一致性修复称作旧性能根因修复。

最终类型输入复核曾发现Next lint生成的next-env.d.ts更新routes类型引用（.next-theme-matrix→.next）；原5090输入/哈希与首次文档收尾拒绝日志保留。按实际生成文件重新捕获类型输入并单独tsc验证，不恢复旧声明、不放宽hash守卫、不改产品。最终类型输入数量见上方与TYPE_INPUTS_FINAL。

## 源码交付与回退合同

本轮12变更路径：3个产品文件、5个验证/目录文件、4个文档；10修改/2新增。原5329与新5331文件raw hash固定，其他2138产品文件一致。最终文档归档源单独记录，通过逐文件raw-source bridge证明应用和验证资产与f0b一致，不声称文档SHA重跑业务全套。

四产物 `MODIFIED_FILE.tar`、强制binary `DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh` 归 `output/refactor-r8y-20261031`。独立副本验收合同：补丁后完整5331hash一致、实际modified19/50；copy-only恢复10文件/移除2新增、5329原hash、旧8行/3读/内存8ID/迟到改价99行为恢复；正常轨迹EXACT。later-edit须在首写前exit1且零写；工作树保留新版，不回灌DB/媒体，不重放付费任务。实际命令、literal、exit、重开与cleanup结果以同目录VERIFICATION/DELIVERY为准。

本轮失败记录及首轮147/1/60原始日志保留，不覆盖为绿。PR8保持draft；本次远端checks以实际head另行刷新。整体ACTIVE，未合main/未部署，47 HOLD。
