# 节点行内引用编辑器

## 模块与职责

图片、视频提示词共用轻量 `InlineReferenceEditor`。编辑器仅负责输入、光标、原子标签、剪贴板和本地撤销历史；节点归属、引用持久化、共享复制、生成与计费继续由各自业务模块负责。没有新增编辑器依赖。

基线为 `2b990949421214802ae900e34f2baf6869f78443`。图片正文继续序列化为 `【图N】`，视频继续使用既有 `{{ref N}}` / 媒体编号编译规则，不修改供应商协议。

## 公共接口与数据归属

- `inline-reference-dom.ts` 将兼容字符串投影为纯文本节点和不可分割标签，标签记录 `data-reference-key`，名称和缩略图不是引用身份。整个渲染不使用 `innerHTML`。
- `InlineReferenceEditor` 接收 `value`、`tokens(value)`、`onChange`、`resolvePastedKey`；暴露光标选择、插入和聚焦接口。DOM 变更按值和展示签名缓存，父画布重渲染不重复构造标签或图片。
- 图片 `ImageReferenceComposer.textareaRef` 的类型更新为 `HTMLDivElement`。父原有 focus、尺寸测量和滚动行为继续可用；父负责两个 ref 的类型调整。
- 视频编辑器内部保存原始 wire 字符串，名称仅单向投影，不反向用名称推断身份。通过 `videoPromptDisplayOffset` / `videoPromptRawOffset` 保留原 `onMention(choice, displayStart, displayEnd)` 合同；标签和富剪贴板身份包括 `input.id + nodeId + kind`。跨编辑器仅在来源与类型唯一时回退匹配，不将相同来源的多个角色/槽位混成第一个。
- 图片未知剪贴板来源保留 `【失效引用】`；视频保留 `{{ref 0}}`。父图片 manifest 校验显式拦截失效占位，旧缺失图号仍按原校验处理。

## 实现与迁移

- 浅色行内“缩略图＋名称＋图号”标签，保留上方素材卡、用途选择、定位和图片预览。
- 输入 `@` 可按名称/图号筛选并通过方向键、Enter、Escape 操作；候选有缩略图。同名节点不合并。
- 中文 IME 期间不插入候选、不替换编辑 DOM；组合结束后再投影。
- 整标签退格/Delete、选区剪切、多行文本、撤销/重做；键盘事件不泄漏为画布快捷键。
- 富剪贴板携带稳定身份，已存在引用按目标编号映射；未知来源失效，不偷偷按相同图号换图。粘贴 HTML 仅接收纯文本；全量预检富剪贴板范围后再改写，畸形数据不产生部分转换。
- 只读支持选中文本和复制；拖拽文本/标签不变成画布节点移动。视频按 `nodeId` 重置编辑器历史，避免跨节点撤销串入旧提示词。

## 集中验证

`node scripts/verify-inline-node-reference-ui.cjs BASELINE`

```text
INLINE_UI_BASELINE=REPRODUCED textareas=2 inline_chips=0 suppliers=0
INLINE_UI_CLEANUP=PASS browser_closed=1 server_closed=1
```

`node scripts/verify-inline-node-reference-ui.cjs MODIFIED`

```text
INLINE_UI_MODIFIED=PASS checks=22 real_react=1 chromium=1 suppliers=0 pageerrors=0
INLINE_UI_CLEANUP=PASS browser_closed=1 server_closed=1
```

两条 exit 0。基线通过表示原无行内标签状态准确复现。修改版采用实际 React 图片/视频组件及真实 Chromium；本地 PNG 缩略图实际解码，非第三方图片或供应商访问。22 组覆盖图片/视频标签、同名、预览、原子删除/撤销重做、换行光标、IME、Escape、稳定身份剪贴板/重编号/未知来源、HTML 文本化、畸形剪贴板、改名、视频新增引用及重复来源多槽位、已有标签后的光标插入、视频改名不改 wire/不进入撤销历史、只读和 390px 换行。截图已经重新打开检查。

首轮在 React 只读更新尚未提交时立即断言 DOM，得到 `true !== false`；测试改为等待实际只读属性后通过，产品逻辑没有放宽。首次 full-project `tsc --noEmit --incremental false --pretty false` exit 0；父将对全模块最终整合统一复查。

## 未完成项与边界

本记录仅为实际组件与浏览器输入层验证，持久化、真实企业身份、节点复制/共享、整站 Next 与 main 整合由父完整切片验收。本模块没有网络供应商调用、SSH、部署或公开更新说明。103 暂停决定保持。

## 完整 Canvas 联调发现：私有缩略图读取修复

父完整 Canvas 联调发现：上方素材卡通过 `CachedImage` 正常读取，而最初行内 DOM 的裸 `img` 请求 `/_next/image` 导致私有缩略图破图。此前公共 PNG fixture 没有覆盖这个差异，22 组不能作为私有媒体视效通过证据。

修复后 DOM 只创建缩略图 slot；`InlineReferenceEditor` 使用 React portal 将原生 `CachedImage` 挂入 slot，复用既有媒体授权、Blob 缓存、账号切换即时撤销、权限失效、abort、release 和 canvas 图片队列。不引入另一套授权或缓存。输入周围文字时复用原标签/slot/portal，不按键重复请求或闪烁。

新增 `PRIVATE_BASELINE` / `PRIVATE` 模式，使用真实浏览器 `browser-image-cache`、cookie 保护的回环 `/media/private/*` 及真实协议 manifest。Next optimizer 故意返回 404；匿名实际 GET 为 401。私有来源不是 data URL 或公共图片。

```text
node scripts/verify-inline-node-reference-ui.cjs PRIVATE_BASELINE output/inline-node-reference-ui/private-before
INLINE_UI_PRIVATE_BASELINE=REPRODUCED card_decoded=3 inline_broken=2 optimizer_requests=2 suppliers=0
exit=0

node scripts/verify-inline-node-reference-ui.cjs PRIVATE
INLINE_UI_PRIVATE=PASS checks=8 private_media=1 cache_manifest=1 optimizer_requests=0 suppliers=0 pageerrors=0
INLINE_UI_CLEANUP=PASS browser_closed=1 server_closed=1
exit=0
```

8 组验证包括 image/video chip 实际解码 `naturalWidth=128`、Blob 源与缓存标记、同源凭据、无 optimizer 请求、键入保留同一图片 DOM/lease 且无新增授权请求、匿名拒绝、A→B 同步清除旧 src 且 B 无权限、A 恢复重新授权、权限失效撤销已解码像素、组件卸载释放活跃 lease。私有截图已重新打开。首次 baseline loader 只匹配 `.tsx` 漏掉旧 `.ts` DOM renderer，修正 loader 后真实原反例通过；没有修改产品迎合旧错误脚手架。
