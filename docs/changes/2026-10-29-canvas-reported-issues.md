# 画布截图问题台账与修复验收

## 范围与固定基线

- 用户提供 11 张截图，逐张打开核对；原图编号与 SHA256 存于 `E:/Workspace/naumi/output/canvas-reported-issues-20261029/attachments/MANIFEST.json`。
- 主线基线：`3b6a5279b4364590954751e8f5b5c9d566010806`，工作分支 `codex/canvas-reported-issues-20261029`。共享管理 UI 未提交改动保持不动，不合重构分支。
- 本文是持续更新的待修复台账。截图证明用户当时的现象，不单独证明最新版仍有相同根因；源码、隔离复现、线上只读、合入与部署分别记录。

## 待修复清单

| ID | 原图 | 用户描述 / 可见错误 | 实际排查与状态 | 验收要求 |
|---|---|---|---|---|
| C01 | 01 | AI 便捷工具失败后，节点 Delete 快捷键无效，只能右键 | **已复现、已修**：task-/pend- 被删除入口排除，失败 task 不可选 | 失败节点可选、可删；运行任务不因删除显示而丢回执 |
| C02 | 02 | AI 抠图失败；提示报价凭据与账号或工作空间不符 | **已复现、已修**：报价漏项目头，dedicated 历史个人项目报价落 tenant、执行落 personal | 报价和提交冻结同 scope；跨账号/空间继续拒绝 |
| C03 | 03 | 编辑图中文字不可用；提示无可用模型绑定 | **已复现、已修**：已有明确视觉模型选择仍被旧 binding 门槛挡住；线上 v152 确实无 vision.ocr | 真正 executor 验证模型、能力及工具范围；完整 UI 识别→改字→结果显示 |
| C04 | 04 | 重构比例失败，无连接线，失败节点不能删除 | **已复现、已修**：报价同 C02；连线不是漏存，而是 default 白线在浅色画布不可见；删除同 C01 | 改用既有 comet 深色边，失败停止流动；删除/undo 保留关系 |
| C05 | 05 | 扩充画面失败；同报价上下文错误 | **已复现、已修**：与 C02 共用链路，完整 UI 已产出模拟结果节点 | 保持原参考图、画幅和合法上下文 |
| C06 | 06 | 标注过程正常，提交标注改图失败；同报价错误 | **已复现、已修**：与 C02 共用链路，完整 UI 实际绘制标注/输入指令/提交/显示结果 | 标注输入→报价→提交一致，不放宽鉴权 |
| C07 | 07 | 纯文本节点生图，以及反推提示词后生图失败；无支持本次参数的通道 | **已复现、已修**：无引用的 auto 未解析，真实 Nano 两类配置的比例枚举拒绝 auto | 新的无图 generate 在报价前固定 1:1；显式画幅/有图自适应/旧接受计划不改 |
| C08 | 08 | 多图同时反推，结果数量前后不一致，存在空文本 | **已复现、已修**：逐 worker 建占位、空字符串误成功、错误仅 toast；现一次建齐且独立存错误 | 5 输入稳定对应 3 成功/2 明确失败，刷新错误仍可读，批次单次 undo |
| C09 | 09 上半 | 撤销/删除保存超时：signal timed out，修改留本地 | **部分闭合**：复现并修复失败删除重试换 nonce；超时本地保留/原 nonce 重试通过。截图当时网络/服务端根因未由时间或 requestId 定位 | 不靠改文案或调大超时宣称网络根因已消除；保留待核对项 |
| C10 | 09 下半、10 | 空图和文字混选不能一起删除；Ctrl+Z/Delete 对空节点失效 | **已复现、已修**：遗漏本地占位且创建未入 undo | 空图/文字/普通/失败混选确认数和实际数一致，单次撤销全部恢复 |
| C11 | 11 | 新项目上传提示成功但节点不显示，刷新退列表后重进才出现 | **已复现、已修**：mergeWorks 前发布导航被无关刷新提前消费 | 同步后发布导航，立即显示；占位同步失败只查已上传 ID、不二次上传 |

## 分工与验证约定

- 工具报价：`billing/client.tsx` 与专属测试，真实 CreationContext/quote 校验保留。
- 节点操作：CanvasClient 的删除、选择、历史和快捷键；不改工具生成/上传函数。
- 上传/反推：CanvasClient 的上传/反推段及必要数据模块；不改删除/报价段。
- 父线程：模型用途/目录与线上只读核验、总台账、整合、最终回归与制品。
- 优先复用真实模块和完整 CanvasClient fixture。供应商为隔离边界，不调用真实收费生成，不重放用户未知任务。
- 本轮不自动发布服务器。代码/配置缺陷、已在 main 修复但未上线、仍需现场确认，分别标记。

## 线上只读取证

