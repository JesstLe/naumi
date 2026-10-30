# 2026-10-30 画布多图子节点、生成箭头和点击批量上传

## 模块与用户目标

基线 `3065cf964e53ccac9865ab8b26d7da6359dcec94`。用户要求：从当前图片生成 3 张时保留原图，创建 3 个独立的横排子节点和连线，不再依次覆盖当前图；原图片生成按钮仅保留箭头图标；空图片节点点击上传应支持多文件。

## 已确认根因

1. `generateSelectedImage()` 对所有 `genCount` 都传 `replaceNode:true`，同一 `canvasTarget` 收到多张结果，结果因此进入原节点版本链。
2. `runGen()` 为整次请求创建一个占位；非原位落点还按结果原像素高度纵排。
3. `doUploadPend()` 明确只取 `files[0]`；专用隐藏 input 未开启 `multiple`。拖拽/根上传已有多图能力，与此入口不是同一条控制路径。

## 本次实现

- 新增 `lib/canvas/generation-fanout.ts`：数量决定落点语义、整行避让、稳定 slot/result 绑定、FileList 快照。纯前端布局规则不引用数据库、供应商、Route。
- **单张仍原位生成；2–4 张不传 canvasTarget**，保留原节点、原图、原版本；N 个独立占位都连接来源节点，正常结果保存为 N 个独立作品。
- 保留 **一次 variants=N 请求、原总报价、原 operationId、原冻结参数、原引用身份/角色**。没有拆成 N 次计费 POST，没有改模型参数映射或价格。
- 各占位显示既有进度动画；此为已有交互展示，不声称供应商逐张精确进度。结果以原任务真实回执为准。
- 行布局整体避让既有节点；比例自动时以原图 frame 为预览；每个 slot 可拖动。图片 id 第一次观察后固定到 slot，重排/部分回执不会交换已有 id 的位置。
- session receipt 增加可选 UI-only `placement`，随 scope/原请求身份校验；刷新使用原 recovery 入口 GET 原任务并以 `mode:initialize` 写落点，不覆盖已经手动移动的作品坐标。
- 重试先读原 receipt 的冻结数量和落点语义，草稿后来改成 1 张也不会把已受理 3 张变成原位覆盖；已受理恢复不重传参考图。未知/404不授权另一笔POST。
- 不足 N 张保留未交付 slot 和原 receipt；已有成功图可见。原“剩余积分已退回”的无依据文案改为实际结算口径。
- `GenerationSubmitAction` 使用箭头；可访问名称仍为“生成”，失败重试分支保持。
- 空节点多选上传：先复制 FileList 后清 input，先建立首图项目锚点，后续最多两路上传，每图保留同步 receipt。第一图位于当前占位，其余横排；解码失败逐文件反馈，已保存但同步失败只同步原图，不重新上传。原图字节保持。

## 数据、权限、事务和公共接口

- 后端生成/预占/结算/作品/父子回执路径未改，本模块不新建计费事务。
- `ImagegenPendingAttempt.placement?: CanvasFanoutPlacement` 为会话级 UI 元数据，不进入冻结供应商 request。
- `ImagegenPendingRecovery.onAttach` 增加第 4 个可选 placement 参数；旧调用方和旧无 placement receipt 兼容。
- `updateCanvasImagegenPlacement(scope, actionKey, update)` 只更新精确 scope 下现存 receipt；不保存鉴权 Header。
- CanvasClient 编排实际占位、HTTP 与保存；新 helper 负责可复用的目的地/几何规则。

## 集中验证

证据根：`E:/Workspace/naumi/output/canvas-feedback-20261030/fanout`。

### Baseline

```powershell
node scripts/verify-canvas-fanout-upload.cjs --source-root E:/Workspace/naumi/output/canvas-feedback-20261030/fanout/before --baseline --output-root E:/Workspace/naumi/output/canvas-feedback-20261030/fanout/baseline-final
```

