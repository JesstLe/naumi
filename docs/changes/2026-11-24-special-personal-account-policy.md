# 特殊个人账号策略：实施台账

基线：a1dc2c569596dfbc7fa5e0cdd8c8c4148972552b。任务隔离：codex/special-personal-account-20261123，E:/Workspace/naumi-special-account-20261123。共享checkout的27条既有dirty内容保持原样。

## 用户目标及边界

普通个人账号，初始可用积分99999，无企业归属；GPT生图固定专属TDH上游；常规后台不呈现该账号的消费详情、搜索命中、统计或导出。原余额、扣费、供应商成本、幂等及受控审计继续真实保留。账号本人仍可读取自己的作品、任务及账本。

用户决定：先完成开发，验收后再确认发布。本任务不部署、不创建生产账号、不授予生产积分、不修改生产供应商配置、不重放旧任务、不进行真实收费生成。生产密码不进入源码、测试及证据。

## 调研来源

2026-11-23只读核对47模型历史版本150：TDH provider为platform-images，baseUrl为https://api.tdhcodex.com/v1，协议openai-images，wire model为gpt-image-2，上游platform-images:9ba2827204791ed8；供应商元数据735e05a8-1f70-4435-a6cb-e17607704057 revision6。

历史provider禁用、能力verified=false；原credentialRef对应行在核对时不存在。该证据证明历史来源，不证明今天的密钥、权限、模型参数或真实生成可用。未复制103隔离验证分支。只读证据：E:/Workspace/naumi/output/account-haibao-20261123/TDH_IMAGE.txt、TDH_SNAPSHOT.txt。

## 模块与职责

- accounts/creation-policy：账户域拥有personalOnly、reportVisibility、image单上游授权；无邮箱硬编码。策略表为增量表app_account_creation_policies。
- bi/user-management：原manageBiUser/create可选creationPolicy，及带expectedVersion的creation-policy命令。创建、99999初始grant、策略、个人资料与管理审计在原事务中提交；原commandId/HMAC指纹/CAS不变。发布模型读取复用当前tx，不嵌套借连接。
- 企业成员/团队/中央身份owner：加入、创建企业、迁移激活前均取得同一用户行锁并检查personalOnly；设置个人策略也取得该锁并拒绝既有企业关系。并发只能一方成立，不悄悄迁移原成员。
- saas/creation-context：专用部署的特殊账号新创作明确为personal，显式企业请求拒绝；签名续调附带服务端当前授权。已受理任务仍从冻结归属和原编号恢复。
- model-config：纯选择/准备接收可信accountImage，隐藏专属模型只授权该账号；绑定必须是一个启用上游及供应商，无supplierRouting、业务阶段路由或全局图片预设覆盖。模型不匹配/通道失效明确失败，不自动转APIB。
- image-model-catalog及/api/config、/api/models：只给特殊账号呈现专属目录；匿名及普通账号目录不变。目录复制只用于展示，原执行版本和digest不改。已受理隐藏模型的运行描述来自原冻结scope，不以当前目录重新授权。
- private-image-channel：仅构造草稿，使用新provider/upstream/public-model标识及原生凭据引用，复制历史能力/映射，不提高verified、不伪造价格，不重新开启旧全局provider。上线启用沿原配置验证/发布owner，不另造供应商系统。

## 常规后台读侧

统一账户可见性谓词覆盖BI列表、精确搜索、总数、概览、用户用量、CSV；创作中心canonical/legacy/unified候选键、翻页和详情/事件/素材；旧后台用户/作品/消费接口；待核对列表及角标；供应商调用列表、成本统计及直接调用链；阶段详情、后处理恢复入口、供应商活动统计。无email的执行阶段通过原账务/供应调用操作归属关联，覆盖父/子编号。

通用authorizedTargetEmail仅在跨账号管理员读取分支检查可见性，本人分支不变。因此非/api/admin的作品、视频、Canvas读取也不成为旁路。隐藏记录与不存在记录采用原入口的不暴露响应。

该策略仅过滤常规报表读取。app_ledger、app_billing_operations、app_supplier_calls、app_model_execution_stages及原管理审计不删除、不改数；账务结算/对账owner仍完整读取。供应商余额和实际采购成本不是用户报表，不伪装为零。

## 已修独立审查发现

