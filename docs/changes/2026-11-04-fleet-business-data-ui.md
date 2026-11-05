# 103 总后台：跨站积分与业务数据视图

## 模块与归属

- UI 位于 `src/components/admin/business-data/`；既有 `/admin/usage` 与中央管理既有入口接入，不另建隐藏的数据后台。
- `FLEET_CONTROL_ENABLED=1` 时，默认读取全部已登记站点。普通本地部署、企业用量页继续使用原 `UserUsage`。
- 103 原有的任务、产出、Token、企业筛选和导出分析通过 `?detail=local` 保留；带原 `from/to/tenantId/sort/size` 的历史深链接仍走原页面，避免日期和排序被新视图忽略。
- 中央模式的 `/admin/center` 运营概览默认显示全站消费与趋势；`section=users/orders/ledger/artworks` 分别直接打开全站用户、订单、账务、作品。页面标题、导航归属和默认 tab 随入口映射，之后仍可在五个分类之间切换。
- `/admin/creations` 的完整统一创作界面未替换；其“作品数据”子导航打开跨站只读作品。用户导航保留“本站用户管理”，原管理 mutation 和全部详细分析可经 `?detail=local` 进入。
- `q/accountType/status/period/id/source` 原 BI 深链接，以及没有新站点/view 的旧邮箱下钻，继续由原完整 BI 接管；新的账户下钻始终绑定站点，不会意外落入本站管理。
- UI 只依赖 `business-contracts.ts`、`business-central-contracts.ts` 的公开合同，以及 `/api/admin/business`；不访问数据库、不持有连接器凭据。

## 本次实现

- 同一界面的五个只读分类：积分消耗、用户、订单、账务、作品。
- 站点选择、7/30/90/365 天、搜索、分页和账户下钻由 URL 绑定；返回数据同时绑定当前账号及筛选，旧筛选结果不会闪入新查询。
- 默认全部站点，展示每个来源的回执状态和真实 `observedAt`。未完整返回时，总数和趋势为“—”或等待状态，不以本站数字假装全站合计，也不把断线改成 0。
- 原始消费和退款分别展示。余额为当前本金减预留；用户列表的 `creditsUsed` 显示为“预留积分”，不误标为累计消费。历史孤立流水的未知余额保持“—”。
- 相同邮箱使用 `[站点 ID, 邮箱]` 作为行身份，不合并账户或余额。账户明细切换为该来源的账务/作品查询，不提供对远端账号的本站扣款、充值或管理按钮。
- 作品只显示已获授权的元数据，不捏造跨站缩略图链接或绕过媒体权限。
- 手动刷新明确传 `refresh=true`；后台返回新的查询时点。默认查询使用既有 30 秒合并窗口，轮询使用同一签名 requestId。
- 快速连续筛选每次从当前 URL 同步合并，再通过 Next 原生 History 集成更新 `useSearchParams`；不读取旧 render 的 filter，不触发只改查询参数所不需要的 RSC 切换。
- 读取有界：单次传输 20 秒、合计等待 90 秒、响应最多 2 MiB。权限失效清除原授权快照；缺少回执或网络失败保留 UNKNOWN，不继续显示“查询中”或造完成状态。

## UX / DX / AX

- 浅色布局；四个指标、来源状态、消费趋势及按站点分组的明细。表格在容器内横向滚动，移动端页面不横向溢出。
- 明确每站 30 条分页，避免将分布式每站分页伪称全局排名。分页、站点、时间范围及未知状态均可由无障碍角色定位。
- API 传输、轮询状态、纯聚合模型、指标、趋势、明细分开；复用共享 DTO，不维护第二份业务金额规则。
- 失败状态区分 pending、offline、failed、unknown；界面没有数据库复制、支付重放或自动配置发布动作。

## 验证记录

集中 UI 合同测试：

```text
node node_modules/tsx/dist/cli.mjs scripts/verify-fleet-business-data-ui.ts
FLEET_BUSINESS_DATA_UI_CONTRACT=PASS assertions=58 realBusinessWrites=0 SSH=0
exit=0
```

覆盖：7+42=49 消费、退款独立、同邮箱分站身份、部分来源不是 0、已知消费与未知余额并存、分页、错误日期、响应查询不匹配、重复来源、UNKNOWN 旧数据清除和 403 不解析旧数据体；另覆盖五个既有中央入口映射、初始非消费 tab 返回消费、所有 legacy filter、本地用户管理入口及完整创作页共存。

定向 TypeScript：`node node_modules/typescript/bin/tsc -p output/fleet-business-data-ui/tsconfig.json --pretty false`，最终 exit 0、无输出。首次定向配置漏引 Next 自带 CSS ambient declarations，只有 CSS module 声明缺失；补入真实 `node_modules/next/types/global.d.ts` 后通过，没有向产品添加类型桩。

入口集成小轮使用 `output/fleet-business-data-ui-v2/tsconfig.json`，同时包含 center、usage、navigation 及 UI 模块，exit 0、无输出；浏览器 runner 语法和 `git diff --check` 同样 exit 0。第一版四产物保留，入口集成后的四产物单独生成到 `output/fleet-business-data-ui-v2/`，不覆盖先前证据。

### 真实浏览器发现的快速筛选回归

父控制器首次真实 Next 浏览器结果保留在 `output/fleet-business-data-20261104/browser-fixture/BROWSER_RESULT.json`。前 7 项断言已过，作品→积分消耗后立即切全部站点，第二次 `navigate` 仍合并旧 render 的 `view=creations`，导致 API 收到 `all+creations`，消费指标不存在；这次 FAIL 未改写为通过。

修正由每次读取 `window.location.search` 的最新同步 URL 合并筛选，再原生 `history.replaceState`，Next 自动同步搜索参数。连续事件不依赖 React/RSC 提交完成，不增加 sleep 或禁止后续输入。集中合同加入三个确定性快连操作/初始入口断言（合计 58 项）；v3 四产物另存，保留 v1/v2 与浏览器失败。父控制器在另一目录运行真实浏览器复验。

第一条组合 shell 命令因 PowerShell here-string 语法错误未执行测试；改为普通 UTF-8 字符串配置后，才取得上面的实际测试结果。

## 浏览器与交付待办

- `scripts/verify-fleet-business-data-browser.mjs` 已准备；要求父控制器提供已运行的隔离 Next 服务和原生管理员 cookie/密码文件。
- 浏览器测试只允许 loopback HTTP，不启动服务、不连接生产、不写业务数据库。数据响应明确为双站 fixture，实际渲染的是修改后的 Next 页面。
- 将核验真实 DOM 的 49 积分、同邮箱两行、站点切换、五类只读表、刷新标志、未知来源非零、403 清除旧数据、五个中央入口初始 tab 与本地管理链接、1440/390 布局；输出 PNG 与 `BROWSER_RESULT.json`。
- 本子模块未做 SSH、生产部署、付费生成或两站数据库合并。真实连接器→103 的端到端结果和上线状态由主控制器另行记录，不能用 fixture 截图代替。
