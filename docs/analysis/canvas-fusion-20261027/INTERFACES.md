# 当前源码接口索引

固定 main `305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea`。自动提取的源码目录索引，不是运行接口探测；没有调用HTTP或供应商。

## HTTP 入口

| 路由 | 声明的方法 | 源码 |
|---|---|---|
| `/api/canvas/video-nodes/[id]/batch` | GET, POST | [源码](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/canvas/video-nodes/[id]/batch/route.ts#L1) |
| `/api/canvas/video-nodes/[id]/generate` | POST | [源码](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/canvas/video-nodes/[id]/generate/route.ts#L1) |
| `/api/canvas/video-nodes/[id]` | GET, PATCH | [源码](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/canvas/video-nodes/[id]/route.ts#L1) |
| `/api/canvas/video-nodes/copy` | POST | [源码](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/canvas/video-nodes/copy/route.ts#L1) |
| `/api/canvas/video-nodes` | GET, POST | [源码](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/canvas/video-nodes/route.ts#L1) |
| `/api/canvas/video-workflows` | POST | [源码](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/canvas/video-workflows/route.ts#L1) |
| `/api/video/assets` | GET, POST | [源码](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/assets/route.ts#L1) |
| `/api/video/byoc/catalog` | GET | [源码](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/byoc/catalog/route.ts#L1) |
| `/api/video/catalog` | GET | [源码](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/catalog/route.ts#L1) |
| `/api/video/extract` | POST | [源码](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/extract/route.ts#L1) |
| `/api/video/generate` | POST | [源码](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/generate/route.ts#L1) |
| `/api/video/media-jobs/[id]` | DELETE, GET | [源码](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/media-jobs/[id]/route.ts#L1) |
| `/api/video/media-jobs/quote` | GET | [源码](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/media-jobs/quote/route.ts#L1) |
| `/api/video/media-jobs` | GET, POST | [源码](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/media-jobs/route.ts#L1) |
| `/api/video/nodes` | GET | [源码](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/nodes/route.ts#L1) |
| `/api/video/projects` | GET | [源码](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/projects/route.ts#L1) |
| `/api/video/references` | POST | [源码](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/references/route.ts#L1) |
| `/api/video/results` | DELETE, GET | [源码](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/results/route.ts#L1) |
| `/api/video/tasks/[id]/cancel` | POST | [源码](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/tasks/[id]/cancel/route.ts#L1) |
| `/api/video/tasks/[id]/resolve` | POST | [源码](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/tasks/[id]/resolve/route.ts#L1) |
| `/api/video/tasks/[id]/retry` | POST | [源码](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/tasks/[id]/retry/route.ts#L1) |
| `/api/video/tasks/[id]` | DELETE, GET | [源码](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/tasks/[id]/route.ts#L1) |
| `/api/video/tasks/[id]/send-to-canvas` | POST | [源码](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/tasks/[id]/send-to-canvas/route.ts#L1) |
| `/api/video/tasks` | GET | [源码](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/tasks/route.ts#L1) |
| `/api/video/texts` | GET, POST | [源码](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/texts/route.ts#L1) |
| `/api/video/worker/drain-status` | GET | [源码](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/worker/drain-status/route.ts#L1) |
| `/api/video/worker/tick` | GET, POST | [源码](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/worker/tick/route.ts#L1) |
| `/api/video/workflows/[id]` | GET, POST | [源码](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/workflows/[id]/route.ts#L1) |
| `/api/video/workflows` | GET, POST | [源码](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/workflows/route.ts#L1) |

## 视频 Agent 工具

下列是实际注册工具，不代表用户所有请求都会调用，亦不证明模型必然遵守制作规则。

| 工具 | 标签 | 定义 |
|---|---|---|
| `run_video_workflow` | 执行视频制作链 | [canvas-video-tools.ts:60](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L60) |
| `get_video_workflow` | 查询视频制作链 | [canvas-video-tools.ts:61](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L61) |
| `resume_video_workflow` | 继续视频制作链 | [canvas-video-tools.ts:62](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L62) |
| `cancel_video_workflow` | 停止视频制作链 | [canvas-video-tools.ts:63](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L63) |
| `confirm_video_workflow_stage` | 确认原阶段报价 | [canvas-video-tools.ts:64](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L64) |
| `list_video_models` | 视频能力目录 | [canvas-video-tools.ts:65](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L65) |
| `list_video_workflows` | 自备视频工作流 | [canvas-video-tools.ts:66](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L66) |
| `list_video_text_nodes` | 读取剧本来源 | [canvas-video-tools.ts:67](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L67) |
| `get_video_text` | 读取片段文字 | [canvas-video-tools.ts:68](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L68) |
| `plan_video_script` | 保存剧本资产 | [canvas-video-tools.ts:69](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L69) |
| `get_video_config` | 读取视频节点 | [canvas-video-tools.ts:74](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L74) |
| `list_video_assets` | 本人媒体素材 | [canvas-video-tools.ts:75](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L75) |
| `list_video_nodes` | 画布视频节点 | [canvas-video-tools.ts:76](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L76) |
| `create_video_node` | 创建视频节点 | [canvas-video-tools.ts:77](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L77) |
| `set_video_config` | 保存视频参数 | [canvas-video-tools.ts:78](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L78) |
| `set_video_prompt` | 保存视频描述 | [canvas-video-tools.ts:79](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L79) |
| `set_video_references` | 保存视频有序引用 | [canvas-video-tools.ts:80](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L80) |
| `plan_video_shot` | 保存单镜头方案 | [canvas-video-tools.ts:81](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L81) |
| `plan_video_storyboard` | 保存分镜方案 | [canvas-video-tools.ts:82](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L82) |
| `generate_video` | 生成节点视频 | [canvas-video-tools.ts:105](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L105) |
| `extend_video` | 续写节点视频 | [canvas-video-tools.ts:106](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L106) |
| `edit_video` | 编辑节点视频 | [canvas-video-tools.ts:107](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L107) |
| `get_video_task` | 查询视频任务 | [canvas-video-tools.ts:108](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L108) |
| `cancel_video_task` | 请求停止视频 | [canvas-video-tools.ts:109](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L109) |
| `process_video` | 视频媒体处理 | [canvas-video-tools.ts:110](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L110) |
| `get_video_media_task` | 查询媒体处理 | [canvas-video-tools.ts:111](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L111) |
| `cancel_video_media_task` | 停止媒体处理 | [canvas-video-tools.ts:112](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L112) |

## 协议 profile

旧分支声明 44 项；当前声明 53 项；新增 9 项，移除 0 项。声明/注册不等于当前账号可调用。

| profile | 来源分层 |
|---|---|
| `openai-videos` | 旧分支已有 |
| `grok2api` | 旧分支已有 |
| `cogvideox3` | 旧分支已有 |
| `agnes` | 旧分支已有 |
| `agnes-v25` | 旧分支已有 |
| `ark` | 旧分支已有 |
| `kie-generic` | 旧分支已有 |
| `kie-kling` | 旧分支已有 |
| `kie-kling-v26` | 旧分支已有 |
| `kie-kling-omni-text` | 旧分支已有 |
| `kie-kling-omni-image` | 旧分支已有 |
| `kie-kling-omni-reference` | 旧分支已有 |
| `kie-kling-omni-transform` | 旧分支已有 |
| `kie-motion-control` | 旧分支已有 |
| `apimart-generic` | 旧分支已有 |
| `apimart-kling` | 旧分支已有 |
| `apimart-kling-v26` | 旧分支已有 |
| `apimart-kling-omni` | 旧分支已有 |
| `apimart-motion-control` | 旧分支已有 |
| `gemini` | 旧分支已有 |
| `minimax` | 旧分支已有 |
| `metaso` | 旧分支已有 |
| `autodl` | 旧分支已有 |
| `runninghub` | 旧分支已有 |
| `comfyui` | 旧分支已有 |
| `tokendance-seedance` | 旧分支已有 |
| `tokendance-kling-text` | 旧分支已有 |
| `tokendance-kling-image` | 旧分支已有 |
| `tokendance-kling-motion` | 旧分支已有 |
| `tokendance-kling-omni` | 旧分支已有 |
| `tokendance-wan3` | 旧分支已有 |
| `tokendance-happyhorse` | 旧分支已有 |
| `tokendance-minimax` | 旧分支已有 |
| `tfrouter-generic` | 旧分支已有 |
| `tfrouter-kling` | 旧分支已有 |
| `tfrouter-kling-omni` | 旧分支已有 |
| `tfrouter-grok` | 旧分支已有 |
| `compshare-h3` | 旧分支已有 |
| `compshare-hailuo` | 旧分支已有 |
| `compshare-vidu` | 旧分支已有 |
| `compshare-vidu-extend` | 旧分支已有 |
| `compshare-vidu-lip-sync` | 旧分支已有 |
| `compshare-wan` | 旧分支已有 |
| `compshare-seedance` | 旧分支已有 |
| `apimart-apib-seedance` | 之后新增 |
| `apimart-apib-kling` | 之后新增 |
| `apimart-apib-wan` | 之后新增 |
| `apimart-apib-h3` | 之后新增 |
| `geek-kling` | 之后新增 |
| `geek-wan3` | 之后新增 |
| `apib-video-v2` | 之后新增 |
| `geek-video-v2` | 之后新增 |
| `geek-h3-v2` | 之后新增 |

## 数据归属线索

此处列视频目录、节点服务与Agent文件实际引用的业务表；共享账号、计费、作品和媒体表见总览，不是数据库全库清单。只有读引用时不冒充表定义。

| 表 | 定义或引用 |
|---|---|
| `app_canvas_video_batches` | 定义：[src/lib/video/canvas-batch.ts:27](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/canvas-batch.ts#L27) |
| `app_canvas_video_node_copies` | 定义：[src/lib/canvas/video-node-repository.ts:23](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/canvas/video-node-repository.ts#L23) |
| `app_canvas_video_node_operations` | 定义：[src/lib/canvas/video-node-repository.ts:21](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/canvas/video-node-repository.ts#L21) |
| `app_canvas_video_nodes` | 定义：[src/lib/canvas/video-node-repository.ts:13](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/canvas/video-node-repository.ts#L13) |
| `app_canvas_video_projects` | 定义：[src/lib/canvas/video-node-repository.ts:11](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/canvas/video-node-repository.ts#L11) |
| `app_canvas_video_task_sends` | 定义：[src/lib/canvas/video-node-repository.ts:19](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/canvas/video-node-repository.ts#L19) |
| `app_canvas_video_workflow_sources` | 定义：[src/lib/canvas/video-node-repository.ts:20](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/canvas/video-node-repository.ts#L20) |
| `app_video_asset_imports` | 定义：[src/lib/video/assets.ts:15](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/assets.ts#L15) |
| `app_video_media_jobs` | 定义：[src/lib/video/media-jobs.ts:30](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-jobs.ts#L30) |
| `app_video_media_probes` | 定义：[src/lib/video/media-inspection.ts:16](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-inspection.ts#L16)；[src/lib/video/media-jobs.ts:39](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-jobs.ts#L39) |
| `app_video_model_defaults` | 定义：[src/lib/video/frozen-capability.ts:15](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/frozen-capability.ts#L15) |
| `app_video_reference_uploads` | 定义：[src/lib/video/reference-upload.ts:9](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/reference-upload.ts#L9) |
| `app_video_script_operations` | 定义：[src/lib/video/script-assets.ts:25](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/script-assets.ts#L25) |
| `app_video_tasks` | 引用：[src/lib/video/cancellation.ts:15](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/cancellation.ts#L15)；[src/lib/video/result-assets.ts:37](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/result-assets.ts#L37) |
| `app_video_workflow_run_nodes` | 定义：[src/lib/video/workflow.ts:32](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow.ts#L32) |
| `app_video_workflow_runs` | 定义：[src/lib/video/workflow.ts:22](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow.ts#L22) |

## 视频目录与关键集成点的公开符号

词法索引含函数、类型和常量；不是所有函数的动态调用图。完整业务链见总览和能力矩阵。

| 模块 | 符号 | 行 |
|---|---|---|
| `src/app/api/canvas/video-nodes/[id]/batch/route.ts` | `const runtime` | [14](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/canvas/video-nodes/[id]/batch/route.ts#L14) |
| `src/app/api/canvas/video-nodes/[id]/batch/route.ts` | `function GET` | [23](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/canvas/video-nodes/[id]/batch/route.ts#L23) |
| `src/app/api/canvas/video-nodes/[id]/batch/route.ts` | `function POST` | [31](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/canvas/video-nodes/[id]/batch/route.ts#L31) |
| `src/app/api/canvas/video-nodes/[id]/generate/route.ts` | `const runtime` | [13](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/canvas/video-nodes/[id]/generate/route.ts#L13) |
| `src/app/api/canvas/video-nodes/[id]/generate/route.ts` | `function POST` | [15](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/canvas/video-nodes/[id]/generate/route.ts#L15) |
| `src/app/api/canvas/video-nodes/[id]/route.ts` | `const runtime` | [9](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/canvas/video-nodes/[id]/route.ts#L9) |
| `src/app/api/canvas/video-nodes/[id]/route.ts` | `function GET` | [12](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/canvas/video-nodes/[id]/route.ts#L12) |
| `src/app/api/canvas/video-nodes/[id]/route.ts` | `function PATCH` | [14](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/canvas/video-nodes/[id]/route.ts#L14) |
| `src/app/api/canvas/video-nodes/copy/route.ts` | `const runtime` | [11](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/canvas/video-nodes/copy/route.ts#L11) |
| `src/app/api/canvas/video-nodes/copy/route.ts` | `function POST` | [13](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/canvas/video-nodes/copy/route.ts#L13) |
| `src/app/api/canvas/video-nodes/route.ts` | `const runtime` | [9](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/canvas/video-nodes/route.ts#L9) |
| `src/app/api/canvas/video-nodes/route.ts` | `function GET` | [11](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/canvas/video-nodes/route.ts#L11) |
| `src/app/api/canvas/video-nodes/route.ts` | `function POST` | [13](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/canvas/video-nodes/route.ts#L13) |
| `src/app/api/canvas/video-workflows/route.ts` | `const runtime` | [10](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/canvas/video-workflows/route.ts#L10) |
| `src/app/api/canvas/video-workflows/route.ts` | `function POST` | [11](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/canvas/video-workflows/route.ts#L11) |
| `src/app/api/video/assets/route.ts` | `const runtime` | [8](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/assets/route.ts#L8) |
| `src/app/api/video/assets/route.ts` | `function POST` | [9](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/assets/route.ts#L9) |
| `src/app/api/video/assets/route.ts` | `function GET` | [11](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/assets/route.ts#L11) |
| `src/app/api/video/byoc/catalog/route.ts` | `const runtime` | [7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/byoc/catalog/route.ts#L7) |
| `src/app/api/video/byoc/catalog/route.ts` | `function GET` | [8](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/byoc/catalog/route.ts#L8) |
| `src/app/api/video/catalog/route.ts` | `const runtime` | [18](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/catalog/route.ts#L18) |
| `src/app/api/video/catalog/route.ts` | `const dynamic` | [19](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/catalog/route.ts#L19) |
| `src/app/api/video/catalog/route.ts` | `function GET` | [21](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/catalog/route.ts#L21) |
| `src/app/api/video/extract/route.ts` | `const runtime` | [12](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/extract/route.ts#L12) |
| `src/app/api/video/extract/route.ts` | `const dynamic` | [13](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/extract/route.ts#L13) |
| `src/app/api/video/extract/route.ts` | `const maxDuration` | [14](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/extract/route.ts#L14) |
| `src/app/api/video/extract/route.ts` | `function POST` | [20](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/extract/route.ts#L20) |
| `src/app/api/video/generate/route.ts` | `const runtime` | [15](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/generate/route.ts#L15) |
| `src/app/api/video/generate/route.ts` | `function POST` | [38](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/generate/route.ts#L38) |
| `src/app/api/video/media-jobs/[id]/route.ts` | `const runtime` | [6](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/media-jobs/[id]/route.ts#L6) |
| `src/app/api/video/media-jobs/[id]/route.ts` | `const dynamic` | [7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/media-jobs/[id]/route.ts#L7) |
| `src/app/api/video/media-jobs/[id]/route.ts` | `const maxDuration` | [8](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/media-jobs/[id]/route.ts#L8) |
| `src/app/api/video/media-jobs/[id]/route.ts` | `function GET` | [17](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/media-jobs/[id]/route.ts#L17) |
| `src/app/api/video/media-jobs/[id]/route.ts` | `function DELETE` | [18](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/media-jobs/[id]/route.ts#L18) |
| `src/app/api/video/media-jobs/quote/route.ts` | `const runtime` | [5](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/media-jobs/quote/route.ts#L5) |
| `src/app/api/video/media-jobs/quote/route.ts` | `const dynamic` | [6](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/media-jobs/quote/route.ts#L6) |
| `src/app/api/video/media-jobs/quote/route.ts` | `function GET` | [7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/media-jobs/quote/route.ts#L7) |
| `src/app/api/video/media-jobs/route.ts` | `const runtime` | [9](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/media-jobs/route.ts#L9) |
| `src/app/api/video/media-jobs/route.ts` | `const dynamic` | [10](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/media-jobs/route.ts#L10) |
| `src/app/api/video/media-jobs/route.ts` | `const maxDuration` | [11](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/media-jobs/route.ts#L11) |
| `src/app/api/video/media-jobs/route.ts` | `function GET` | [13](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/media-jobs/route.ts#L13) |
| `src/app/api/video/media-jobs/route.ts` | `function POST` | [21](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/media-jobs/route.ts#L21) |
| `src/app/api/video/nodes/route.ts` | `const runtime` | [8](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/nodes/route.ts#L8) |
| `src/app/api/video/nodes/route.ts` | `function GET` | [10](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/nodes/route.ts#L10) |
| `src/app/api/video/projects/route.ts` | `const runtime` | [4](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/projects/route.ts#L4) |
| `src/app/api/video/projects/route.ts` | `function GET` | [5](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/projects/route.ts#L5) |
| `src/app/api/video/references/route.ts` | `const runtime` | [11](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/references/route.ts#L11) |
| `src/app/api/video/references/route.ts` | `const dynamic` | [12](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/references/route.ts#L12) |
| `src/app/api/video/references/route.ts` | `const maxDuration` | [13](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/references/route.ts#L13) |
| `src/app/api/video/references/route.ts` | `function POST` | [40](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/references/route.ts#L40) |
| `src/app/api/video/results/route.ts` | `const runtime` | [6](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/results/route.ts#L6) |
| `src/app/api/video/results/route.ts` | `const dynamic` | [7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/results/route.ts#L7) |
| `src/app/api/video/results/route.ts` | `function GET` | [9](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/results/route.ts#L9) |
| `src/app/api/video/results/route.ts` | `function DELETE` | [17](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/results/route.ts#L17) |
| `src/app/api/video/tasks/[id]/cancel/route.ts` | `const runtime` | [6](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/tasks/[id]/cancel/route.ts#L6) |
| `src/app/api/video/tasks/[id]/cancel/route.ts` | `function POST` | [7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/tasks/[id]/cancel/route.ts#L7) |
| `src/app/api/video/tasks/[id]/resolve/route.ts` | `const runtime` | [9](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/tasks/[id]/resolve/route.ts#L9) |
| `src/app/api/video/tasks/[id]/resolve/route.ts` | `function POST` | [12](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/tasks/[id]/resolve/route.ts#L12) |
| `src/app/api/video/tasks/[id]/retry/route.ts` | `const runtime` | [15](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/tasks/[id]/retry/route.ts#L15) |
| `src/app/api/video/tasks/[id]/retry/route.ts` | `function POST` | [17](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/tasks/[id]/retry/route.ts#L17) |
| `src/app/api/video/tasks/[id]/route.ts` | `const runtime` | [15](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/tasks/[id]/route.ts#L15) |
| `src/app/api/video/tasks/[id]/route.ts` | `const dynamic` | [16](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/tasks/[id]/route.ts#L16) |
| `src/app/api/video/tasks/[id]/route.ts` | `function GET` | [18](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/tasks/[id]/route.ts#L18) |
| `src/app/api/video/tasks/[id]/route.ts` | `function DELETE` | [31](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/tasks/[id]/route.ts#L31) |
| `src/app/api/video/tasks/[id]/send-to-canvas/route.ts` | `const runtime` | [9](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/tasks/[id]/send-to-canvas/route.ts#L9) |
| `src/app/api/video/tasks/[id]/send-to-canvas/route.ts` | `function POST` | [10](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/tasks/[id]/send-to-canvas/route.ts#L10) |
| `src/app/api/video/tasks/route.ts` | `const runtime` | [15](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/tasks/route.ts#L15) |
| `src/app/api/video/tasks/route.ts` | `const dynamic` | [16](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/tasks/route.ts#L16) |
| `src/app/api/video/tasks/route.ts` | `const maxDuration` | [17](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/tasks/route.ts#L17) |
| `src/app/api/video/tasks/route.ts` | `function GET` | [21](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/tasks/route.ts#L21) |
| `src/app/api/video/texts/route.ts` | `const runtime` | [11](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/texts/route.ts#L11) |
| `src/app/api/video/texts/route.ts` | `function POST` | [12](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/texts/route.ts#L12) |
| `src/app/api/video/texts/route.ts` | `function GET` | [23](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/texts/route.ts#L23) |
| `src/app/api/video/worker/drain-status/route.ts` | `const runtime` | [4](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/worker/drain-status/route.ts#L4) |
| `src/app/api/video/worker/drain-status/route.ts` | `const dynamic` | [5](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/worker/drain-status/route.ts#L5) |
| `src/app/api/video/worker/drain-status/route.ts` | `function GET` | [8](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/worker/drain-status/route.ts#L8) |
| `src/app/api/video/worker/tick/route.ts` | `const runtime` | [12](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/worker/tick/route.ts#L12) |
| `src/app/api/video/worker/tick/route.ts` | `const dynamic` | [13](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/worker/tick/route.ts#L13) |
| `src/app/api/video/worker/tick/route.ts` | `const maxDuration` | [14](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/worker/tick/route.ts#L14) |
| `src/app/api/video/worker/tick/route.ts` | `function POST` | [45](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/worker/tick/route.ts#L45) |
| `src/app/api/video/worker/tick/route.ts` | `function GET` | [56](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/worker/tick/route.ts#L56) |
| `src/app/api/video/workflows/[id]/route.ts` | `const runtime` | [11](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/workflows/[id]/route.ts#L11) |
| `src/app/api/video/workflows/[id]/route.ts` | `function GET` | [14](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/workflows/[id]/route.ts#L14) |
| `src/app/api/video/workflows/[id]/route.ts` | `function POST` | [16](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/workflows/[id]/route.ts#L16) |
| `src/app/api/video/workflows/route.ts` | `const runtime` | [9](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/workflows/route.ts#L9) |
| `src/app/api/video/workflows/route.ts` | `function GET` | [11](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/workflows/route.ts#L11) |
| `src/app/api/video/workflows/route.ts` | `function POST` | [13](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/workflows/route.ts#L13) |
| `src/app/video/page.tsx` | `const metadata` | [4](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/video/page.tsx#L4) |
| `src/components/canvas/video/byoc-settings.tsx` | `function VideoByocSettings` | [9](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/byoc-settings.tsx#L9) |
| `src/components/canvas/video/camera-settings.tsx` | `function CameraSettings` | [9](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/camera-settings.tsx#L9) |
| `src/components/canvas/video/compact-composer.tsx` | `function VideoCompactComposer` | [19](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/compact-composer.tsx#L19) |
| `src/components/canvas/video/dialog-stack.ts` | `function isTopVideoDialog` | [1](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/dialog-stack.ts#L1) |
| `src/components/canvas/video/element-editor.tsx` | `function ElementEditor` | [7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/element-editor.tsx#L7) |
| `src/components/canvas/video/form-controls.tsx` | `const videoFieldClass` | [4](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/form-controls.tsx#L4) |
| `src/components/canvas/video/form-controls.tsx` | `const videoButtonClass` | [5](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/form-controls.tsx#L5) |
| `src/components/canvas/video/form-controls.tsx` | `function assertVideoFieldsValid` | [6](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/form-controls.tsx#L6) |
| `src/components/canvas/video/form-controls.tsx` | `function VideoField` | [7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/form-controls.tsx#L7) |
| `src/components/canvas/video/form-controls.tsx` | `function VideoSection` | [8](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/form-controls.tsx#L8) |
| `src/components/canvas/video/generation-node.tsx` | `type VideoGenerationNodeData` | [10](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/generation-node.tsx#L10) |
| `src/components/canvas/video/generation-node.tsx` | `function VideoGenerationNode` | [32](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/generation-node.tsx#L32) |
| `src/components/canvas/video/history-picker.tsx` | `function VideoHistoryPicker` | [43](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/history-picker.tsx#L43) |
| `src/components/canvas/video/i18n.ts` | `function useVideoI18n` | [5](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/i18n.ts#L5) |
| `src/components/canvas/video/media-actions.tsx` | `type MediaInputChoice` | [13](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/media-actions.tsx#L13) |
| `src/components/canvas/video/media-actions.tsx` | `function MediaActionsDialog` | [51](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/media-actions.tsx#L51) |
| `src/components/canvas/video/node-toolbar.tsx` | `const VideoNodeToolbar` | [8](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/node-toolbar.tsx#L8) |
| `src/components/canvas/video/parameter-panel.tsx` | `function VideoParameterPanel` | [8](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/parameter-panel.tsx#L8) |
| `src/components/canvas/video/player.tsx` | `type VideoPlayerAction` | [7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/player.tsx#L7) |
| `src/components/canvas/video/player.tsx` | `function mediaDownloadHref` | [11](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/player.tsx#L11) |
| `src/components/canvas/video/player.tsx` | `function mediaDownloadName` | [12](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/player.tsx#L12) |
| `src/components/canvas/video/player.tsx` | `function VideoPlayer` | [20](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/player.tsx#L20) |
| `src/components/canvas/video/prompt-optimizer.tsx` | `function VideoPromptOptimizer` | [8](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/prompt-optimizer.tsx#L8) |
| `src/components/canvas/video/reference-list.tsx` | `function ReferenceList` | [10](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/reference-list.tsx#L10) |
| `src/components/canvas/video/result-dock.tsx` | `const VideoResultDock` | [8](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/result-dock.tsx#L8) |
| `src/components/canvas/video/settings-dialog.tsx` | `type VideoNodeDraft` | [20](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/settings-dialog.tsx#L20) |
| `src/components/canvas/video/settings-dialog.tsx` | `function VideoSettingsDialog` | [26](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/settings-dialog.tsx#L26) |
| `src/components/canvas/video/settings-fields.tsx` | `function VideoSettingsFields` | [17](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/settings-fields.tsx#L17) |
| `src/components/canvas/video/settings-panel.tsx` | `function VideoSettingsPanel` | [7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/settings-panel.tsx#L7) |
| `src/components/canvas/video/shot-editor.tsx` | `function ShotEditor` | [6](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/shot-editor.tsx#L6) |
| `src/components/canvas/video/source-attribution.tsx` | `function VideoSourceAttribution` | [3](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/source-attribution.tsx#L3) |
| `src/components/canvas/video/use-byoc-catalog.ts` | `function useVideoByocCatalog` | [6](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/use-byoc-catalog.ts#L6) |
| `src/components/canvas/video/use-media-jobs.ts` | `class MediaQuoteRequired` | [7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/use-media-jobs.ts#L7) |
| `src/components/canvas/video/use-media-jobs.ts` | `function useMediaJobs` | [12](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/use-media-jobs.ts#L12) |
| `src/components/canvas/video/use-video-assets.ts` | `class VideoAssetImportError` | [9](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/use-video-assets.ts#L9) |
| `src/components/canvas/video/use-video-assets.ts` | `function videoAssetChoice` | [10](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/use-video-assets.ts#L10) |
| `src/components/canvas/video/use-video-assets.ts` | `function useVideoAssets` | [11](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/use-video-assets.ts#L11) |
| `src/components/canvas/video/use-video-catalog.ts` | `function useVideoCatalog` | [7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/use-video-catalog.ts#L7) |
| `src/components/canvas/video/use-video-generation.ts` | `class VideoGenerationPriceChanged` | [10](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/use-video-generation.ts#L10) |
| `src/components/canvas/video/use-video-generation.ts` | `function useVideoGeneration` | [12](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/use-video-generation.ts#L12) |
| `src/components/canvas/video/use-video-history.ts` | `type VideoTaskDetail` | [8](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/use-video-history.ts#L8) |
| `src/components/canvas/video/use-video-history.ts` | `type CanvasVideoSend` | [9](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/use-video-history.ts#L9) |
| `src/components/canvas/video/use-video-history.ts` | `class VideoRetryPriceChanged` | [10](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/use-video-history.ts#L10) |
| `src/components/canvas/video/use-video-history.ts` | `function useVideoHistory` | [15](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/use-video-history.ts#L15) |
| `src/components/canvas/video/use-video-nodes.ts` | `type VideoPrivateFetch` | [7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/use-video-nodes.ts#L7) |
| `src/components/canvas/video/use-video-nodes.ts` | `class VideoNodeClientError` | [8](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/use-video-nodes.ts#L8) |
| `src/components/canvas/video/use-video-nodes.ts` | `function useVideoNodes` | [10](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/use-video-nodes.ts#L10) |
| `src/components/canvas/video/use-video-tasks.ts` | `function useVideoTasks` | [6](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/use-video-tasks.ts#L6) |
| `src/components/video/video-studio-session.tsx` | `function VideoStudioClient` | [26](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/video/video-studio-session.tsx#L26) |
| `src/lib/video/assets.ts` | `const videoAssetImportSchema` | [12](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/assets.ts#L12) |
| `src/lib/video/assets.ts` | `type VideoAssetView` | [13](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/assets.ts#L13) |
| `src/lib/video/assets.ts` | `function ensureVideoAssetSchema` | [15](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/assets.ts#L15) |
| `src/lib/video/assets.ts` | `function importVideoAsset` | [16](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/assets.ts#L16) |
| `src/lib/video/assets.ts` | `function listOwnedVideoAssets` | [33](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/assets.ts#L33) |
| `src/lib/video/byoc-recipe.ts` | `type FrozenByocRecipe` | [17](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/byoc-recipe.ts#L17) |
| `src/lib/video/byoc-recipe.ts` | `function runFrozenByocRecipe` | [19](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/byoc-recipe.ts#L19) |
| `src/lib/video/byoc-recipe.ts` | `function prepareByocRecipe` | [20](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/byoc-recipe.ts#L20) |
| `src/lib/video/byoc-settings.ts` | `const videoByocOverridesSchema` | [5](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/byoc-settings.ts#L5) |
| `src/lib/video/byoc-settings.ts` | `type VideoByocOverrides` | [6](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/byoc-settings.ts#L6) |
| `src/lib/video/byoc-settings.ts` | `type VideoByocWorkflow` | [7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/byoc-settings.ts#L7) |
| `src/lib/video/byoc-settings.ts` | `type VideoByocCatalog` | [8](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/byoc-settings.ts#L8) |
| `src/lib/video/byoc.ts` | `const byocVideoInputSchema` | [26](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/byoc.ts#L26) |
| `src/lib/video/byoc.ts` | `function knownComfyVideoOutput` | [34](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/byoc.ts#L34) |
| `src/lib/video/byoc.ts` | `function withByocVideoTask` | [35](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/byoc.ts#L35) |
| `src/lib/video/byoc.ts` | `function submitByocComfyVideo` | [46](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/byoc.ts#L46) |
| `src/lib/video/byoc.ts` | `function retryByocVideoTask` | [81](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/byoc.ts#L81) |
| `src/lib/video/camera-presets.ts` | `interface CameraProfile` | [20](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/camera-presets.ts#L20) |
| `src/lib/video/camera-presets.ts` | `interface LensProfile` | [36](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/camera-presets.ts#L36) |
| `src/lib/video/camera-presets.ts` | `const CAMERA_PROFILES` | [49](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/camera-presets.ts#L49) |
| `src/lib/video/camera-presets.ts` | `const LENS_PROFILES` | [140](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/camera-presets.ts#L140) |
| `src/lib/video/camera-presets.ts` | `const FOCAL_LENGTHS` | [231](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/camera-presets.ts#L231) |
| `src/lib/video/camera-presets.ts` | `const APERTURES` | [232](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/camera-presets.ts#L232) |
| `src/lib/video/camera-presets.ts` | `type FocalLengthValue` | [234](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/camera-presets.ts#L234) |
| `src/lib/video/camera-presets.ts` | `type ApertureValue` | [235](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/camera-presets.ts#L235) |
| `src/lib/video/camera-presets.ts` | `const FOCAL_LENGTH_META` | [238](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/camera-presets.ts#L238) |
| `src/lib/video/camera-presets.ts` | `const APERTURE_META` | [253](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/camera-presets.ts#L253) |
| `src/lib/video/camera-presets.ts` | `function describeFocalLength` | [267](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/camera-presets.ts#L267) |
| `src/lib/video/camera-presets.ts` | `function describeAperture` | [278](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/camera-presets.ts#L278) |
| `src/lib/video/camera.ts` | `const videoCameraSchema` | [3](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/camera.ts#L3) |
| `src/lib/video/camera.ts` | `type VideoCamera` | [4](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/camera.ts#L4) |
| `src/lib/video/camera.ts` | `function compileVideoCamera` | [5](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/camera.ts#L5) |
| `src/lib/video/cancellation.ts` | `function requestVideoCancellation` | [20](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/cancellation.ts#L20) |
| `src/lib/video/cancellation.ts` | `function beginVideoTaskSubmission` | [36](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/cancellation.ts#L36) |
| `src/lib/video/cancellation.ts` | `function confirmVideoTaskCancelled` | [52](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/cancellation.ts#L52) |
| `src/lib/video/cancellation.ts` | `function sendPendingVideoCancellation` | [59](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/cancellation.ts#L59) |
| `src/lib/video/canvas-batch-client.ts` | `function videoBatchQuote` | [5](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/canvas-batch-client.ts#L5) |
| `src/lib/video/canvas-batch-client.ts` | `function hasCanvasVideoBatch` | [12](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/canvas-batch-client.ts#L12) |
| `src/lib/video/canvas-batch-client.ts` | `function generateCanvasVideoBatch` | [21](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/canvas-batch-client.ts#L21) |
| `src/lib/video/canvas-batch.ts` | `const canvasVideoBatchSchema` | [18](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/canvas-batch.ts#L18) |
| `src/lib/video/canvas-batch.ts` | `function readCanvasVideoBatch` | [34](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/canvas-batch.ts#L34) |
| `src/lib/video/canvas-batch.ts` | `function submitCanvasVideoBatch` | [43](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/canvas-batch.ts#L43) |
| `src/lib/video/canvas-receipts.ts` | `type CanvasVideoReceipt` | [3](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/canvas-receipts.ts#L3) |
| `src/lib/video/canvas-receipts.ts` | `function readVideoReceipt` | [5](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/canvas-receipts.ts#L5) |
| `src/lib/video/canvas-receipts.ts` | `function prepareVideoReceipt` | [8](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/canvas-receipts.ts#L8) |
| `src/lib/video/canvas-receipts.ts` | `function saveVideoReceipt` | [12](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/canvas-receipts.ts#L12) |
| `src/lib/video/canvas-receipts.ts` | `function clearVideoReceipt` | [13](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/canvas-receipts.ts#L13) |
| `src/lib/video/canvas-workflow.ts` | `const canvasWorkflowSchema` | [13](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/canvas-workflow.ts#L13) |
| `src/lib/video/canvas-workflow.ts` | `function buildCanvasVideoWorkflow` | [14](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/canvas-workflow.ts#L14) |
| `src/lib/video/canvas-workflow.ts` | `function scheduleCanvasVideoWorkflow` | [29](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/canvas-workflow.ts#L29) |
| `src/lib/video/canvas-workflow.ts` | `type PreparedCanvasVideoWorkflow` | [38](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/canvas-workflow.ts#L38) |
| `src/lib/video/canvas-workflow.ts` | `function prepareCanvasVideoWorkflow` | [39](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/canvas-workflow.ts#L39) |
| `src/lib/video/capabilities.ts` | `type VideoModelCapability` | [11](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/capabilities.ts#L11) |
| `src/lib/video/capabilities.ts` | `function documentedVideoCapability` | [114](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/capabilities.ts#L114) |
| `src/lib/video/capabilities.ts` | `function fallbackCapability` | [119](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/capabilities.ts#L119) |
| `src/lib/video/capabilities.ts` | `function getVideoModelCapability` | [142](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/capabilities.ts#L142) |
| `src/lib/video/capabilities.ts` | `function validateAgainstCapability` | [153](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/capabilities.ts#L153) |
| `src/lib/video/capabilities.ts` | `function configuredVideoCapability` | [224](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/capabilities.ts#L224) |
| `src/lib/video/capabilities.ts` | `type VideoCatalogEntry` | [233](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/capabilities.ts#L233) |
| `src/lib/video/capabilities.ts` | `function videoCatalog` | [236](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/capabilities.ts#L236) |
| `src/lib/video/capabilities.ts` | `function configuredVideoCatalog` | [249](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/capabilities.ts#L249) |
| `src/lib/video/capability-schema.ts` | `const VIDEO_MODES` | [3](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/capability-schema.ts#L3) |
| `src/lib/video/capability-schema.ts` | `type VideoMode` | [4](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/capability-schema.ts#L4) |
| `src/lib/video/capability-schema.ts` | `const videoOptionSchema` | [11](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/capability-schema.ts#L11) |
| `src/lib/video/capability-schema.ts` | `const videoLimitsSchema` | [18](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/capability-schema.ts#L18) |
| `src/lib/video/capability-schema.ts` | `const videoDefinitionSchema` | [24](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/capability-schema.ts#L24) |
| `src/lib/video/capability-schema.ts` | `type VideoModelDefinition` | [37](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/capability-schema.ts#L37) |
| `src/lib/video/capability-schema.ts` | `type VideoOptionDefinition` | [38](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/capability-schema.ts#L38) |
| `src/lib/video/capability-schema.ts` | `type CapabilitySource` | [39](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/capability-schema.ts#L39) |
| `src/lib/video/capability-schema.ts` | `type ResolvedVideoCapability` | [40](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/capability-schema.ts#L40) |
| `src/lib/video/capability-schema.ts` | `const VIDEO_WIRE_PROFILES` | [41](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/capability-schema.ts#L41) |
| `src/lib/video/capability-schema.ts` | `const videoWireProfileSchema` | [46](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/capability-schema.ts#L46) |
| `src/lib/video/capability-schema.ts` | `type VideoWireProfile` | [47](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/capability-schema.ts#L47) |
| `src/lib/video/capability-schema.ts` | `const VIDEO_PROTOCOLS` | [48](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/capability-schema.ts#L48) |
| `src/lib/video/capability-schema.ts` | `function videoProfileProtocol` | [49](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/capability-schema.ts#L49) |
| `src/lib/video/client-history.ts` | `function videoHistoryDraft` | [7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/client-history.ts#L7) |
| `src/lib/video/client-settings.ts` | `type VideoNodeConfig` | [13](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/client-settings.ts#L13) |
| `src/lib/video/client-settings.ts` | `type VideoCatalogModel` | [14](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/client-settings.ts#L14) |
| `src/lib/video/client-settings.ts` | `type VideoInputChoice` | [15](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/client-settings.ts#L15) |
| `src/lib/video/client-settings.ts` | `function resolveVideoTextInputs` | [16](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/client-settings.ts#L16) |
| `src/lib/video/client-settings.ts` | `const VIDEO_MODE_LABELS` | [23](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/client-settings.ts#L23) |
| `src/lib/video/client-settings.ts` | `const VIDEO_ROLE_LABELS` | [24](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/client-settings.ts#L24) |
| `src/lib/video/client-settings.ts` | `const VIDEO_KIND_LABELS` | [25](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/client-settings.ts#L25) |
| `src/lib/video/client-settings.ts` | `function selectedVideoCatalogModel` | [26](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/client-settings.ts#L26) |
| `src/lib/video/client-settings.ts` | `function catalogCapability` | [33](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/client-settings.ts#L33) |
| `src/lib/video/client-settings.ts` | `function videoDurations` | [34](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/client-settings.ts#L34) |
| `src/lib/video/client-settings.ts` | `function videoResolutions` | [35](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/client-settings.ts#L35) |
| `src/lib/video/client-settings.ts` | `function videoAspectRatios` | [36](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/client-settings.ts#L36) |
| `src/lib/video/client-settings.ts` | `function videoNodeCreationDefaults` | [38](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/client-settings.ts#L38) |
| `src/lib/video/client-settings.ts` | `function videoModeRoles` | [48](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/client-settings.ts#L48) |
| `src/lib/video/client-settings.ts` | `function reconcileVideoSettings` | [59](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/client-settings.ts#L59) |
| `src/lib/video/client-settings.ts` | `function inputReference` | [84](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/client-settings.ts#L84) |
| `src/lib/video/client-settings.ts` | `function validateVideoSettings` | [88](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/client-settings.ts#L88) |
| `src/lib/video/client.ts` | `type VideoClientConfig` | [13](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/client.ts#L13) |
| `src/lib/video/client.ts` | `type VideoTaskStatus` | [19](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/client.ts#L19) |
| `src/lib/video/client.ts` | `function resolveVideoConfig` | [21](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/client.ts#L21) |
| `src/lib/video/client.ts` | `function createVideoTask` | [39](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/client.ts#L39) |
| `src/lib/video/client.ts` | `function getVideoStatus` | [91](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/client.ts#L91) |
| `src/lib/video/client.ts` | `function fetchVideoContent` | [122](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/client.ts#L122) |
| `src/lib/video/contract.ts` | `class VideoContractError` | [9](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/contract.ts#L9) |
| `src/lib/video/contract.ts` | `function resolveVideoCapability` | [13](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/contract.ts#L13) |
| `src/lib/video/contract.ts` | `const videoInputSchema` | [46](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/contract.ts#L46) |
| `src/lib/video/contract.ts` | `type NormalizedVideoInput` | [47](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/contract.ts#L47) |
| `src/lib/video/contract.ts` | `function normalizeVideoInput` | [56](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/contract.ts#L56) |
| `src/lib/video/coordination-pool.ts` | `function getVideoCoordinationPool` | [14](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/coordination-pool.ts#L14) |
| `src/lib/video/coordination-pool.ts` | `function acquireVideoCoordinationLock` | [37](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/coordination-pool.ts#L37) |
| `src/lib/video/frozen-capability-schema.ts` | `const frozenVideoSchema` | [4](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/frozen-capability-schema.ts#L4) |
| `src/lib/video/frozen-capability-schema.ts` | `type FrozenVideoCapability` | [7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/frozen-capability-schema.ts#L7) |
| `src/lib/video/frozen-capability.ts` | `function ensureVideoDefaultsSchema` | [13](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/frozen-capability.ts#L13) |
| `src/lib/video/frozen-capability.ts` | `function freezeManagedVideoCapability` | [20](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/frozen-capability.ts#L20) |
| `src/lib/video/media-billing.ts` | `function mediaBillingQuote` | [8](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-billing.ts#L8) |
| `src/lib/video/media-billing.ts` | `class MediaPriceChangedError` | [14](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-billing.ts#L14) |
| `src/lib/video/media-billing.ts` | `function confirmMediaQuote` | [20](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-billing.ts#L20) |
| `src/lib/video/media-client-intent.ts` | `type MediaJobIntent` | [3](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-client-intent.ts#L3) |
| `src/lib/video/media-client-intent.ts` | `type MediaReceipt` | [4](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-client-intent.ts#L4) |
| `src/lib/video/media-client-intent.ts` | `function mediaIntent` | [6](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-client-intent.ts#L6) |
| `src/lib/video/media-client-intent.ts` | `function mediaReceiptKey` | [7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-client-intent.ts#L7) |
| `src/lib/video/media-client-intent.ts` | `function readMediaReceipt` | [8](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-client-intent.ts#L8) |
| `src/lib/video/media-client-intent.ts` | `function writeMediaReceipt` | [9](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-client-intent.ts#L9) |
| `src/lib/video/media-client-intent.ts` | `function clearMediaReceipt` | [10](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-client-intent.ts#L10) |
| `src/lib/video/media-client-intent.ts` | `function clearTerminalMediaReceipts` | [11](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-client-intent.ts#L11) |
| `src/lib/video/media-formats.ts` | `function mediaExtension` | [3](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-formats.ts#L3) |
| `src/lib/video/media-formats.ts` | `function inspectedMediaMime` | [9](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-formats.ts#L9) |
| `src/lib/video/media-inspection.ts` | `type FrozenMediaInput` | [13](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-inspection.ts#L13) |
| `src/lib/video/media-inspection.ts` | `function ensureMediaInspectionSchema` | [15](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-inspection.ts#L15) |
| `src/lib/video/media-inspection.ts` | `function recordMediaProbe` | [18](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-inspection.ts#L18) |
| `src/lib/video/media-inspection.ts` | `function verifiedOwnedMedia` | [22](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-inspection.ts#L22) |
| `src/lib/video/media-job-schema.ts` | `const mediaOutputNameSchema` | [3](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-job-schema.ts#L3) |
| `src/lib/video/media-job-schema.ts` | `const mediaAuxiliarySchema` | [5](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-job-schema.ts#L5) |
| `src/lib/video/media-job-schema.ts` | `const mediaActionSchema` | [6](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-job-schema.ts#L6) |
| `src/lib/video/media-job-schema.ts` | `const mediaJobRequestSchema` | [7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-job-schema.ts#L7) |
| `src/lib/video/media-job-schema.ts` | `type MediaJobRequest` | [28](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-job-schema.ts#L28) |
| `src/lib/video/media-job-schema.ts` | `type MediaProbe` | [29](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-job-schema.ts#L29) |
| `src/lib/video/media-job-schema.ts` | `type MediaJobStatus` | [30](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-job-schema.ts#L30) |
| `src/lib/video/media-job-schema.ts` | `type MediaJobOutput` | [31](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-job-schema.ts#L31) |
| `src/lib/video/media-job-schema.ts` | `type PublicMediaJob` | [32](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-job-schema.ts#L32) |
| `src/lib/video/media-jobs.ts` | `function ensureMediaJobSchema` | [28](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-jobs.ts#L28) |
| `src/lib/video/media-jobs.ts` | `function publicMediaJob` | [64](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-jobs.ts#L64) |
| `src/lib/video/media-jobs.ts` | `function listMediaJobs` | [67](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-jobs.ts#L67) |
| `src/lib/video/media-jobs.ts` | `function createMediaJob` | [82](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-jobs.ts#L82) |
| `src/lib/video/media-jobs.ts` | `function cancelMediaJob` | [249](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-jobs.ts#L249) |
| `src/lib/video/media-jobs.ts` | `function recoverMediaJobs` | [254](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-jobs.ts#L254) |
| `src/lib/video/media-jobs.ts` | `function getMediaJob` | [258](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-jobs.ts#L258) |
| `src/lib/video/media.ts` | `const MEDIA_JOB_DIR` | [8](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media.ts#L8) |
| `src/lib/video/media.ts` | `type WorkerInput` | [9](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media.ts#L9) |
| `src/lib/video/media.ts` | `type WorkerAuxiliaryInput` | [10](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media.ts#L10) |
| `src/lib/video/media.ts` | `type WorkerOutput` | [11](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media.ts#L11) |
| `src/lib/video/media.ts` | `type WorkerJobView` | [12](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media.ts#L12) |
| `src/lib/video/media.ts` | `function mediaWorkerConfigured` | [13](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media.ts#L13) |
| `src/lib/video/media.ts` | `class MediaWorkerError` | [14](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media.ts#L14) |
| `src/lib/video/media.ts` | `function mediaWorkerHealth` | [19](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media.ts#L19) |
| `src/lib/video/media.ts` | `function mediaJobDirectory` | [23](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media.ts#L23) |
| `src/lib/video/media.ts` | `function mediaWorkerRequest` | [24](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media.ts#L24) |
| `src/lib/video/media.ts` | `function prepareMediaInputs` | [29](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media.ts#L29) |
| `src/lib/video/media.ts` | `function auxiliaryMediaBytes` | [44](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media.ts#L44) |
| `src/lib/video/media.ts` | `function prepareMediaAuxiliary` | [49](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media.ts#L49) |
| `src/lib/video/media.ts` | `function readMediaWorkerOutput` | [57](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media.ts#L57) |
| `src/lib/video/media.ts` | `function waitMediaWorker` | [63](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media.ts#L63) |
| `src/lib/video/media.ts` | `function cleanupMediaWorkerJob` | [70](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media.ts#L70) |
| `src/lib/video/media.ts` | `function probeMedia` | [82](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media.ts#L82) |
| `src/lib/video/media.ts` | `function probeVideo` | [90](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media.ts#L90) |
| `src/lib/video/model-definition.ts` | `function adapterDefinition` | [7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/model-definition.ts#L7) |
| `src/lib/video/model-definition.ts` | `function managedVideoDefinition` | [16](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/model-definition.ts#L16) |
| `src/lib/video/model-definition.ts` | `function legacyVideoView` | [25](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/model-definition.ts#L25) |
| `src/lib/video/node-submission.ts` | `function submitCanvasVideo` | [13](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/node-submission.ts#L13) |
| `src/lib/video/parameter-options.ts` | `function videoParameterScope` | [4](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/parameter-options.ts#L4) |
| `src/lib/video/polling-state.ts` | `function sameVideoSnapshot` | [6](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/polling-state.ts#L6) |
| `src/lib/video/polling-state.ts` | `function mergeVideoNodeSnapshots` | [16](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/polling-state.ts#L16) |
| `src/lib/video/polling-state.ts` | `function reuseVideoTaskSnapshots` | [26](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/polling-state.ts#L26) |
| `src/lib/video/production-prompt.ts` | `const VIDEO_PRODUCTION_PROMPT` | [6](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/production-prompt.ts#L6) |
| `src/lib/video/prompt-assist.ts` | `const VIDEO_PROMPT_OPTIMIZE_SYSTEM` | [1](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/prompt-assist.ts#L1) |
| `src/lib/video/prompt-assist.ts` | `function validateVideoOptimizedPrompt` | [6](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/prompt-assist.ts#L6) |
| `src/lib/video/prompt.ts` | `function compileVideoPrompt` | [3](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/prompt.ts#L3) |
| `src/lib/video/providers/adapter.ts` | `function registerVideoProvider` | [26](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/adapter.ts#L26) |
| `src/lib/video/providers/adapter.ts` | `function getVideoProvider` | [31](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/adapter.ts#L31) |
| `src/lib/video/providers/adapter.ts` | `function listVideoProviderIds` | [41](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/adapter.ts#L41) |
| `src/lib/video/providers/config.ts` | `type VideoProviderProtocol` | [6](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/config.ts#L6) |
| `src/lib/video/providers/config.ts` | `type VideoProviderRuntimeConfig` | [21](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/config.ts#L21) |
| `src/lib/video/providers/config.ts` | `function configuredVideoProviders` | [105](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/config.ts#L105) |
| `src/lib/video/providers/config.ts` | `function getVideoProviderConfig` | [143](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/config.ts#L143) |
| `src/lib/video/providers/config.ts` | `function publicProviderSnapshot` | [153](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/config.ts#L153) |
| `src/lib/video/providers/direct.ts` | `function createDirectVideoAdapter` | [227](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/direct.ts#L227) |
| `src/lib/video/providers/openai-videos.ts` | `function resolveOpenAiVideosConfig` | [27](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/openai-videos.ts#L27) |
| `src/lib/video/providers/openai-videos.ts` | `const openAiVideosAdapter` | [62](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/openai-videos.ts#L62) |
| `src/lib/video/providers/private-context.ts` | `const currentPrivateVideoContext` | [6](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/private-context.ts#L6) |
| `src/lib/video/providers/private-context.ts` | `function runPrivateVideoProvider` | [7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/private-context.ts#L7) |
| `src/lib/video/providers/protocols/apib-documented.ts` | `function buildAPIBDocumentedCreate` | [8](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/apib-documented.ts#L8) |
| `src/lib/video/providers/protocols/apib-documented.ts` | `const apibDocumentedCodec` | [49](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/apib-documented.ts#L49) |
| `src/lib/video/providers/protocols/apib-verified.ts` | `const APIB_VERIFIED_PROFILES` | [8](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/apib-verified.ts#L8) |
| `src/lib/video/providers/protocols/apib-verified.ts` | `function buildAPIBVerifiedCreate` | [43](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/apib-verified.ts#L43) |
| `src/lib/video/providers/protocols/apib-verified.ts` | `const apibVerifiedCodec` | [87](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/apib-verified.ts#L87) |
| `src/lib/video/providers/protocols/apimart.ts` | `function buildAPIMartCreate` | [3](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/apimart.ts#L3) |
| `src/lib/video/providers/protocols/apimart.ts` | `function decodeAPIMartCreated` | [38](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/apimart.ts#L38) |
| `src/lib/video/providers/protocols/apimart.ts` | `function buildAPIMartPoll` | [39](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/apimart.ts#L39) |
| `src/lib/video/providers/protocols/apimart.ts` | `function decodeAPIMartPoll` | [40](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/apimart.ts#L40) |
| `src/lib/video/providers/protocols/apimart.ts` | `const apimartCodec` | [42](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/apimart.ts#L42) |
| `src/lib/video/providers/protocols/ark.ts` | `function buildArkCreate` | [3](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/ark.ts#L3) |
| `src/lib/video/providers/protocols/ark.ts` | `function decodeArkCreated` | [12](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/ark.ts#L12) |
| `src/lib/video/providers/protocols/ark.ts` | `function buildArkPoll` | [13](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/ark.ts#L13) |
| `src/lib/video/providers/protocols/ark.ts` | `function decodeArkPoll` | [14](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/ark.ts#L14) |
| `src/lib/video/providers/protocols/ark.ts` | `const arkCodec` | [15](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/ark.ts#L15) |
| `src/lib/video/providers/protocols/autodl.ts` | `function buildAutoDLCreate` | [5](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/autodl.ts#L5) |
| `src/lib/video/providers/protocols/autodl.ts` | `function decodeAutoDLCreated` | [10](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/autodl.ts#L10) |
| `src/lib/video/providers/protocols/autodl.ts` | `function buildAutoDLPoll` | [14](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/autodl.ts#L14) |
| `src/lib/video/providers/protocols/autodl.ts` | `function decodeAutoDLPoll` | [15](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/autodl.ts#L15) |
| `src/lib/video/providers/protocols/autodl.ts` | `const autoDLCodec` | [23](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/autodl.ts#L23) |
| `src/lib/video/providers/protocols/comfyui.ts` | `function buildComfyUICreate` | [4](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/comfyui.ts#L4) |
| `src/lib/video/providers/protocols/comfyui.ts` | `function decodeComfyUICreated` | [9](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/comfyui.ts#L9) |
| `src/lib/video/providers/protocols/comfyui.ts` | `function buildComfyUIPoll` | [13](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/comfyui.ts#L13) |
| `src/lib/video/providers/protocols/comfyui.ts` | `function decodeComfyUIPoll` | [15](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/comfyui.ts#L15) |
| `src/lib/video/providers/protocols/comfyui.ts` | `const comfyUICodec` | [32](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/comfyui.ts#L32) |
| `src/lib/video/providers/protocols/compshare.ts` | `const COMPSHARE_PROFILES` | [5](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/compshare.ts#L5) |
| `src/lib/video/providers/protocols/compshare.ts` | `function buildCompshareCreate` | [6](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/compshare.ts#L6) |
| `src/lib/video/providers/protocols/compshare.ts` | `function decodeCompshareCreated` | [71](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/compshare.ts#L71) |
| `src/lib/video/providers/protocols/compshare.ts` | `function buildCompsharePoll` | [72](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/compshare.ts#L72) |
| `src/lib/video/providers/protocols/compshare.ts` | `function decodeCompsharePoll` | [73](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/compshare.ts#L73) |
| `src/lib/video/providers/protocols/compshare.ts` | `function compshareCodec` | [81](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/compshare.ts#L81) |
| `src/lib/video/providers/protocols/geek-documented.ts` | `function buildGeekDocumentedCreate` | [8](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/geek-documented.ts#L8) |
| `src/lib/video/providers/protocols/geek-documented.ts` | `const geekDocumentedCodec` | [34](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/geek-documented.ts#L34) |
| `src/lib/video/providers/protocols/geek-h3-documented.ts` | `const geekH3DocumentedCodec` | [16](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/geek-h3-documented.ts#L16) |
| `src/lib/video/providers/protocols/geek-verified.ts` | `const GEEK_VERIFIED_PROFILES` | [6](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/geek-verified.ts#L6) |
| `src/lib/video/providers/protocols/geek-verified.ts` | `function buildGeekVerifiedCreate` | [13](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/geek-verified.ts#L13) |
| `src/lib/video/providers/protocols/geek-verified.ts` | `function decodeGeekVerifiedCreated` | [36](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/geek-verified.ts#L36) |
| `src/lib/video/providers/protocols/geek-verified.ts` | `function buildGeekVerifiedPoll` | [40](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/geek-verified.ts#L40) |
| `src/lib/video/providers/protocols/geek-verified.ts` | `function decodeGeekVerifiedPoll` | [41](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/geek-verified.ts#L41) |
| `src/lib/video/providers/protocols/geek-verified.ts` | `function geekVerifiedCodec` | [47](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/geek-verified.ts#L47) |
| `src/lib/video/providers/protocols/gemini.ts` | `const GEMINI_WIRE_OPTIONS` | [4](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/gemini.ts#L4) |
| `src/lib/video/providers/protocols/gemini.ts` | `function buildGeminiCreate` | [5](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/gemini.ts#L5) |
| `src/lib/video/providers/protocols/gemini.ts` | `function decodeGeminiCreated` | [16](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/gemini.ts#L16) |
| `src/lib/video/providers/protocols/gemini.ts` | `function buildGeminiPoll` | [17](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/gemini.ts#L17) |
| `src/lib/video/providers/protocols/gemini.ts` | `function decodeGeminiPoll` | [21](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/gemini.ts#L21) |
| `src/lib/video/providers/protocols/gemini.ts` | `const geminiCodec` | [34](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/gemini.ts#L34) |
| `src/lib/video/providers/protocols/index.ts` | `function installVideoWireCodecs` | [20](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/index.ts#L20) |
| `src/lib/video/providers/protocols/kie.ts` | `function buildKIECreate` | [4](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/kie.ts#L4) |
| `src/lib/video/providers/protocols/kie.ts` | `function decodeKIECreated` | [58](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/kie.ts#L58) |
| `src/lib/video/providers/protocols/kie.ts` | `function buildKIEPoll` | [62](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/kie.ts#L62) |
| `src/lib/video/providers/protocols/kie.ts` | `function decodeKIEPoll` | [63](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/kie.ts#L63) |
| `src/lib/video/providers/protocols/kie.ts` | `const kieCodec` | [68](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/kie.ts#L68) |
| `src/lib/video/providers/protocols/minimax.ts` | `function buildMiniMaxCreate` | [3](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/minimax.ts#L3) |
| `src/lib/video/providers/protocols/minimax.ts` | `function decodeMiniMaxCreated` | [13](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/minimax.ts#L13) |
| `src/lib/video/providers/protocols/minimax.ts` | `function buildMiniMaxPoll` | [14](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/minimax.ts#L14) |
| `src/lib/video/providers/protocols/minimax.ts` | `function decodeMiniMaxPoll` | [15](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/minimax.ts#L15) |
| `src/lib/video/providers/protocols/minimax.ts` | `const minimaxCodec` | [16](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/minimax.ts#L16) |
| `src/lib/video/providers/protocols/openai-compatible.ts` | `function buildOpenAICompatibleCreate` | [13](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/openai-compatible.ts#L13) |
| `src/lib/video/providers/protocols/openai-compatible.ts` | `function decodeOpenAICompatibleCreated` | [45](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/openai-compatible.ts#L45) |
| `src/lib/video/providers/protocols/openai-compatible.ts` | `function buildOpenAICompatiblePoll` | [46](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/openai-compatible.ts#L46) |
| `src/lib/video/providers/protocols/openai-compatible.ts` | `function decodeOpenAICompatiblePoll` | [50](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/openai-compatible.ts#L50) |
| `src/lib/video/providers/protocols/openai-compatible.ts` | `function openAICompatibleCodec` | [54](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/openai-compatible.ts#L54) |
| `src/lib/video/providers/protocols/runninghub.ts` | `function buildRunningHubCreate` | [4](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/runninghub.ts#L4) |
| `src/lib/video/providers/protocols/runninghub.ts` | `function decodeRunningHubCreated` | [14](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/runninghub.ts#L14) |
| `src/lib/video/providers/protocols/runninghub.ts` | `function buildRunningHubPoll` | [18](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/runninghub.ts#L18) |
| `src/lib/video/providers/protocols/runninghub.ts` | `function decodeRunningHubPoll` | [19](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/runninghub.ts#L19) |
| `src/lib/video/providers/protocols/runninghub.ts` | `const runningHubCodec` | [31](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/runninghub.ts#L31) |
| `src/lib/video/providers/protocols/tfrouter.ts` | `const TF_ROUTER_PROFILES` | [4](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/tfrouter.ts#L4) |
| `src/lib/video/providers/protocols/tfrouter.ts` | `function buildTFRouterCreate` | [5](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/tfrouter.ts#L5) |
| `src/lib/video/providers/protocols/tfrouter.ts` | `function decodeTFRouterCreated` | [29](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/tfrouter.ts#L29) |
| `src/lib/video/providers/protocols/tfrouter.ts` | `function buildTFRouterPoll` | [30](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/tfrouter.ts#L30) |
| `src/lib/video/providers/protocols/tfrouter.ts` | `function decodeTFRouterPoll` | [31](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/tfrouter.ts#L31) |
| `src/lib/video/providers/protocols/tfrouter.ts` | `const tfRouterCodec` | [40](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/tfrouter.ts#L40) |
| `src/lib/video/providers/protocols/tokendance.ts` | `const TOKEN_DANCE_PROFILES` | [16](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/tokendance.ts#L16) |
| `src/lib/video/providers/protocols/tokendance.ts` | `function buildTokenDanceCreate` | [18](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/tokendance.ts#L18) |
| `src/lib/video/providers/protocols/tokendance.ts` | `function buildTokenDancePoll` | [61](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/tokendance.ts#L61) |
| `src/lib/video/providers/protocols/tokendance.ts` | `function decodeTokenDanceCreated` | [66](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/tokendance.ts#L66) |
| `src/lib/video/providers/protocols/tokendance.ts` | `function decodeTokenDancePoll` | [71](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/tokendance.ts#L71) |
| `src/lib/video/providers/protocols/tokendance.ts` | `function tokenDanceCodec` | [77](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/tokendance.ts#L77) |
| `src/lib/video/providers/protocols/workflow-inputs.ts` | `function compileWorkflowInputs` | [5](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/workflow-inputs.ts#L5) |
| `src/lib/video/providers/result-fetch.ts` | `type VideoResultAssetSource` | [7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/result-fetch.ts#L7) |
| `src/lib/video/providers/result-fetch.ts` | `function downloadVideoResultAsset` | [10](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/result-fetch.ts#L10) |
| `src/lib/video/providers/wire-adapter.ts` | `function videoWireEndpoint` | [13](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire-adapter.ts#L13) |
| `src/lib/video/providers/wire-adapter.ts` | `function createWireVideoAdapter` | [19](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire-adapter.ts#L19) |
| `src/lib/video/providers/wire.ts` | `type VideoWireContext` | [7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L7) |
| `src/lib/video/providers/wire.ts` | `type VideoWireRequest` | [8](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L8) |
| `src/lib/video/providers/wire.ts` | `type VideoWireCodec` | [9](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L9) |
| `src/lib/video/providers/wire.ts` | `function registerVideoWireProfile` | [12](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L12) |
| `src/lib/video/providers/wire.ts` | `function buildVideoCreate` | [16](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L16) |
| `src/lib/video/providers/wire.ts` | `function buildVideoPoll` | [20](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L20) |
| `src/lib/video/providers/wire.ts` | `function buildVideoCancel` | [24](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L24) |
| `src/lib/video/providers/wire.ts` | `function decodeVideoCreated` | [25](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L25) |
| `src/lib/video/providers/wire.ts` | `function decodeVideoPolled` | [26](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L26) |
| `src/lib/video/providers/wire.ts` | `function object` | [28](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L28) |
| `src/lib/video/providers/wire.ts` | `function field` | [29](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L29) |
| `src/lib/video/providers/wire.ts` | `function string` | [30](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L30) |
| `src/lib/video/providers/wire.ts` | `function requiredTaskId` | [31](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L31) |
| `src/lib/video/providers/wire.ts` | `function mediaUrl` | [32](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L32) |
| `src/lib/video/providers/wire.ts` | `function wireStatus` | [36](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L36) |
| `src/lib/video/providers/wire.ts` | `function polled` | [45](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L45) |
| `src/lib/video/providers/wire.ts` | `function jsonObjectString` | [52](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L52) |
| `src/lib/video/providers/wire.ts` | `function sanitizeWirePayload` | [56](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L56) |
| `src/lib/video/providers/wire.ts` | `function wireReferences` | [66](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L66) |
| `src/lib/video/providers/wire.ts` | `function unsupportedWire` | [72](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L72) |
| `src/lib/video/providers/wire.ts` | `function rejectAdvanced` | [73](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L73) |
| `src/lib/video/providers/wire.ts` | `function createdResult` | [74](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L74) |
| `src/lib/video/providers/wire.ts` | `function imageWireValue` | [77](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L77) |
| `src/lib/video/providers/wire.ts` | `function selectWireOptions` | [79](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L79) |
| `src/lib/video/providers/workflow-upload.ts` | `function uploadWorkflowReferences` | [10](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/workflow-upload.ts#L10) |
| `src/lib/video/reference-materialization.ts` | `function authorizeVideoReferences` | [15](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/reference-materialization.ts#L15) |
| `src/lib/video/reference-materialization.ts` | `function materializeVideoReferences` | [49](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/reference-materialization.ts#L49) |
| `src/lib/video/reference-media-token.ts` | `const VIDEO_REFERENCE_MEDIA_PATH` | [8](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/reference-media-token.ts#L8) |
| `src/lib/video/reference-media-token.ts` | `const VIDEO_REFERENCE_MEDIA_MAX_AGE_SECONDS` | [9](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/reference-media-token.ts#L9) |
| `src/lib/video/reference-media-token.ts` | `const VIDEO_REFERENCE_MEDIA_MAX_BYTES` | [10](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/reference-media-token.ts#L10) |
| `src/lib/video/reference-media-token.ts` | `type VideoReferenceMediaAsset` | [11](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/reference-media-token.ts#L11) |
| `src/lib/video/reference-media-token.ts` | `type VideoReferenceMediaClaims` | [12](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/reference-media-token.ts#L12) |
| `src/lib/video/reference-media-token.ts` | `function issueVideoReferenceToken` | [31](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/reference-media-token.ts#L31) |
| `src/lib/video/reference-media-token.ts` | `function verifyVideoReferenceToken` | [42](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/reference-media-token.ts#L42) |
| `src/lib/video/reference-media-token.ts` | `function verifyVideoReferenceMediaPathSegment` | [58](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/reference-media-token.ts#L58) |
| `src/lib/video/reference-media-token.ts` | `function matchesVideoReferenceMediaAsset` | [68](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/reference-media-token.ts#L68) |
| `src/lib/video/reference-media-token.ts` | `function createVideoReferenceMediaUrl` | [76](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/reference-media-token.ts#L76) |
| `src/lib/video/reference-media.ts` | `type VideoReferenceMediaDependencies` | [11](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/reference-media.ts#L11) |
| `src/lib/video/reference-media.ts` | `function readVerifiedVideoReferenceLocal` | [64](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/reference-media.ts#L64) |
| `src/lib/video/reference-media.ts` | `function createVideoReferenceMediaHandler` | [80](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/reference-media.ts#L80) |
| `src/lib/video/reference-upload.ts` | `function uploadVideoReference` | [11](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/reference-upload.ts#L11) |
| `src/lib/video/references.ts` | `const videoReferenceSchema` | [4](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/references.ts#L4) |
| `src/lib/video/references.ts` | `const orderedInputSchema` | [19](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/references.ts#L19) |
| `src/lib/video/references.ts` | `type OrderedInput` | [22](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/references.ts#L22) |
| `src/lib/video/references.ts` | `type NumberedInput` | [23](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/references.ts#L23) |
| `src/lib/video/references.ts` | `function numberVideoInputs` | [24](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/references.ts#L24) |
| `src/lib/video/references.ts` | `function orderedMediaReferences` | [34](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/references.ts#L34) |
| `src/lib/video/repository.ts` | `const videoRepo` | [23](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/repository.ts#L23) |
| `src/lib/video/result-assets.ts` | `type SavedVideoResultAsset` | [15](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/result-assets.ts#L15) |
| `src/lib/video/result-assets.ts` | `function collectVideoResultAssets` | [70](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/result-assets.ts#L70) |
| `src/lib/video/result-assets.ts` | `function resultMetadataWarnings` | [106](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/result-assets.ts#L106) |
| `src/lib/video/result-completion.ts` | `function completeVideoResultSet` | [7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/result-completion.ts#L7) |
| `src/lib/video/result-download.ts` | `function readLimitedMediaResponse` | [3](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/result-download.ts#L3) |
| `src/lib/video/result-download.ts` | `function readLimitedVideoResponse` | [48](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/result-download.ts#L48) |
| `src/lib/video/script-assets.ts` | `const videoScriptAssetSchema` | [11](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/script-assets.ts#L11) |
| `src/lib/video/script-assets.ts` | `function saveVideoScriptAsset` | [36](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/script-assets.ts#L36) |
| `src/lib/video/service.ts` | `const VIDEO_PROVIDER_ID` | [64](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/service.ts#L64) |
| `src/lib/video/service.ts` | `type CreateVideoInput` | [100](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/service.ts#L100) |
| `src/lib/video/service.ts` | `type PublicVideoTaskView` | [135](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/service.ts#L135) |
| `src/lib/video/service.ts` | `function publicVideoTaskView` | [160](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/service.ts#L160) |
| `src/lib/video/service.ts` | `function resolveVideoServiceConfig` | [191](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/service.ts#L191) |
| `src/lib/video/service.ts` | `function createVideoGeneration` | [196](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/service.ts#L196) |
| `src/lib/video/service.ts` | `function requestFromQueuedTask` | [261](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/service.ts#L261) |
| `src/lib/video/service.ts` | `function submitQueuedVideoTask` | [337](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/service.ts#L337) |
| `src/lib/video/service.ts` | `const handleVideoCreationError` | [401](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/service.ts#L401) |
| `src/lib/video/service.ts` | `function videoCostPublic` | [433](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/service.ts#L433) |
| `src/lib/video/service.ts` | `function listVideoTaskViews` | [551](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/service.ts#L551) |
| `src/lib/video/service.ts` | `function recoverDueVideoTasks` | [559](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/service.ts#L559) |
| `src/lib/video/service.ts` | `function pollAndSettle` | [573](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/service.ts#L573) |
| `src/lib/video/static-image-probe.ts` | `function probeStaticImage` | [51](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/static-image-probe.ts#L51) |
| `src/lib/video/submission-schema.ts` | `const videoSubmissionSchema` | [7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/submission-schema.ts#L7) |
| `src/lib/video/submission.ts` | `function requireOwnedVideoText` | [28](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/submission.ts#L28) |
| `src/lib/video/submission.ts` | `function videoCreationInputDigest` | [35](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/submission.ts#L35) |
| `src/lib/video/submission.ts` | `function createValidatedVideo` | [36](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/submission.ts#L36) |
| `src/lib/video/task-snapshot.ts` | `type PublicVideoTaskSnapshot` | [7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/task-snapshot.ts#L7) |
| `src/lib/video/task-snapshot.ts` | `function publicVideoTaskSnapshot` | [11](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/task-snapshot.ts#L11) |
| `src/lib/video/types.ts` | `type VideoTaskSource` | [9](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/types.ts#L9) |
| `src/lib/video/types.ts` | `type VideoTaskStatus` | [11](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/types.ts#L11) |
| `src/lib/video/types.ts` | `type VideoReferenceRole` | [18](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/types.ts#L18) |
| `src/lib/video/types.ts` | `type VideoReference` | [26](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/types.ts#L26) |
| `src/lib/video/types.ts` | `type VideoGenerationRequest` | [44](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/types.ts#L44) |
| `src/lib/video/types.ts` | `type VideoProviderCreateResult` | [71](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/types.ts#L71) |
| `src/lib/video/types.ts` | `type VideoProviderPollResult` | [79](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/types.ts#L79) |
| `src/lib/video/types.ts` | `type VideoTaskSnapshot` | [95](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/types.ts#L95) |
| `src/lib/video/types.ts` | `type VideoProviderFetchResult` | [106](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/types.ts#L106) |
| `src/lib/video/types.ts` | `interface VideoProviderAdapter` | [113](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/types.ts#L113) |
| `src/lib/video/types.ts` | `class TransientPollError` | [126](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/types.ts#L126) |
| `src/lib/video/types.ts` | `class PermanentVideoCreateError` | [133](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/types.ts#L133) |
| `src/lib/video/types.ts` | `class UnsupportedVideoCancellationError` | [139](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/types.ts#L139) |
| `src/lib/video/worker.ts` | `function startVideoWorker` | [36](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/worker.ts#L36) |
| `src/lib/video/worker.ts` | `function scanVideoWorkerOnce` | [56](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/worker.ts#L56) |
| `src/lib/video/workflow-creation.ts` | `function assertWorkflowCreationScope` | [10](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow-creation.ts#L10) |
| `src/lib/video/workflow-creation.ts` | `function runWorkflowCreation` | [16](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow-creation.ts#L16) |
| `src/lib/video/workflow-creation.ts` | `function bindWorkflowCreationProject` | [17](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow-creation.ts#L17) |
| `src/lib/video/workflow-creation.ts` | `function validateWorkflowCreationInputs` | [18](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow-creation.ts#L18) |
| `src/lib/video/workflow-creation.ts` | `function acceptWorkflowCreationTx` | [32](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow-creation.ts#L32) |
| `src/lib/video/workflow-creation.ts` | `function updateWorkflowCreationTx` | [42](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow-creation.ts#L42) |
| `src/lib/video/workflow-creation.ts` | `function workflowCreationStatus` | [49](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow-creation.ts#L49) |
| `src/lib/video/workflow-creation.ts` | `function withWorkflowContinuation` | [56](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow-creation.ts#L56) |
| `src/lib/video/workflow-freeze.ts` | `type FrozenWorkflowStage` | [22](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow-freeze.ts#L22) |
| `src/lib/video/workflow-freeze.ts` | `function workflowBindingId` | [23](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow-freeze.ts#L23) |
| `src/lib/video/workflow-freeze.ts` | `function withFrozenWorkflowStage` | [24](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow-freeze.ts#L24) |
| `src/lib/video/workflow-freeze.ts` | `function freezeVideoWorkflow` | [32](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow-freeze.ts#L32) |
| `src/lib/video/workflow-links.ts` | `function associateWorkflowTaskTx` | [5](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow-links.ts#L5) |
| `src/lib/video/workflow-links.ts` | `function completeWorkflowTaskTx` | [6](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow-links.ts#L6) |
| `src/lib/video/workflow-schema.ts` | `const videoWorkflowManifestSchema` | [9](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow-schema.ts#L9) |
| `src/lib/video/workflow-schema.ts` | `type VideoWorkflowManifest` | [14](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow-schema.ts#L14) |
| `src/lib/video/workflow-schema.ts` | `const workflowVideoRequestSchema` | [15](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow-schema.ts#L15) |
| `src/lib/video/workflow-schema.ts` | `const videoWorkflowPlanSchema` | [21](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow-schema.ts#L21) |
| `src/lib/video/workflow-schema.ts` | `type VideoWorkflowPlan` | [26](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow-schema.ts#L26) |
| `src/lib/video/workflow-schema.ts` | `type WorkflowVideoRequest` | [27](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow-schema.ts#L27) |
| `src/lib/video/workflow-source.ts` | `function ownedVideoWorkflowSource` | [7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow-source.ts#L7) |
| `src/lib/video/workflow-source.ts` | `function readOwnedVideoWorkflow` | [10](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow-source.ts#L10) |
| `src/lib/video/workflow-text-context.ts` | `function frozenWorkflowText` | [4](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow-text-context.ts#L4) |
| `src/lib/video/workflow-text-context.ts` | `function runFrozenWorkflowTexts` | [5](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow-text-context.ts#L5) |
| `src/lib/video/workflow.ts` | `type VideoWorkflowNodeStatus` | [19](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow.ts#L19) |
| `src/lib/video/workflow.ts` | `function validateVideoWorkflow` | [50](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow.ts#L50) |
| `src/lib/video/workflow.ts` | `function authorizeWorkflowInputs` | [66](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow.ts#L66) |
| `src/lib/video/workflow.ts` | `function scheduleVideoWorkflow` | [74](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow.ts#L74) |
| `src/lib/video/workflow.ts` | `function getVideoWorkflow` | [95](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow.ts#L95) |
| `src/lib/video/workflow.ts` | `function recoverVideoWorkflows` | [167](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow.ts#L167) |
| `src/lib/video/workflow.ts` | `function confirmVideoWorkflowNode` | [173](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow.ts#L173) |
| `src/lib/video/workflow.ts` | `function listVideoWorkflows` | [188](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow.ts#L188) |
| `src/lib/video/workflow.ts` | `function cancelVideoWorkflow` | [192](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow.ts#L192) |
| `src/lib/video/workflow.ts` | `function resumeVideoWorkflow` | [203](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow.ts#L203) |
| `src/lib/canvas/video-node-schema.ts` | `const videoNodeIdSchema` | [7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/canvas/video-node-schema.ts#L7) |
| `src/lib/canvas/video-node-schema.ts` | `const videoProjectKeySchema` | [8](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/canvas/video-node-schema.ts#L8) |
| `src/lib/canvas/video-node-schema.ts` | `const videoNodeConfigSchema` | [9](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/canvas/video-node-schema.ts#L9) |
| `src/lib/canvas/video-node-schema.ts` | `const videoNodeWriteSchema` | [17](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/canvas/video-node-schema.ts#L17) |
| `src/lib/canvas/video-node-schema.ts` | `type VideoNodeWrite` | [20](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/canvas/video-node-schema.ts#L20) |
| `src/lib/canvas/video-node-schema.ts` | `type CanvasVideoNode` | [21](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/canvas/video-node-schema.ts#L21) |
| `src/lib/canvas/video-node-service.ts` | `function authorizeVideoProject` | [20](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/canvas/video-node-service.ts#L20) |
| `src/lib/canvas/video-node-service.ts` | `function authorizeNodeInputs` | [37](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/canvas/video-node-service.ts#L37) |
| `src/lib/canvas/video-node-service.ts` | `function saveVideoNode` | [61](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/canvas/video-node-service.ts#L61) |
| `src/lib/canvas/video-node-service.ts` | `function copyVideoNodes` | [78](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/canvas/video-node-service.ts#L78) |
| `src/lib/canvas/video-node-service.ts` | `function sendVideoTaskToCanvas` | [110](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/canvas/video-node-service.ts#L110) |
| `src/lib/canvas/video-node-repository.ts` | `function ensureVideoNodeSchema` | [9](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/canvas/video-node-repository.ts#L9) |
| `src/lib/canvas/video-node-repository.ts` | `function getVideoNode` | [30](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/canvas/video-node-repository.ts#L30) |
| `src/lib/canvas/video-node-repository.ts` | `function listVideoNodes` | [31](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/canvas/video-node-repository.ts#L31) |
| `src/lib/canvas/video-node-repository.ts` | `function saveVideoNodeTx` | [32](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/canvas/video-node-repository.ts#L32) |
| `src/lib/canvas/video-node-repository.ts` | `function associateVideoTaskTx` | [62](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/canvas/video-node-repository.ts#L62) |
| `src/lib/canvas/video-node-repository.ts` | `function completeVideoNodeTx` | [72](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/canvas/video-node-repository.ts#L72) |
| `src/lib/canvas/video-projects.ts` | `function ownedCanvasVideoProjects` | [4](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/canvas/video-projects.ts#L4) |
| `src/lib/agent/canvas-video-tools.ts` | `function videoAgentOperationId` | [20](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L20) |
| `src/lib/agent/canvas-video-tools.ts` | `function createCanvasVideoTools` | [21](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L21) |
| `scripts/video-fusion/media-engine.mjs` | `const MEDIA_LIMITS` | [8](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/scripts/video-fusion/media-engine.mjs#L8) |
| `scripts/video-fusion/media-engine.mjs` | `function safeMediaName` | [16](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/scripts/video-fusion/media-engine.mjs#L16) |
| `scripts/video-fusion/media-engine.mjs` | `function mediaJobDirectory` | [20](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/scripts/video-fusion/media-engine.mjs#L20) |
| `scripts/video-fusion/media-engine.mjs` | `function parseProbe` | [21](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/scripts/video-fusion/media-engine.mjs#L21) |
| `scripts/video-fusion/media-engine.mjs` | `function replaceVirtual` | [42](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/scripts/video-fusion/media-engine.mjs#L42) |
| `scripts/video-fusion/media-engine.mjs` | `function validateMediaAuxiliaryText` | [53](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/scripts/video-fusion/media-engine.mjs#L53) |
| `scripts/video-fusion/media-engine.mjs` | `function nativeMediaArgs` | [56](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/scripts/video-fusion/media-engine.mjs#L56) |
| `scripts/video-fusion/media-engine.mjs` | `function presetMediaCommand` | [79](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/scripts/video-fusion/media-engine.mjs#L79) |
| `scripts/video-fusion/media-engine.mjs` | `class MediaEngine` | [107](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/scripts/video-fusion/media-engine.mjs#L107) |
