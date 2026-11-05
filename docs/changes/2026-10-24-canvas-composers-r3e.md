# R3E：Canvas 创作栏与共享控件

2026-10-24。独立工作区 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。
完整基线：`8e9842afad42cf0b520dba3926f640b4c4f0ecc2`；原源码和既有文件原字节先保存。

## 实现与职责

本轮不是把 Canvas 所有变量装进一个 mega-hook：只迁出图片/空白节点和文字创作栏的呈现与局部交互。

- `composer-controls.tsx`：比例图标、Canvas 下拉和数量控件。顶部高清/改比例与创作栏使用同一个下拉实现；旧 `DarkSelect` 名称退出主组件。
- `image-generation-controls.tsx`：模型、模式、比例/分辨率、质量/价格和数量的共用呈现。值与变更回调受控，只有参数菜单开关为局部 state。`ImageQualityControl`、`CanvasModelSelect` 和已有参数规则继续复用，不新增报价逻辑。
- `image-composer.tsx`：图片和空白节点共用 references、prompt、error、footer 和 generation action。图片特有的上传、风格、标记、聚焦、重做仍独立；空白节点仍仅显示普通/详情两模式。
- `text-composer.tsx`：文字输入、引用/mention 菜单、自适应及手动 resize、任务状态呈现。菜单、mention 和本地尺寸状态由组件负责；对 Canvas 键盘层只报告菜单是否打开，卸载会清除该状态。展开布局仍由原 dock layout 协调，不再复制布局算法。
- `canvas-client.tsx`：三处真实入口连接 typed props/callbacks，保留可见性、锁定与只读条件；图片 draft、文字 prompt、文档、task、history、operation 和账务仍由既有 owner 负责。

Canvas **9342 → 8534 行**。AST 对照：**174 个保留函数正文不变**；仅 3 个 leaf controls 迁出。图像/文字/视频任务、HTTP、报价和保存执行函数未因拆 UI 改写。
新增组件为 186/116/100/393 行；没有新全局 store、事件总线或 paid-task 路径。下一次改创作栏排列/mention/菜单，不需要改包含所有创作链的主组件。

## 保持的实际业务含义

- 图片模型、ratio、resolution、quantity 原样送入现有质量/报价控件；`split` 的数量为 3，`triptych` 为 1，普通/详情使用当前数量；空白节点的原模式集合保持。
- 图片输入角色、引用增删、文件上传、原草稿 key 继续原模块；图片节点切换不会互相覆盖草稿。
- 文字引用和 mention 调用原 `updateTextReference`，生成按钮与 Ctrl+Enter 调用原 `generateTextNode`；unknown/已知答案续存逻辑仍为 R3D task。
- 原任务的空 prompt 恢复、busy、陌生 generating 节点的禁重复提交、error 展示及产品帮写保持。
- 可选的图片动作、文字生图权限、原只读入口和视频 compact composer 不重写。
- 13 积分/张、3 张总计 39 的浏览器记录来自本任务隔离报价 fixture，用来证明参数与展示贯通，不是新客户售价。

## 集中验证

证据根 `output/refactor-r3e-20261024/`；精确命令、输入、literal、退出状态在 `VERIFICATION.txt`。

| 层次 | 实际结果 |
|---|---|
| 完整旧源码 + 实际 Canvas JSX/bindings | 58 场景 / 94 检查，中英文、图片/空白/文字、原各状态的 SSR 输出保存 |
| 新组件 + 实际 Canvas JSX/bindings | 58 场景 / 152 检查；逐项 HTML 相等，报价输入模型/比例/尺寸/数量保持；共享外部价格/媒体/context ports 使用相同 fixture |
| 实际 Next/Edge | 15 项：价格输入与非零总价、草稿切换、模式数量、图片特有菜单、空白模式、引用与 mention、展开、键盘生成、卸载后快捷键、portal 清理、三尺寸边界与 resize |
| 实际屏幕尺寸 | 1440×1000、1093×614、390×844 的文字 dock 在视口内且与工具栏分离；截图已打开检查 |
| 相邻真实控件 | 文字任务 6、普通/空白图片 5、文字历史/恢复 12 项通过 |
| 相邻执行 | 文字18/77、详情编辑74/369、图片46/176通过，原操作号与续交语义保持 |
| 布局与已有 shell | collision2625例、geometry1920例、unified dock39检查通过，视频 shell/submit 保持 |
| 类型/lint | 原 tsconfig 字节恢复后全项目 tsc exit0；定向 lint exit0，Canvas 既有8个warning，新模块0 |

