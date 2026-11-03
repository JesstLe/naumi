# 模型映射隔离线整合 main（2026-11-03）

## 用户授权与固定来源

用户最新决定：先核验没有新增回归，再合 main。本轮仅代码整合，不发布服务器、不迁移配置、不收费生成。
- main基线：3ac639d95b6dd0ae6983cb55c1dce3e43092fd44。
- 隔离线固定tip：9d687bf07c244050c0b5423e36282225ac717654。
- 整合分支：codex/integrate-model-mapping-20261103。
- 原模型映射分支继续保留，后续新增实验不自动整合；core-refactor整条线保持排除。

### 纠正之前的归属判断

原映射分支并未整体合main，但单次质量映射修复已由主线提交5365ff529404649fe7f8e5c62aa3f62b223631e7于10/30带入。
两核心文件apimart-preset.ts、image-plan-runtime.ts在本轮main与隔离tip字节一致。
git ancestry和整笔patch-id均不涵盖“另一提交组合中带入相同部分代码”，此前仅据这两项推断修复未进main不准确。
本轮实际剩余产品增量为后台独立图片attempt、草稿/引用迁移及像素标题避让；参数映射保持主线已有修复。

## 模块与边界

- CanvasClient负责按账号/工作区/项目/节点的提交阶段单飞、原位attempt展示与原任务检查入口。
- background-generation仅提供attempt identity、视觉投影、token CAS和空白节点复制，既有client/receipt/报价/账务拥有业务受理和结算。
- draft hooks沿原归属key保留最新草稿与独立object URL，不改引用wire。
- dock-layout纯屏幕几何合并main真实展开与隔离线像素标题保护，不移动节点或viewport。
- 103运维脚本保持显式目标/锁/CAS；47默认活动快照仍all，不清UNKNOWN；这些工具不会随应用启动自动运行。

## 整合冲突与审阅发现

1. 两处冲突：CanvasClient、dock-layout。保留main contenteditable/单body滚动，不恢复旧textarea高度effect；同时接入标题保护及实际header/footer高度。
2. 展开早返回会绕过标题避让：以标题上下最大可用区组合展开，非opt-in展开保持main、收起保护保持103原值。
3. P2：新B成功后旧A失败仍投影“未完成”、当前页原ID检查入口丢失。新增displaySuperseded只隔离视觉；保留旧receipt/closure，已受理或UNKNOWN的独立“检查原任务”按钮只查原attempt。
4. P2：慢prompt保存期A→B→A切选重挂载绕过提交锁。根级scope/node token在flush前占位、受理ACK释放，旧finally按token CAS，受理后新点击仍创建新ID。
5. P2：通用103/site-control after快照漏传taskActivityScope。两处after显式传与before一致的配置值；默认all不变。

## 测试脚手架兼容

- 老103 UI测试仍用textarea且漏持久提示词路由：适配真实contenteditable，新增明确HTTP fixture的prompt GET/POST/CAS，不替换产品组件或逻辑。
- AST动作脚手架补齐主线flush边界及新增根refs；原回调identity比较改为实际ACK回调效果检查。
- frozen-quote-client旧VM缺Event，按真实EventTarget补接口后仍因过时“价格上涨才confirm”断言失败；同main原模块对照同样失败。原业务断言保留，另增当前自动报价/明确未受理有界重报价/UNKNOWN原ID恢复合同84项，候选及基线均通过。
- Python Linux权限测试原生Windows无os.chown；使用网络隔离Linux容器运行原测试，不删除断言。
- supplier-copy103.mjs包含TS依赖，使用tsx执行而不是Node原生解析，原错误留痕。

## 证据与状态

证据根：E:/Workspace/naumi/output/integrate-model-mapping-20261103/。
BASELINE.json固定来源和原始Git archive SHA；ops-before保留两处修正前原字节。
## 集中验证结果

- 提交组件5项、完整client receipt9项、真实Canvas动作11项（含慢保存A/B/A切选与旧任务视觉/恢复隔离）、原fanout15项通过。
- Dock12项、inline22项；实际完整CanvasClient＋本地PG/auth/上传/复制共享7项通过。
- 实际完整Next/ReactFlow后台生成9项、像素与展开18项通过；HTTP/媒体/报价为显式fixture，外部供应商0、pageerror0。
- 真实PG两独立预占/反序完成56项、节点版本CAS/权限16项；单映射63检查17case、供应商迁入选择性回退PG73项、异步实现53项、现行报价/UNKNOWN恢复84项通过。
- 103活动范围11项真实PG，默认all仍保留超预算拒绝、全部旧boot/unknown及原ID；通用finish真实调用表达式6项通过。原生Windows权限测试在Linux网络隔离容器重跑16项通过，未更改原断言。
- 555标题几何、2625碰撞、1920主线原几何；组合对照192主线展开/192隔离收起逐值不变、174扩展标题保护与反复测量稳定。
- 完整Next typegen及tsc exit0，最终补菜单后tsc再次exit0、stdout/stderr为空。

### 最终窄审新增布局问题与修正

静态复核发现每笔UNKNOWN各占一个footer按钮会在窄屏裁掉生成入口。父改为多笔任务共用一个有界SelectMenu入口，逐行仍绑定原operationKey；单笔继续原检查按钮，不删除任何任务。
真实Next新增390×844、同节点三笔丢ACK回归：生成箭头完整且真实命中，三笔全部可从菜单/单笔入口按原ID检查，新增POST0；2检查通过、服务/browser清理。首次附加脚手架错误使用不存在的data-composer-shell，保留超时，改为产品真实data-composer-kind，不改产品迎合测试。

### 失败与证据层级

旧frozen-quote测试保留价格上涨confirm过时断言，候选与main相同失败；现行独立84项合同两边通过，不宣称原套件全绿。
完整Next冷启动首次chunk与测试perf覆盖层反例保留，后续预热实际HTML/chunk并关测试探针通过；无生产操作。
以上本地fixture、真实本地PG、真实Next浏览器分别记录，不扩大为全部模型或生产全链路验收。

完整源码副本回滚、补丁重放、四制品及最终Git SHA登记在同证据根proof/和FINAL_INTEGRATION.json。服务器发布本轮未执行。