首次只读审查发现并逐项落实：/api/config遗漏与重复目录投影；账号事务嵌套借连接；执行阶段及后处理直接入口；管理员跨账号公共helper；供应商活动统计。补充查出冻结隐藏目录不应依赖当前policy，以及父操作查询不能绕过私有子操作。固定版复核又发现平台概览personal活动与成本异常task/router outbox遗漏，均补齐共享SQL和真实PG回归；常规后台retry/variable入口同步守卫，原Worker和真实供应商聚合不变。

## 验证记录与证据层级

证据根：E:/Workspace/naumi-task-evidence/special-account-20261123/。原始BASELINE.tar及BASELINE-management.log在改动前保留。

集中验收脚本scripts/verify-special-account.ts使用真实隔离PG、真实账户/账务/创作owner、原SDK及loopback供应商，非生产供应商：原子99999授分、重复并发命令/CAS、审计后段失败整事务回滚、企业写入拒绝及双向锁竞争、专用站个人归属、签名续调、目录隔离、报价/准备/冻结、单上游实际wire、真实任务/作品/结算、UNKNOWN恢复不重提、所有已列读侧隐藏与原账本保留。PGPOOL_MAX=1另跑以验证无嵌套连接饥饿。登记到既有refactor-cases，不新建测试框架。

受影响既有回归已执行：BI管理、private BI、模型冻结/执行、imagegen执行、pending-view、provider-activity、团队子账号、SaaS创作及unified创作均通过。创作查询性能脚本使用本任务基线a1dc2c56对比，150组语义一致、1804记录；列表中位约29.38→30.03ms、深页29.24→29.66ms，查询数均1，不代表线上或10万活跃容量。

保留的早期失败：首次类型问题及测试夹具无效图片；pending最小夹具未含新增表，补齐schema后原断言不变通过；性能脚本默认对照过时9ae4edff导致差异，改为实际任务基线后通过；SaaS脚本漏SETTINGS_SECRET环境项，补齐独立fixture secret后通过。它们不记为最终PASS或主线原有缺陷。

真实Next/Chromium浏览器已通过：专属目录单选、普通账号隔离、后台private用量为空、跨账号详情404；浏览器无生成POST、无pageerror。截图确认先等待真实账号hydrate及作品加载。最终固定SHA复核和完整命令/exit以VERIFICATION.txt为准。首轮Next夹具缺worker secret、随后缺已配置API占位导致setup重定向，保留失败日志；不将环境失败冒充产品修复。没有生产浏览器或真实TDH能力验收。

## 接口示例（开发契约，不是执行记录）

```ts
// 密码通过原受保护输入进入现有账号owner；不得写入文件。
const command = userCommandSchema.parse({
  action: "create", id: ORIGINAL_COMMAND_ID, email: TARGET_EMAIL,
  name: TARGET_NAME, password: protectedPassword, initialCredits: 99999,
  reason: "批准的个人账号开户", creationPolicy: {
    personalOnly: true, reportVisibility: "private",
    image: { modelId: PRIVATE_PUBLISHED_MODEL_ID, upstreamId: PRIVATE_UPSTREAM_ID }
  }
});
await manageBiUser(command, authenticatedAdmin);
// 超时重试必须保留同id、同payload；不要重新授分或换供应商。
```

## 尚未执行及启用顺序

1. 最终固定SHA审查、归档及副本回滚完成后合main；提交不是上线。
2. 待用户另行确认发布，再核验目标站当前版本、锁及未排空任务。
3. 通过受保护原凭据库核验/导入有效TDH密钥；用历史source构造独立草稿，按有来源参数验证，不能把loopback测试当作TDH真实能力。
4. 先完成支持策略的Web+Worker整站发布及旧槽排空，再启用专属配置/创建账号；新旧版本并存期间不创建特殊账号。生产启用后的回滚下限必须支持该策略，不能回到忽略策略的旧程序使消费暴露或改走默认通道。若直接回滚材料仍为旧程序，应先完成兼容版本的发布轮次再激活账号。
5. 按原manageBiUser一次性创建个人账号+99999+policy；验证所属、目录、原账本及常规后台不可见。真实收费验收须沿另行明确预算执行。
6. 本次ROLLBACK.sh只在显式指定的隔离源码副本验证；不回灌数据库/媒体，不删除原审计，不恢复或重放生产任务。

既有provider-activity脚本要求初始无审计表，整组复用同一个fixture库会受前例留表影响；集中runner改为每case独立本机fixture数据库，不删除或放宽原断言。完整源摘要/每case命令/退出码沿用既有refactor-runner留档，scope为受影响模块而非全仓core。

未完成生产项保持NOT TESTED。47暂缓发布决定及103独立线仍保留。
