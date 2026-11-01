# 重构工作区：当前交付快照

## 当前推进：R9E 原生交互复用与直接生成合同

[R9E模块](changes/2026-11-01-refactor-r9e-native-interaction-contract.md)：timeline/director 的原生验证复用既有 `dragCanvasNode`，不再私有读取一次坐标就发手势；原持久化、撤销/重做、锁定、复制、删除、账务断言和等待时间保留。真实 ReactFlow/生产 drag owner 的四场景原/新对照为12/14检查，正常轨迹EXACT；当前同源完整应用中的 timeline 和 director 原生链均PASS。它们不证明历史单次失败的唯一根因。

直接生成旧CI扫描器在同源复现 exit1（要求恢复已删除的报价版本误拦），现在核对 typed 创建owner、原服务器quote、scope/operation透传及无重复积分确认，27项静态正反检查PASS；不是实际钱包验收。feature Core回归仅由PR触发，main push与精确source workflow_call保留，runner16场景282检查PASS，不删除业务测试。

当前验证/完整应用固定 `bb0ebce1ba489222901205db49ca3ae6592127ba`，Web/Worker同镜像与原生SDK应用字节一致。目录215项已全部到达：首批61PASS/1主题FAIL/153未到达，随后只执行153个原未到达项，全部PASS；**两批合计214PASS/1FAIL/0未运行，完整core仍FAIL，不能称单次215全绿**。没有复用旧case结果。主题重载40检查后节点等待超时，导航200、无pageerror，但截图及正文读取也超时；附加协议诊断未给出唯一首因，结束了其自有浏览器，原失败保留。没有提高超时、换浏览器或跳过断言。

同固定镜像 runtime177、实际产品浏览器92（2context、routeMocks0）及450秒混合校准通过：165图片/12媒体，177consume/1014积分，付费重放0，未完成父任务0，capacityClaim=false。非增量tsc exit0，5090个编译器输入+4配置绑定，37个既有lint warning/exit0，四类SCC0。原e689两处脚本类型错误和诊断中断记录均保留。

本轮产品源码改动0，全部2141个原src/services字节不变；完整源码5344文件，对照5342原文件。四产物、副本回滚及最终source/doc桥接见 `output/refactor-r9e-20261101/DELIVERY.json` / `VERIFICATION.txt`。**整体ACTIVE；main未合、部署0、47HOLD**。验证/文档不计产品模块，主线同步计数仍2；下一步是定位主题重载失败并完成真实同源整版退出，而非继续重复已通过批次。远端新head CI以最终DELIVERY快照为准。

## 上一模块：R9D 整版取证与验证依赖归属

[R9D记录](changes/2026-11-01-refactor-r9d-current-acceptance.md)：完整应用固定79705670，Web/Worker同镜像与原生SDK应用字节一致。原212项全部到达：第二轮完整运行146PASS/1FAIL，未到达65项单独运行全部PASS，合计211PASS/1FAIL，未复用旧结果；**完整core仍FAIL**。首次theme重载超时后原参数97检查通过、timeline原生拖动失败后旧版与当前诊断通过，两项首因均OPEN，不用后续通过抹掉原失败。

验证入口9a1e8b2a把timeline素材依赖收敛为已通过的生产者case、同源commit/digest、实际日志hash/marker与5个文件hash；父级FAIL及completeCore=false原样保留。新增19个状态合同检查，目录212→213，**完整213尚未运行**。没有修改产品文件，全部2141个src/services原始字节仍与应用镜像源码一致。

本轮实际同镜像runtime177、产品浏览器92（routeMocks=0、真实登录/PG）、450秒混合校准通过；混合165图片+12媒体、177consume/1014积分、未知重放0、未完成父任务0，businessInvariants=PASS且capacityClaim=false。lint/非增量tsc exit0、5089编译器输入+4配置绑定、四类SCC0。它们分别证明自己的范围，不把独立验收PASS合成为corePASS。

四产物、回滚、最终源码/验证代码桥接与新head远端状态见output/refactor-r9d-20261101/DELIVERY.json、VERIFICATION.txt。整体ACTIVE，main未合、部署0、47HOLD。下一步优先定位两项间歇性失败、完成当前213全套；入口别名盘点48个调用/31文件只作迁移线索，不作运行事故归因。本轮是验证职责修正，功能同步计数仍2，不因文档或验证资产变化虚增。

## 上一模块：R9C 报价与 Canvas 编辑边界

[R9C模块](changes/2026-11-01-refactor-r9c-quote-canvas-boundary.md)把公共报价/报价保存、Canvas入口/intent/模型准备的身份统一到已认证actor；编辑任务用例不再接收或构造Request，HTTP/header/模型适配由入口承担，headless复用既有withModelOperation。保留输入校验→来源归属→模型准备→真实报价/预占顺序，没有新增确认/限额/缓存/schema。

