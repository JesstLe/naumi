# R7U：整理画布用例归属

## 职责与调研

基线 7d256ff1（R7T）；本轮刷新 origin/main=bbc8f784，记录6个新增提交，本片不混入主线整合。整体重构仍 ACTIVE，未合main、未部署、47 HOLD。

原 CanvasClient.tidyLayout 同时拥有八类节点的布局投影、文字 flush、history apply/pushUndo、延迟60帧Fit。history自身已校验scope并串行处理，不能把旧用例进入history误记为真实跨项目写入。具体待验证反例：排队Fit只看historyCurrent，用户后来手动zoom/Fit/拖动不会使它退休；flush后切换scope仍会读取新Flow并尝试旧history；旧异步异常会出现在新视图。

## 实现

- lib/canvas/arrange.ts 提供 planCanvasArrangement（纯布局投影）及 arrangeCanvasDocument（应用用例）；smartLayout与flowNodeSize保留原算法，八类成员、锁定/临时障碍、workflowGroup排除及400移动节点原限制保留。
- 页面仅连接既有text/history/Flow/view-controls端口。history仍唯一拥有事务、请求身份、回执、UNKNOWN与单步undo；没有新写API/任务/账务引擎。
- 整理占用原history busy，flush后先核对原view；持久化成功才记undo；旧view错误不进入新视图。Fit绑定原scope和原navigationRevision，新手动导航或新整理会退休旧Fit。
- 等待Flow位置与已保存moves相同后才Fit；最多60帧。位置查找从逐move find改为一次Map，输出与Fit参数不变。

## 验证与证据层级

完整原始5184文件SHA与归档已保存。首轮原调用者23检查/新版25检查，16共同轨迹EXACT；新增400节点等待就绪查找的确定性ID读取计数对照（旧80200/新400），非生产耗时或容量承诺。类型exit0、lint exit0（既有warning保留）；原smart-layout 30混合节点、20随机图、400节点、稳定性/锁定/循环通过，179个无关函数AST相同。

完整Next原生测试实际点击整理时只POST一次、等待回执前节点不动已通过；首轮后续定位器误把真实名称“缩放比例”写成“缩放”，超时exit1，属于测试定位缺陷，不改产品。原生副本Next仅生成tsconfig的自有types include，初次重试全hash guard因此零写入拒绝；核实仅该生成差异后继续。最终原生/固定源码20项受影响回归、类型与架构结果以本轮VERIFICATION/DELIVERY为准。inventory从151到153：新增arrange并将原有smart-layout纳入集中runner，不另造框架。

history/Flow/frame对照端口为受控fixture；完整Next测试也使用loopback HTTP，均不等于真实PG、供应商或生产容量。历史R7S整版150和Linux证据不改标为本轮。

## 未完成

本片封版状态与源码版本以DELIVERY为准；整体剩余选择/视频任务同步编排、billing→toast依赖、性能/容量、有效远端CI及最终main整合验收。R7S整版与R7T原生证据保持各自SHA，不改标为R7U。
