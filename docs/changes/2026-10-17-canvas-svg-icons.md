# 画布界面 Emoji 统一 SVG — 2026-10-17

## 范围

截图中的图片节点Dock、空白节点Dock、拉线派生菜单及比例弹层。独立分支codex/canvas-svg-icons-20261017，从已整合最新版的release103候选6417625e出发；开工/提交前fetch，并普通合入main19f95e7c（仅ops）。共享checkout18项未提交不覆盖，特别保留canvas-action-menu.tsx同事修改。

## 实现

- 清除CanvasClient全部6处界面Emoji字面量：风格冰块→Box、比例直尺→Ruler、派生图片/上传→Image/Upload、三视图数量→Image、文生图→Type。
- 聚焦字符→Focus、派生文字T→Type、两个生成箭头→ArrowUp；比例选项尺寸轮廓由CSS边框改为原生SVG rect，原比例计算保持。
- Lucide沿用当前字体色、统一14/16px、shrink-0，装饰图标aria-hidden；SVG轮廓不依赖系统Emoji字体。
- 不删改用户提示词Emoji，不更改选择值/生成/计费/上传/位置/Worker。

## 实际验收

基线AST确认6处；改后0处。183个命名函数、所有JSX事件处理逐个对照原字节保持；RatioIcon明确允许纯展示变更，校验原尺寸计算。原删除面板210项/节点入口与模型共享回归通过。Next15.5.27/React19真实CanvasClient+HTTP隔离fixture+原生无头Edge9项通过：SVG实际DOM、风格选择、比例1:1→3:4、三视图、用户Emoji、390px、拉线菜单3种图标、空白节点；pageerror0、供应商0、未隐式生成。全量tsc exit0。最初几个测试定位/关闭弹层失败已保留，最终完整批次browser-complete.log。

独立副本实际执行可执行ROLLBACK.sh，恢复原SHA及6Emoji；正式源码仍保持SVG。截图svg-dock-desktop.png、svg-dock-390.png、svg-spawn-menu.png、svg-pending.png已真实渲染并打开检查。四件证据在output/canvas-svg-icons-20261017/，VERIFICATION含精确命令、输入、字面输出和退出码。fixture端口14656/14657已关闭；Next临时tsconfig已恢复，不提交配置噪声。

## 交付边界

本地完成，提交/推送后记录最终SHA；未部署103或47，无SSH/部署锁/候选/切流/Worker操作。公开更新说明不把未上线记录当已发布。可选择性整合此功能提交，不整文件覆盖并行canvas工作。
