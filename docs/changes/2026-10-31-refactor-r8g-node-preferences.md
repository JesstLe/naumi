# R8G：节点偏好读取、投影与共享历史归属

## 基线与范围

完整基线 `80e317ad2ff3f817a83173d2a724c0462de289b6` / 5257文件已保留原始SHA和tar于 `output/refactor-r8g-20261031`。本轮处理Canvas遗留的节点锁定、层级、文字样式读取/本地缓存/提交与历史回放，非机械编辑器JSX拆分。

## 职责和依赖

- `node-settings.ts`仍拥有既有schema、默认值和文字样式纯规则，接口不变。
- `node-preferences.ts`拥有账号/工作空间/查看对象级偏好快照、加载状态、读取与已提交回执的合并、UI提交准入；不依赖React、DOM、Fetch或DB。跨项目共享同一账号偏好，跨账号/工作空间ABA重新建立桶，旧读不提交到新身份。
- `node-preferences-browser.ts`复用原GET和document headers，只在原DB-less fallback读写本地key；personal原key兼容，其他workspace不借用personal数据。服务端成功数据不再重复镜像到本地。
- `use-canvas-node-preferences.ts`只组装并订阅；稳定get/locked为原拖动/缩放回调读取最新值，不为每个节点再建状态。原页面仅保留翻译、图标、选中节点及窄事件adapter。
- 提交全部走原 `canvasHistory.submit`，与文字/图片/连线的原请求身份、串行恢复和撤销栈共用；不再由属性事件自行apply+push另起一次意图。原UNKNOWN先恢复再准备新设置，from在恢复后按最新偏好取值。
- 六种原生节点kind来自原 `CANVAS_NATIVE_NODE_KINDS`/document适配，一处维护；不建插件注册器或平行保存接口。

## 必须保留与待验证

原锁定/解锁、层级边界、文字样式、原生六kind标志、只读不写、GET失败不冒充空成功、本地fallback、共享history undo/redo保留。原项目已提交回执可在同账号项目导航后投影，迟到账号/工作空间请求隔离。加载开始后已提交的设置/工作流导入不可被慢读覆盖。

本轮集中验证计划：原页面函数/原Effect与新owner反例、真实React加载与workspace ABA、共享history lostACK恢复/原body/一次undo；原生属性控件与真实PG历史，完整类型/lint/四依赖图、同固定镜像Web/Worker与副本回滚。所有“已通过”以后续实际日志更新，不把计划当证据。

整体ACTIVE；本片为主线同步后第2/3模块，未合main/未部署，47 HOLD。现有任务/冻结价/账务/供应商链不改。

## 模块实现与第一批集中验证

实际原页面Effect/函数+原document/history controller：基线16项 REPRODUCED；新版25项 PASS，慢读覆盖1→0、旧workspace锁1→0、lostACK写入身份2→1。新增typed lock/front/back命令在原UNKNOWN恢复之后计算最新from和层级，保留文字样式及±100000边界；只读/未ready/shared busy、账号与workspace ABA、读取合并/删除和原browser local key隔离均通过。属性写入身份不是付费生成或重复扣款证据。

实际React DOM原/新各6项：workspace原GET1→新GET2，已确认order42原被覆盖0→新42；原项目导航不重复GET，冻结headers与迟到读取通过。HTTP/auth/工作空间是显式端口，不冒充真实PG。原history67用例/184检查及text-document21用例/58检查原断言保留，最终同SHA集中重跑以REPORT为准。

类型exit0，lint exit0/既有38warnings无新增；四种依赖图SCC均0。架构扫描在首次dirty阶段只统计tracked文件（3个新owner尚未入索引，4条未解析），固定源码后再扫，不隐去该边界。静态node-editing gate旧80e基线原有arrange内联断言失败：原规则早已在arrange owner，现改查实际owner和页面locked连接；该旧gate失败不是产品缺陷，原日志NODE_EDIT_INHERITED.log保留。

完整产品验收扩展原双浏览器流程，新增真实属性面板暂存→原history POST→PG设置→实际textarea样式、锁定/解锁、层级、共享undo/redo及刷新。只读PG observer复用原fixture pool，无新HTTP或产品写路径。夹具文字ID改为真实产品text-前缀（text-r6c），四个调用方同步；避免把旧image形状的r6c-text冒充真实文字kind。固定镜像与这批产品验收尚待执行。
