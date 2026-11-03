# Dock 单滚动、展开与引用浮层：浏览器验收

## 模块与职责

- 测试固定基线：`78a1366216a60c27dfd22ae1405fb2aef8f4d7e3`。
- `scripts/verify-dock-reference-layout.cjs` 直接 bundle 实际 `CanvasComposerShell`、CSS module、`canvasDockLayout`、图片编辑器、`VideoCompactComposer` 及其视频编辑器。
- 文本、空白图片、已有图片和视频由测试容器选择；容器尺寸来自真实 viewport，Dock 尺寸只由生产布局函数计算，没有伪造展开高度或覆盖产品 overflow。
- 底部模型按钮使用展示 fixture；不执行生成、鉴权、PG、持久化或服务器发布。完整 CanvasClient 接线和原提交合同由父另行验收，不能把本测试写成整站 Next 验收。

## 输入与命令

输入：60 行提示词、16 张本地合成 PNG；1440×1000、390×844、1024×480 窗口及打开浮层时动态 resize。真实 Chromium、真实 React 和产品样式。远程请求拦截，供应商调用为 0。

```text
node scripts/verify-dock-reference-layout.cjs BASELINE
DOCK_LAYOUT_BASELINE=REPRODUCED nested_scroll=3 expand_delta=0 mention_clipped=1
DOCK_LAYOUT_CLEANUP=PASS browser_closed=1 server_closed=1
exit=0

node scripts/verify-dock-reference-layout.cjs MODIFIED
DOCK_LAYOUT_MODIFIED=PASS checks=12 real_components=1 chromium=1 suppliers=0 pageerrors=0
DOCK_LAYOUT_CLEANUP=PASS browser_closed=1 server_closed=1
exit=0
```

基线采用 `git show` 的固定源码 overlay；基线 PASS 表示原问题准确复现，不是产品已通过。

## 12 组验收

1. 已有图片长正文只有 body 一个纵向滚动容器，展开实际增高。
2. 收起后恢复尺寸、正文滚动位置、文本和原选中节点；编辑焦点和选中文字保持。
3. 16 张候选通过 body portal 显示；桌面 4 列、16 项同时可见，不受 Dock 或 footer 裁切。
4. 键盘选择第 16 项、插入后继续输入，身份仍为 `【图16】`；正文滚动不被候选操作带走。
5. 中文 composition 中不弹选单，完成后可恢复，Escape 只关闭候选。
6. 真实长正文滚到末行后输入 `@`，候选明确 `data-placement=top`，完全位于底栏上方。
7. 空白图片 Dock 复用单滚动与实际展开合同。
8. 实际 `VideoCompactComposer` 父容器中的视频编辑器展开；候选选择保留 `{{ref 6}}` wire。
9. 原 controlled 文字 Dock 展开不退化。
10. 390×844 窄屏候选与 footer 在 viewport 内，键盘末项使候选 scrollTop 增加而正文不滚。
11. 1024×480 低高度窗口同样验证独立候选滚动及尺寸边界。
12. 候选打开时 resize 自动重定位，外部点击关闭，生成提交次数仍为 0。

### 实测尺寸

- 1440×1000：Dock **310 → 790 px**，body **213 → 693 px**。
- 主纵向滚动容器：基线 **3**（图卡／正文／body）→ 修改版 **1**（body）。
- 桌面选图：760×298 px，4 列，16 项可见。
- 长正文末行：body scrollTop=1077；候选顶坐标538.75、高298，底部836.75，小于body底858。

## 截图与证据

`output/dock-reference-layout/BASELINE/RESULT.json`、`MODIFIED/RESULT.json` 保存命令、输入、checks、实际 bounding boxes、pageerrors 和退出状态。

已生成并打开核验：

- `BASELINE/baseline-nested-scroll-and-clipped-mention.png`
- `MODIFIED/desktop-expanded-reference-panel.png`
- `MODIFIED/desktop-long-prompt-top-picker.png`
- `MODIFIED/reference-panel-390x844.png`
- `MODIFIED/reference-panel-1024x480.png`

初轮基线脚手架在 `fill` 后未保证插入位置，候选未展开；改为真实 `Control+End` 再键入 `@`，基线三个问题均复现。没有改产品来迎合测试。随后一次集中 suite 加入明确上翻、焦点选区及候选自身滚动断言，最终 12 组通过。

## 父封包与回滚入口

脚本支持：

```text
node scripts/verify-dock-reference-layout.cjs ROLLBACK <独立回滚副本根目录>
```

此时只读取副本中原 shell/layout/editor 文件做 bundle overlay，要求恢复基线3滚动／展开差0／候选裁切行为。副本回滚、四产物、Git 合并和最终发布状态由父统一记录；本测试模块没有改产品或执行部署。
