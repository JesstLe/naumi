# 图像创作固定次数拦截移除（批准清单 19/20）

## 边界与基线

- 任务 worktree：`C:/Users/13357/.t3/worktrees/naumi/t3-b885d705`。
- 任务分支：`t3/remove-creation-rate-limits`（T3 预先创建的隔离分支，保留绑定）。
- 父指定基线：`05598fe53bd03bfbaa74ff6ee5b39c2b689cb055`；开工工作树干净。
- 开工执行 `git fetch origin main`，观察 `origin/main=1871f84d181c8b5dc48ee506544a3857875907c1`。本任务不合入无关主线、不修改共享 checkout，整合由父任务负责。
- 父已整合冻结报价 `2bbf3f99`。`imagegen/dispatch`、`imagegen/batch`、`model-config/*`、Canvas 大组件、并发控制均不修改。
- `generate-image/route.ts` 仅修改 rate import、固定 IP 判断及其失效注释；尾部并发槽由父另一子任务负责，交由普通 merge 整合。

## 已实现模块

直接移除入口次数判断，无新策略框架、无替代计数。

1. `imagegen` 正常/批量提交、`imagegen/inputs` 上传准备、`imagegen/plan` 预览、`imagegen/recover-delivery` 原结果恢复。
2. `generate-image` 旧普通生成。保留 IP 读取用于 `isBanned`；不调整执行槽。
3. `canvas/expand`、`canvas/annotate`、`canvas/text-edit`、`canvas/image-tasks`。`text-edit` 是图片中的文字编辑，不是文字 Agent 聊天。
4. `extract`、`garment`、`garment3d`、`avatar`、`cutout`、`dewatermark`、`dewrinkle`、`inpaint`、`packaging3d`、`printfile`、`recolor`、`replicate`、`retouch`、`style`、`tryon`、`upscale`。
5. `suite`、`aplus` 及 `aplus` 的 `redo_source` 母图重做；保留重做状态、归属与持久幂等控制。

6. 原生参考工作台 `reference-workbench/[...path]` 的 `ref-upload` 删除；`ref-quote` 仅对图片动作取消，保留 `workbench/infer-prompts` 和 `chat-image/send` 的原文字规划频控。
7. `competitors/[id]/action` 取消 `edit` / `replicate` 图像动作的次数限制，保留 `analyze` 的原文字视觉分析频控。

总计 29 个 route 文件，原 31 处次数判断中删除 29 处、另外 2 处仅保留原文字分支。只读并行核对发现 `extract` / `garment` / `garment3d` 与竞品图像动作遗漏，已补齐；参考工作台 quote 混合文字与图片，不整段取消文字限制。

## 保持的行为

- 登录与真实操作者绑定、同站请求验证、素材/任务/项目归属、封禁、请求格式/大小。
- 账务、冻结报价、接受回执、幂等、Worker 授权与恢复、实际执行并发。
- `src/lib/rate-limit.ts` 原封不动。登录、鉴权、管理、文字聊天/文字创作、视频等非本任务次数限制不修改。
- 原结果恢复仍只恢复保存结果，不重新生成。
- `canvas/ocr` 与 `replicate/analyze` 是识别/分析文字而非图片创作，`canvas/workflow-import` 及其 `asset` 是本地工作流/素材导入；本轮保留。`comfyui/run` 同时处理视频，不改变共享视频路径。图片技能/工作流/端点目录管理及供应商回调限流保留。

## 集中验证（完成）

