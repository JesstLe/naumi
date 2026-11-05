# R10I：工作台文档用例与 Agent typed 报价

## 基线与目标

独立工作树 E:/Workspace/naumi-refactor-20261024，基线21f251d36621ac823924cb4b1baef4751d2d6673，完整5417原始文件/hash已归档。本轮推进W3的两个独立owner，不新建通用manager，不重复W1/W2。

## 调研与实现

原工作台HTTP route自行决定settings allowlist、聊天创建/清理/删除/计划取消，以及历史模板来源查找/冻结/应用。这些规则迁入reference-workbench/documents应用owner；上述入口保留认证、权限、同源、JSON/URL解析和错误/响应适配；未声称整个route所有读取/下载聚合均已迁移。SQL软删除归repository，仍在原reference-chat锁和同一Tx内；读取在持锁后，活动任务保护、plan_pending取消、返回chatState及原项目锁保持。

模板只从所属项目已保存结果对应的原operation/plan提取prompt/settings和版本标签，继续保存原参数；应用不重新规划或读取current售价，参考素材归属和去重保持。普通设置只更新原六字段，原其余payload保留。新headless用例与HTTP共享实现，无新表、框架、限额或确认。

Agent已有认证actor仍构造http://internal/api/billing/quote内存Request并通过cookie重新取身份。它不是内部HTTP网络请求，但使无HTTP凭据调用401。现在直接调用已有quoteForActor(email,input,undefined,snapshot)，完整沿用原服务端snapshot、数量/质量/模型/比例输入与当前冻结上下文。只改generic报价支路；图片计划、视频/制作链/A+原任务恢复、余额、operation指纹和用户停止不重做。

## 原始证据与验证边界

真实PG/实际handler/Sharp/本地素材原64检查保留正常HTTP、聊天锁等待后再读、并发取消一胜、跨owner拒绝、终态清理、历史模板保存/应用原参数和零执行/扣款。Agent旧4次构造quote Request，无凭据401；原账单3/current11冻结价保持。

初始验证准备错误均保留：误用app_credit_lots/app_credit_ledger表名、缺text.competitor及其必需agent.text绑定、signup/fixture grant产生的已有billing operation被误当应为零。验证改为真实schema、有效配置和动作前后增量，不修改产品或放宽业务断言。每轮失败均已清理随机schema/HTTP/pool/media。

修改版67检查通过，含相同HTTP合同与三个headless调用；Agent quote Request4→0、cookie读取1→0，headless401→正常actor报价，原3/current11及operation指纹保持。

集中报价组17/17子命令完整执行通过，局部runner按合同PARTIAL/exit2；原Agent58检查、图片25case/74check、工作台13组（5图片/3文字、原价/取消/真实余额/两张auto/零未知重放）、钱包及W1账务35保持。runner20case/373check、最终非增量tsc exit0/5123实际输入、lint0、四类SCC0。首次TSC仅新增settings回退空对象的类型推断错误，添加Record注解后修正；首次报价组缺专属feedback DB，第二次旧scanner仍要求quoteForRequest字面调用，失败均留存。scanner改为绑定真实quotation:quoteForActor及actor/snapshot、禁止伪Request，保留原37检查再补6正负例，新43PASS；不以恢复HTTP桥绿化测试。

另三个旧脚本当前/完整21f251d3副本同样失败：verify-reference-workbench仍要求auto虚构授权价高于confirm；quote-errors仍要求low质量拒绝（现已按qualityfallback正常回退）；label仍要求外部47工作台跳转（当前为原生路径）。三脚本未修改、未计PASS，不为旧预期恢复业务误拦；当前原pricing-friction-workbench完整13组已实际通过。原始日志在INHERITED_BASELINE_COMMANDS.json。

OWNERSHIP_RECHECK逐项核对W1/W2改动产品raw保持及本轮命名职责，不把该范围扩成全项目语义审阅完成。当前完整5420源码/13路径（4产品、4验证/登记、5文档），四产物、完整5417原始hash副本回滚、原64行为及正常投影对照以本轮VERIFICATION/DELIVERY终态为准。本轮不是live browser或供应商付费质量验收；template使用已保存历史operation fixture，不冒称本轮重新执行供应商生成。整体重构ACTIVE，main未合/未部署，47HOLD。
