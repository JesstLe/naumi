# R5K：Canvas 工作区页面与支付弹层分责

日期：2026-10-26。独立分支 `codex/core-refactor-20261024`。

## 为什么拆这一块

主组件已经有独立的 scene/document/task/history owner，但仍直接持有模板、会员、账户、安全、生成与结算页面的懒加载、页面堆栈及二维码状态。修改账户页面导航或支付弹层会直接触及 Canvas 节点/任务主组件，职责无关却共处同一闭包。

本模块不增加业务限制或框架，不重写钱包或订单。完整基线 `4a4f32905e2c5e3a456ed4c6452786dc5ea75181`，4397 个原始文件哈希及完整归档。

## 实施与真实消费者

- `use-canvas-workspace-pages.ts`：唯一持有页面栈、一级打开/下级导航/返回/关闭、二维码状态、原订单刷新请求及二维码预加载。没有 Canvas graph/document/task import。
- `canvas-workspace-pages.tsx`：持有7个原 lazy 页面及实际 body portal、导航捕获、二维码组件接线；全部页面仍懒加载，原 class/文案/桌面明暗兼容不变，没有新增UI描述。
- `canvas-client.tsx`：实际改用上述 owner，只使用打开/关闭/isOpen；通过 `applyTemplateToCanvas`、`refreshCredits` 保留领域动作。移除旧栈/支付状态、7个lazy定义和整段页面JSX，不保留平行旧实现。
- Canvas **8534→8319行**；171个保留具名函数经TS AST printer比较保持。唯一保留函数中的调用改绑为 `workspacePages.close()`；3个页面导航函数迁移。`refreshPayment` 新函数的 null state 返回只覆盖组件不可调用时的空状态，正常请求体和回执更新保持。
- 模板应用仍由原函数操作项目和作品，订单/账户/报价/余额/生成后端源码均未修改。关闭页面不关闭另开的二维码，支付关闭独立；商用展示开关及原相对链接规则原样保留。

## 集中验收

| 项目 | 实际结果 |
|---|---|
| 完整旧源码抽取的实际React/portal控件 | 44检查、15快照，exit0 |
| 新实际hook+view React浏览器控件 | 59检查、15快照与旧树一致，exit0；仅归一标签间缩进空白 |
| 上述 fixture 边界 | 页面body及QR控件为显式fixture，支付响应为loopback；验证的是原HTTP字段/映射、导航与回调，不是支付到账或钱包验证 |
| 真实Next Canvas完整源码副本 | 页面portal6检查，直接挂body、关闭/遮罩、快捷键让位和释放，exit0 |
| 相邻真实Canvas创作栏 | 15检查，价格参数、节点draft、引用、快捷键及三种视口通过 |
| 相邻真实图片任务 | 5检查，两入口/并发/失败后原结果续接/receipt清理通过，新增供应商0 |
| TypeScript | 全项目exit0 |
| lint | exit0，原Canvas8个hook warning保留；不是0 warning |
| 架构扫描 | emitted静态SCC0、全literal导入SCC0；不是运行性能或全项目容量结论 |
| 保留函数/业务接口 | 171个函数保持，1关闭调用改绑，7lazy页面迁移，后端接口变化0 |

实际Next使用完整源码复制目录，只在该副本写Next dev tsconfig/dist；不修改默认工作树。三个owned生产文件token全部相同，其中hook仅refreshPayment缩进与最终文件有差别，见 NEXT_SOURCE_BINDING.json。最终实际hook/view的浏览器对照来自当前源码。

## 原始失败与证据边界

首次旧/新测试均exit1，因为fixture空section没有可见面积，waitFor错误要求visible；修为attached。第二轮比较发现旧JSX注释导致根节点缩进空白，HTML只归一标签间空白；第三次比较发现持久化baseline JSON省略undefined，统一JSON表示后比较。上述均保留原日志，不改生产行为来迎合测试。

相邻图片脚本环境变量误写为CANVAS_IMAGE_TASK_EVIDENCE，实际需要CANVAS_IMAGE_EVIDENCE，因此旧ignored默认输出目录被复用。当前新结果已复制到本模块image-browser，事后归档不伪称事前备份，详见EVIDENCE_DESTINATION_CORRECTION.json。先前模块固定源码包、日志、回滚材料未被修改。

## 交付与后续

四产物、4397原hash完整副本回滚、旧行为恢复、精确patch重放、提交/远端及loopback清理以 `output/refactor-r5k-20261026/DELIVERY.json` 为准。真实工作树保留修改后的源码。没有运行生产支付、供应商、SSH、发布或main回写。

这是同步后的第1个功能模块。开工刷新发现main新增 `b3103a4d`，只更新已有发布文档；本轮不混入固定R5J源码或冒充已整合，后续按模块同步约定处理。

下一步仍为上传/助手/外围组合与跨请求、多tab CAS，以及R6同SHA CI、整包候选/基准/容量及实际产品验收。Canvas仍有8319行，SCC0和本模块通过不代表整体重构完成。整体目标active。
