# R7V：Canvas 视频任务跟随归属

## 调研与职责

基线8e8e77a2，原始5188文件哈希与完整归档已保存。页面有完整视频任务GET/占位/完成作品定位合并/积分刷新/失败通知/轮询timer，两个去重Set又归页面；effect仅依赖user.email与active.key，未随workspace/target/readOnly epoch变化。任务取消是API合法终态但旧占位清理只含completed/failed。静态疑点须由实际旧函数时序夹具验证，不能冒充生产事故。

## 设计与迁移

- `canvas/video-task-follow` 只拥有观察编排、按原document key分桶的已同步/已提示集合和timer，GET已有任务、恢复原占位、initialize已有结果；无生成POST、无新账务、无history。
- React小hook按现有CanvasDocumentScope与enabled装配，清理timer并退休旧session；页面只给project/geometry/pending/document I/O/credits端口。
- 读取和initialize沿canvasDocumentFetch，认证完成后再核对原scope；原pending/document owner保持。readOnly不启动写恢复；取消终态移除原视频占位，不撤销任务或退款。
- 原80源ID分块/500列表、8/15/12秒、进度5—95、attention卡、原任务幂等恢复与零生成保持。

## 进行中

完成模块后集中原/新调用者A/B及真实hook生命周期、PG/HTTP关键链；第三模块完成后普通整合已记录main bbc8f784，再固定集中验证。不将局部日志/fixture外推生产/10万容量。整体ACTIVE、未合main未部署、47 HOLD。

## 原/新实际调用者首轮

原effect21检查/新版22检查，14共同轨迹EXACT；用实际document-scope及pending owner，React effect生命周期、auth/HTTP/timer受控。旧readOnly不停止follow、旧cancelled占位不退出、退休后的延迟pending updater仍添加节点；新版修正。workspace/target切换的新会话只处理原scope，auth await后旧scope无网络调用；不是线上越权事故或账务变化证明。首轮零付费生成POST。

下一步第三模块同步主线，再固定源码集中验证、完整Next真实恢复/cancelled链和副本回滚。未知任务不重提，账户余额/退款仍归原账务。