完整eb65基线5337raw文件与修改版实际原生HTTP/PG/Worker对照29场景59检查、正常投影EXACT：旧报价/编辑认证2～6次→1，headless0/列表1保持。真实lease领取、回环供应商1POST、私有结果像素读回、原价6/current17后只consume1/charge6，原任务重放、丢ACK和并发不重买。现有Request第三参验证调用方已迁到真实HTTP/领取路径，未保留Request重载。

固定产品验证源d35：pricing13/13与APImart实际入口通过；runner仅选pricing，仍PARTIAL/exit2，非完整212。ff6f21f3修正旧辅助fixture后，视频跟随21、视频提交30场景121检查、OCR22场景79检查、pending实际React/调用方8组36检查通过；真实PG model-execution包含headless Canvas/Worker/轮换/未知不重买通过。最终lint exit0/37既有warning、非增量tsc exit0、四类SCC0。类型证据准确口径是5089个编译器列出输入+4配置绑定=5093，保留原计数记录。产品及pricing/APImart输入在d35与ff6间raw一致；没有把旧执行重标成新SHA。四产物、最终副本回滚与推送状态见output/refactor-r9c-20261101/DELIVERY.json及VERIFICATION.txt；完整212/App/Worker当前整版仍待执行。

## 上一模块：R9B 历史生成入口

[R9B 模块](changes/2026-11-01-refactor-r9b-legacy-generation-ingress.md)将历史generate-image的intent、BI、model、opaque quote、signed versions和领域actor/quote port贯穿同一个服务端身份。完整1efb基线5335raw文件与修改版实际native HMAC/HTTP/PG各38场景79检查，正常结果投影EXACT；旧提交4～7次认证、父轮询2次，修改后均1次，health仍0次（不含middleware）。保留原价6/当前17、真实预占和余额不足、丢失ACK后503→原intent409待核查、同编号并发一任务；没有新表、价格确认或跨请求缓存。

固定验证源`b7963e41025fd2e1bdccf7f99a705d11e9128684`：7个产品文件完成显式参数迁移，其他2134原src/services raw hash一致；pricing12/12全部执行通过、0失败/未运行/复用，runner仍PARTIAL/exit2（非完整211，其余199未本轮执行）；5092实际类型输入/tsc exit0、lint exit0/37既有warning、四类SCC0。独立副本恢复5335原始raw hash及原38/79行为，later-edit首写前拒绝/零写。归档与该验证源之间仅4文档变化，产品/验证资产字节一致；最终补丁与四产物见本轮DELIVERY。

本轮为上次主线同步后第1模块，开工fetch确认origin/main仍e2f56255且已包含；没有新main待整合、没有写/推main。最后完整应用验收仍是R8Z，不把本模块通过扩展为完整211目录或当前App/Worker通过。

## 上一模块：R9A 图片入口身份归属

[R9A 模块](changes/2026-11-01-refactor-r9a-image-ingress-routes.md)已迁移其余 5 个图片路由文件的 7 个处理器，并把主提交 BI 包装的身份来源统一到入口。完整 fe9d 基线与修改版实际 HTTP/native cookie/PG 对照各 39 场景、90 检查，正常响应/授权/原字节投影 EXACT；认证 SQL 从 `2/3/2/2/2/2/2` 变为 `1/1/1/1/1/1/1`。该计数不含 middleware。7 个产品文件变更，其他 2134 个原 src/services 文件 raw hash 不变，不改领域/钱包/供应商/schema。

R9A固定验证源码 `9a52ba65b77e729ea724fceff66283c5f020e678`：pricing 11/11 脚本通过、0失败、0未运行、0复用；runner 因部分目录返回 **PARTIAL/exit2**。R9A时目录210项，其他199项未在该轮重新执行。该轮5091实际类型输入一致/tsc exit0、lint exit0/37既有warning、四类SCC=0。独立副本恢复5333原始哈希及39/90原行为，later-edit首写前拒绝/零写。归档1efb与该验证源仅文档更新；不是R9B源码执行结果。

第三功能模块后已刷新 origin/main `e2f562556ea6e71370619686e1fc8d4c634ef5e7` 并执行普通整合（已包含，源码不变），modulesSinceSync 3→0；没有修改或推送 main。当前封装与实际命令归 `output/refactor-r9a-20261101`。

## 最近完整应用验收（R8Z）

