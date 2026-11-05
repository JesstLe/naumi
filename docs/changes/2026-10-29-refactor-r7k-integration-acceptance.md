# R7K 全量集成与原生交互验收

## 基线与目标

工作树 E:/Workspace/naumi-refactor-20261024，分支 codex/core-refactor-20261024，起点 4b59f683。整体重构继续 ACTIVE，未合回main、未部署，47 HOLD。

R7J 已封存119/120及6组Next47；本片关闭完整验收缺口并推进完整Linux候选，不重复新建任务/历史/计费框架。启动刷新origin/main为e9ef9ff6，本轮首先保持既有固定基线定位，后续同步另记，未把远端读到的提交冒充已合入。

## 场景到导演连线

原失败位于 verify-scene-native-interactions.ts:167。只读 DOM 轨迹显示显式fit点击后仍在旧deep-link视图（source手柄在x166/y34并被顶部按钮遮挡），约600ms后实际fit到scale0.440394且source/target均可命中，之后不再漂移。实际原节点在0.5/1/1.25缩放下每次原生拖拽均触发原onConnect；完整原实现加观察等待后真实PG/Canvas/Worker/供应商fixture整链通过。

结论：当前证据支持验收对动画与测量的时序竞争，不支持更改生产节点或连线规则。只把原生手势准备归到 scripts/verification/canvas-connection-drag.ts：两端口均在视口、中心真实命中、几何连续8frame稳定后仅执行一次原生dragTo；无force、无onConnect注入、不重试业务动作。源代码/节点CSS/权限/任务/账务不改。主用例保持原sceneReference、图片/全景、导演输出、历史与冻结工作流断言。

## 运维快照历史测试

旧fixture的supplier outputs缺少真实复合主键，按当前分页协议应为unknown而不是假装已观察；测试夹具补与真实表一致的复合PK。888f旧快照与v3证据的结构差异先保存完整前后，再分别验证共同业务内容与新证据，不通过删除断言/恢复旧生产协议来换PASS。

## 仍待

最终本片集中运行、同SHA全核心、完整Linux Web+Worker及产品/持续负载、四产物/回滚/远端以本片VERIFICATION/DELIVERY为准；容量与required CI及整体main交付仍需真实证据。


### 开发中验证与失败保留

原始全链加只读viewport轨迹再次通过，SCENE_BASELINE_2保留：explicit fit后旧scale1/source约x166,y34被顶部按钮命中；600ms后scale0.440394，之后稳定。首个诊断page.evaluate嵌套命名函数被tsx注入__name导致失败，改成内联无命名回调，不改产品。

运维测试原supplier-output缺PK已补真实复合PK；大行现为unknown-page-byte-limit而非旧unknown-byte-limit，仍断言rows为空，不放宽为任意unknown。full旧新共同表字段全等，新globalLedger另与真实SQL SHA叶逐项相等；proof共同标识/冻结digest/行数/摘要全等，v3新增paidstate/version单独逐字段断言，明确旧证据不可借新收集反向认证。old Snapshot类型不同，compare显式传private DTO。失败日志保留，最终完整33项将在集中组重新运行，不以最后单项通过替代整组。
