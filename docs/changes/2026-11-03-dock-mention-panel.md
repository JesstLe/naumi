# Dock 的 @ 引用浮层

## 模块与职责

- 基线：`78a1366216a60c27dfd22ae1405fb2aef8f4d7e3`。
- 本模块仅负责图片/视频编辑器的候选显示与 viewport 定位，不改引用身份、图号、保存协议、素材授权、报价或生成执行。
- `ReferenceMentionPanel` 是 body portal 的非模态 listbox。输入焦点、中文输入法和光标仍归原 `InlineReferenceEditor`。
- `referenceMentionPlacement` 是无 React/DOM/I/O 的布局函数；根据光标行、编辑区宽度和可视 viewport 算出位置、列数与高度。
- Dock 壳的单滚动区及展开尺寸由父任务另行接入，两个模块只通过编辑器 DOM ref 及既有 `[data-composer-body]` 可见边界配合。

## 公共接口及状态归属

```ts
ReferenceMentionPanel({
  id, label, editorRef, activeOption, optionCount, revision, onClose, children
})
```

- 父编辑器仍拥有 query、active index、候选内容和插入操作；浮层不增加第二份引用状态。
- 浮层拥有临时位置、resize/scroll observer 和外部点击监听；卸载时全部释放。
- DOM `data-testid="reference-mention-panel"` 与 `role="listbox"` 在同一个 portal 根上，`data-placement` 为 `top`／`bottom`。

## 实现

1. 图片和视频候选均脱离 Dock 文档流，因此不会撑高正文、被底栏或 `overflow:hidden` 裁切。
2. 光标的真实 DOM Range 决定上下锚点；无有效光标矩形时使用输入区可见底部。浮层按 `visualViewport` 避让屏幕边界，下面不足时向上展开。
3. 宽屏最多四列，较窄为三列/两列，小宽度单列；候选有 40px 缩略图、名称和既有图号/用途，同名来源仍可辨识。最大可视高度 320px，超出只滚候选面板。
4. 键盘选项通过调整浮层自己的 `scrollTop` 进入可见区，不调用会带动 Dock/页面的 `scrollIntoView`。
5. resize、捕获滚动和移动端 visualViewport 变化使用 rAF 合并更新；用户滚浮层自身不重算位置。
6. 选择候选时阻止鼠标夺焦点；外部 pointerdown 与 Escape 关闭。原中文 IME、方向键/Enter、稳定身份、视频 raw/display 光标映射保持。
7. 缩略图继续使用原 `CachedImage`，没有裸 img、私有媒体地址改写或独立缓存。
8. 移除图片正文 `max-h-[220px]/overflow-y-auto`、上方素材卡 `max-h-48/overflow-y-auto` 和视频正文的内层高度/滚动限制；由 Dock 单一正文容器滚动。

## 集中验证

工作目录：`E:/Workspace/naumi-dock-reference-layout-20261103`。

```text
node scripts/verify-inline-node-reference-ui.cjs MODIFIED
INLINE_UI_MODIFIED=PASS checks=22 real_react=1 chromium=1 suppliers=0 pageerrors=0
INLINE_UI_CLEANUP=PASS browser_closed=1 server_closed=1
exit=0

node scripts/verify-canvas-image-references-ui.cjs
PASS canvas reference UI and transport fixture; supplier calls=0
exit=0
```

实际 React 图片/视频组件与原生 Chromium 已覆盖原标签/IME/剪贴板/光标/只读等 22 组；原图片引用 UI→提交适配器保持通过。上述 fixture 都是本地合成图，零真实供应商调用。

纯布局函数四组额外检查（1440×900、390×844、1000×560、390×300）均通过：浮层在 viewport 内、桌面四列、窄屏两列、上下翻转。父任务的长正文/16图/整体单滚动/展开按钮真实浏览器套件负责最终跨模块验收，结果由父统一记录。

## 交付边界

- 本切片没有自行 commit/push、部署或变更公开说明；由父统一提交与回滚封包。
- 103 暂停发布决定保持。
- 现有“图N”/`{{ref N}}` wire、节点 ID、CAS、复制分享及已接受任务没有改动。
