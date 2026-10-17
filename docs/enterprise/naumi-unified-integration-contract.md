# Naumi统一企业数据接入契约 U1

## 部署与路由

最终产品以18482/preview.html?v=4原企业协作界面为准。Naumi `/admin`仅作为现有数据源后台；原admin产品页面与新增导航已撤除。

产品只读API：`GET /api/enterprise/integration`，enterpriseAuthorize+当前组织scope校验、私有no-store响应、速率限制；不开放POST。旧`/api/admin/enterprise-workbench`仅为源端诊断API，产品不调用。不接受客户端自报角色、企业成员列表、数据库URL或上游token。

环境配置（无密钥）：

```sh
NAUMI_ENTERPRISE_SOURCE_INSTANCE_ID=source-prod-a
NAUMI_ENTERPRISE_DEPLOYMENT_MODE=shared
NAUMI_ENTERPRISE_ALLOWED_IDS=

# 同一代码独立企业部署的配置示意：
NAUMI_ENTERPRISE_DEPLOYMENT_MODE=dedicated
NAUMI_ENTERPRISE_ALLOWED_IDS=<已审核的一个企业UUID>
```

私有模式唯一ID同时约束新适配器和原enterprise scope/list，原全局平台admin/BI接口还需部署期全路由隔离审计。不能将以上配置当成完整平台库安全裁剪工具。

## 查询

| action | 参数 | 返回 |
|---|---|---|
| context | 无其他字段 | {version,source,transport,instanceId,mode,viewer,enterprises} |
| members | enterpriseId | 原EnterpriseSnapshot（服务端范围内成员） |
| records | enterpriseId,kind,from?,to?,email?,page?,size? | IntegrationPage |

kind=artworks/generations/ledger；日期按北京时间，默认最近30天，最多366天；page 1–100000，作品/生成size 1–100（默认30）；账本沿用原analytics固定25条，响应size为实际值，客户端按响应分页，不假设请求size生效。

query为严格白名单，未知字段400。UUID无效400，部署范围外404，匿名401；无企业范围403，配置缺失/非法503；企业组织/成员/入口授权继续由原enterprise服务检查。

## 端口与标准DTO

代码：`src/lib/enterprise/integration/contracts.ts`。

EnterpriseDataPort={transport,policy,list(),members(enterpriseId),records(query)}；产品context包装源身份、部署模式和list结果。当前transport只有in-process，实现NaumiEnterpriseAdapter；未来HTTP适配必须遵循同形态与同等授权，未在本轮提供远程凭据/切换选项。

IntegrationPage：version=1；source=naumi；instanceId；enterpriseId；kind；rows；total/page/size；generatedAt；consistency=source-read；attribution=current-membership-not-historical-ownership。

IntegratedRecord：

- ref={instanceId,enterpriseId,kind,id}：kind是artwork/image-job/canvas-task/video-task/ledger，不跨来源按裸ID去重。
- account={sourceKey,email,name}：sourceKey为JSON tuple(instanceId,email)，不是企业名称；name缺失可为null。
- createdAt/title/prompt/status/operation/sourceLabel/provenance：只输出允许的展示字段。
- taskRefs={imageJobId,canvasTaskId,videoTaskId,billingOperationId}，缺失为null，不用标题猜关联。
- credits={quoted,charged,reserved,delta,settled,evidence}：evidence=linked-ledger/ledger-entry/unrecorded；无明确扣费证据charged=null，已记录0保留0。
- ledgerKind：consume/refund等，按源analytics分类。
- media={available,href}：href只允许同源授权enterprise/media，非原始对象存储URL；仍核验当前身份，不保证源记录关联一定能取回已删除媒体。
- attribution={visibility:current-enterprise-scope,businessOwnership:unconfirmed,workflowTaskId:null}。

上述结构不含password/hash/token/供应商参数/原始错误/私有URL、平台内部成本、可任意写入的业务patch。

## 服务复用

1. list→enterpriseList；members→enterpriseSnapshot。
2. artworks→enterpriseRead+queryBi的原artworks-only范围路径和原作品展示规则。
3. generations→enterpriseRead+queryEnterpriseOperations，重用operationSource SQL但独立白名单字段，**不放宽queryBi原“scope只支持artworks”的门禁**。
4. ledger→enterpriseAnalytics.details，保留原退款/用途分类和作用域，不重写原始reason输出。
5. media→原enterprise/media以及readBrowserImage当前鉴权机制。

operationSource增加明确source_table/has_ledger_charge供同源转换，避免按kind名称猜源表或将COALESCE 0当确有0消费。

## 范围差异

作品/生成沿用员工视图，可见emails来自原scope.visible；账本沿用analytics并可含老板本人。产品使用当前来源用户，不使用平台管理员代理。演示role下拉框与数据源viewer明确分离，数据不写入原localStorage。源角色授权保持当前组织树语义，非“历史归属”；后续snapshot-aware历史归属另建generation_links。

## 后续跨部署握手（设计，尚未启用）

目标仅提供tenant-bound服务接口，不暴露通用admin API给客户连接器。请求携带sourceInstanceId、sourceEnterpriseId、viewer delegation、scopeRevision和requestId；服务端同时核验固定凭据范围和实时成员/组织授权。映射配置来自受控绑定，不接受浏览器传入任意sourceEnterpriseId或baseUrl。

跨系统持久化只记源引用与必要投影，不复写账本。缓存标记采集时间/水位；撤权后拒绝历史重放和媒体访问。scopeRevision未知或身份服务失败时不提供旧的更宽范围缓存；同步失败不会调用新生成/扣费。

## 兼容与回退

shared且未启用专属配置时，原/enterprise行为兼容；新页面无sourceInstanceId则503配置提示。dedicated启用后不得靠回滚到不识别固定企业策略的旧程序公开混合数据库。

本轮代码回滚脚本仅还原标记的测试副本，保留源业务数据；没有新业务表迁移或扣费写入。正式企业私有上线的兼容版本、独立DB和全接口权限验收尚待完成。
