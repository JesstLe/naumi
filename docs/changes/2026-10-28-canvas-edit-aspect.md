# 画布修改结果非等比拉伸修复

## 用户反馈与复现
- 用户截图反馈“修改后会拉伸”。本轮查明同类缺陷存在于标注改图、同步在线改字及持久改字任务的结果落地代码。
- 基线 `294beac9862f9877d763afd12d29ca83a544adfd`；独立 `codex/canvas-edit-aspect-20261028`。
- 抽取基线 annotate 的真实结果表达式，输入 1024×1536 上游圆形图、原图 1200×1600：圆形输出包围盒 467×415，宽高比 1.1253，证实是像素非等比缩放，不只是画布边框显示。
- 截图不包含原任务 ID；上述证据是当前相同编辑代码的可复现缺陷，不反推这张历史图片的全部上游链路。

## 模块与职责
- `canvas/edited-image-output` 只负责编辑结果的方向归一化、编码和真实宽高/比例；不调用模型、不修改账务、不拉伸、不裁切、不补边。
- annotate、text-edit、canvas-image-tasks 复用同一结果合同，保存及返回真实结果尺寸；显式发布的后处理仍按冻结策略执行，不附加第二次强制缩放。
- 编辑入口在报价前传递源图比例；模型请求层从本人作品补齐该比例，保留已冻结报价优先级。扩图和普通生成不被改成“跟原图”。
- 旧直连 exact-size 模型使用现有精确尺寸合同；受管理的请求保留自己的冻结参数映射，不改供应商目录/价格。

## 当前实现与迁移
- 三条默认编辑输出链路取消 `resize(sourceWidth, sourceHeight, fit:fill)`。
- 返回结果宽高和作品 ratio 使用实际输出，Canvas 继续使用已有等比渲染能力。
- 历史已完成结果不批量覆盖；已有上游 checkpoint 的未完成任务可沿原任务恢复，不重放付费生成。

## 验证与待完成
- 上一轮实际完成：9 项像素/方向/透明度检查、9 项报价与输入比例合同、8 项隔离 PostgreSQL/本地 HTTP 编辑管线、4 项旧直连尺寸合同，全部通过；供应商真实调用 0。
- 基线 `BASELINE=REPRODUCED CIRCLE=467x415 ASPECT=1.1253 SIZE=1200x1600`；修改 `MODIFIED=PASS CIRCLE=400x400 ASPECT=1.0000 SIZE=1024x1536`。
- 编辑管线 `EDIT_PIPELINE=PASS CASES=8 LOCAL_SUPPLIER_CALLS=3 REAL_SUPPLIER_CALLS=0 SETTLED_OPERATIONS=4`。覆盖三入口、幂等回执、已保存供应商结果恢复、不重复扣费，原图保持。
- 上轮浏览器验收中断，HTTP 200 不作为 UI 验收证据。2026-10-29 用户要求本次合并；同步最新 main 后再集中验证与记录交付。
- 47 HOLD 保持；无生产写入或真实供应商调用。

## 2026-10-29 收尾验收
- 修复提交 `76301f2d`；在任务分支整合最新 main 后，像素 9 项、报价输入合同 9 项、真实编辑管线 8 项、旧直连 4 项再次通过，全量 TypeScript exit 0。
- 旧 `verify-canvas-image-tasks.mjs` 静态检查仍在 Route 搜索恢复函数，主线已迁移到 `worker/tick-scan`。只将测试更新为同时验证 Route 委托与实际 scan 调用，未修改 Worker 逻辑；复测 exit 0。
- 实际 Next Canvas 浏览器已打开并检查三张节点图片解码尺寸；基线和修复后圆形渲染正确对应各自原始像素。新增无参考图节点输入文字、默认自适应提交、回执落图通过；API 账号/结果为本地 fixture，参数 admission/compiler 使用实际模块，不作为生产供应商效果证据。
- 独立 PostgreSQL/本地异步 HTTP 供应商的纯文生图实际管线，`TEXT_ONLY_PIPELINE=PASS INPUTS=0 RATIO=1:1 HTTP_STATUS=200 ARTWORKS=1 SETTLED_OPERATIONS=1 REPLAY_POSTS=0 LOCAL_SUPPLIER_CALLS=1 REAL_SUPPLIER_CALLS=0`。
- 源码包、差异、基线/修改/副本回退字面回执及最终 main SHA 见 `E:/Workspace/naumi/output/canvas-edit-aspect-20261028/VERIFICATION.txt`。Git 合入与生产发布分开记录。
