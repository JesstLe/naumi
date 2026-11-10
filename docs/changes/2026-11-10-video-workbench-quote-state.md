# VV-01／VV-07 视频工作台报价状态修复

## 模块与职责

修复真实103试片前核验发现的工作台价格误导：正式报价未返回／切型加载／失败时，不能用默认0显示为免费。模块只负责现有工作台的报价展示，复用BillingProvider、正式quote、原生成Hook及账务owner；不新增报价、计费或任务状态机。

## 公共接口、依赖方向、数据与事务归属

VideoStudioSession → useBillingEstimate → BillingProvider → /api/billing/quote。原quote对象保存型号、计费版本及金额；原useVideoGeneration按原编号查询／提交。缺报价仍由原门禁禁止提交，0只在明确正式零报价或BYOC时成立。没有改Hook的全局cost默认值，避免影响其他已依赖该兼容值的业务。

## 固定基线与本次实现

- 开工origin/main固定9d74f7bebd4ba9c1a90242f8832e5c5b2adf232b，独立codex/video-quote-state-20261110。共享admin改动及103映射验证线保持。
- 根因：useBillingEstimate在quote=null时返回cost=0；工作台把estimate.cost放进已有cost??"—"表达式，导致占位逻辑永远不生效。真实浏览器基线显示“生成视频 · 每个 0 积分”，按钮虽禁用仍误导价格。
- 最小修复：仅在实际estimate.quote存在时读取credits或api-cost-plus授权上限，否则cost=null，复用已有“—”占位。明确credits=0、authorizedCredits=0以及BYOC免费语义保持；未改价格、发布配置、预扣、原编号、重试或已接受任务。
- Canvas节点设置本来已根据quote是否存在显示报价中，不存在同一路径，未复制新状态或扩大修改。

## 验证命令、结果及证据层级

- 新脚本`node scripts/verify-video-workbench-quote-state.cjs output/video-quote-locked-deps`打包真实VideoStudioClient、VideoSettingsFields、模型选择、useBillingEstimate和BillingProvider；仅身份、Next链接及HTTP传输为fixture，无监听服务器和线上调用。有效提示词下验证提交门禁，不依赖空提示词的另一个禁用条件。
- 9项实际React／Edge检查：初始报价待返回不显示0、正式20积分、切型清旧价、旧型号迟到响应不覆盖当前价、明确正式零价可用、503报价显示未知且禁用、成本加成41积分授权上限、BYOC0可用、无生成请求／pageerrors0。真实供应商调用0。不是部署或真实模型质量验收。
- 原提交／恢复30场景121断言、client-settings、试片范围14项集中回归通过。120积分／5视频／2媒体和FRAME_UNSUPPORTED原配置矛盾保持。
- 起初借用共享node_modules导致缺three、旧TypeScript／React／sharp类型不匹配，保留失败但未修改产品绕过。最终在独立完整源码副本使用与package.json相符的既有依赖：TypeScript5.9.3、React类型19.3.0、three0.186.1、sharp0.35.5，tsc exit0。定向ESLint exit0，原两个Hook警告原样保留，不计为本次新增。
- fixture首次模型控件定位使用button而实际为combobox；随后一个测试复用已缓存型号未触发503；BYOC初始fixture缺少WorkflowInputs数组。这些测试适配问题已修正，保留各轮失败。真实产品基线0积分错误独立复现，不以测试适配失败冒充产品缺陷。

## 回退、Git与部署

原文件哈希及四件套保存于`E:/Workspace/naumi-task-evidence/video-quote-state-20261110/`：MODIFIED_FILE.zip、DIFF_FILE.patch、VERIFICATION.txt、可执行ROLLBACK.sh。独立完整副本回退恢复原文件字节／新增文件原缺失状态，同一保留回归脚本再次检出原0积分表现；修改交付副本保持。精确命令、输入、字面结果与退出码见VERIFICATION.txt。

本模块拟普通合main；提交／主线与103实际部署分开。当前线上仍沿唯一r3回执3a043c6b／1794310315，本修复未部署，不创建后继候选、不持103锁，47未连接。

## 未完成项与下一步

VV-01原视频账户0余额且无普通密码、正常后台凭据请求超时的前置差项尚未解除；本轮没有重复请求、入账、试片或借QA赠额。通过正常验密与正式入账后，按已固定120积分范围逐个生成，UNKNOWN查原任务，记录媒体／账务／六维质量。辅助审片与声音后续代码仍与r3线上内容区分。整体目标保持active。

## 可复用续跑指令

```text
继续canvas-video-execution台账，先查VV-01专用actor的正常登录／正式资金回执，不重复发布r3。
工作台缺报价显示“—”只证明展示修复，不证明免费或实际可执行；提交沿正式quote和原操作。
保留120积分／5视频／2媒体上限，UNKNOWN不重提，按实际模型产物和原账务关闭质量格。
```
