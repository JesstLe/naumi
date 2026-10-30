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