最终 15 项 browser 与 58/152 SSR 在最后的共享控件 import 清理后重新运行；相邻控件/任务在该纯名称清理前通过。没有修改服务端或 SQL，本轮不重复 PG suite；不将上轮 PG 数字算作本轮重跑。所有网络均为本地 UI fixture，供应商/生产调用0。

## 原失败与验证资产维护

1. `BASELINE_FIRST.log`/`MODIFIED_FIRST.log`：SSR fixture 漏 `useFeatureAccess` 导出，两端 setup exit1；补同一 context stub 后运行。
2. `MODIFIED_COMPARE.log`：严格 HTML 比较发现图片 footer 少了原有一个空格节点，exit1；恢复原空格后58组完全一致，不通过放宽比较掩盖差异。
3. `DOCK_COLLISION.log`：旧 source assertion 只在 Canvas 找已迁出的 minHeight，exit1；verifier 跟随实际 text composer 接线读取，2625几何例原样保留。
4. `UNIFIED_DOCK.log` 和完整基线 `UNIFIED_DOCK_BASELINE.log` 均在旧 token `videoDurations(cap)` 断言 exit1；现有代码已是 `videoDurations(cap, config.mode)`。只更新该已有参数形态断言，以及新共享组件路径检查；不改视频产品代码。最终39检查通过。
5. T3 preview 同一步两次 `Preview automation snapshot timed out after 15000ms.`；随后用仓库 Edge 流程，自有预览页关闭，未操作其他页。
6. 图片相邻 verifier 初次使用了它不读取的 `CANVAS_IMAGE_TASK_EVIDENCE`，结果 JSON 写到旧默认 R3A 目录；现已复制到本轮 `image-tasks/`，并在两处写来源更正，见 `EVIDENCE_DESTINATION_CORRECTION.json`。旧目录该 JSON 是本轮重新执行结果，不再绑定原 R3A 提交；原 R3A 源码归档、日志及基线未改写。
7. staged whitespace 检查发现新控件文件末尾多一个空行，exit2；删除空行后源码/归档哈希和独立副本回滚刷新，运行语句未变化，最终58组恢复对照一致。

## 收尾、回滚与剩余

四产物：`MODIFIED_FILE.tar`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`。独立完整源码副本先覆盖新版归档，再回滚 5 个既有文件、移除 7 个新增文件，校验原哈希并重跑58/94基线；实际工作树保留新版实现。归档逐文件 hash 与封存源码核对，四产物重新打开检查。

自有 Next14361/proxy14362 已退出，两个端口无监听，tsconfig原字节恢复；本轮未启动PG。`CLEANUP.json` 回读为PASS。
本轮为 main 同步后的第 **2** 个模块；只在独立分支提交推送，不合 main、不发布。

下一模块推进 **R4A 基础 DB/事务与数据 owner**，打断基础连接与业务领域的反向依赖；保留锁顺序和现有事务，不改表、不创建ORM/事务DSL。R3尚余上传/助手/外围工具组合，文字/图片跨请求CAS、旧client-intent升级、完整build/容量与R4B—R6仍未完成。既有R2/R3B2/R3B4/scene测试债务保持登记，整体重构goal active。

```text
从R3E固定提交继续整体重构，先推进R4A纯Pool/Tx基础切片及直接消费者。
读取现有db/getPool、billing事务、creation事务和coordination pool；
保持原连接预算、数据库/锁/事务顺序、原operation与幂等结算，避免新业务护栏。
真实模块集中对照、保留失败原件、独立副本回滚、任务分支提交；不接管发布。
```