- `node node_modules/eslint/bin/eslint.js --quiet <29个修改route>`：exit 0（无错误输出），日志 `eslint.log`。
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`：exit 0（无错误输出），日志 `typecheck.log`。
- 最小标准 `next-env.d.ts` 在本worktree忽略目录按 Next 类型声明生成，没有修改共享依赖；不会提交。
- 29 个基线文件的原始字节与 `git show 05598fe...:<path>` 完全相等；原 SHA256 保存在 `source-manifest.json`。
- TypeScript AST 对照：仅允许删除固定次数与失效 import/局部 IP，以及两处仅文字条件收窄，其他登录/归属/ban/账务/幂等/大小/并发 AST 不变（29/29）。

- 可复用脚本：`scripts/verify-image-creation-rate-limits.cjs`。
- 实际执行原 route 或 AST 精确提取的入口条件，mock 下游，不访问 DB/供应商，不真实生成。
- 基线已复现原次数拦截，修改后越过旧阈值到达后续处理；动态核对匿名、跨 owner、既有 ban 与 same-site，请求大小由原始 route/body 实现保持及 AST 对照证明。
- 测试日志保存在忽略目录 `output/image-creation-rate-limits-20261023/`，测试完成后补充命令、结果、边界。

### 实际命令与结果

```powershell
node scripts/verify-image-creation-rate-limits.cjs --ref 05598fe53bd03bfbaa74ff6ee5b39c2b689cb055 --expect limited --report output/image-creation-rate-limits-20261023/baseline.json
node scripts/verify-image-creation-rate-limits.cjs --expect unlimited --report output/image-creation-rate-limits-20261023/modified.json --check-preservation
D:/DEV/Git/bin/bash.exe output/image-creation-rate-limits-20261023/ROLLBACK.sh
node scripts/verify-image-creation-rate-limits.cjs --root output/image-creation-rate-limits-20261023/rollback-copy --expect limited --report output/image-creation-rate-limits-20261023/rollback.json
```

四条命令均 exit 0。三组行为探针分别输出：

```text
PASS expect=limited routes=29 oldGuards=31 requests=3192 supplierCalls=0 dbCalls=0 httpCalls=0 sourceFilesUnchanged=true
PASS expect=unlimited routes=29 oldGuards=31 requests=3192 supplierCalls=0 dbCalls=0 httpCalls=0 sourceFilesUnchanged=true
PASS expect=limited routes=29 oldGuards=31 requests=3192 supplierCalls=0 dbCalls=0 httpCalls=0 sourceFilesUnchanged=true
```

- 回退仅操作独立 `rollback-copy`，29 个 route 的 SHA256 恢复到指定基线；工作树 29 个 route 仍为修改版。
- 每个旧阈值继续请求 3 次。实际原 POST：4 个 `imagegen` 小路由及原生参考工作台；其余为原始 AST 入口守卫投影（24 个 route）。
- 动态覆盖：31 组匿名、31 组伪造客户端邮箱、5 组既有跨 owner 拒绝、22 组既有 ban 拒绝、6 组跨站拒绝。原入口没有本地 ban 条件的 9 组明确为 `NOT_APPLICABLE`，不算 ban 验收通过。
- 提交旧 30/33 放行、后 3 次 400；修改后 33/33 到达下游。上传 100/103→103/103，预览 60/63→63/63，恢复 8/11→11/11；其他原次数拦截返回 429。
- 竞品 `analyze` 仍 120/123 放行、3 次 429；参考工作台文字 infer/chat-plan 仍 40/43 放行、3 次 429。
- 脚本默认不启用整文件对照，父合并独立并发/其他变更后仍可运行；单独审查本任务时可传 `--check-preservation`。
- 实际 route 的身份解析、schema、创作包装器、下游服务为显式桩；legacy 投影终止在 continuation sentinel，不执行完整生成管线。测试不证明真实 DB 权限查询、扣款/结算、供应商、生图质量、HTTP 部署或线上验收。
- 日志：`baseline.log`、`modified.log`、`rollback.log`、`rollback-bytes.log`；逐次边界响应、guard 原文、源码 hash 和测试边界见对应 JSON。

## 交接状态

- 实现和本地集中验证完成；仅本任务增量提交，提交 SHA 由交接回复和本地验证材料登记。无剩余代码编辑或测试进程。
- 本任务不 SSH、不部署、不调用供应商、不 push main；父负责整合、全量四产物及发布验收。
- 功能迭代按本模块完成计 1 次；未因工具调用/文档变更频繁测试。