字面输出：`CANVAS_FANOUT_UPLOAD=REPRODUCED CHECKS=1 FAILED=0 SUPPLIER_CALLS=0 EXIT=1`，实际 exit 1，预期旧行为复现。输入 canvas-client 为上述基线 Git 原字节；没有修改 before。

### 实际函数与整模块

```powershell
node scripts/verify-canvas-fanout-upload.cjs --output-root E:/Workspace/naumi/output/canvas-feedback-20261030/fanout/unit-r2
node scripts/verify-canvas-fanout-receipt.cjs . E:/Workspace/naumi/output/canvas-feedback-20261030/fanout/receipt-r1
```

- `CANVAS_FANOUT_UPLOAD=PASS CHECKS=12 FAILED=0 SUPPLIER_CALLS=0 EXIT=0`
- `CANVAS_FANOUT_RECEIPT=PASS CHECKS=7 FULL_CLIENT_MODULES=1 SUPPLIER_CALLS=0 EXIT=0`

前者 AST 提取实际 `generateSelectedImage/runGen/doUploadPend` 等函数，并加载完整 helper，在明确 React state/HTTP 边界 fixture 运行；不是完整浏览器。后者加载完整 imagegen canvas-client、client、schema、client-recovery 等模块，验证一次 quote18/variants3/一次POST、404/丢响应GET-only、slot乱序/拖动、scope和清receipt；媒体/鉴权/HTTP为 fixture。两者实际 exit 0。

### 完整 Next + React Flow

父复用的本地服务：`CANVAS_REGEN_PORT=15181 node scripts/serve-canvas-regeneration-fixture.cjs`，Next 15182、入口15181；仅本地隔离 fixture，不启动 Worker，不调用生产供应商。

```powershell
$env:CANVAS_FANOUT_OUT='E:/Workspace/naumi/output/canvas-feedback-20261030/fanout/ui-final'
node scripts/verify-canvas-fanout-ui.cjs
```

`CANVAS_FANOUT_UI=PASS CHECKS=5 FULL_NEXT=1 SUPPLIER_CALLS=0 PAGEERRORS=0`，exit 0。

实际浏览器断言：
1. 图片主按钮没有“重新生成”可见文字，aria为“生成”。
2. 真实点击数量3，在POST仅一次的情况下有3个占位、3条来源边，原图无重生成遮罩/版本变更，原quote总18。
3. 请求后刷新，原任务恢复GET返回3结果，3节点横排、原图保持、无第二次POST。
4. 真实原生文件选择器 `isMultiple=true`，选3文件产生3作品，落点不同且同一项目，上传原文件全部SHA一致，无幽灵占位。
5. pageerror=0、外部供应商网络=0。

实际截图均已打开检查：`ui-final/fanout-generating.png`、`ui-final/fanout-complete.png`、`ui-final/pending-upload-three.png`。截图素材为本地测试图，不是新收费生成。

首轮 UI 的文件字节断言失败原因：Playwright `route.request.postDataBuffer()` 对原生文件上传省略文件内容，返回0字节。回归改用真正的本地HTTP接收 multipart 后验证原字节 SHA；不放宽断言、不改产品。保留 `ui-r1/ERROR.json`。

## 完成边界

- 本模块实现与本地集中测试完成；父线程负责总 TypeScript、相邻回归、最终制品/副本回滚、普通 main 合并推送。
- 预览fixture不会代表真实供应商质量验收或生产发布。
- 103模型映射实验线完全未读取/拷贝/合入。无生产配置、数据或供应商收费调用。
- CanvasClient 后续由父集成文字/成组 patch，子代理不覆盖父最新源码。

## 父最终集成补修

原核心12 PASS后，独立审阅发现partial反复查询重复undo、上传等待槽busy窗口；父补去重和全批次busy后核心15 PASS。另补异常成功少图不清原receipt。最终完整Next5 PASS、完整文字/组集成15 PASS在补修后复跑，见总台账及final-tests。保持一次总报价、一次付费POST、旧任务只查不重买。
