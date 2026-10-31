# R8K：Canvas节点创建用例归属

## 模块与职责

基线eb84d55896476768baa1e31f2dcfe46f1fc97b6b，独立目录/分支不变。普通fetch后主线待整合0；R8J验证能力切片不增加产品模块数，本片为同步后第2个产品模块。完整5285原文件字节/归档已保留。

Canvas原来直接编排三套创建：空白/连线图片、多参考图片、文字节点；坐标、序号、pending/text追加、原history、选择/draft/焦点及文字保存混在页面函数。新增`canvas/node-creation`应用用例，页面只提供现有document/history/presentation和几何端口，并用同一入口分派八类既有节点动作。不是把新表、任务队列、保存引擎或万能store搬到另一个目录。

## 公共接口、依赖方向、状态与事务归属

- `createCanvasPendingAtScreen`：沿原viewport/零zoom回退计算坐标，沿共享pendSeqRef派生原ID，追加原pending，写一次原pending-add history，再调用原选择/focus呈现。
- `createCanvasMultiReferenceNode`：原已选图片判定、输入顺序/原上限、真实Flow尺寸投影、最右侧/平均Y、原group文案及一次history集中在本用例。几何端口提供节点位置/宽度，模块不依赖ReactFlow运行时。
- `createCanvasTextAtScreen`：调用既有newCanvasText，不复制字段规则；沿原document追加→导航/选择/prompt→原focus矩形→原text-add history→原save顺序。真实文字尺寸与原300×176focus矩形分别保留，不借重构改变布局。
- `dispatchCanvasNodeCreation`：八类入口复用既有concrete actions；readOnly与video feature的原判断不变，不增加新业务权限或模型路由。

pending数据继续归pending-presentation，文字数据/持久化归text-document，undo/redo归history；页面只拥有呈现/React生命周期，序号仍是编辑器共享的原pendSeqRef，文字生图和上传共用该序号的路径未改。函数为同步创建用例，不创建/重放生成POST，不改变报价、钱包、UNKNOWN、供应商或原素材归属。

模块只依赖现有纯规则、geometry及type，不依赖React、Next、组件、DB、fetch、浏览器存储、timer。原focusEditableCanvasArea的延迟实现仍在原视图适配，未把它冒称本轮已修复或新建另一套scope。

## 验证记录与证据层级

实际原Canvas三个创建函数及八类分派共27场景，不使用手写副本；VM只记录已有document/history/presentation端口，newCanvasText/flowNodeSize为实际模块。修正夹具X_GAP100与真实90的不一致后，原27checks、改后30checks，27场景的节点字段/输入顺序/ID/坐标/历史/导航/选择/draft/焦点/save全轨迹EXACT。覆盖匿名空白、文字真实登录判断、只读、force新项目、重复/超量sourceIDs、共享序号、无Flow及zoom0、多参考16输入与八类创建。不是PG或完整浏览器证明。

初次baseline路径捕获末尾NUL空项、首次夹具gap错误及原始无效结果均单列保留；原误配结果不充当通过证据。实现后统一执行类型/受影响矩阵、完整core及固定完整Linux应用，未运行结果不记通过。最终命令、字面输出、退出码、四产物与副本回滚见本轮DELIVERY/VERIFICATION。

## 未完成项与下一步

继续剩余Canvas Shell组合、端到端调度等待诊断、有效CI、最终完整main整合和生产验收；R8J测量仍只归原c146完整镜像，不冒用为本轮测量。整体ACTIVE、未合main未部署、47 HOLD。**分支超过48h因用户要求独立整体候选，完整退出尚未满足；本片不替代整版交付。**

既有local-node-history、node-entry-models、node-operations验证器跟随实际页面→创建用例→原document/history链，不恢复已迁出的内联规则；原undo/redo、原请求/回执与参数断言保留。


集中core首轮在4e8bb178为109PASS/1FAIL/75NOT_RUN，shared-history VM缺少实际pendingNodeCreationPorts编译，不是undo规则被删；修正后原16条history断言保留。旧node-entry-models首次适配的CommonJS module变量冲突已修；原baseline同时复现其旧静态selector检查，验证器现在沿真实CanvasImageComposer→CanvasImageGenerationControls→CanvasModelSelect，不恢复旧inline组件。该独立旧验证器纳入统一catalog，目录185→186。原失败、baseline、输出副本验证和PG清理均留证，产品两文件不随夹具修正改变。

第二次全core在c72c0672为78PASS/1FAIL/107NOT_RUN；admin-shell旧夹具在setState尚未commit时立即读count得到旧10而非1。夹具App用layoutEffect回执实际committed revision，navigate等待同一revision，原导航/数量/权限/键盘断言不变；无sleep或产品后台改动。初次4e原92产品已通过，仍只归其固定源；最终全量将重新固定，不跨SHA拼绿。
