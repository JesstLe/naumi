# 空白双击与右键菜单统一

## 用户行为与根因

基线 `f69f539dc9571456b3cd809abda8bb3a9843cbad`，独立分支 `codex/canvas-doubleclick-menu-20261120`。
用户澄清：双击空白处应与右键单击一致，先显示菜单，不直接创建图片节点。
上轮实现把双击接到了图片创建入口，因此跳过了现有节点类型/上传/历史等选择。

## 实现与归属

只修改 `CanvasClient` 空白双击分支，直接调用既有 `onPaneContextMenu(event)`。
两种手势共享菜单状态、坐标换算、屏幕边缘适配、选项、禁用状态、子菜单及后续创建入口。
不是复制一份菜单或创建另一套节点逻辑。打开菜单不写文档/历史，也不提交生成或计费。
标题/节点内容不触发空白菜单；现有只读和手形双击缩放、标题编辑、压缩副本、多图网格、PSD行为保持。

## 验证与证据

扩展原 `verify-canvas-image-ux-browser.mjs`，实际Next+React+Edge对照：同点右键/双击主菜单的顺序、禁用状态、屏幕锚点，以及“添加节点”子菜单的全部类型/可用性均应一致。
双击不创建节点，明确选“图片”后才创建一次，原undo能撤销。相邻原位标题/压缩/网格/锁定/失败及手形缩放继续在同一完整浏览器切片覆盖。
实际基线退出1并复现 `opening the double-click menu must not create a node / 1 !== 0`；改后实际Next八项全部exit0，主菜单/子菜单/坐标对照通过。类型检查exit0、原节点创建27场景/105断言通过。已打开双击菜单截图核对真实菜单与节点列表，没有直接生成节点。
独立审查确认生产分支同源且原几何/手势边界保持，节点创建105断言复跑通过。额外旧 `verify-canvas-node-menu.cjs` 仍查找已迁移的内联创建调用，基线与修改后相同退出1，记BASELINE FAIL；本轮用真实菜单浏览器对照覆盖，不改旧正确业务行为来满足过时静态夹具。
基线、改后、副本回滚、源hash与最终SHA记录在 `output/canvas-doubleclick-menu-20261120/VERIFICATION.txt`；稳定归档 `E:/Workspace/naumi-task-evidence/canvas-doubleclick-menu-20261120/`。

## 未执行项目

不进行生产部署或收费调用；本轮浏览器使用本地API fixture，不冒称真实数据库/生产长任务验收。共享checkout的27项未提交内容保持。
