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

## 第三模块主线同步

模块提交c9d468ba后普通merge main bbc8f784（6提交），生成3e11e593；2冲突：browser-data-cache同时保留既有workspace/revision分区与BrowserCacheStorage、output-advisory测试跟随真实共享controller而非旧单体两个字符串。incoming notice脚本原AST夹具随新owner迁移到原image-task fixture，56原语义断言全通过；未恢复旧页面生成逻辑。browser-cache及notice两项接入既有registry（154→156），证据目录env沿原runner端口，命令不改写。当前无merge状态；main同步模块计数3→0。

首轮合并后tsc exit0；实际缓存Edge/IDB、完整core156/真实PG/实际Next跟随恢复待集中。主线当前6提交全部在候选，候选未合回main、未部署。

## 集中验证首轮与精确修正

固定6e206562完整core首轮29PASS后在image-auto-frame停止：该脚本三模型还要求浏览器显示9:16自动画幅提示，与刚合入用户选定A/B信息提示隐藏冲突。planner冻结wire/完整原参考画幅/单次提交均已通过；只把已选定隐藏的UI提示断言改为notes=[]，保留原请求941:1672/automatic、uiStart=1及服务端warnings全部检查，不修改产品。原报告与41项中3失败字面日志保留core-sealed，未改写为PASS。自有PG容器455f7bfa已清理且端口关闭。

同固定应用完整Next实页8检查已通过：原task ID恢复占位，scope headers、needs_attention原卡更新、cancelled收起且零定位、完成后原结果initialize1/merge1并渲染、重复查询不重生成/不重定位、mobile390无页面溢出、pageerror/external/paid0。其API为loopback fixture，结果节点fixture使用已有作品图片，未做真实视频解码/生产PG验收；2100应用文件逐hash相同，15430/15431端口已关闭。

第二轮cf6bb316：31PASS后parent-completion的25用例均在执行前遇到严格fixture loader的UNMOCKED_IMPORT output-advisory→notice-visibility；既有loader没有登记新纯叶依赖，不是25个产品账务失败。仅增加加载实际notice-visibility模块的精确映射，供应商/结算throwing sentinel不变。core-fixed原失败与PG清理记录保留。

## 最终检查点：模块通过，整体门禁保持OPEN

固定应用/验证c496e36d（全部src/services与原生8检查、完整Linux构建逐hash一致）。完整156原条目均实际执行过，同SHA/digest证据并集153PASS、3OPEN；这不是单次完整core PASS。原runner多次fail-fast保留：29/1旧提示预期、31/1严格loader、92/1 Windows端口EACCES、98/1时间线传输、107/1场景、110/1角色；后续同SHA/env/命令/日志hash验证复用明确登记，补跑其余43项43PASS/0失败/0未跑（PARTIAL/exit2）。`CONSOLIDATED_CORE.json`为证据索引，不伪装required CI全绿；未跑条目0，OPEN三个仍有原始失败。

- OPEN timeline-native-canvas：Windows Next dev在测试清理前退出，控制GET出现ECONNRESET/ECONNREFUSED；独立观察记录launcher exit0，未证明内部退出根因。实际时间线application/matrix/真实FFmpeg已通过，不替代该完整UI门禁。
- OPEN scene-application、character-application：原真实UI节点/标题等待超时，诊断与原日志保留，不把历史R7S通过冒认本轮通过。宿主另观察到committed99,301,576,704B/limit108,740,050,944B及一次WMI内存不足；是环境证据，不是已证明唯一根因。其他任务进程未操作。
- 完整生产Dockerfile候选`sha256:40cf71614aeed3a9b81d71a1b7e994c74faa2ce8c2ed488114b5c64fe00a8042`构建/封装通过；同镜像真实Web/Worker/PG、双browser37通过，浏览器路由/鉴权替换0，180秒混合读取，最终7笔42积分均为隔离fixture。所有容器/内部网络清理及Worker POSIX drain exit0。
- 未绕过full-core PASS门槛启动新的Linux媒体runtime177；R7S177只保留原版本证据。实际Next视频恢复8检查/PG/HTTP各层分开登记。
- tsc/lint exit0，37既有warnings，4类SCC0。原/新跟随21→22检查、14共同轨迹EXACT。候选目录5200文件；四产物/副本回滚与远端以本轮DELIVERY为准。整体ACTIVE、未合main未部署、47 HOLD。

下一步优先收敛上述原生进程/环境生命周期并恢复严格完整门禁，再继续selection和billing→toast职责边界；不以153通过结束整体重构。
