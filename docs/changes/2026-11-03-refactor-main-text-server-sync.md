# main 文本工作流：后端 owner 整合

## 固定输入与职责

- 重构输入 `936fe80e4057ae76752d656e3880e3b7f25b3428`；main 输入 `dede39337f174da487b0067550f7770366d52dbe`。
- 仅整合文本生成 Route、视频正文读取／脚本片段和 model request 的实际引用事实，不把 main 的 db facade 或旧执行器搬回领域 owner。
- `text-content`、`text-generation-input`、`text-generation-references` 为 main 的纯内容合同；本 child 不改这三个 helper。正文、写作要求及上下文分开；completed/failed 清空正文不回退旧写作指令，legacy idle prompt-only 保持兼容。

## 接口、依赖与事务

- `/api/canvas/text-generate` 继续使用现有 billing → BI → authenticated handler 的协议适配；新 `content` 与 `projectKey` 输入沿原请求身份冻结。关联文字从现有 `canvas/text-node-repository.listCanvasTextNodes(actor)` 读取，再按当前 projectKey 验证；图片仍从 artworks repository 读取，文字 ID 不送视觉图片读取。
- `model-config/requests` 沿原 `withModelRequest → runModelOperation` 窄接口编排，只对该文本路由的 general 输入排除文字引用，不豁免图片／产品图或 reverse/assist 视觉合同。自动 merge 把 main 的局部 `domainPath` 留在拆分后的 `runModelOperation`，实际产生 ReferenceError；现在从该 owner 已有 `input.path` 读取。
- `video/submission.requireOwnedVideoText` 保留 frozen workflow 原文优先、认证 actor SQL 与 pending 拒绝，最后使用统一正文规则。
- `video/script-assets` 保留现有 storage-schema owner、项目授权、原 actor + video-node-graph 锁、单 transaction、source hash / UTF-16 边界及幂等回执；仅将 source 的正文投影接到统一 helper。
- `api/video/texts` 保留原授权／SQL／分页协议，用统一 helper 投影正文。无 schema、收费、重试、restore 或 synchronous replay 产品改动。

## 正式回归与明确层级

- 新 `scripts/verify-main-text-server-owners.cjs` 支持 `--source-root`、`--out > MAIN_TEXT_SERVER_EVIDENCE > 默认`。它执行完整实际 submission / script-assets / video-texts Route 模块，SQL、授权和执行器 ports 为明确 fixture，不声称真实 PG。
- 相同 oracle 在936原模块读取 completed空正文＋旧AI写作要求时真实返回旧要求并exit1；候选13项涵盖空正文、legacy idle、原内容、pending、冻结原文／空文、不额外DB读取、HTTP投影、片段范围拒绝、emoji边界、source hash、原锁／事务／rollback。
- main 的 actual Route + OpenAI SDK + loopback HTTP 33项保留。fixture只补当前 `text-node-repository` 公有port绑定，不替换其断言或预算。
- main 的真实 model request 模块7项保留；fixture读口从旧聚合server调整到现有 availability / execution-services，能力门禁和原正文wire验证不删。
- 原 text-only Route／SDK检查沿真实模块运行，不用纯字符串helper代替。

精确command/input/stdout/stderr/exit与前后source hashes归 `output/pr8-main-text-sync-20261103/server-agent/`。初始自动merge scope反例与936正文反例保留在INITIAL_COMMANDS.json；最终集中批次以COMMANDS.json/REPORT.json为准。全树type/build、整体core及正式副本rollback由主集成执行，不把模块通过扩展为整体退出或部署。生产和收费供应商调用0，main仅同步进重构候选。

## 最终集中批次

5条命令单次全部exit0：server owner13项、model引用7项、actual Route/SDK loopback33项、原text-only真实Route/SDK合同、8个职责路径定向lint。12个参与输入pre/post逐字节一致；没有运行整仓type/build，也没有真实PG或供应商收费。

新增oracle最终额外覆盖实际GET /api/video/texts completed空正文响应，故最终为13项，不重标初轮12项记录。baseline936与自动merge scope反例为独立copy，未覆盖当前候选；正式四产物副本rollback由root使用同一--source-root命令执行。
