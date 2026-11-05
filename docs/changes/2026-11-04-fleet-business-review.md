# Fleet 业务只读查询：PR #11 审查修复

## 范围与状态

本轮针对 `ef91eca4` 的五条 CodeRabbit 意见逐条核对、复现与修复。只修改既有业务查询边界、读查询故障处理及相应验证，不变更消费/退款/余额口径，不导库、不重放任务、不合 main。正式新 head CI、机器人复审与生产验收分别确认，以下本地证明不冒充线上发布。

## 4469109548：缺收据结构不阻塞控制队列

`business.query` 是纯读操作。原代码发现 `app_fleet_applied` 缺表或缺列时抛异常，`connectorTick` 在 ACK 前退出，中央保留 `leased`，按最旧队头派发会阻塞后续控制命令。

改为直接返回 `failed/UNAVAILABLE`，不初始化 App/schema、不执行读查询、不要求本地持久化收据，允许中央正常接收失败 ACK。旧 mutation 的收据、幂等和异常传播行为不变。

真实双 PG 与 HTTP poll/ACK 验证缺表和缺列两种情况：基线中央 business 仍 leased、后续 ban queued；修改版 business failed/UNAVAILABLE，后续 fixture ban 成功。纯读阶段 catalog 和用户字节不变；后续明确控制操作仅改变目标用户的 banned 字段，lost ACK 重放保持同一 mutation 收据，不重复改账。pool max=1 保持。

## 4469109579：控制历史不携带高频业务快照

generic `fleetSnapshot` 在 WHERE 中、LIMIT 100 之前排除 `business.query`，而非仅清空 payload 后继续占用控制历史窗口。业务结果仍由原 `fleetReadCommand` 通过独立权限边界读取，控制命令的 root/委托过滤与排序不变。

真实 PG 种入 120 条、每条约 36KB 的业务结果。基线 generic 最近100条均为 business，挤掉控制历史；修改版 generic 保留3条原控制、0条 business。委托过滤与专用 business getter 同时验证，不扩大权限。

## 4469109491：HTTP 错误体防御解析

非成功响应的 HTML、空字符串、JSON null/标量和缺 body 统一生成 `BusinessReadError` 并保留真实 HTTP status，不泄漏原始解析异常。200 的畸形 JSON 使用可读格式错误；401/403/404 的提前鉴权处理及清快照行为保留。

有限响应实际执行原 client：ef91 基线12例中5例失败，修改版12例全部通过。新增12例并入既有 UI 合同，共70项。

## 4469109533：刷新 revision 仅消费一次

hook 新增 `usedRevision` ref；只有新的刷新 revision 才发送 refresh=true。其后的搜索、tab、分页和 identity 变化恢复默认30秒合并查询，每次新的刷新仍可强制新 asOf。原取消、身份键、ready 和 poll fence 逻辑保持。

离线浏览器中实际执行 React/ReactDOM 与原 hook，不启动 Next 或 HTTP 服务。ef91 基线15项中4项失败；修改版15项通过、页面错误0。覆盖连续刷新、刷新后筛选/分页/tab默认合并、HTTP错误状态及鉴权清值。

## 4469109466：历史 baseline 不要求后来提取的 helper

`verify-admin-usage-skew.cjs` 仅在 modified 模式要求实际加载并 source-hash `consumption-read.ts`。所有模式仍保留真实 SQL、语义、权限、只读端口、无网络与计划断言。

用与历史 Git `d75a9d7e` 字节相同的完整两个生产 TS 模块执行 --baseline：修复前在 helper 断言退出2、未运行性能计划；修复后完整语义通过并真实重现 `jsonb_each` 2,561,600 loops / 1,600 parents，REPRODUCED exit1。当前修改版为1,600 loops，PASS exit0，两份完整语义结果相等。反向控制：modified 模式选择旧 source 仍明确拒绝缺 helper，exit2。

## 集中验证与证据

- 源协议101项，含新队列/控制历史兼容16项，真实PG、HTTP、pool max1。
- UI合同70项，实际 client 12例及实际 ReactDOM hook 15项。
- 历史 baseline 与当前 skew 各9项，语义结果逐字段相同。
- 整库 TypeScript `--noEmit --incremental false --pretty false` exit0，stdout/stderr均为空。
- 新 hook 脚本接入既有 `fleet-business.yml`，依赖的 fixture/lib 路径也纳入触发范围；原正式协议入口直接调用新增队列兼容测试。

证据根：`output/fleet-business-review-ef91eca4/`。保留可信原始 baseline、修改版结果、HTTP400 fixture 配置错误及 JSONB key 顺序断言错误等中间证据，不将它们冒称产品故障或通过结果。

本机旧256MiB共享 PG 在执行历史放大查询时发生 cgroup OOM，异常退出不计作预期 baseline。重查询迁至本任务独立1GiB临时 PG，保持原1,600父数据矩阵和计划阈值，随后成功重现。共享 PG 恢复后，central/source 两库共12张业务表 hash 与此前基线完全相同。未改变任何生产或共享 PG 的资源配置；独立临时 PG 仅用于本地受控复现。

## 同时观察到的既有协作 UI CI 同步问题

ef91 的 core 检查在 `collaboration-ui` 失败，实际执行报告绑定的是 GitHub PR merge commit `b41485a6`，不能混称为 head 源码本地执行结果。完整 artifact/log 显示“私聊 员工101”5秒内不可见：reload后分页 cursor=100 的请求先发出，111ms后 mount 的默认无cursor首屏刷新覆盖了分页结果。

本地原脚本原样29项通过，未声称本地重现产品故障。仅调整既有验收的阶段同步：预置实际账号无cursor/q首屏请求的 response barrier，确认200、response.finished并等待浏览器渲染后，再执行原100→101分页、员工101搜索/私聊与会话cursor断言。没有增加sleep、调高超时、删断言或修改协作产品源码。修改版原脚本一次29项通过。

该补丁只稳定“首屏刷新已完成后再分页”的验收阶段，不宣称修复或排除真实用户在首屏刷新前早点击的既有产品竞态。原CI失败、完整trace、原样本地PASS与修改后PASS均单独保留在 `collaboration-ci` 证据目录。
