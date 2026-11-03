# 画布节点初始化、属性与视频目录读取恢复

## 模块与职责

六类节点（视频、导演、人物、场景、音频、时间线）的列表读取收敛到 `use-node-list-read.ts`：有界读取、单飞、身份 fencing、ready/error 和聚焦／轮询读取。各节点模块仍拥有自己的写队列、revision/CAS、operation receipt 和保存失败恢复，不把列表重读变成写重试。

CanvasClient 继续拥有项目恢复、pending deep-link、节点属性和属性本地镜像；视频目录由既有 `useVideoCatalog` 拥有。本批不改变节点保存协议、真实供应商提交、账务、UNKNOWN 判定或旧任务身份。

## 实现与兼容

- 列表 GET 的 15 秒期限包含 request 内的鉴权与响应体读取；即使底层 Promise 不响应 abort，调用方也有界结束。
- 仅合法 `nodes` 数组以及非空 id/projectKey、非负整数 revision 才成为权威快照；失败不变成空列表。
- ready 表示本身份曾收到权威响应，而非某次尝试结束。初读失败保留 `nv:canvas:last` 与 pending deep-link；成功空列表才允许现有“项目已消失”路径完成。
- 显式重新读取与 focus/visibility 共用一条读取 flight；不会调用 `retryPending` 或提交保存。视频既有周期在超时后继续。
- 成功后的读取失败保留已有节点；A→B→A、卸载与 StrictMode 下旧读取不覆盖当前可见状态。
- 节点属性读取同样包含 15 秒期限、严格 envelope 校验与 owner fencing；失败保留原本地字节和同 owner 已读属性，提供独立只读重试。
- 视频目录挂起落到既有 error/retry UI，不永久保持 loading。

## 集中验证

`scripts/verify-canvas-node-read-resilience.cjs` 在真实 React 19 / Edge 挂载实际六 hook、原视频保存队列与 `useVideoCatalog`；通过 TypeScript AST 提取实际 CanvasClient 项目消失 effect、pending-node effect、节点属性读取／持久化 effect、JSON 解析函数及两个只读重试按钮。测试没有复制 ready 门禁判断。

HTTP、request 内鉴权、响应体、PG 写回执及外围 Canvas shell 是显式 fixture。15,000ms 读取期限加速为 150ms；视频周期只在相应场景加速，原写队列退避也明确加速。没有真实数据库、账号或供应商连接。

| 场景 | 覆盖 |
| --- | --- |
| 六类列表 auth/request/body 挂起 | 18 个实际 hook 读取边界，期限后不 ready、保留项目恢复键 |
| 六类列表 503、坏 JSON、缺 nodes、非数组、坏元素 | 30 个实际 hook 负向组合，不把失败解释为空 |
| 成功空列表与项目消失 | 原 AST gate 完成，恢复键／pending link 可清除 |
| focus/visibility 各 20 次＋显式 refresh | 每类保持一个 flight、GET-only |
| 上次成功后失败、A→B→A、StrictMode、卸载 late response | 旧节点与当前身份保持；卸载后无新 React commit |
| 视频周期超时后继续 | 下一读取可成功，不永久挂住 |
| 保存 UNKNOWN、原操作重试、CAS conflict | 原 raw body／operationId／expectedRevision 保持；只读 retry 不增加写；409 不静默 rebase |
| 节点属性 8 类负向、原生本地迁移、owner 切换 | 原本地字节／已读属性保留、严格 envelope |
| 节点属性显式重试及 late response | GET-only、旧超时体不覆盖成功恢复 |
| 视频目录 auth/request/body 挂起及显式重试 | 有界进入错误 UI、原 ticket fencing 保持 |

基线使用封存 `dfdec4f8a8b209d1a8f98f4908ac7da34cfd142c` 源码：

```text
node scripts/verify-canvas-node-read-resilience.cjs --baseline --source-root output/browser-stability-goal-20261103/decode-baseline-source --output-root output/browser-stability-goal-20261103/node-reads/baseline
CANVAS_NODE_READ_RESILIENCE=BASELINE_REPRODUCED CHECKS=27 DEFECTS=22 PROVIDER_CALLS=0
exit 0

node scripts/verify-canvas-node-read-resilience.cjs
CANVAS_NODE_READ_RESILIENCE=PASS CHECKS=28 DEFECTS=22 PROVIDER_CALLS=0
exit 0
```

基线的 22 个 expected-defect 组和 5 个保护 control 分开记录；它的 exit 0 表示预期旧缺陷复现，不表示旧行为验收通过。修复版另增加独立属性重试 control，共 28 组。

## 验证发现并修正的 owner 持久化缺陷

第一轮扩展检查为 **27/28**，不是全部通过。实际 AST 回放证明：A 的节点属性已成功后切换 B，B 请求仍挂起，属性读取 effect 的 `setReady(false)` 尚未进入下一次 render，后续旧持久化 effect 捕获 A 的 settings 与 ready=true，却使用 B 的邮箱键，把 B 原本地设置覆盖成 A 设置。

原结果封存于 `output/browser-stability-goal-20261103/node-reads/NODE_SETTINGS_OWNER_FAILURE.json`。主线程在原持久化 effect 增加 `nodeSettingsLoadedOwner.current === nodeSettingsOwner` 约束并补依赖；随后完整 28 项重跑通过。A/B 的本地字节和 B 的 late response 分别验证，没有删掉该失败记录或放宽断言。

## 证据层级与未完成

`output/browser-stability-goal-20261103/node-reads/{baseline,modified}/RESULT.json` 含逐项结果、源码 SHA、请求／写 raw body 与明确 fixture 边界；`extracted-gates.tsx` 是对应源码 AST 提取内容。浏览器 pageerror、外部网络、供应商调用均为 0。

测试中的写回执、任务状态和 operation ID 是隔离 fixture，不是线上数据库或真实供应商验收。该子模块未自行 commit、SSH、建候选或发布；源码副本回退、完整构建和最终提交由稳定性主线程集中封存。本地 hook／AST 通过不替代整站部署与真实用户旧页面验收。