| 字段 | 值 |
|---|---|
| 工作目录 | E:/Workspace/naumi-refactor-20261024 |
| 分支 | codex/core-refactor-20261024 |
| 当前完整应用验收 applicationSource | f7441ed0f9ae077f5d3f6fafb0f7c70b6d585567 |
| 文档归档 source | 以本轮DELIVERY.json为准；仅文档raw-source bridge，不冒称文档SHA重跑业务 |
| 完整源码 | 5333文件；本轮11路径：5产品、2验证/目录、4文档；原5331文件 |
| App/Worker固定镜像 | sha256:5934e621d6fdad7aa36149eea14dd306c62d080af846759146ed8f32adaddce6 |
| 固定版本 | 1793474041 |
| SDK | 同完整源码、完整App字节EXACT，七个原生入口 |
| 完整核心目录 | **209 PASS / 0 FAIL / 0 NOT_RUN / 0 reuse** |
| 同镜像运行 / 产品浏览器 | **177检查 / 92检查**，180秒、2context、routeMocks=0 |
| 混合业务 | 450秒calibration：165图片＋12媒体，177consume/1014fixture积分，业务不变量PASS |
| 类型与结构 | tsc exit0；5090实际类型输入；lint exit0/37既有warning；四类SCC=0 |
| 同机配对性能 | 5轮/10栈、每侧15页面/150prepare/300read；本轮当前候选采样无超过原10%调查阈值的指标 |
| GitHub | [PR8](https://github.com/JesstLe/naumi/pull/8)，draft；本次head实际CI见本轮证据 |
| 整体目标 | **ACTIVE；mainMerged=false；deployed=false；47 HOLD** |

## 本轮职责收敛

[R8Z入口归属](changes/2026-11-01-refactor-r8z-ingress-ownership.md)让HTTP入口传递已认证actor，当前权益检查返回actor-bound决定，plan/原报价同actor复用；跨actor/no-context仍读自己的policy，每次调用/下一请求重新检查，无全局或跨请求缓存。实际原生cookie/HTTP/PG/planner/quote原/新20用例33检查，入口内auth/policy2/2→1/1，正常公开/授权轨迹EXACT。此数字不是完整App包含middleware的认证总次数。

产品只改5文件，其他2136原产品raw hash一致；无新表、事务锁、业务限额或价格确认。原任务/报价ID、原价、输入归属、钱包与UNKNOWN保持。R8Y唯一报价意图的职责和兼容合同继续保留。

| 指标 | 3e90完整基线 | 当前f7441ed0完整镜像 | 变化 |
|---|---:|---:|---:|
| 可视就绪 p95 | 7834.70 ms | 7796.28 ms | -0.49% |
| 实验交互估计 p95 | 1744.00 ms | 928.00 ms | -46.79% |
| 报价准备 p95 | 37.69 ms | 19.05 ms | -49.46% |
| 只读请求 p95 | 23.20 ms | 19.26 ms | -16.96% |
| Web采样RSS p95 | 411.41 MiB | 414.84 MiB | +0.83% |

测量口径：同机/Edge、相同package/lock与实际Node24.22.2/React19.3.0/Next15.5.28/glibc2.36，320节点/12张相同1024px图片、4xCPU/5Mbps/80ms、privateMedia1。仍含冷样本；不是线上INP或10万活跃容量证明。旧R8X827的prepare +17.98%与R8Yf0b的+10.57%原始观测继续保留；本次新候选结果不重写旧结果，不宣称已证明旧差异唯一根因。

## 文档职责与下一步

- [架构与职责](REFACTOR_ARCHITECTURE.md)：稳定边界、公共接口、数据归属。
- [迁移合同](architecture/REFACTOR_MIGRATION.md)：阶段方法、兼容条件、模块索引。
- [整体退出审计](architecture/REFACTOR_EXIT_AUDIT.md)：各项当前证据与未完成项。
- 实际命令、失败、source/hash、原/新对照、binary补丁与独立副本回滚归output/refactor-r8z-20261101，以VERIFICATION.txt和DELIVERY.json为准。

1. 当前性能判定：本轮当前候选采样无超过原10%调查阈值的指标；保留原10%阈值与冷样本，历史归因未完成项独立记录。
2. 有效远端CI后进行最终main普通整合与固定整版验收；本地PASS/候选push不是CI通过或部署。
3. 生产容量、历史供应商/持久化/传输问题及生产验收沿独立台账，不以本轮模块通过自动关闭。

**候选分支超过48小时尚未合main。** 整体退出仍有有效CI、最终main整版及独立容量/历史/生产门槛。保留独立工作树和未整合分支，不处理他人资源；47 HOLD未解除。

本轮汇总门槛满足不代表每轮都变快：对照基线跨期p95有明显漂移，paired第2轮p50仍回退；p50沿原driver nearest-rank估计。不能把汇总约49%的降幅归因为本次改动的确定收益。逐轮原值/旧原始观测与归因不确定性均保留在PAIRED_VARIANCE_ASSESSMENT.json。

## 入口迁移边界

R8Z/R9A直接候选由R9B历史轮询迁移收口；R9C继续迁移公共billing quote与canvas/image-tasks的间接链，并移除编辑用例Request边界。局部AST/调用链不是全站闭合；其他跨文件适配、当前215完整固定验收、有效CI、最终main/生产门槛仍独立保留。
