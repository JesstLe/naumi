# SaaS 后台设计验收

更新时间：2026-10-23。负责人：主代理；实现负责人：GPT-6.1 Sol high。

final result: blocked

当前阻塞：新增供应商余额模块与分支整合后的回归尚待完成；视频工作流持久恢复还缺根记录与冻结scope。三张核心页面、钱包落点、移动成员布局、双会话范围、平台退出与普通用户深链登录修订已复核。M04当前writer已整合且有真实本地PG/故障fixture证据，不能将已发现的工作流缺口算作通过；正式构建和合入新增视频/Agent入口后的验收仍待收齐。本报告不表示生产验收或发布完成。

## 比较目标与环境

- 视觉原图：`docs/design/saas-admin-20261022/platform-overview.png`、`tenant-creation-detail.png`、`enterprise-overview.png`，均为 1487 × 1058。
- 实现：本分支真实 Next 应用，`http://127.0.0.1:18499`；独立本机 PostgreSQL `saas_admin_fixture`，供应商调用 0。用户、企业、图片、积分均为明确标记的 fixture。
- 浏览器：Codex IAB。桌面实际 CSS viewport 为 1440 × 1024；浏览器缩放 1.28，因此 viewport API 设为 1843 × 1311，再用 DOM 和截图尺寸核对。截图有垂直滚动条时为 1432 × 1019；无滚动条时为 1440 × 1024。移动实际 CSS viewport 为 390 × 844，滚动条内内容宽 382；API 设置 499 × 1080。
- 对比去除浏览器外框，源图归一至实际截图尺寸并合在同一输入中查看。原图的演示数字、产品图片、租户名与本机 fixture 不同，这些差异不作为数据错误，也不伪造演示增长率。
- `platform-initial.png` 为识别 IAB 缩放之前的截图，不作为有效桌面对比。正式用 `platform-desktop.png`。

## 比较证据

| 页面 | 实现截图 | 同输入全景对比 | 局部证据 |
| --- | --- | --- | --- |
| 平台总览 | `output/saas-design-qa/platform-desktop.png` | `output/saas-design-qa/platform-comparison.png` | `output/saas-design-qa/platform-table-comparison.png` |
| 租户详情/创作 | `output/saas-design-qa/tenant-desktop.png` | `output/saas-design-qa/tenant-comparison.png` | 修订后局部对比待补 |
| 企业概览 | `output/saas-design-qa/enterprise-desktop.png` | `output/saas-design-qa/enterprise-comparison.png` | 修订后局部对比待补 |
| 企业创作详情修订 | `output/saas-design-qa/enterprise-creation-postfix.png` | 与租户原图的共有详情区域后续同输入复核 | 图片预览焦点和筛选已验证 |
| 企业成员移动 | `output/saas-design-qa/enterprise-members-mobile.png` | 无独立移动原图，按 PRD 响应式要求检查 | 行高与关键列问题待复拍 |

## Findings 与修订历史

| 严重性 | 首轮观察、影响与证据 | 修复要求 | 当前复核 |
| --- | --- | --- | --- |
| P1 | 租户详情存在多余旧模块导航、全宽筛选；全文要求用作大标题、参数以 JSON 展示。详情从约 Y240 下移到约 Y380，执行过程和费用被挤出首屏。见 `tenant-comparison.png`。 | 隐藏重复旧入口，筛选放左列，安全短标题，完整要求保留正文，参数值芯片。 | 实施代理已修改。企业共用详情修订截图显示短标题、参数芯片与首屏执行过程；租户同状态复拍仍待做。 |
| P2 | 平台实际为条柱，原图为折线面积趋势，且缺少数值轴。默认日期为空但实际数据按七天查询。 | 使用真实时序点的折线面积图和轴，显式默认起止日期；空值不得补成零。 | 实施代理集成中，待复拍。 |
| P2 | 状态切到失败后，初版列表刷新而右侧仍为原已完成记录，URL 保留旧 creationId。 | 筛选变更同步清选择和页码，避免列表与详情矛盾。 | **复核通过**：企业状态为 failed，URL page=1 且无 creationId，右侧提示选择记录。 |
| P2 | 初版图片弹窗 Tab 能到背景按钮，Esc 关闭后没有回触发按钮。 | 锁定弹窗焦点，Esc 关闭并还焦。 | **复核通过**：Tab 后 focus=关闭预览且 insideDialog=true；Esc 后 dialogCount=0 且 focus=放大图片。 |
| P2 | 390px 成员表格操作堆叠造成约190px行高，邮箱过度折行，关键成员列未固定。见 `enterprise-members-mobile.png`。 | 紧凑移动卡片或合理表格最小列宽及局部滚动，固定关键身份列，操作不拉长全行。 | 实施代理修改中，待复拍。 |
| P2 | 钱包页外层模块导航和原 BillingNavigation 重复。见 `wallet-initial.png`。 | 只保留一组模块二级导航及必要业务子标签。 | 实施代理修改中，待复拍。 |
| P2 | 首轮浏览器控制台 React duplicate key（空 key）。 | 导航唯一稳定 key。 | 实施代理已修，需新加载后的错误时间戳复核。 |
| P2 | 普通登录成功留在首页，没有返回带租户上下文的 redirect。 | 严格同源内部目标校验并返回原企业页面。 | 实施代理已修，待完整登录路径复核。 |