- 2026-10-29 本轮读取 47 实际 Web/Worker 为 `e18780188d02ac92c901b8cf5648b4554aef14e8 / 1793247893`；不能把工作树 3b6 或后续合并说成已上线。
- 活跃模型配置 **v152**：没有 `vision.ocr` binding，也没有 canvas.ocr business，但可见模型 `gpt6Astra` 的已发布通道声明支持 vision。原请求入口未接纳明确选择，属于代码接线缺口，不通过猜测供应商能力或偷偷加绑定解决。
- 脱敏配置只用于本地真实 plan/executor 模块复现。模型服务没有调用真实供应商；本次没有修改生产配置、账号、账务、任务或租约。
- 14:25 BJT 的只读 PG 快照：connections=10、idle-in-transaction=1、blocked=0。仅为当时观测，不据此认定 C09 原因或结束旧事件；没有终止连接/重启服务。

## 独立复核补修

独立只读审查没有发现确定 P1，指出 3 个可达 P2，父已修并加入集成回归：

1. 空占位被上传/生成结果替换后，消费它的 pending-add/pending-link 历史，避免 undo×2/redo×2 同时复活空占位与成品。详情序列和结果同步重试也覆盖。
2. 反推排队/执行中的文字占位不作为可删除对象；删除显示不冒充取消已受理任务，避免排队项被删后仍请求和复活。
3. 同账号/空间内切换项目，已受理结果仍保存并记入起始项目整批历史；仅界面 toast 受当前项目限制。

完整 UI 补测还暴露原普通图片 `add` 历史在撤销最后一图时退回项目网格，导致重做失去原 scope。现在与已有 workflow-add/mixed-add 一样保留空画布；实际新项目上传→空槽上传→撤销两次→重做两次，只恢复两张作品，不复活空槽。

## 集中验证与证据层级

执行根目录为本任务 worktree；完整命令、输入、逐项原始输出和退出码封存在证据根 `artifacts/VERIFICATION.txt`。

| 入口 | 最终结果 | 验证层级 |
|---|---|---|
| `verify-canvas-tool-quote-scope.cjs` | 20 PASS；旧版6项真实复现 | React BillingProvider + 完整 CreationContext/quote Route/校验；SQL/auth fixture |
| `verify-canvas-model-admission.cjs` | 16 PASS；旧版10项复现/正控 | 121完整产品模块、v152配置、真实OCR executor/plan/admission，未知父/旧冻结计划保护 |
| `verify-canvas-node-history.cjs` | 13 PASS；旧版4通过/9失败 | 原函数体、状态及HTTP边界fixture |
| `verify-canvas-upload-reverse.cjs` | 5 PASS；旧版2项复现 | 原函数及异步门闩、同步重试不二次上传 |
| `verify-canvas-issue-integration.cjs` | 4 PASS | 上述3个复核集成问题、结果替换路径 |
| `verify-canvas-reported-tools-ui.cjs` | 8 PASS，6个结果节点、OCR1次 | 完整 Next CanvasClient：抠图/扩图/重构/OCR后改字/标注/纯文本生图实际点击 |
| `verify-canvas-node-history-ui.cjs` | 8 PASS | 完整 Next：空/失败/普通/文字混选，删除/undo，超时相同nonce |
| `verify-canvas-upload-reverse-ui.cjs` | 7 PASS | 完整 Next：5输入、排队删除门闩、刷新错误、上传立即显示、连续撤销重做无幽灵占位 |
| `verify-canvas-text-failure-pg.cjs` | 9 PASS | 独占真实 PostgreSQL，旧行、新列、owner隔离、history restore幂等 |
| `verify-canvas-scoped-history.cjs` | 12 PASS | 原有项目/账号/异步起始作用域回归 |
| `tsc --noEmit --incremental false` | exit 0 | 完整类型检查 |

附加既有回归：历史比例 80 条参数/23 种比例、imagegen capability、Canvas 参数 480 组合/90 JSON与multipart拒绝/5真实route均通过。参数脚本原有两处字面源码匹配落后于既有主线（新增 withCreationRoute 外层、原旧 retried 局部变量已删除），只对齐实际包装及捕获 opts 重试路径，不删参数/冻结校验。scoped-history VM 补充真实 `historyFailureMessage` 与无视图 `active=null` 依赖，原12项断言保持。

所有测试供应商调用 0；完整页面模拟 API，不能表述为真实供应商生成质量/耗时验收。截图已实际打开检查。

## 尚未完成与部署边界

- C09 当时生产请求超时的具体根因仍需 requestId/时间窗或服务日志关联；本轮闭合客户端保留与幂等重试，不把它标为全部解决。
- 新 UI/业务代码须下一轮固定 main 蓝绿发布后才能影响 47 用户；本任务只整合，不执行发布。
- 没有重放截图用户的已受理付费任务，没有声称旧图片/文字记录已批量修复；批量反推错误字段从新操作开始可靠记录。
- 本地空节点与隐藏失败展示历史为当前 CanvasClient 会话能力，不扩大为新增跨刷新持久化。

## 制品

`MODIFIED_FILE.zip`、`DIFF_FILE.patch`、`VERIFICATION.txt`、`ROLLBACK.sh` 位于证据根的 `artifacts/`；原版本在完整 `baseline-source.zip` 与逐文件 `before/`。恢复只作用于独立源码副本，不回灌生产 DB/媒体。最终 main 合并 SHA 与清理状态见 `FINAL_STATUS.json`。
