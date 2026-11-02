# 分镜原生入口、制作面板与原操作恢复

## 模块与职责

- 基线 `2e79509754542ce620e22be62e24721d6ae47487`，本次 worktree `E:/Workspace/naumi-storyboard-flow-20261102`。
- `storyboard-client.ts`：正式剧本规划消息、镜头选择/顺序、冻结提交意图的纯逻辑；无网络、数据库和收费操作。
- `use-storyboard-workflow.ts`：复用现有工作流 API，持久保留原 operation、作用域、请求和恢复过程；单串行轮询及有限退避。
- `StoryboardPanel`：浅色镜头方案/制作记录、复用或重新生成、输出次序、真实节点编辑、状态/成片播放下载、仅合成重试。没有另建视频任务系统。
- `canvas-client.tsx`：只做既有 Agent、文字Dock、视频Dock、作品刷新和真实节点编辑接线；未修改 `canvas-action-menu.tsx`。

## 公共接口、依赖与状态归属

- 文字节点入口调用 `storyboardPlanningRequest`，传正式 textNodeId/projectKey，不截取原稿放进聊天；使用现有画布 Agent。消息明确只规划、按实际cap选择 multi_shot 或 independent、不换模型、不生成素材、不执行制作链。
- Agent 的实际 `video_nodes` SSE 回执在任务成功后打开制作面板并选中其真实节点；手动从视频Dock也可打开。
- 视频Dock先保存当前草稿成功再打开制作面板，防止用户眼前编辑和工作流读取版本错位。
- POST `/api/canvas/video-workflows`：`{id,projectKey,nodes:[{id,revision,reuseCompleted?}],assembly?:{nodeIds}}`。次序只决定合成，不暗改依赖；复用已有结果是可见选项。
- GET `/api/video/workflows?projectKey=...` / `GET /api/video/workflows/[id]`；POST `[id]` 复用 resume/cancel/confirm，并接 `retry-assembly` + `expectedAttempt`。后端拥有归属、冻结、收费、幂等与媒体任务。
- 浏览器 sessionStorage 按账号/目标账号、workspace、项目保存原请求与制作记录；不以404、503或HTTP状态推断没有受理。只有服务端明确 `operationNotStaged:true` 才清待核对请求。继续使用同一id及完整原payload，绝不另建未知任务。
- 变更workspace关闭面板、取消读取；异步回执由作用域/生命周期核对，旧回执不写入新面板。镜头草稿顺序按相同作用域缓存，单镜编辑后回到面板仍可保留方案。
- 已有run按状态、taskId及assembly签名去重，未变化的轮询不触发画布刷新。成片真实 artworkId 经既有 mergeWorks 回到画布，不伪造节点。

## UI 行为

1. 已完成且非空文字节点显示“拆分镜头”；忙、只读、锁定、未完成原稿不触发。
2. 面板可勾选/排列镜头、进入实际节点编辑、明确选复用/重新生成；支持生成并合成或仅生成。
3. 只有一节点（包含原生shots的情况也一样）默认仅生成，不被concat最少两段约束卡住。
4. 已确认失败/取消且已有合成job时显示“仅重试合成”；前序镜头失败未创建job，不显示误导的合成重试。
5. 成片显示真实video控件及打开/下载链接；未知请求留原编号并提供核对继续。
6. 原生ShotEditor接入 `minShotDurationSeconds`、`shotDurationStep`、`maxShotPromptChars`，输入最小/步长/长度来自能力声明，不硬编码全部模型。

## 集中验证

```text
CWD E:/Workspace/naumi-storyboard-flow-20261102
node scripts/verify-storyboard-ui.cjs
STORYBOARD_UI=PASS CHECKS=11 DESKTOP=1366 MOBILE=390 UNKNOWN_SAME_OPERATION=PASS ASSEMBLY_ONLY_RETRY=PASS NO_UNCHANGED_REFRESH=PASS REAL_SUPPLIER_CALLS=0
exit 0
```

真实 React panel/hook/ShotEditor/规划按钮；API为受控本地函数，独立headless Edge通过HTML拦截运行，无监听服务、无用户浏览器、无生产API、无收费供应商请求。

11项覆盖：已有结果复用和明确顺序、编辑真实node、revision/reuse/顺序冻结、断网重载原payload、仅合成重试、结果控件与真实作品id回调、未变化不刷新、单节点仅生成、390px无横向溢出、原生输入约束、规划正式来源、workspace变化不重放。测试用一秒真实FFmpeg视频检查player媒体显示，媒体生成质量/保声由独立后端和audio测试覆盖。

证据根 `E:/Workspace/naumi/output/storyboard-flow-20261102/`：
- `ui-run.txt`、`ui/RESULT.json`。
- `ui/storyboard-plan-desktop.png`、`ui/storyboard-result-desktop.png`、`ui/storyboard-mobile.png`，均已打开检查。
- 新模块定向lint `ui-new-lint.txt` exit0，无warnings/errors。
- 包含旧canvas-client/settings-dialog的定向lint exit0，保留原有React依赖warnings；本次新增模块warning已修正。
- 本切片阶段全量tsc只报告并行后端media-jobs inputs隐式any三项，本UI无诊断；整模块最终类型结果由root收口，不冒充已绿。

## 迁移与交接

- 全局状态、会话、节点编辑/生成、媒体账务仍沿用原模块，无数据库迁移由此UI引入。
- 此UI脚本不是全App/SSE/生产验收；root负责实际Agent/工作流/合成集成、主线合并与完整回退包。
- 本轮仅代码/测试/合 main，47暂停发布、103实验线隔离保持。
