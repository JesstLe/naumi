# R6P：Canvas 图像创作意图与多阶段编排

## 基线与调查

独立工作树 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。基线 `fcda31d512c743a72aeb996a327ce3de14dbfe96`；4622 原文件 hash 和完整归档见 `output/refactor-r6p-20261027/BASELINE.json`、`BASELINE_SOURCE.tar`。

开工刷新并普通整合固定 main `e4369998d00f044cf5ad0150e8c7b7dbc055e12f`，4 个提交只涉及文档/AGENTS。保留本轮原生能力适配原则，未迁入上游页面、数据字段或新任务系统。

调查确认：助手会话/SSE/恢复已在 R5M 归唯一 owner；本轮保留，不重复拆。实际剩余变化理由是普通生成、三视图、重做、助手点击生成的规则与 stage 编排仍混在 Canvas 组件中。单图片任务的报价/提交/回执/位置/落图已在 R3A/R2 归原 owner，本轮继续调用，不创建平行 controller。

## 所有权与接口

- `canvas/image-creation.ts`：拥有创作意图、原提示词继承、普通/合成三视图/分图/详情分发、重做血缘和多阶段顺序。
- 仅通过四个显式端口协作：`generate`（原 image task）、`detail`（原 detail task）、`rename`（原 history/document）、`isCurrent`（原 account/project/workspace/epoch scope）。不引用 React、HTTP、计费、数据库或 Canvas 组件。
- Canvas 负责捕获编辑栏输入与组装端口，展示返回的输入错误；原占位节点、任务位置、选择和文档写入继续由原 owner 承担。
- 空白节点共用同一提示词继承函数；参考图字节/顺序/角色、用户原文、比例/分辨率/数量、血缘、operation key 与阶段 offset 保持原规则。
- 多阶段三视图在前序交付及改名 await 后继续检查原 scope；项目/账号/workspace ABA、卸载不把后续阶段受理到新上下文。已经受理的原任务仍由原 task/receipt owner 恢复。

## 集中验证与变化范围

应用源码和完整 Linux 包固定 `8de98c45fb085e63ea27f28d1e6ff465b0a1709c`。外部控件观察器的两处修正在其后提交，单独固定脚本 SHA；不以该工具提交冒充新业务镜像，业务/Worker源码及核心用例输入保持固定。

| 层级 | 本轮实际结果 |
|---|---|
| 完整旧 Canvas 函数 → 新应用及实际薄入口 | 旧48 / 新49检查；34组原提示词、选项、File字节/名称/顺序、参考角色/编号及血缘精确相同 |
| 时序 | 9组；旧12次迟到后续应用调用 → 新0；项目/工作空间ABA、账号、卸载不继续下一阶段；仅切换选择仍继续原意图 |
| 原图片任务 | 46场景176检查，共享原controller；原operation/known job、partial回执、落点、整批undo、上下文不重提保持 |
| 相邻 | 文字生图输入67场景、选择批执行、并发/原请求字段与计费wrapper合同通过 |
| 全项目TypeScript / 受影响源码ESLint | exit0 / exit0，0 errors、7条既有warning保留 |
| 结构 | Canvas5849→5688行；148个原函数保持；1871个其它原产品/服务文件hash相同；控件type alias前后emitted JS精确相同 |
| 核心集中验证 | 41/41 PASS，failed0/notRun0；新创作与原图片任务加入现有runner |
| 完整Linux生产Dockerfile | Web/Worker/media同一固定完整镜像通过；Worker bundle原字节保持 |
| 同镜像运行 | 125检查；原价6/current17、UNKNOWN不重放、实际登录/HTTP/PG/Worker/账务/媒体/排空保持 |
| 真实产品双浏览器 | 32检查；原生HTTP/登录/PG、路由替换0；总7次交付、7笔/42积分隔离账本、确认弹窗0、60秒混合读 |
| 本轮创作产品链 | 新增5检查：三视图3张且侧/背保留实际front锚点血缘、重做1新版本、合成图1张；新增5笔/30积分；刷新不增加调用/扣款 |
| 依赖 | static/runtime/emitted-static/emitted-all SCC均0；既有fixture/toast层边界单列 |

时序夹具的12→0统计的是应用端口调用，不扩大为历史线上付费重放归因。真实产品使用本地隔离供应商，不宣称外部模型画质/付费生产验收。

## 观察器失败与固定输入

原失败保留在 `FAILURE_INDEX.json`：

- 首次迁移对空白提示词文本匹配失败，未发生部分Canvas写入；改为定位实际initializer AST。
- 首次A/B观察器把JSON保存后的array null与内存undefined直接比较、且未包括旧caller已有的trim；修正观察边界，未改业务输入预期。
- 并发verifier调用补显式source root，选择用例改读实际共享prompt owner，并执行原fallback规则。
- 第一次完整浏览器已完成原27项，随后导航观察器将水合前的isVisible=false当成项目列表；改为等原生Canvas或实际项目卡片就绪。
- 第二次已实际完成三视图3张/3笔，随后“重做”选择器同时匹配历史redo和图片重做；收窄到真实node action panel。
- 最终完整32项exit0。只改两个镜像外验收脚本，没有为了修观察器重建或替换业务包。实际工具输入hash在 `ACCEPTANCE_INPUT_FINAL.json`；`SOURCE_BINDING.json`明确列出两处外部验收例外，其余业务/Worker/core输入与原镜像精确一致。

## 交付、回滚与后续

- `output/refactor-r6p-20261027/` 保存完整4622原文件hash/归档、MODIFIED_FILE.tar、字节级DIFF_FILE.patch、VERIFICATION.txt及可执行ROLLBACK.sh。独立副本恢复全原hash、重跑旧48检查；真实工作树保留新版，终态以DELIVERY为准。
- 回滚以代码/旧行为副本验收，不恢复生产数据库、不重放已受理任务。source/task/history/billing owner没有平行实现。
- 这是主线同步后的第1功能模块；不把这一模块称整个Canvas或全项目完成。
- Canvas尚有工作流执行、通用请求适配、画布层应用组合等编排要继续收敛；容量/真实性能与完整产品最终交付仍待整体审计。历史Windows冷dev问题未借本轮固定Linux包冒称已关闭。
- 整体目标active；不合main、不部署、不接发布锁。独立线超过48小时按用户要求保留，本轮已普通同步固定主线。
