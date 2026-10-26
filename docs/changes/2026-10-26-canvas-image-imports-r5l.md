# R5L：Canvas 图片导入 owner 与原结果续接

日期：2026-10-26。独立工作树 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。

## 固定基线与问题

完整基线 `3c43477ad0b3410830365895882693f946cc6f5f`，4402个原始文件 SHA-256 与完整源码归档。

Canvas 已拆 scene/document/task/history/page，但普通文件/拖拽/粘贴、助手附件的导入队列/布局/进度/回执仍在主闭包；占位上传又自持第二套保存/同步流程。完整旧函数对照实际复现：

- 普通导入在准备/鉴权等待期间换账号或工作空间，仍尝试一次旧请求；旧助手路径的对话guard已有，未误写成没有。
- 占位上传已保存后先移除占位，再读作品；读失败时保存ID不进可重试状态，用户难以只续接原结果。
- 占位上传直接发送大原图，没有复用浏览器预览准备；服务端对超过12MiB且没有预览的请求已有明确拒绝，正常批量/助手路径已有准备机制。

## 唯一 owner 与消费者

- `src/lib/canvas/image-imports.ts`：持有队列、首成功根、布局保留、并发2、进度、saved IDs、同占位并发合并与只读同步。按账号/工作空间隔离队列/root；项目切换可继续保存原项目，但不抢回新视图。成功记录随可见批次淘汰；被关闭的未交付占位回执保留至续接，关闭展示不丢保存事实。
- `use-canvas-image-imports.ts`：每个editor一个owner，`useSyncExternalStore`订阅唯一快照；没有第二份React队列。
- `image-import-status.tsx`：原进度/错误/同步/定位视图及回调。主组件真实改绑，删除原队列、并发上传、同步实现和整段status JSX。
- 普通文件/drop/paste与助手附件调用同一`upload`；占位调用同owner的`uploadPending`，共用请求和已保存结果同步。占位已保存后的再次选文件/重试只读原ID，不再创建第二张。
- `client-image-upload.ts`仅增加可选第6参数冻结请求头；未提供时原调用语义不变。原auth、签名PUT、本地fallback POST、缩略/preview字段与超时保持。账号/工作空间在每个鉴权/PUT/完成断点核验，不新增确认、限价或运营门槛。
- Canvas **8319→8080行**。167个保留具名函数AST保持；明确改写四个上传adapter/reset，新增一个捕获上下文函数。模型选择、报价、钱包、生成、已受理收费任务不变。

## 真实验收与修正

| 验证 | 实际结果 |
|---|---|
| 完整旧Canvas函数 | 10类/40检查通过，旧account/workspace各1次late POST、占位saved ID丢失按预期复现 |
| 新owner | 15类/63检查通过，late POST均0、并发2、同节点一次、saved ID保留、同步不上传；三图坐标与旧树精确一致 |
| 实际uploadFormData | 旧15/新17检查；fallback POST/direct PUT原字节相同，冻结请求头、auth后取消/PUT后不complete；HTTP/XHR为显式夹具 |
| 原status JSX→新view | 18个真实React SSR对照通过，仅忽略最外层缩进空白 |
| 实际Next＋真实PG上传/读取handler | 5组通过：批量2/普通同步失败/占位同步失败/助手1，5份原图字节hash一致、补同步上传POST0 |
| 大原图占位 | 实际浏览器prepareOriginal/thumbnail、owner、transport、PG handler10检查；>12MiB PNG原字节完全相同，同占位重复POST0 |
| 相邻Next | 创作栏15、图片任务5通过；生成请求fixture，外部供应商0 |
| 保留/布局 | 167函数保持，普通3图坐标与旧版相同，旧坐标不重排，原聚焦/定位visibility通过 |
| 全项目tsc / lint | exit0；Canvas原8个hook warning保持，不写0warning |
| literal导入扫描 | emitted静态SCC0、全部literal导入SCC0；不代表容量、动态SQL/网络或生产验收 |

真实Next回归发现全局作品读取错误条遮挡上传面板同步按钮，保留first exit1；当同账号/工作空间/项目的saved import已由具体同步面板接管时，不再重复显示同一全局错误条。没有清除document错误，也没有对其他读取失败隐藏提示；实际鼠标点击通过，没有force click。

其他原失败完整留存：VM observer缺process环境、并发fixture的序号分配在异步读取前错误、旧visibility文本空格断言、SSR夹具JSX模式/外层缩进，以及大图browser fixture未定义process.env导致加载超时。这些只修测试准备/观察器，不改业务来迎合结果。

## 源码绑定边界

实际Next运行时的4个owned生产文件逐字节绑定；最终收尾另将主组件错误去重条件限定原project，该小增量由实际Canvas表达式定向反例覆盖；import owner在Next后增加了占位大图preserveOriginal准备，该最终增量由实际浏览器+PG大原图用例及14类owner验证覆盖。57个输入的实际served browser bundle与重新编译哈希完全相同，见 LARGE_RUNTIME_BINDING.json。没有把旧Next结果冒充该增量后的完整Next/产品镜像回归。

## 四产物、回滚与Git

`output/refactor-r5l-20261026/`保存MODIFIED_FILE.tar、DIFF_FILE.patch、VERIFICATION.txt和可执行ROLLBACK.sh。完整modified独立副本回滚4402原hash、删除introduced路径，并运行旧owner/transport行为；实际源码保留新实现。精确文件数、patch重放、Git提交/push/remote与自有PG/loopback清理以DELIVERY.json为准。

这是同步后的第2功能模块。main已观察到b3103a4d文档增量，固定业务整合仍为b15d4761；不把未合文档记为已含。下一模块后按三模块约定普通整合main，不回写main，不部署。

## 继续项

- 画布助手会话/工具执行状态和外围组合仍在主组件；跨请求、多tab CAS未关闭。
- 本轮saved import receipt是当前editor生命周期内的原ID续接，不是跨刷新/浏览器崩溃的durable上传intent恢复，也不把HTTP丢失且无ID的上传当可自动重提。跨刷新资产可按既有作品读取恢复；更完整上传intent设计另列后续。
- R6同SHA CI、完整候选构建、既有benchmark债务及实际性能/容量/生产验收继续。整体目标active，未合main、未部署。

R5L收尾补正：错误去重仅匹配saved batch的原project，旧项目待同步不隐藏新项目读取错误；15类63检查含实际Canvas条件的跨项目反例。生产修改仅新增batch.project及条件匹配，未重跑相邻浏览器；完整本轮产物刷新到后续修正提交。
