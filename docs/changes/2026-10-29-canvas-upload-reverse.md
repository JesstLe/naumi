# 截图排查：批量反推与新画布上传显示

## 基线与证据层级

- 父任务工作树 `E:/Workspace/naumi-canvas-reported-issues-20261029`，原始基线 `3b6a5279b4364590954751e8f5b5c9d566010806`。不合并重构分支。
- 对应截图：`abf2e418…`（多图反推数量变化、空白）、`02569261…`（新项目上传成功但图片未显示）。
- 证据目录：`E:/Workspace/naumi/output/canvas-reported-issues-20261029/upload-reverse`。before 从固定 Git 对象导出，不用并行修改中的工作文件冒充基线。
- 结论来自实际源码函数的异步门闩复现、完整 Next CanvasClient 本地 API fixture、真实隔离 PostgreSQL；未复跑截图原用户的生产任务，不声称已上线。

## 已确认问题与修复

| 问题 | 确定根因 | 实现 |
| --- | --- | --- |
| 5 张反推只先出现 2 个文字节点，数量随完成而变化 | worker 内创建占位，2 路并发只先创建 2 个；不是少选图片 | 提交前一次性建立所有去重输入的有序占位，每输入保留自己的 sourceIds；继续最多 2 路请求 |
| 失败反推节点像空白节点，最终提示仍把失败算完成 | failed 节点没有 error 字段，content/prompt 均空；done 仅累计处理数量 | 独立持久化 error，失败卡显示原因；成功/失败/尚未保存分别计数，不把错误写入生成内容或提示词 |
| 反推空白响应被标为成功 | 客户端仅检查 truthiness，空格字符串通过 | 仅接受非空 trim 后的 string；其他响应明确失败。实际路由原有服务端文字检查保持 |
| 反推期间切换项目仍继续提交后续输入 | worker 没有捕获项目、账号和工作空间的 current guard | 未开始的请求停止并有明确失败原因；同账号/空间内已完成结果保存回原项目，不串当前项目；换账号/空间不再写入 |
| 已存上传图片但新画布仍空 | uploadRoot 在 mergeWorks 完成前发布 pendingNodeRef；无关 projects/store 更新可以先消费该 ref，清掉唯一导航请求 | 先确认作品同步，再发布导航并触发一次 works render；仅当前 importScope 打开项目，后台上传不把已切走用户拉回 |
| 空图片节点上传后同样可能不显示，失败重试可能重复上传 | doUploadPend 提前移除占位、先发布 ref，再 fire-and-forget merge | 成功同步后才移除占位；已上传 artworkId 单独保留回执，再次点击只同步同一个作品，不发第二次上传 |

## 模块归属

- `canvas-client.tsx`：上述两条用户操作编排、已保存作品的视图交接、文本失败显示。
- `canvas/reverse-prompt-batch.ts`：最多 2 路的有序、逐输入结果编排；不拥有网络、模型、账务或数据库。
- `db.ts` 文本节点 CRUD、`/api/canvas/text-nodes`：独立 `error_message` 字段，最大 2000 字符，成功状态清除旧错误；旧行默认为空。仅扩展 schema，不回填或移动原数据。
- `canvas-history.ts`：text-restore 可选 error 字段，撤销/恢复不丢失败原因；旧客户端没有该字段仍兼容。已有 owner 条件、幂等 operationId 不变。
- 不修改供应商执行、收费语义、旧任务恢复凭据或媒体权限。其他子任务的模型/报价/删除改动由父统一验收。

## 集中验证

### 源码函数与异步边界

`node scripts/verify-canvas-upload-reverse.cjs --source-root <before> --baseline --output-root <tests/baseline-final>`：

```text
CANVAS_UPLOAD_REVERSE=REPRODUCED CHECKS=2 FAILED=0 SUPPLIER_CALLS=0 EXIT=1
```

旧真实 reversePromptsForSelection 在 5 输入下先生成 2 占位，失败内容为空；旧 uploadRoot+原 pending effect 在 GET 门闩间被无关项目刷新消费，上传成功但没有打开新项目。不是用缺少新导出函数作为复现。

修改态同脚本：

```text
CANVAS_UPLOAD_REVERSE=PASS CHECKS=5 FAILED=0 SUPPLIER_CALLS=0 EXIT=0
```

包括切项目不拉回、占位已上传后同步失败→重试只读原 ID（上传次数保持 1）、切换上下文停止后续反推请求。

### 完整 Next 页面

`CANVAS_UPLOAD_REVERSE_URL=http://127.0.0.1:18071 node scripts/verify-canvas-upload-reverse-ui.cjs`：

```text
CANVAS_UPLOAD_REVERSE_UI=PASS CHECKS=5 FULL_NEXT=1 SUPPLIER_CALLS=0
```

真实 Shift 多选 5 图→反推，接口门闩前完整出现 5 个占位；结果 3 成功、2 明确失败，sourceIds 一一对应、仅 5 次调用；刷新后失败原因保持；真实“创建新项目→上传”无需刷新即显示。pageerror=0，外部供应商网络=0。

截图 `tests/ui-r2/reverse-results.png`、`tests/ui-r2/new-project-upload.png` 已打开检查。首轮使用 Ctrl+A 未进入多选，修正为产品现有 Shift 多选后通过，未修改产品快捷键来迎合测试。

### 真实 SQL

本任务独占 `postgres:16-alpine` 容器、loopback 随机端口、tmpfs；`verify-canvas-text-failure-pg.cjs` 执行真实文本 CRUD 与完整 history 函数，9 项通过：新增列幂等/旧行保留、错误独立存取、长度限制、跨 owner upsert 拒绝、成功清错、history 恢复和回放幂等、跨 owner history 拒绝、旧无 error payload兼容。

```text
CANVAS_TEXT_FAILURE_PG=PASS CHECKS=9 REAL_SQL=1 SUPPLIER_CALLS=0
```

副本回滚、整合类型检查、最终 main 提交和发布状态由父封存记录统一登记。本模块不自行提交、推送或发布。