## 五项视觉面

- 字体与层级：系统中文无衬线，企业主标题 28px、区域标题 18px、侧栏15px；表格13px比PRD正文14–16px略密，当前桌面可读，列入P3微调。初版租户长标题的换行问题已要求修复，不把图片小字不可读当作已通过。
- 间距与布局：208px深蓝侧栏、浅灰页面、白卡片和细分隔基本对应原图。详情的首屏比例与移动表格仍是本轮阻塞；必须同状态复拍后判定。
- 颜色：海军蓝侧栏、蓝色选中、浅灰底、绿/黄/红状态对应原方向。状态同时含文字，不仅依靠颜色；fixture中的真实失败与待核查不可改成视觉演示的成功。
- 图片与资产：真实本机受鉴权素材已加载，原图/参考图/结果可放大；本次是媒体业务数据而非装饰替代。源概念图产品照与 fixture 产品不同，不要求伪装成生产结果。专用标志保留 Naumi 品牌文字，不新绘制假图标替代业务素材。
- 文案：平台和企业导航、页面信息层级采用批准方向，无宣传口号。完整原始要求保留；历史缺项为“未记录”。按 PRD，未实现统一全站搜索时不渲染装饰性顶部搜索框，该差异为明确产品约束。

## 已测交互与证据边界

- 平台管理员和原生企业所有者均经正常 UI 登录本机隔离 fixture。
- 平台七组主导航、租户六标签、企业六组导航可到达；钱包充值入口正确打开充值套餐内容，重复导航仍需修订。
- 企业概览“查看”进入企业创作列表及详情；原图、参考图、输出加载成功。
- 企业状态筛选清旧详情、URL同步；图片预览 Tab/Esc/还焦通过。
- 390px企业菜单可展开、选择后收起，页面未发生全局横向溢出；成员表局部横滚可见，但行密度/关键列待修。
- `enterprise-overview-mobile.png` 捕获的是加载中，不能作为最终移动概览证据，需替换为稳定数据态。
- 控制台初轮 duplicate-key 已报告；最终需新导航/重载后读取错误日志，不能用旧错误缓存判定修复失败或忽略新错。
- 未在生产修改配置、会员或账务；未重放收费任务。API/数据库隔离、撤权媒体、分页等证据由实施模块脚本单独记录，不能用本报告替代。

## 实施清单

- [ ] 平台趋势/日期/钱包导航补丁整合后同视口复拍，并生成全景及重点局部组合图。
- [ ] 租户创作页复拍并重核首屏、筛选和图片交互。
- [ ] 企业概览桌面局部和390px稳定态；成员移动修订复拍。
- [ ] 1280px、1024px、390px的关键导航、详情及局部表格溢出验证。
- [ ] 普通登录 redirect、刷新深链、浏览器返回验证。
- [ ] 新加载控制台检查、剩余 P0/P1/P2 关闭后将 final result 更新为 passed。
- [ ] M04所有入口、故障恢复与正式构建集中验收；发布状态单独记录。

## 后续微调

- P3：在密集表格中权衡13px与14px正文，以中文和邮箱可读性为准，避免只为贴图减少实际信息。
- P3：素材标题当前“参考图 2”“生成结果 3”为素材序号，容易被理解为数量；可显示“参考图”“生成结果”并将序号作为小号角标，组数量按真实统计。

## 第二轮复拍与修订（2026-10-23）

### 截图密度及有效证据修正

IAB的普通截图在目标视口超出宿主当前可见区域时会裁切或出现重复表面；例如 `enterprise-desktop-postfix.png` 仅471px宽，后来的 `enterprise-desktop-postfix-valid.png` 实际1293px宽，均不作为1440px验收。`enterprise-native-postfix.png` 的右边重复侧栏为捕获表面问题，不是DOM有两份导航，已废弃其组合图。保留这些材料用于说明复核过程，不能把它们标为合格截图。

最终使用同一IAB、同一页面状态的CDP原生屏幕捕获，显式 `captureBeyondViewport=true` 与 `clip={x:0,y:0,width:1843,height:1311,scale:1}`。实际DOM CSS视口1440×1024、zoom1.28、滚动条内1432px；三个最终截图均1843×1311，清晰且无裁切。原图1487×1058按contain等比例归一至1843×1311再组合，不拉伸源图。副本没有修饰业务画面。

