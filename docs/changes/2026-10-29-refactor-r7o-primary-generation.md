# R7O：主要图片生成应用归属与主线容量修复接入

## 基线与调研

独立目录 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`，完整基线 `e6835722463c20519d6f4ae0e8e356f8d9ab75ef`。开工保存5081文件原字节/hash，原始tar与R7N已封存源码一致。先刷新并普通merge主线 `154a7f9fc4a13726fd6b666c0d959edb6ea01c30` 的10提交，无冲突；包括APIMart原任务轮询期限/退避/进度、失败下载body释放，以及上传完整解码校验的有界输出。沿现有供应商适配、上传入口和媒体owners接入，不恢复旧单体。

R7I已将edit/detail/Comfy编排移出React；runGen/generatePend仍直接组合image-task、request、scope、generation/pending、文本反向链接和失败重试。后续改任务落地仍需改Canvas大入口，文本链接也越过text-document的写规则。

## 模块、接口与状态归属

- `canvas/image-runs.ts` 提供 `runCanvasDerivedImage` / `runCanvasBlankImage`。负责衍生/替换图和空白/文字联图的应用编排：现有输入规范化、占位位置、原controller创建、activity与失败重试、原结果attachment及完成回调。模块不另持operation/job/quote状态。
- `CanvasImageRunContext` 只描述原有scoped view、geometry、document和HTTP/UI ports；没有DI容器、全局事件、额外存储、任务或账务框架。原workspace revision、account/project epoch、准备后鉴权、未知结果不自动重POST、已知job/结果仅续接均留原owner。
- React保留只读/账号/锁定交互前置、当前输入和选中节点提示。两个入口不再直接构造task或request，也不直接修改/持久化text targetIds。
- `text-document.attachImageResults` 从本owner最新节点合并结果链接，复用已有set/save队列、draft/rebase、归属和冲突规则；保留用户已修改的文字及targetIds，去重而不复活删除节点。没有跨模块直接写表。
- Canvas原来的consumePending与占位移除先后顺序保留；文本链接仍在原task attachment阶段完成；未修改冻结报价、私有素材、原请求身份、结算或供应商语义。

## 验证资产与当前实际结果

扩展原image-task夹具以加载真实image-runs及真实Canvas组装函数；新增primary verifier对完整原工作树函数和当前函数做轨迹比较，不把旧R3无controller版本充作本片baseline。两组共57场景：正常/partial、拒绝/unknown、素材/位置/同步失败、并发恢复、workspace ABA、项目切换/卸载、参考角色/文件、透明/改比例、只读/锁定/空输入和detail分流。

- 完整baseline：57场景114检查，组件task factory2/request preparer2/text writes1。
- 新版：57场景130检查，完整请求/结果/坐标/history/提示/原回执轨迹精确一致；三个组件私有组合计数均0。
- 新版实际text-document追加12检查：最新草稿/链接保留去重、原队列保存、删除源不复活、stale/readonly零写、保存失败保留草稿并沿原retry恢复。
- 原image-task47场景179检查通过；此层为实际函数/模块+浏览器/HTTP端口夹具，PG0，不冒充完整Next或真实供应商验收。
- 首次baseline跨盘源码副本因没有node_modules无法解析zod/noble而exit1，原日志保留。夹具显式使用同一锁文件的现有依赖安装，未externalize或跳过业务代码，随后重新执行完整原/新对照。

主线APIMart与上传解码原测试登记到现有核心catalog（含上传输入准备），加本片primary入口，总数125→129；没有第二套回归框架。最终固定源码、完整/受影响矩阵、tsc/lint、架构、实际控件层级、四产物及独立副本回滚以本片VERIFICATION/DELIVERY为准，本文件不预填未执行的通过。

## 仍待与下一步

整体目标ACTIVE；未合回main、未部署，47 HOLD。分支超过48小时因用户要求独立目录持续整体重构。本片不将既有R7M镜像重标为当前应用；新固定镜像、同机同数据INP/混合容量、剩余Canvas编排变化传播和最终main整版退出仍需实证。GitHub账户付款/支出问题造成远端core未启动的真实债务保留，不重复rerun或改费用。历史MEDIA_STATE_WRITE_FAILED原生errno根因仍OPEN。


类型检查首轮保留一条Promise返回类型不匹配：原generateDetailSequence实际为Promise<unknown>而新port误写Promise<void>。按调用方只await、不消费返回值的事实修正port为Promise<unknown>，无运行改动；随后完整tsc与lint均exit0，原39条warnings保留。


## 整片回归发现并消除的运行时耦合

44b0708f首轮完整core保留14 PASS/1 FAIL/114 NOT_RUN。新增upload-memory入口真实加载上传route时，从adaptiveCanvasImageSize穿透mock-data.ts加载UI图标，触发lucide CJS/ESM错误；没有把lucide/mock-data加进测试mock绕过。

尺寸算法与三个常量原封不动收敛到纯 `canvas/image-size.ts`，8个实际运行时调用方（上传、作品导入、图像导入/本地编辑、节点几何、视频复制/脚本素材）迁移到该owner；mock-data保留兼容re-export，不复制第二套产品规则。新数值verifier使用测试专属的原e683函数四声明快照，覆盖原数字边界和网格，并检查8条真实导入及纯模块零依赖；该快照不被产品导入。加入原catalog后总数为**130**（不是129）。

原生首次页面未就绪：跨盘E依赖junction使Next无法解析实际存在的Geist字体文件，随后manifest缺失。首轮日志/源码副本与缓存原样保留；改为另一份新C盘字节副本，使用同一lockfile SHA0890e236的已有C盘本地依赖，不改布局/字体/供应商代码，不删除或覆盖首轮失败现场。最终原生是否通过以独立命令结果为准。


b20b8630第二轮保留15 PASS/1 FAIL/114 NOT_RUN，upload-memory仍失败。进一步沿实际import链确认：主线夹具只mock旧db facade，未覆盖本分支既有platform/persistence/artwork I/O owners，导致真实writer/schema越过夹具边界。只把同一批原SQL/账号/作品I/O端口映射到这五个现有owner；没有mock图像算法、媒体校验、存储或上传route，也未修改任何原39项断言。定向上传suite随后39/39、native queue/process0、network0通过。纯尺寸模块的8条UI目录耦合已独立消除；它不是此次夹具失败的全部原因。

实际Next控件在完整字节副本、同lockfile C盘本地依赖中通过：空白节点5检查（原prompt/operation、保存失败原结果续接、零额外生成POST、原图/坐标保持、回执完成清理），原位图片8检查（实际A/B/上传U像素、选择/关闭/失败保留、原节点revision、原版本undo/redo、布局连线保持），pageerror0、paid supplier0。两组应用源码绑定b20b8630；后续仅夹具/doc变化，与全部2075应用文件逐字节一致的桥接单独留存，不冒充新完整镜像验收。
