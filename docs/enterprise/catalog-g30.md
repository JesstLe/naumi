# G30 商品目录、店铺范围与需求冻结引用

## 用户操作与职责

运营在原需求详情选择有权限店铺的SKU，核对规格后绑定草稿，提交时再次校验目录状态。设计/美工读取需求冻结商品资料，不必进入ERP。商品管理员在原需求中心的商品目录管理品牌、店铺、商品与SKU，变更必须预览并写原因，历史修订不覆盖。公司真实账号及目录数据尚未配置，验收采用独立合成来源。

商品管理是独立catalog_admins授权，不因团队manage自动取得全公司目录管理权限。运行初始化清单显式catalogAdmin；每请求同时验证成员、manage和目录授权。目录只读选择按当前团队属于店铺teamIds筛选，账号停用/店铺停用/授权撤销立即影响新选择。既有工单的商品快照随原工单权限读取，撤销店铺授权不抹掉已交付证据。

## 数据合同

019迁移：catalog_admins、catalog_entities当前指针、catalog_revisions不可变修订、catalog_commands回执和审计。实体键为enterprise+id，kind固定：brand/shop/product/sku。

- brand：name、enabled。
- shop：name、channel、teamIds、enabled。
- product：name、brandId、sellingPoints（人工）、enabled。
- sku：name、productId、shopIds、specification、barcode可空、enabled。
- 各实体可带externalRef(system,instance,key)，仅显式登记的外部标识，不声称API已验证；不可随同ID改绑，禁止相同kind外部元组绑定到两个实体。名称不唯一且不作为合并键。
- expectedVersion、reason、previewHash、commandId：每批1–50项，全部预演、全部确认，版本或依据变化整批409；命令/修订/当前指针同事务。新增要显式UUID，批内可以引用同时新增的父实体。管理员可保存停用记录，但不得开启引用了停用父级/店铺的SKU。未知字段拒绝。
- 本轮输入为手工表单或JSON批量清单，复用同一预览API；不伪称已完成聚水潭CSV字段适配或自动同步。人工sellingPoints不由任何后台源采集覆盖。后续来源层独立存储，不反写原表。

## 需求联动

新增草稿动作set-demand-catalog，输入selection为shopId+skuId+四个revision或null，reason必填。仅草稿原提报人（request）或manage+request可改，沿原order.version/commandId/事件事务。服务端读取当前四实体及店铺授权，验证enabled及关系，冻结四实体资料和版本；客户端不提交快照正文。

提交需求时重新核验当前目录与冻结版本，一旦停用/改版/撤权则明确提示重新选择，不静默升级。提交成功后旧需求始终保留原值；商品改名、停用或新修订不回写历史需求。旧无商品需求仍保留兼容，商品不自动成为所有旧流程的必填；动态模板的必填规则由M05后续实施。清空引用必须显式动作，不因编辑需求文字丢掉快照。

预览不修改工单，不改变员工/团队/绩效。现有品牌/店铺字符串路由不自动从目录ID改写，避免更名导致未确认改派；稳定ID路由合同列后续，当前表单归属仍显式可核对。

## 页面与接口

原需求中心增加商品目录入口；授权读取shop+sku搜索/30项分页；管理者可切四类实体、编辑/停用/历史及JSON批量预览。所有来源字符串纯文本转义，无脚本/SQL/任意抓取URL。

GET /v1/catalog：context、list、history、selection；POST：preview、apply。Naumi BFF /api/enterprise/workflow/catalog沿同源会话与实时来源授权。店铺范围、历史管理、批量变更均服务端核验。原需求详情显示冻结品牌/店铺/商品/SKU/规格/卖点，草稿可选择或清空。

## 版本与运行

schema19只在隔离库测试，不迁真实schema8。无019时新目录端点503，旧需求/排期继续。真实运行目录使用显式启用预览/确认，最低reader/writer19，防旧程序绕过商品提交检查；旧活动进程每次请求检查下限。019记录既有个人容量启用状态，目录启用不隐式开启个人容量。真实蓝绿仍需操作者确认旧读写者已升级并排空，floor不等于自动发现全部实例。

## 验收

四实体与跨批关系、同名不同ID、唯一外部元组、版本过期/并发/幂等/事务故障、分页空页总数、停用/恢复、shop授权与撤权、源团队不可管理、目录管理员独立授权。绑定/清空/提交、提交后改名保持旧快照、旧schema8兼容及原UI390px/切号/迟到响应。实际运行和Next组合包含同一目录→需求链；真实公司商品/接口/容量/部署未验证。

M03剩余：聚水潭实际字段/CSV预演映射、增量/水位/墓碑、运营补录审批、SKU图片与使用权、更细的店铺负责人授权。M05动态需求表单下一模块继续，未因此标记32模块完成。

## 实施记录与运行步骤（2026-10-18）

- CatalogStore按企业串行预览/保存，批内父实体可乱序，ID按UUID规范大小写处理。kind与外部元组固定，同名不同ID保留。只读选择裁掉其他店铺及团队授权字段；来源授权、成员、目录权限各自核验。
- 需求set-demand-catalog/submit沿订单锁及目录锁验证，商品正文只由服务端生成；目录停用不级联删除旧快照。旧品牌/店铺字符串路由保持，不把新目录选择暗中当成改派规则。
- 原需求中心商品目录、四类管理表单、JSON批量预览、修订历史、店铺SKU搜索分页、详情选择/清空与冻结资料展示已接。管理员关系字段使用显式ID，后续可继续优化搜索选择器，不声称已完成聚水潭CSV界面。
- 服务与BFF已集中验证同名/标识唯一/批次原子/父版过期/两人冲突/回执/停用/撤权/分页；实际旧schema8拒绝新目录但旧任务正常。原生浏览器实际新建品牌，同批新增店铺/商品/SKU，选择草稿并提交，再改商品名称，旧需求保留商品v1、新目录v2；条码000123保持。响应丢失原命令重试、员工无管理入口、390px、迟到关闭、换号清空通过。
- 019增加availability_enabled显式状态，从旧minimum_reader>=17回填；后续目录floor19不等于容量启用。容量check和请求鉴权同时核验该flag，旧17启用仍沿原CLI。目录默认关闭，enable-plan/enable需要已升级全部reader/writer的明确确认、预览hash和审计，运行19但关闭目录的旧peer在启用后ready/business503；18及以下版本拒绝。
- 隔离开发运行22组与真实Next22组、完整源码类型检查通过。最终代码与测试、原数据复核/副本回滚见enterprise-catalog-g30-20261018/VERIFICATION.txt。真实schema8保持，不创建catalog表或真实目录数据。

部署准备命令（只在实际蓝绿准备及独立配置完成后执行；本轮仅隔离fixture执行）：

```text
node dist/runtime.mjs catalog-enable-plan --config CFG --admin ADMIN --input ATTESTATION
node dist/runtime.mjs catalog-enable --config CFG --admin ADMIN --input ATTESTATION --preview-hash PLAN_HASH
```

ATTESTATION含commandId/reason/confirmedAllReadersAndWritersUpgraded=true；新槽配置catalogEnabled=true，初始化账号catalogAdmin=true仅给经确认目录管理员。运行门禁不是对真实旧实例排空的自动证明。

M03目录与需求冻结引用这一纵向模块本地完成；完整M03来源同步/CSV字段映射等仍待实施。功能同步计数2（G28为1，G29文档核对不计业务迭代），整体目标ACTIVE。下一步M05动态需求表单与目录引用的必填/版本合同。
