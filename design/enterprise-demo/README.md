# 企业协作 Demo（2026-10-17）

## 当前增量：V2同表多视图

见[详细V2 PRD](../../docs/enterprise/team-scheduling-v2-prd.md)和[实施记录](../../docs/enterprise/team-scheduling-v2-implementation.md)。默认五个视图，支持独立配置/草稿/版本/个人视图，新增/复制/重命名/排序/归档恢复；任务只存一份。

“按设计师分组”保留源标签名，但当前实际是按任务排期情况分列的看板。设计器可设置表格/看板、父锚定分组、填色规则、卡片字段及顺序、空列、选项与列序/颜色。修改排期标签需要原因，不更新完成状态、日期或贡献事实。

V1键保留，V2键`naumi-enterprise-workbook-v2`在首次成功保存后建立。多标签本地旧快照提示不代表正式数据库CAS。

只读预演工具（标准库Python，无Excel写入）：

```sh
python design/enterprise-demo/tools/preview_import.py SOURCE.xlsx --output LOCAL_PREVIEW.json
python design/enterprise-demo/tools/preview_import.py SOURCE.zip --output LOCAL_PREVIEW.json
```

在团队排期“导入预演”选择JSON；只在内存展示，支持问题筛选和CSV，不导入业务数据。原始资料/预演JSON只存本地忽略输出目录，禁止提交真实数据到Git。当前只支持单工作表主xlsx，不合并多表，不恢复未导出的权限/自动化/账号ID。

集中验收：`node design/enterprise-demo/release-check.mjs`；`python -m unittest discover -s design/enterprise-demo/tools -p test_preview_import.py`。浏览器运行`workbook-browser-check.js`、旧排期与工作流脚本。源码仍是原型，生产SSO/权限/DB/附件/上线独立验收。

## 打开

直接用浏览器打开 `preview.html`；单HTML包含全部CSS、JS、图标和矢量商品示意，不依赖npm、CDN或后端。可选本地HTTP：

```powershell
python -m http.server 18482 --bind 127.0.0.1 --directory design/enterprise-demo
```

浏览器访问 `http://127.0.0.1:18482/preview.html`。这是本地预览，不是生产地址。

## 已做

- 浅色企业侧栏/工作台：任务统计、队列、趋势、团队工作量和动态。
- 8视图：工作台、需求中心、任务中心（表格/看板）、团队排期、素材与交付、贡献与绩效、成员与团队、归属规则。
- 5角色：运营林可、设计主管陈序、设计师许知、美工周然、验收人沈悦。
- 新需求表：品牌/店铺/类型、日期/优先级、说明、交付规格、紧急原因与本地文件名；按表归属预览。
- 未匹配店铺进入待分配，可由主管人工决定归属；不随机派给员工。
- 主管审核/拆单：设计与美工串行依赖或单类任务；派单后员工确认，也可直接认领。
- 执行/阻塞/恢复/进度/提交；评审返工/二稿/验收；全任务验收后需求完成、运营签收。
- 贡献事实按任务唯一记录，CSV导出；只做事实，不做最终评分或薪酬。
- 素材预览/内嵌SVG下载、本地文件选择；不上传文件内容。
- 浏览器localStorage保存示例状态、刷新恢复、重置、抽屉焦点管理/ESC、390px布局。

## 建议体验

1. 右上切运营，新建需求，观察自动归属。
2. 切主管，进入需求审核通过，拆分并发布任务；可在任务详情指派。
3. 切设计/美工，确认或认领，开始制作/更新进度/提交；串行任务需前置验收。
4. 切验收，退回修改或确认通过；看贡献事实及运营签收。
5. 左下重置可恢复初始数据。另选“其他店铺”体验待分配。

## 明确边界

仅前端本地演示，全部人员/品牌/店铺/任务均为合成样例。角色切换不是真实SSO/RBAC，不具备多人并发/跨浏览器一致性；localStorage可由用户修改。钉钉、聚水潭、生产账号/素材/数据库和上一轮工作流服务均未连接；不发真实消息、不执行付费创作、不上架。
排期负载与7天趋势为标记的示意数据，不能用于真实考核。日期固定2026-10-17用于稳定评审。

## 团队排期可配置业务表格（2026-10-17增量）

详细目标：[PRD](../../docs/enterprise/team-scheduling-prd.md)；[契约](../../docs/enterprise/team-scheduling-contract.md)；[实现与验收](../../docs/enterprise/team-scheduling-implementation.md)。

- 产品父记录/制作子记录、执行人/需求方分组、筛选、任务详情与状态流程入口。
- 编辑布局：列顺序（拖动/箭头）、显隐、宽度（表头拖动/数值）、别名、预设配色、行密度、摘要与表格+周排期。
- 团队草稿、发布版本、历史恢复；个人视图按演示账号隔离；恢复布局不回退任务。
- 自定义文本/数字/日期/单选；归档保留值；字段结构操作独立保存。
- 排期编辑写回同一任务，原因日志；跨日周表、示例工时均摊和超配提示。已验收锁定，执行中转派交正式交接。
- 配置保存在`naumi-enterprise-scheduling-v1`，业务仍用原键。点击全局“重置演示”会一起恢复。
- CSS/JS模块编译进单HTML；无新依赖。小规模原型使用原生树表验证交互，正式大数据Grid选型/许可/虚拟化仍需专项验证，不声称本原型支持万行性能。

建议：主管→团队排期→编辑布局→调整列/创建字段→保存草稿→退出→重进→发布→编辑任务计划→周排期；再切设计师保存个人布局；最后用版本记录恢复布局。

集中检查补充：`node design/enterprise-demo/schedule-tests.mjs`；在真实浏览器执行`schedule-browser-check.js`。后者覆盖42项DOM验收，原工作流脚本仍覆盖36项。正式多人、身份/行字段权限、真实附件、钉钉导入/通知均未接入。

## 构建与集中验证

```sh
node design/enterprise-demo/build.mjs
node design/enterprise-demo/verify.mjs
```

`browser-check.js` 是在真实浏览器页面上下文执行的集成验收脚本，走DOM控件，不是后端验收。36个检查覆盖8导航、看板/筛选、提单/归属/拆单/依赖、指派确认、执行/阻塞/返工/验收/签收、待分配、贡献去重及浏览器错误。另检查刷新持久化和390px八视图/表单无全页横溢出。

源码修改后重新build生成`preview.html`。不将独立Demo直接覆盖`src/app/enterprise`；UI确认后再接真实业务服务和权限。
