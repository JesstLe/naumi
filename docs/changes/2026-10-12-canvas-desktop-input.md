# 画布连线删除与桌面输入适配

## 任务边界 / 协作

- 独立 worktree：`C:/Users/13357/.codex/worktrees/performance-20261012/naumi`。
- 分支：`codex/canvas-desktop-input-20261012`；基线 `9a9482b580c59aefc4fe8a21fe113cc2e413031a`。
- 只改代码、验证与推送分支，不连接服务器、不发布、不合入 main。
- 分支继承此前性能与浏览器缓存模块，接手应合并整条分支，不只摘取此次最后提交。
- 开工已刷新 origin/main `9740b9f74e2db9d3bff6a56fd4a9bc68c09591da`，在基线祖先中。

## 已复现的根因

实际生产构建 + Windows Edge，点击图片节点再点击连线、按 Delete：`BASELINE_EDGE_DELETE=BUG nodeDeletes=0 edgeCuts=0`。

常驻 Agent 小球有 `data-canvas-hotkeys-blocked=true`，旧全局选择器把所有带该属性的非按钮元素判作模态层，导致整个画布键盘和粘贴被拦截。点击连线还残留旧图片/文字选择，数据刷新又会覆盖 RF 的 edge.selected，这两处让删除对象及反馈不稳定。

## 实现

1. 区分全局模态遮罩与局部输入隔离：小球/助手内部事件仍隔离，但在画布上的键盘与粘贴不再被常驻元素阻断。输入、IME、真正的菜单/对话框继续优先。
2. 点击线明确取消节点选择，删除先处理当前线；节点/空白/项目/账号切换清线选择。刷新继承 edge.selected，选中样式沿用既有 CSS。
3. 图片血缘删成功后再移除本地线；失败保留线及选择供重试。删除去重、长按忽略、与历史保存互斥，浏览器快捷键/视口操作不整体封锁。
4. 文字连线统一现有 `/api/canvas/history` 原子字段更新。图片到文字同时移除 sourceIds/productIds；文字到图片移除 targetIds；文字间移除 sourceIds。等待在途文字保存，清理对应已提交旧草稿。沿用现有认证和服务端事务，不改数据库结构。
5. 空白占位线只更新当前输入、parentId、linked，支持局部 undo/redo；生成/上传中和 task 所属线不可选择或剪断，不取消已开始生成，不影响原扣费机制。向生成中空白节点新增输入同样被拦截。
6. macOS 删除标签改为 `⌫` / `Fn+⌫`，与实际 Backspace/Delete 事件一致；Windows 保持 Del/Backspace。修复陈旧静态验收规则，增加实际浏览器回归脚本。
7. WebKit 实测发现空白画布 Backspace 默认触发浏览器后退，退出项目；画布非输入状态现在显式 preventDefault，即使无选择或只读也不后退。输入框/IME 仍交给原生行为。

## 验收记录（完成后更新）

- 基线浏览器复现已完成；SHA256 原件 `AD0794E17F77BBBBEF24C1B16A23AFF81BD5ACDB0836A531BBD0FF760325F25E`。
- 初轮生产构建、TypeScript、Edge Windows + Mac 键位模拟通过；扩大输入、模态、复制粘贴及各种文本线回归进行中。
- WebKit 引擎运行在 Windows，Mac 平台/UA/Meta 键由浏览器模拟；它不是原生 macOS/Safari 实机验收。
- 最终证据：忽略目录 `output/canvas-desktop-input-20261012`。真实供应商调用为 0；API 存储故障与数据状态由隔离浏览器 fixture 控制，未宣称生产数据库验收。
- 待真实 Mac 硬件验收：Safari/Chrome/Edge 原生系统剪贴板、Fn/Delete 键盘映射、触控板 pinch 与双指平移。既有媒体/并发验收仅复用或定向回归，不声称所有工具已在真实 Mac 验证。

## 同步与交接

本轮算一个完整输入修复模块，完成后迭代计数从 1/3 到 2/3；下一功能模块完成时按约定刷新整合 main。提交前再次 fetch 并记录 SHA；共享 E 盘 checkout 不切分支、不覆盖他人文件。没有服务器发布，空间维护发布计数不变。

四个交付物为 `delivery/MODIFIED_FILE.zip`、`delivery/DIFF_FILE.diff`、`delivery/VERIFICATION.txt`、`delivery/ROLLBACK.sh`。回滚只作用于标记的独立源码副本，不还原实际任务工作树、不切服务器、不回灌数据库。精确命令、输出、退出码及 SHA 见 VERIFICATION.txt。
