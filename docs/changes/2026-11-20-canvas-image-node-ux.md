# 图片节点：多图网格、双击创建、原位标题与压缩副本

## 模块与职责

基线 `b5b6d09b07eb57d2aee739185f726dd43a7d6546`，独立分支 `codex/canvas-image-ux-20261120`。
共享 `E:/Workspace/naumi` 的原有分支与未提交内容保持不动。本切片不启动服务器发布或生产生成。

用户要求：多图导入排列对齐、双击增加节点、直接双击标题修改；用户明确“压缩文件体积，保留原图”。

## 根因、决策与可见行为

1. 原导入按每一行自身图片宽度累计X，所以不同比例跨行时同列锚点不一致。`canvasImageImportGrid` 按每列最大宽度分配X、每行最高图片加标题分配Y；尺寸、纵横比、输入顺序、分组与原件字节保留，不重排已有节点。
2. 原空白双击仅缩放。可编辑选择模式双击空白pane，复用 `addPendAtScreen` → `createCanvasPendingAtScreen` → 原pending/history，一次创建可一次撤销。图片/标题/输入框事件不创建额外节点；只读及手形模式仍保留原双击缩放。
3. 原标题双击打开画布浮层输入。新 `ImageNodeTitle` 在标题处编辑，Enter/失焦提交、Escape取消、IME回车不误提交，编辑框内双击选词不覆盖草稿。通过scene稳定回调复用原 `saveNodeRename` 与history，不新建持久化或改名API。只读/锁定/生成占位不编辑；失败保留草稿并显示错误，移除标题祖先的溢出裁剪、实际文件名仍截断。
4. 工具栏新增“压缩”动作，明确下载压缩副本。原 `downloads` owner 拥有单次压缩意图、忙态、重复点击去重与账号/工作空间退休取消；原授权读取先取得原图，再由浏览器编码静态WebP（质量0.82、像素尺寸不变）。只有至少缩小8%才下载；未缩小时明确反馈。原作品/画布取图/节点数据不改、不上传覆盖，不经过供应商或计费。

## 公共接口与依赖方向

- `image-size.canvasImageImportGrid`：纯几何；`image-imports`仍拥有批次/队列/回执/项目与原件上传。
- `scene-types` / `use-canvas-scene-actions` / `scene-projection`：可选 `renameArtwork` → `onRenameCommit`；保持稳定回调与最新scope。
- `ImageNodeTitle`：仅局部输入状态；主页面提供原history命令，标题不是第二套作品存储。
- `downloads.compressImage` → `download-browser.compress` → `prepareImageUpload`：原下载/媒体授权路径；`browserImageHeader`限制静态格式/64MiB/6400万像素，bitmap finally释放，编码回退PNG不冒充WebP。
- `prepareImageUpload.force`仅显式压缩使用；普通导入仍 `preserveOriginal:true`，原其他调用的阈值与传输行为保持。

## 验证与证据边界

- 改前已有 imports / node-creation / downloads 用例exit0。
- 实际Next15.5.28画布基线：空白双击不创建、标题不在节点内编辑、无压缩按钮、5张混合比例导入列错位；`CANVAS_IMAGE_UX_BROWSER=BASELINE_REPRODUCED`，4项exit0。
- 定向领域：1–64张布局、列锚点、标题间距、无重叠；压缩去重、退休取消、错误后重试、无效编码器回退及bitmap释放，共49758断言。原 imports19/102、downloads15、scene30/108回归通过。
- 独立Reviewer发现输入框双击覆盖草稿、错误被标题裁剪、WebP回退MIME假设及手形/只读缩放兼容问题，均已修正；真实组件复跑包括IME、Enter只提交一次、Escape及错误保留。
- 本轮私有依赖按当前锁文件安装在D盘；没有改共享旧依赖。完整类型检查已在当前依赖实际exit0，和上一任务旧依赖89项基线诊断是不同环境，不能说旧环境已修复。
- Next在E源/D依赖跨盘链接会把字体或入口解析成错误路径，失败日志保留。实际Next验收改为D盘受控源码副本+同盘固定依赖，生产源码逐SHA核对；没有为跑通改生产Next配置。前置E盘Next14误用和两次字体解析失败均非有效产品验收。

## 完成回执与未执行项目

实际Next改后7项已通过：创建/撤销、标题原位编辑及输入框内双击、保存/Escape/撤销、真实压缩副本、5图原件网格、锁定拒编、保存失败保留草稿与可见告警；pageerror0。真实透明PNG1231349字节→WebP164004字节（640×480不变、透明像素保留），原作品快照不变。最终增加手形缩放兼容回归并在整合SHA重新执行。
已打开实际整页网格、标题编辑及失败截图；独立Reviewer已检查实际diff、重跑领域用例、复核截图及D盘产品源hash，无剩余代码阻断。E盘执行浏览器脚本与D盘产品runtime分别标注，最终同步副本不混淆。
应用合并源码 `045a846b331fa7953f8f4ccfc02a5890335dbb25`，第一父 `531a0bb27a354888e7eec7fe109ec4747cebabc8`，保留同期PSD节点编辑和透明表面。固定源六组子命令均exit0，真实Next八项通过（含手形缩放），2335个产品源/实际浏览器脚本与D运行副本逐SHA完全一致。新依赖基线及合并源类型检查均exit0。
独立审查PASS；源码副本回滚恢复12项原文件/缺席状态，同时保留前置PSD与透明面，真实Next再次复现旧四项行为。主工作区和修改产物保持新状态。完整命令、日志、源码摘要及最终远端SHA在 `output/canvas-image-ux-20261120/VERIFICATION.txt`；稳定归档 `E:/Workspace/naumi-task-evidence/canvas-image-ux-20261120/`。
这里只普通合入main，不代表已上线。生产发布、真实数据库和付费上游未执行。
后端为本地受控API端口；本任务不改服务端授权、任务、计费、存储或模型配置，不将浏览器fixture称为生产验收。
