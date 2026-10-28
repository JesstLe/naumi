# R6W：原位重生成与版本历史接入既有 owner

## 模块、基线与职责

独立工作树 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`；基线 `0145812070fca641e0f9b681585600288763fc61`。本轮整合固定 main `cfb6f80033fd89885f1337d6fbe83d82c663e253` 的 4 个提交、28 个路径。完整 4758 个原始文件已归档、逐文件 hash 检查并重新打开；原始 main 也有独立归档。

保留主线已实现的产品行为：普通图片主操作在原节点重生成，原始媒体和生成回执不可变，显示版本独立持久化；明确的三视图等工具仍派生；旧任务迟到、锁定或节点删除时不覆盖当前显示。

## 公共接口、依赖、数据与事务归属

- `canvas/image-version-store` 拥有版本历史、显示版本 CAS 和挂载回执。原 owner 账户事务锁、行锁、operation 身份、旧图与原媒体规则保留；改为直接使用 platform pool、窄 creation-access 和 creation-scope，不经 `db` 或上下文大出口组装。
- 原 `app_artworks` 两列进入既有 persistence schema；主线版本表原 SQL 进入 `canvas/storage-schema` 的 pool-scoped readiness，并由 application persistence startup 显式初始化。没有新增表、钱包或任务体系。
- 作品显示与原媒体读取归 `artworks/row`、`artworks/repository` 和原 DTO。`listArtworksByIds(...,{original:true})` 保留任务回执原图；`db.ts` 保持纯兼容出口，不恢复实现。
- 正常及恢复的结果落库仍共用 `complete-image-delivery`，原位生成输出标记在该唯一 writer 中处理。父任务挂载版本保留本分支原有的实际结算与 partial 口径，未恢复 main 的旧双份交付、旧 `childCharges` 或 Route 执行代码。
- HTTP 兼容轮询的 `canvasAttachment` 进入既有 `generation-query`，Route 保持薄传输适配。
- `image-version` 进入共享 history contract/compiler/controller，读取当前 artwork 后冻结 expected revision；重试、ABA、scope、回执、撤销重做继续由原 controller 负责，不复制 main 的独立 historyAttempts 状态。
- 普通生成意图归 `image-creation`，FormData 与目标快照归 `image-task-request`，提交/轮询/失败恢复归原 `image-task-controller`。原位结果和原任务恢复共用 `createCanvasImageVersionAttachment`：只合并原节点，不写位置、不添加派生节点。
- 原位等待/失败的渲染归 scene projection 与 artwork renderer，历史入口归已有 image composer。历史读取使用 document scope；主组件只保留小型调用适配，不恢复内联提交/轮询/版本写入循环。
- 创作素材的 `storage_snapshot` 沿主线实现冻结实际输入像素；后续节点换图不改写历史输入证据。

## 实现与迁移状态

8 处 Git 合并冲突均已按已有 owner 迁入，索引已逐路径解决，未恢复巨石实现。原始 Route、db、creation-context 保留本分支实现；main 变更迁入实际职责文件。主线取消的独立“重做”按钮已从 composer 移除，普通主操作显示“重新生成”；已有失败任务按钮仍恢复原 operation，不把未知提交改成一次新购买。

本分支已有 partial delivery 语义继续保留：不完整结果进入历史，但不覆盖当前图片。初次整合脚本的 Python 字符串转义、错误定位到已瘦身 Route、以及旧 import 空格断言失败均保留日志；这些失败发生在缓冲写入前，不记为产品回归通过。

## 集中验证与未完成项

已完成首轮模块集中验证：真实 Canvas adapter/creation owner 基线保留派生行为，新版普通主操作原位执行、独立重做入口退休；新 request/projection/history/attachment/row 合同 9 组检查通过；真实隔离 PG 16 组版本操作通过；完整真实生成入口和 loopback 供应商管线通过，1 次成功结算、UNKNOWN 重放新增 POST=0。完整固定候选 core、镜像及产品控件验收尚待执行。版本 CAS、同任务重放、并发、锁定/删除、原始图片、创作素材快照和未知状态禁止重 POST 都须验证；不以源码静态存在代替运行结果。

本轮不合入 main、不部署。R6V 的通过记录只作前序证据，不自动升级成本轮验收；整体重构目标继续，剩余 UI 组装、实际 CI 设置和同机性能对照仍未完成。

## R6W 集中检查与具体修正

- 真实 startup fixture 已扩为 41 个显式 owner，版本表 SQL 仍只有 storage-schema 一个 owner。
- 当前 TypeScript exit 0；Next lint exit 0，保留既有 warnings，不写成零警告。静态、全 import、emitted 静态、emitted 全 import 四类 SCC 均为 0；原有 release fixture 两条 lib→app 与 billing toast 一条 lib→UI 仍单列，不虚报全部反向边已消除。
- 复现并修正已有内联 Data URL 的兼容拒绝：`expectedImage` 是已持久化媒体身份，不是新输入网址；提交和 history 的 4096 字符限制移除，真实两个 schema 通过 6,600,022 字符合同检查。原 owner/scope/revision/素材授权不变，不引入新限额。
- 退役 `retryCanvasImageCreation`：生产搜索仅剩已删除按钮的失效 import，无真实调用方；已删除未使用的旧应用分支，历史源验收仍从基线副本读取，不重新增加生产按钮来满足旧脚本。
- 模块 fixture 首轮缺 VM process、随后缺 sourceNodeId 的准备错误和 incoming history 旧路径错误均保留原 exit 1 日志；没有把这些失败记成通过。主线真实 schema 复现另用正确源路径记录。
- 产品验收改为真实同节点生成与版本选择/共享 undo redo；三视图、合成图及 Comfy 仍沿真实派生流程。未以 DOM mock 或新 API 替代原完整产品。

本文件随固定候选封版结果继续更新；尚未取得的完整候选结果不提前写 PASS。原始 4758 文件基线、当前改动、回滚副本与最终 Git 来源将在本轮 DELIVERY 中绑定。整体目标保持进行中。

## 最终固定候选集中验收

应用固定 `85f164a8a363f816b9065acd7bfc01b645416a67`，digest `468bb37347b9bf103d2c62060987b69c24ecbcecd2df260d57ce14c036d06b2b`；正式Dockerfile完整Web/Worker/media镜像 `sha256:296d3d2a1da6b3b537a81e5d7c78756941792d76d1799805bd50ea6309c98200`。后续仅文档及两个浏览器验收文件的菜单选项及完成前置条件修正（等待实际任务UI收尾和原回执清理，不以DB已有结果/零派生占位代替），普通生成正例改用完整创作配方，不再把缺编辑目标的旧重做指令冒充生成成功正例；产品源码与core实际用例入口均保持；最终Git/远端SHA及明确例外由SOURCE_BINDING和DELIVERY绑定。

- 完整core **73/73**，同SHA/digest/环境/日志hash复用37项，后续新执行36项，失败0、未执行0；保留原69入口并加入原位adapter、共享版本owner、PG版本和完整入口管线4项。已退役按钮的旧脚本改为观察实际主操作，不为旧断言恢复死路径。
- 同完整Linux镜像runtime **125**、真实双浏览器产品 **37**，route mock0、确认弹窗0、真实PG/Worker/存储/账本与POSIX排空通过；loopback协议供应商不等于付费上游质量验收。
- 真实版本选择、撤销重做不产生生成请求或扣款；普通主操作不再隐式把自己的输出当参考图。原生三视图/合成图和Comfy各自保留原派生数量/引用/单价。
- 1906个其它产品文件hash保持，四个兼容面字节保持；Canvas5752→5755，明确改名generateChild为generateSelectedImage并退休retrySelected，其余函数的相同/改绑列表记录在STRUCTURE_FINAL。没有按行数搬成mega-hook。
- TypeScript与lint exit0；既有warnings和两个release fixture→app/一条billing toast→UI边仍列出，不冒充已消除。四类SCC0。

**长分支保留说明：**用户明确要求在独立目录持续交付完整重构版本，本分支超过48小时保留以遵守该交付方式；本轮不自行合main、不删除该工作树、不启动发布。R6W切片封存不代表整个项目完成。

下一步先核实待整合主线，再收敛仍在Shell中的模板应用/导入生命周期与外围交互组装；复用已有image imports、artwork document、task controller、history和assistant-session，不重复开发已有owner。GitHub branch protection与active rules两个只读接口均返回HTTP403（账户方案提示），未据此冒称required checks已强制；同机同数据性能对照及整体退出审计仍未证明。

## 留存失败与验收输入边界

首次 core 为43通过/1失败/29未执行：旧抽取夹具漏接实际 isNodeLocked，修正夹具并补锁定零提交/零位移/零undo后47场景179检查通过，未修改产品逻辑。后续固定85f core曾37通过/1角色原始鼠标拖动超时/35未执行；无源码变化的后续原用例真实拖动/PG/undo/redo通过，37项仅按原runner严格同SHA/digest/环境/日志hash复用。超时截图和日志保留，鼠标时序根因未闭合，不以重新通过抹去失败。

完整产品浏览器第一次沿旧派生占位判断过早reload，原位控制器原回执尚待收尾；夹具改为等待真实原位status结束和会话原回执清理，未删除或改写任何回执。第二次实际HTTP400说明旧“只调整光照”的编辑指令缺编辑目标，供应商/扣款增量0；普通生成不应隐式添加自身为底图，所以正例改用完整创作配方，而非修改产品解除输入要求。两个失败完整保留，最终37项产品矩阵通过；不能据此宣称“无底图编辑”已放行。

镜像/core绑定85f164a8；随后只改两个浏览器验收文件和文档，所有产品源码、服务与其余非文档输入仍逐hash一致。SOURCE_BINDING列出两个具体例外和差异原因，不把最终全目录digest冒称与旧候选完全相同。
