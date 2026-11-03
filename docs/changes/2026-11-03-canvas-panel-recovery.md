# 画布懒面板故障隔离与显式恢复

## 模块与职责

画布可选编辑面板由 `recoverablePanel` 统一处理客户端加载、局部失败、显式重试和关闭。它只拥有加载尝试和局部错误状态；CanvasClient 继续拥有节点、草稿、File 预览和任务引用，生成与计费模块仍拥有业务提交及账务。

本次接线限于 CanvasClient 顶部原有 17 个 `next/dynamic` 声明及一个 import。没有改业务面板 JSX、供应商、全局版本检查、Service Worker、缓存清理或发布控制器。

## 调研与问题

基线 `dfdec4f8a8b209d1a8f98f4908ac7da34cfd142c` 的可选面板仅有 loading fallback。实际 Next/Webpack lazy chunk 请求失败会传递至整个 CanvasClient 外面的 CanvasErrorBoundary，卸载画布；`useImageReferenceDraft` cleanup 清空临时 File 并撤销 object URL。外层重试虽然重新挂载画布，但模块级 React.lazy 的 rejected promise 仍被缓存，再开面板不会重新请求 chunk。

现有版本提示已经使用 loaded bundle version、请求超时、单飞和手动刷新；发布静态资源 union 也已有逐字节验证。本模块不重建这些能力，不用自动 reload 掩盖问题。

## 实现与接口

`recoverablePanel(loader, { loading })` 从 loader 的确切组件类型推导 props，支持 named export、default export 和带默认对象的可选 props。

- 仅在客户端 effect 后挂载 lazy 组件；SSR 与首次 hydration 继续显示原 loading，保持原 `ssr:false` 语义。
- 错误边界仅包住当前可选面板，不卸载父画布。
- 用户点击重试时创建新的 React.lazy 实例，再调用原 loader；没有定时自动重试、刷新或业务请求。
- 失败 UI 是浅色紧凑错误条，通过 portal 放到 body，避开原画布裁切和变换容器；只有重试／关闭，不展示堆栈。
- 存在 `onClose` 时调用原回调，否则仅隐藏此处失败 UI。保持挂载的 `open=false` 对话框不会显示加载错误条；重新打开后恢复显式操作，但不会自动重新请求。
- 原组件 props 只传给原组件，不铺到 DOM；任务 ID、冻结参数、原报价及 UNKNOWN 的解释没有变化。

## 集中验证及证据层级

验证脚本：`scripts/verify-canvas-panel-recovery.cjs`。

该脚本构建独立极小 Next 15.5.27 / React 19.3.0 production 应用，读取真实 Webpack 输出 chunk，从真实请求 URL 注入一次或持续 404。使用实际源码 CanvasErrorBoundary、File draft hook/store 和恢复组件；Canvas shell、业务面板、locale/workspace 明确是 fixture。它不是整仓 CanvasClient／数据库／已受理供应商任务 E2E。

| 检查 | 结果 |
| --- | --- |
| 基线真实 chunk 404 卸载画布，撤销 File URL；再次打开沿用 rejection，无新请求 | 已复现 |
| 主站 `/canvas` 与 `/desktop/canvas` 一次失败，显式重试产生第二次请求并加载成功 | 通过 |
| 父实例 marker、提示词、File 原始字节、fixture 原 operation/task ID 保留 | 通过 |
| 持续失败每次显式重试只新增一次请求；callback 关闭和无 callback 关闭 | 通过 |
| 保持挂载的隐藏对话框不显示错误，关闭／重开仍可显式重试 | 通过 |
| SSR loading only；named/default export 与 optional props 编译 | 通过 |
| 全仓 `tsc --noEmit --incremental false --pretty false` | exit 0 |

命令与字面输出：

```text
node scripts/verify-canvas-panel-recovery.cjs --baseline --source-root output/browser-stability-goal-20261103/decode-baseline-source --output-root output/canvas-panel-recovery-20261103/baseline-final
BASELINE_EXPECTED_BUG=PASS REAL_PRODUCTION_WEBPACK_CHUNK=YES CASES=2 SUPPLIER_CALLS=0

node scripts/verify-canvas-panel-recovery.cjs
MODIFIED_PANEL_RECOVERY=PASS REAL_PRODUCTION_WEBPACK_CHUNK=YES CASES=6 SUPPLIER_CALLS=0

node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
[no output] exit 0
```

证据位于 `output/canvas-panel-recovery-20261103/{baseline-final,modified}/`：`RESULT.json` 含源码 SHA、chunk URL/SHA、实际请求次数和边界说明；`build.log` 记录 production 构建。浏览器请求只允许 localhost，所有 non-GET/生成请求及供应商调用均为 0。文档中的 task ID 保留仅指 fixture 身份不变，不冒称真实供应商任务恢复验收。

## 未完成与下一步

本模块未提交或独立发布。由主线程集中复核整个稳定性切片、源码副本回退及最终提交；本次未做整仓固定镜像／服务器蓝绿／真实旧构建新服务双槽验收，不能将局部 Next fixture 写成上线完成。原静态资源 union 与跨版本业务协议仍按现有发布流程分别验收。

## 统一收尾回执

本模块已经并入本分支功能提交 `f770015e`；main固定 `dede3933` 仅单向同步到本分支后，受影响集中13命令和完整Next画布/文字UI通过。最终状态以 `2026-11-03-browser-stability-goal.md` 与证据 `output/browser-stability-goal-20261103/FINAL_STATUS.json` 为准；上文“未提交/待父任务”记录对应子模块交接时点。未反向合main，未服务器部署或真实供应商生成。