| 页面 | 最终完整浏览器截图 | 同输入全景比较 | 同输入局部比较 |
| --- | --- | --- | --- |
| 平台总览 | `output/saas-design-qa/platform-1440-surface.png` | `platform-1440-comparison.png` | `platform-1440-focused.png` |
| 租户创作详情 | `output/saas-design-qa/tenant-1440-surface.png` | `tenant-1440-comparison.png` | `tenant-1440-focused.png` |
| 企业概览 | `output/saas-design-qa/enterprise-1440-surface.png` | `enterprise-1440-comparison.png` | `enterprise-1440-focused.png` |

上述比较图均在 `output/saas-design-qa/`，已将源图与实现合在同一输入打开查看，未以分别打开图片代替组合比较。

### 本轮结果

- 平台真实折线面积图与数值轴已替换条柱，默认起止日期明确显示。来源真实fixture点与概念图的数量和走势不同，属于正确业务差异。主导航、层级和配色对应批准方向。待处理卡片较概念图精简说明文字，符合用户不加无用文案的要求。
- 租户重复旧入口行已移除，筛选位于左列，标题短句、完整原话、公开参数标签与模型标签均保留。再一次压缩dl默认外边距、模型行和图高后，费用行由CSS y1000移至y935，在1024高首屏可见，实际付款账户紧随其后；技术折叠区允许继续向下查看。P1首屏问题关闭。
- 企业概览的导航、最近创作表、成员用量、权益与待处理布局符合批准方向。没有编造源图的增长百分比、已离职私人历史或企业钱包。使用系统字体栈：GeistSans及系统中文fallback；h1 28/700、h2 18/650、表格13/400。局部对比可读，字重/间距无P0/P1/P2差异。事件节点以真实历史状态显示，未把当时“排队中”改成概念图的全绿成功；连接线外观可列P3优化。
- 成员移动行高从约190px降至64–65px，身份列sticky，390px视口 `scrollWidth=clientWidth=390`，表格1210px仅在360px局部容器滚动。修订截图 `enterprise-members-mobile-postfix.png`。
- 390px企业概览已等到真实表格数据后捕获 `enterprise-overview-mobile-postfix.png`；1024与390创作详情 `enterprise-creation-1024.png` / `enterprise-creation-mobile.png` 无全局横向溢出，带“返回列表”并已实际返回。1280×910 CSS企业概览保存于 `enterprise-1280-postfix.png`，全局宽度1272=scrollWidth。
- 钱包重复导航修复期间一度丢失“钱包与充值”，已作为P1记录并补回唯一模块导航。修订后 `aria-current=page`、实际首屏“充值套餐”pressed；截图 `wallet-1440-postfix.png`。仅查看，未改变价格或发布配置。
- 发现原生owner-A与平台cookie共存时，企业下拉出现B、UI把A显示成B所有者，但创作接口拒绝。统一企业鉴权后复核：下拉仅A，直接URL B显示“当前企业不可访问”，截图 `enterprise-dual-session-rejected.png`。平台管理B继续走平台租户入口，不能借cookie扩大原生企业身份。
- 平台退出原先DELETE200但router replace/refresh竞态仍留原页面；修订成功后硬导航，复核最终URL `/admin`、仅访问密码表单且原私有数据已清，截图 `admin-logout-postfix.png`。
- 本轮新导航控制台没有duplicate-key或其他新增JS错误；记录中早先 `2026-10-22T18:17:21.200Z` 的本机PG恢复端口ECONNREFUSED属于环境恢复前，已核对PG恢复55439且后续页面正常，未把该旧错误当作产品修复失败或忽略新错。

### 剩余与边界

- [P1，已关闭] 普通用户已从 `/account` 正常退出。首轮企业未登录状态缺登录入口；新增明确登录链接后，实际执行“带tenantId/view/creationId企业URL→登录链接→输入fixture owner账号密码→自动返回同一创作详情”，参数保持并补默认from/to，三素材、原始要求、执行与费用载入成功。修订截图 `enterprise-login-deeplink-postfix.png`。不是手动导航或单测替代。
- 供应商余额模块新纳入：须检查未知/失败/不限额/真实单位、缓存和刷新，以及企业不能读供应商内部字段；源图未包含余额卡，按新需求验收。
- 合入其他已完成业务分支后，新增视频批量、Agent回复恢复等真实入口还需覆盖冻结上下文与证据，当前截图不能替代那些新增入口的验收。
- 实施代理另核实已有 `/api/video/workflows` / `scheduleVideoWorkflow` 路径缺顶层creation记录、运行持久scope及恢复继承；新增canvas-batch经同scheduler，prepared_enc也需固化空间。已纳入整合后的M04补齐及集中fixture，不能将八组已通过回归扩张成所有入口已完成。
- 最终正式类型/构建、完整集中验收及47真实数据验收仍由对应记录证明；当前final result保持blocked。
