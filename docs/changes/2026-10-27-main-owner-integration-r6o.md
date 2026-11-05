# R6O：主线增量按真实 owner 整合

## 模块与基线

- 工作区：`E:/Workspace/naumi-refactor-20261024`，`codex/core-refactor-20261024`。
- 本轮起点：`b28fceb6de3417edddb0009e272ebc040329efec`。
- 固定 incoming main：`4e15e71a2d56ba8518340c04a256cf920b978e41`，25 个提交、87 个路径。
- 普通 merge 保留双 parent；16 个冲突按现有职责边界整合，不恢复旧 db/runtime/Canvas 大文件。
- 完整 4591 个原文件 hash 和原树保存在 `output/refactor-r6o-20261027/BASELINE.json`、`BASELINE_SOURCE.tar`。

## 公共接口、依赖与归属

| 主线增量 | 真实 owner | 本轮处理 |
|---|---|---|
| 会话 revision / CAS / 防晚写复活 | `agent/session-repository.ts` | 原始时间戳字符串、单调更新时间与冲突语义；DDL 仍归 startup |
| 历史媒体地址归属 | `artworks/repository.ts` | runtime 直连窄读取端口；db 仅保留兼容 export |
| 图片参数计划 | `model-config/image-parameter-plan.ts` | 纯编译、统一 schema、实际 wire/omit，不读 current 或数据库 |
| 冻结执行合同 | `execution-contract.ts` / `execution.ts` / `requests.ts` | 新 plan 元数据沿原 quote 传递；旧受理任务未带版本保持旧解释 |
| 供应通道与传输 | `channel-routing.ts` / `execution-transport.ts` / `execution-fetch.ts` | 保持单向 composition 与既有回调；本地拒绝身份不冒充供应商未扣费证据 |
| 参数审计 | `execution-audit.ts` / `saas/creation-writer.ts` | 沿原 operation 记录参数计划；审计失败不授权重新生成 |
| 映射管理界面 | `model-editor.tsx` / `editor-state.ts` | 复用单一 typed editor 状态；不增加多个弹窗 flag |
| 节点菜单 | `node-menu-items.ts` / `context-menu-surface.tsx` | 工具栏与空白右键共享菜单；移除旧平行 nodeTypeMenu 状态 |
| 图片/文字提示词优化 | 已有 image/text composer + `prompt-optimizer-client.ts` | UI 会话与浏览器 HTTP transport 分离；保留 workspace/node/draft revision 和取消 |
| 映射后原图交付 | `finish-stored-image.ts` / `complete-image-delivery.ts` | 新 plan 不隐式 upscale；正常执行与原结果续交同规；显式 frame/postprocess、旧任务不改 |

## 集中验证结果

被测应用与完整 Linux 包固定 `ffa8882a5aeb4bf8b12b3bce6977be1901d8ee71`。普通 merge 的两个 parent 分别为本轮起点和固定 incoming；下述结果不是原 R6N 的复用数字。

| 检查 | 本轮实际结果 |
|---|---|
| 全项目 TypeScript | 两次集中检查 exit 0；最终源码与受检源码一致 |
| 受影响 70 个源文件 ESLint | exit 0，0 errors、10 warnings，未以关闭规则压掉 warning |
| required core | 39/39 PASS，failed=0、notRun=0；新会话/参数计划/owner/优化规则接入原 runner |
| 新会话真实 runtime + PG | 58 检查，精确 revision、CAS、防 stale cache 与删除复活、媒体证据过滤 |
| 图片参数计划 | 25 逻辑/loopback 检查 + 16 真实 PG 冻结往返、旧版本、篡改反例 |
| 模型管理真实 HTTP / PG | 原管理回归及新映射原子发布/同 ID/旧版本冲突通过 |
| 图片参数映射真实 ModelEditor | 1440/390px，实际 operation body 与 backend schema 一致；map/omit/空值与无横溢出 |
| 节点菜单真实 React | 8 类型、3 可用/5 占位、坐标/键盘/只读/视频权限、3 viewport 通过 |
| 提示词实际 handler | 27 检查，完整输入、引用/对白、不完整输出、授权和原视频逻辑保持 |
| 完整 Linux Web/Worker 同镜像 | 125 检查；原价 6/current17、UNKNOWN 不重放、取消零重提、账务/回执、媒体与 POSIX 排空 |
| 完整产品真实双浏览器 | 27 检查；原生登录/HTTP/PG、图片文字冲突、生成/编辑共 2 张/2 笔/12 积分、60 秒混合读、额外确认 0 |
| 剪贴板产品回归 | 上述 27 项中的 6 项；2 次预期 copy POST，undo/redo 同 ID；额外供应商/扣款 0 |
| 完整 Linux Canvas 优化控件 | 12 检查；真实已构建 UI + 明确标注 API fixture；预览不覆盖、取消/迟到/ABA/workspace、文字与空白图片、390px |
| 结构证据 | 主线 6 个 session 声明、1 个媒体函数 AST 相同；9 个新增 leaf 文件与 main 原字节（仅归一行尾）相同 |
| 变化传播 | 1802 个原 src/services 文件 SHA 不变；Canvas 5868→5849 行、152 个原函数保持、没有删除原函数 |
| 依赖 | static/runtime/emitted-static/emitted-all SCC 全为 0；现存层倒置单列，没有伪称全架构债务归零 |

命令、原始输出、失败尝试、源指纹与原/新输入见 `output/refactor-r6o-20261027/`。新完整镜像 source digest 与 core 完全一致。Windows 冷 dev 的历史 layout eval SyntaxError 本轮没有重跑或宣称关闭，实际控件以完整 Linux 包验证。

## 基线、修改与回滚合同

`verify-refactor-main-sync.ts` 使用三个真实 owner 源投影，其余依赖为当前 checkout，不称完整旧 checkout 的端到端 A/B：

- BASELINE：12 检查，复现两个并发旧写均成功、删除后的晚写复活、旧交付隐式放到 2048px。
- MODIFIED：20 检查，CAS 单胜者、删除不复活、真实 owned media 过滤；新映射结果 16px 原字节保留，旧任务仍 2048px，显式目标 frame 不变。
- ROLLBACK：在独立完整副本恢复原文件，并运行同一基线检查；最终 hash 与字面输出以 `VERIFICATION.txt` 为准。实际重构工作树保持新版，不回退开发目录。

初次夹具密钥长度、1K 无放大语义、gradient 必填、旧 owner mock、内联组件定位等失败单列在 `FAILURE_INDEX.json`；未改业务预期来掩盖失败。映射管理发布 payload 在整合自查中修正为原后端要求的 `mapping` 字段，并补实际 ModelEditor 控件验证，不仅验证子表单。

## Git、产物与后续

- `MODIFIED_FILE.tar`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`、4591 原 hash/完整归档、独立副本与 patch 精确核验均归本轮证据目录；最终完成状态看 `DELIVERY.json`。
- 同步后功能计数归零。新功能没有恢复 db/runtime 巨石或 Canvas 内联 dock，没有引入积分确认、换 operation 重提或新业务限额。
- **独立重构线超过 48 小时：按用户持续整体重构、独立目录的明确要求保留；本轮已普通整合固定主线，不将整线自动合 main。**
- 继续整体重构、变化传播范围与残余 Canvas 编排收敛；R6O 只是本轮整合模块。完整产品收尾与整线交付尚未完成；本轮不合 main、不部署、不操作服务器或发布锁。
