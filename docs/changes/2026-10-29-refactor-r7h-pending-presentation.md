# R7H：Canvas 占位与原编辑恢复的状态归属

## 问题与边界

完整基线 e5a94330，独立 `E:/Workspace/naumi-refactor-20261024` / `codex/core-refactor-20261024`。继续 R7F/R7G 的剩余切片，不重复实现 generation-presentation、edit-task、detail-task-controller、结果 attachment 或 billing 机制。

原 CanvasClient 同时拥有全局 pendNodes、可变 ref 和 editTaskStateRef Map；空白、导入、详情和编辑的展示与保留逻辑散在恢复、拖动、删除、进度、失败处理里。Map 按裸 placeholder ID 索引，即便记录附有 account/project/workspace，另一 scope 的同 ID 仍能覆盖原记录。旧异步 setter 指向全局数组，组件本身承担判断谁能更新谁的责任。

## 本轮所有权

- `canvas/pending-presentation` 只拥有 session-local 展示数据：每个既有 document scope.key 的 records/order、保留标记、拖动坐标和 React 快照。保留标记只引用同一条 canonical record，不复制第二份节点状态。
- 小型 hook 只订阅当前 binding，readOnly 时不展示可编辑占位；旧 binding 的迟到进度可以更新原 scope，不能改当前其他 scope。卸载由 React subscription 解除。
- edit/detail 在创建时捕获原 pending binding；占位摆放、同操作失败卡替换、显式删除、离开视图清理 transient、返回恢复均通过 owner。
- 拖动过程只更新 canonical record，不逐帧渲染 Canvas；提交时发布最终位置，结果落地读取 live position。
- React 不再拥有 editTaskStateRef 或全局 pending useState；pendNodesRef 仅是现有同步调用者的只读当前视图投影，不拥有写入与恢复。

任务创建/恢复、已保存原结果、原 operation、冻结报价、鉴权、余额与单次结算继续原 controller 和文档 owner。没有新表、HTTP、任务引擎、确认、费用或限额。UNKNOWN 不自动重提，已知结果只续接。

## 集中验证

新增实际 React hook / 完整基线 state A/B，覆盖 account/project/workspace、同 ID 隔离、迟到进度、readOnly、卸载、100 次 live drag、transient 与 failed replacement；实际 Canvas cutout/detail 入口继续复用原脚本，只增加真实 owner 接线，不复制规则。并对原图片/详情/活动/结果/history/scene 链集中验收。

测试、类型、结构与真实应用验收分层记录在 `output/refactor-r7h-20261029/VERIFICATION.txt` 和 DELIVERY.json。实现阶段尚未填通过数字；最终记录以原日志为准。完整 core/Linux 产品及容量不是本切片的默认通过结论。

## 交付及后续

四产物、原文件 SHA、完整源副本回滚、恢复后旧行为、补丁回放及远端 SHA 在同目录封存。原工作树保留重构实现；不合 main、不部署，整体目标 ACTIVE。main 的更新另记，不把追赶主线替代本切片，也不将历史 MEDIA_STATE_WRITE_FAILED 原生 errno 根因标关闭。

后续继续减少 Canvas 业务回调/外围组装的变化传播范围、同场景 INP/容量、有效远端 required CI 及完整版本最终 main 整合退出。
