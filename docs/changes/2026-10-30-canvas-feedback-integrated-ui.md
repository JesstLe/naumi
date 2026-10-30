# 画布反馈：完整 Next 集成 UI 验收

## 模块与职责

本记录验证父线程已合在同一工作树的 CanvasClient 接线；不是新增模型、后台任务或发布流程。

- 工作树：`E:/Workspace/naumi-canvas-feedback-20261030`。
- 页面：原完整 Next CanvasClient，隔离 fixture `http://127.0.0.1:15181/canvas`。
- 测试脚本：`scripts/verify-canvas-feedback-integrated-ui.cjs`。
- API、身份、媒体与保存响应为本地浏览器路由 fixture；使用真实 React、ReactFlow、原页面组件和点击/拖动。生产数据库写入、供应商调用均为 0。
- 未启动第二个 Next，未停止共享本轮 fixture；进程收尾由父统一处理。

## 实际覆盖

1. 图片主按钮只显示生成箭头，保留可访问名称“生成”。
2. 图片优化器预览后取消保留原提示词；应用写入本节点草稿。
3. 优化请求携带已选发布文字模型，不误用图片模型。
4. 普通文字主工具栏为“文字创作”，商品帮写保留在“更多”；创作栏不混入智能帮写按钮。
5. 文字优化预览与应用实际写入文字草稿。
6. 文字生成失败保存具体错误，不提示“重新选择原图反推”；同节点再次生成成功后保存正文、清理旧错误，刷新正文仍在。
7. 首次 OCR 模型目录人为延迟，期间不发 OCR 报价或执行；目录返回后报价与执行均为同一有效选择。
8. 在线改字侧栏显示识别片段，原图完成实际解码后才截图。
9. 多选两张图片执行原成组 API，`canvasGroupId` 进入作品并显示新底板；取消选择底板仍保留。
10. 从未选中的组成员首次拖动，两图同位移，只有一个原历史请求，两个 position 指令保持相对距离。
11. 刷新后从持久 fixture 作品读取同组 ID，整体底板重新出现。
12. 解组只清组关系/底板，两个作品及连线保留。

## 最终命令与结果

```powershell
$env:CANVAS_FEEDBACK_UI_OUT='E:/Workspace/naumi/output/canvas-feedback-20261030/integrated-ui-final'
node scripts/verify-canvas-feedback-integrated-ui.cjs
```

```text
CANVAS_FEEDBACK_INTEGRATED_UI=PASS CHECKS=15 FULL_NEXT=YES SUPPLIER_CALLS=0 PAGEERRORS=0 EXIT=0
```

退出码 `0`。`RESULT.json` 记录 15 项断言、请求/历史/分组/优化/文字保存载荷、实际源码 SHA256 与证据边界。

证据目录：`E:/Workspace/naumi/output/canvas-feedback-20261030/integrated-ui-final`。

- `group-selected-full-canvas.png`
- `group-persistent-full-canvas.png`
- `text-writing.png`
- `ocr-first-open.png`
- `RESULT.json`

截图均为真实本地页面，非设计稿。最初脚本选到画布文字节点的 textarea，修正为 `image-node-dock` 内定位；R1 失败保留。R2 OCR 截图拍于缓存图片完成前，R3 起加入 `complete && naturalWidth > 0`，最终图片解码断言通过。以上均为测试定位/取证时序修正，没有为测试改产品。

## 未完成与边界

本测试不替代真实供应商响应协议验收（对应文字模块真实 SDK + 本地 HTTP 测试）、真实 PG 结算回执验收、生产部署与真实用户验收。父线程负责最终版本整合、类型检查、制品/回滚及 main 合并。
