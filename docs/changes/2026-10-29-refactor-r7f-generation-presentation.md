# R7F：Canvas 生成展示状态归属

## 模块与职责

生成活动在R7D已统一，但task card、占位坐标/尺寸、失败卡及busy Set仍由整个Canvas页面无作用域持有。本轮将这份实际展示状态收拢到 generation-presentation，并按已有artwork document scope.key（账号/工作空间/项目）绑定；hook只订阅当前binding。异步回调捕获原binding，不再通过页面当前ref改别的view。沿用原task/controller和原activity，无新网络、任务、账务或history框架。

## 生产迁移

- 普通生成与详情批次的创建、失败替换、stage/progress、失败重试卡、删除和坐标占用归owner。
- 同步编辑、Comfy和空白节点的活动也使用同一binding；scene/batch选择只观察当前scope的busy与task卡。
- 拖动实时位置供原attachment读取，每次pointermove不通知全Canvas；结束才提交展示位置快照。原pend/edit状态与持久化仍在原owner。
- 页面删除三个raw ref、task useState与直接setGenerationTasks；实际所有生产写入进入owner。原请求/引用/计费/原结果controller不变。

## 基线与验证

基线905d5d83完整4953实际文件已逐hash归档；普通整合main81c2cb7b仅文档1提交。本轮集中验证在完整切片实现后执行，结果如下。原React四声明与原Canvas函数作为baseline，modified用实际hook及owner；验证跨project/account/workspace卡片、busy、布局占位和原binding迟到更新，补实际runGen/detail入口与原controller。

## 未完成边界

本模块只拥有生成展示，不接管pending编辑文档/执行器。整体ACTIVE；性能/INP/容量、剩余UI/renderer状态职责、有效远端CI和最终main整合仍待。历史MEDIA_STATE_WRITE_FAILED原生errno仍OPEN，不以新fixture通过关闭。未合main、不部署。

## 集中验收结果

- 完整905d5d83基线：实际React/Edge及原Canvas runGen/detail调用者 **6组39检查**，复现跨project/account/workspace的foreign task/busy/layout各1。新版 **8组46检查**，三种foreign均0；同ID迟到回调、旧view取消订阅、失败重试保留拖动anchor、hide保留/remove释放anchor通过。100次pointermove不唤醒整Canvas；该结果不是全站INP基准。
- 原图片任务47/179、详情/编辑74/369、generation activity38/134、request/workflow39/88通过。原controller、prepared intent、冻结报价和账务代码未改；unknown不自动重POST，已知结果只续交、已知任务只查询。
- 相邻scene30/103、interaction34/92、result placement6/6、原progress曲线和runner12/146通过。新增case注册到唯一refactor catalogue（105入口），runner传递独立evidence目录；不把注册等同远端required CI生效。
- 当前完整Next/ReactFlow **三个独立控件命令**：原位生成7（4种geometry/失败原图保留）、详情/扩图5（原任务恢复/一次undo）、interaction12（拖动/连线/撤销/unknown原请求）通过。源码字节副本运行，HTTP/账号/媒体为本地fixture，未用产品PG或真实供应商。真实hook隔离切换和全Canvas控件分别验收，不声称在完整Canvas上执行了跨账号切换用例。
- 全项目tsc exit0；最终lint及四类SCC结果以VERIFICATION为准。Canvas5778→5734行。既有src/services仅Canvas接线与generation-activity通知两文件变动；其它2035产品文件hash一致，新增owner/hook两个文件。不增加表、网络/计费owner、确认或业务上限。

## 失败与修正

全部初始失败保留在output/refactor-r7f-20261029/FAILED_ATTEMPTS.json及原日志：

1. 初版presentation夹具预期layout spacing144而真实owner为132；VM Flow端口缺getNodes。只修期望与fixture API。
2. 相邻scene旧fixture缺director/character/audio/timeline/scene五个可选callback，原完整基线同失败；补齐输入后30/103通过，产品hook不改。
3. 旧image-task browser仍期待普通生成派生新节点，但R6W已是原位替换，且其response没有canvasAttachment。原exit1保留，不把旧协议测试当成新版业务结果；改用已有原位browser。
4. 原位browser夹具只改revision未回canonical canvasImageVersionId，实际产品版本校验正确拒绝。只补夹具canonical版本字段后完整7项通过，未放松版本检查。
5. 首次lint新增positions依赖提示；接线补齐依赖，不抑制规则。其它原有warning另列。

## Git、产物与继续路线

R7F基线905d5d83；整合81c2cb7b仅1条文档提交，后续main b15bbdfd的X5等6提交记录为下一切片待整合，不在本片追赶或冒充已包含。固定源码、远端SHA、原始hash、四产物及独立副本恢复后行为以output/refactor-r7f-20261029/DELIVERY.json与VERIFICATION.txt为准。

四产物为同目录MODIFIED_FILE.tar、DIFF_FILE.patch、VERIFICATION.txt、可执行ROLLBACK.sh；只在独立副本恢复基线，不覆盖工作树或用户数据。完整core105、完整Linux镜像/runtime和全产品PG/账务本轮未重跑；不借用R7E旧SHA结果代验。

<span style="color:#b91c1c">整体重构分支超过48小时：仍按用户独立整体重构要求持续推进，未达到完整版本退出条件，阶段提交只推独立分支，尚未合回main或部署。</span>

下一实际边界：pending/edit占位与保留恢复状态仍属原页面/retained任务映射，需要单独核实document/task和展示的归属；不再次迁移本轮已完成的generation card/busy/position。继续实际变化传播/INP与容量、有效远端required CI、最终main整合及完整版本退出；历史媒体状态写盘原生errno根因保持OPEN，不因当前scene通过关闭。
