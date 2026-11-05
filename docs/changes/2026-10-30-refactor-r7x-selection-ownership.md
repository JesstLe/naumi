# R7X：Canvas 选择状态与 Flow 交互归属

## 模块与公共边界

基线 `47cfa595426b099b5f13caf908e56e4b879e0ff5`；独立目录 E:/Workspace/naumi-refactor-20261024。本片继续整体重构，不合 main、不部署，47 HOLD。R7V 同步后第 2 个功能模块，incoming main e4709885 三提交留待按既有节奏整合。

既有 `selection.ts` 继续拥有纯选择规则；新增 `selection-controller.ts` 拥有唯一临时选择快照、现有 CanvasDocumentScope 下的选择命令、Flow 节点/连线选择投影和复制节点迟到呈现。`use-canvas-selection` 只绑定已有 scope 与 React 订阅；页面只连接当前节点目录、Flow 更新与视图工具，无新增文档、持久化、任务或账务 owner。

## 原结构与本次实现

原 hook 是未绑定文档的一个 useState，页面另行实现 group/clear/IDs/toggle、节点/连线/Flow 事件与 copied-node ref/effect/timer。项目/账号/工作空间变化只清了部分字段，原 setter 可继续写下一文档；复制呈现 ref 仅核对 owner/project，没有工作空间 epoch。

本次将这些真实职责迁入一个 selection owner：当前 binding 退休后，字段 setter、事件与延迟 Flow updater 均不改新视图；新 scope 同步得到空选择，不用 effect 先显示旧状态再清理。显式 deep-link、模板/原生节点创建、文字创建与复制导航携带明确目标项目，合法目标焦点仍保留。复制选择等待真实节点出现，保留原 1500ms 等待窗口；用户新选择、scope 退休或过期收起该投影，旧 timeout 不覆盖替代投影。

原选中规则、Ctrl/Meta/Shift、group、只选连线后 Delete、清多选但保留原焦点、hand/running-task 跳过、原 history、原 operation/报价/UNKNOWN 保持。兼容字段 setter 继续服务现有调用方，只有事件编排/临时呈现退出页面。

## 验证设计与当前状态

新增 actual React DOM verifier 运行原 hook/页面事件与新 owner，使用实际 document context；Flow、workspace、auth 和 timer 是显式端口，不冒充完整 Next/PG。基线复现项目/账号/工作空间 ABA 和迟到 setter；共同轨迹比较原选择事件与函数式 setter。新例覆盖延迟 Flow updater、显式目标导航、复制等待/取消/替换 timeout/作用域隔离。

集中执行类型、依赖架构、现有交互/节点操作/拖动/快捷键/复制/历史/生成邻接回归，并用完整同盘源码副本验证实际 Next 控件。具体命令/输入/字面输出/exit、失败准备记录、完整包与副本回滚结果在封版补齐；本节设计不等于已通过。

整体 ACTIVE；Canvas 其它交互/展示职责、原生 dev 退出根因、完整 core、有效远端 CI、性能容量与最终整版 main 整合仍继续。


## 最终应用与实测闭环

最终应用/集中验证源码 `ca694d87202422722ac96a3ffc2970302884355d`；完整 5206 文件副本逐 hash 对齐。新增浏览器脚本准备期间的独立提交只改验证文件；最终原生与核心受影响矩阵全部重新绑定 ca694d87，没有借用旧版本通过计数。

- 实际 React DOM：基线 20 检查复现跨项目/账号/workspace ABA 的旧选择及迟到 setter；新版 31 检查、16 共同页面事件轨迹 EXACT，包括 Ctrl/Meta/Shift、组选择、右键文字/占位/失败任务、edge、Flow 和函数式 setter。新 owner 验证延迟 Flow updater 退休检查、合法目标项目焦点、复制等待/新选择取消/timeout 替换/到期以及跨 workspace 隔离。
- 同 SHA 受影响库存 16 项全部 PASS／0 FAIL／0 NOT_RUN，runner 对 subset 正确保留 PARTIAL／exit2，不写成完整 core158 PASS。完整 TypeScript exit0，全项目 lint exit0，37条既有 warning；runner 自测12/205、交互34/92和节点操作19/59通过。六类原生文档 actual hooks68/106与真实隔离PG/HTTP6/146通过，scope/单次原请求/原账务均保持。
- 完整 Next/ReactFlow 实际浏览器：交互12项，节点操作11项，选择/项目导航6项，共29项全部 exit0。包括多选拖动、只删连线、撤销重做、原operation UNKNOWN、复制已保存但读失败后只取原结果、mixed复制/删除原回执、双击批量仅原两次提交、同项目重开无旧多选、换项目无旧dock、复制焦点与迟到timeout不污染。供应商为本地fixture，paidCalls0；不冒充真实PG或生产验收。
- 浏览器额外发现同项目重开选择残留：在完整中间应用297358bf上用最终probe实测 `2 !== 0`／exit1，旧快照未动。最终 ca694d87 将新建、打开项目、回项目列表改接同一 reset，当前实测0，保留合法跨项目创建/复制焦点。
- Canvas4968→4879行；页面退出选择实现与复制ref/timer，保留窄兼容调用。只改两个既有产品文件，新增一个selection owner；其余2098原src/services文件hash完全一致。旧selection纯规则、history、任务、账务、SQL和provider都不改；四类SCC0、运行时lib→UI0，既有type-only边单列保留。

## 准备失败与保留记录

首轮把TEXT_IMAGES夹具额外两条文字混入既有interaction整数组断言，实际10项先通过、随后因数组长度预期exit1。自有Next custom dist又自动格式化/扩展自有副本tsconfig，完整raw hash漂移明确记录，未计完整source通过。重建新完整副本，沿默认.next，使用原库存跑原suite；新导航probe自行通过原text API建立B项目。最终5206文件前后hash全相同，原失败不改写。

既有interaction脚本在完整原版同样错误期待Ctrl文字点击仍聚焦，而当前原函数实际返回null；先复现再只修fixture预期与scope hook接线断言。旧unregistered batch-workflow contract原版就因旧clipboard import静态断言失败，试查后恢复原脚本未改，不计通过。没有为旧断言重新引入重复选择状态。

## 回滚、交付与整体状态

完整原始5202文件基线、完整5206新包、byte-exact patch、VERIFICATION与可执行ROLLBACK由本片证据目录统一交付。回滚只对独立完整副本，所有目标hash先检查再写；后续编辑应零写入拒绝；恢复原hash和20项旧选择复现行为，开发树保持新实现。实际封版结果以 `output/refactor-r7x-20261030/DELIVERY.json` 为准，源代码验证绑定与归档证据文档变化分开。

所有自有Next端口15436/15437与集中PG资源已退出/清理；浏览器本地fixture的进程树由测试生命周期结束，exit1为停止后的进程状态，不是已通过脚本的exit。生产/他人资源未操作。

整体仍ACTIVE。当前第2/3模块；下一片应先接最新主线并验证完整固定候选，不继续用局部通过替代整版退出。历史Windows原生dev退出原因、全core158与受门禁Linux runtime、性能/容量、有效required远端CI、最终普通合main及整版交付继续保留。独立整体候选超过48小时的事实与用户整体交付方向继续明确，未合main未部署，47 HOLD。
