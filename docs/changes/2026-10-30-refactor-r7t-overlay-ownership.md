# R7T：Canvas 浮动层布局与测量归属

日期：2026-10-30。工作树 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。整体重构 ACTIVE，未合 main、未部署，47 HOLD。

## 基线与调研

基线 `c9facaaa0960956a6613a9310e084e6f7c482c1f`，完整5181 raw SHA256及完整源码包保留在`output/refactor-r7t-20261030`。开工fetch的main仍1754dad4，没有新增主线差异，不重复整合R7S。上轮完整core150/完整Linux同镜像177+52+37保留原版本，不冒称本片已验证。

页面仍直接拥有131行浮动层编排及7处测量ref/state：同一锚点的render projection、每帧DOM跟随、最小pan、observer订阅分散在页面；扩展新浮动层必须触及页面生命周期。既有`dock-layout`负责纯几何，本片不重写其碰撞算法、不新增全局布局manager。

## 模块、接口与归属

- `lib/canvas/dock-layout`：原碰撞/停靠规则保持，增加`canvasOverlayNodeScreen`与`canvasAnchorViewport`纯函数，明确节点矩形、viewport、可视尺寸/安全区输入；不导入DOM/React/数据库/Next。
- `components/canvas/use-canvas-overlay-layout`：拥有panel/text/toolbar/rename四refs、测量state、ResizeObserver、锚点/尺寸变化的最小pan与稳定live viewport callback。读取现有selection及几何，不拥有文档、history、任务或账务。
- Canvas页面：用窄selection、画布尺寸、原Flow/viewport refs和原view-controls zoom端口组装；保留用户交互和渲染接线，不再实现第二套浮动层测量/跟随算法。
- 原image/text/native文档、history、selection、generation owner保持。不会将“整理布局”写事务迁入展示hook，也不会新建任务或内部HTTP。
- 当前文档/视图context改变时observer重绑；已退役observer的callback及延迟state updater保持原视图身份，不读取新文档DOM。

## 集中验证协议

新verifier执行实际React和DOM测量：原完整overlay block与新版hook/pure geometry，对照25种viewport×节点及expanded/readOnly/缺锚点/menu/拖动/换锚点，common traces逐项比较；实际ResizeObserver订阅与可控退役callback检查同ID切文档及image→text切换。Flow imperative port受控，不冒充完整ReactFlow页面。

同一原回归目录新增canvas-overlay-owner（150→151）；旧dock collision静态检查跟随实际测量owner，原2625组碰撞安全断言不删除。模块完整后统一跑类型/lint、原几何、任务/控件受影响链和实际Next响应式控件；结果只以实际REPORT/DELIVERY为准。

## 交付与未完成

四件最终材料为MODIFIED_FILE.tar、byte-exact DIFF_FILE.patch、VERIFICATION.txt、可执行ROLLBACK.sh；独立副本恢复原5181哈希，并验证原observer/context行为，late edit先guard后全零写入拒绝，开发树保持新版。完整命令、literal输出、退出码和远端由DELIVERY登记。

整体仍需剩余Canvas文档/选择/布局应用组合、toast反向边、变化传播/受控性能对照、有效远端CI、容量与最终普通main整合。上轮GitHub账单导致job0steps失败未由本片修改账户。新hook少行数不是整体完成。

## 已执行的模块验证

- 原实际React/DOM10项，31共同轨迹；新版12项，原31轨迹逐项EXACT。原同ID切文档后新的dock DOM未被observer订阅已复现；新版重绑并忽略退役image observer，不将受控回调说成线上事故复现。
- 类型exit0，lint exit0；纯几何2640场景（2490 legacy exact +150既有窄屏规则）、碰撞2625场景通过，数值/原安全区保持。
- 首次verifier误把真实ResizeObserver测量造成的React render也认作live callback强制渲染，原/新都exit2；修正为检查callback本身不触发render，保留observer实际测量，未改产品来迎合测试。重命名view需要的nodeScreen输出漏接已补齐，原tsc非零日志保留。
- 新增geometry仅从页面搬出规则并由模块复用；`projectOverlay`是render/live共用的唯一组装点。原viewport、document、history与账务未迁移。

实际完整Next/ReactFlow原参考链9检查与5个响应式视口通过，真实控件操作/输入像素/原版本及undo-redo/失败重试保持。初次完成后消除新hook新增的依赖warning并移除页面退役import；最终同源native另存记录，不把初测哈希改写成最终源。
