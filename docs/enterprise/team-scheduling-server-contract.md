# 团队排期服务端契约 · S1

## 身份与权限

`Authorization: Bearer <BFF签发的短时JWT>`。算法固定EdDSA/Ed25519，header={alg,typ:JWT,kid}；claims严格为{iss,aud,sub,enterpriseId,teamId,iat,exp,jti}；最长300秒，无额外角色或权限字段。服务端只配置公钥，令牌签发和钉钉登录在后续受信BFF实现。

`resolveDatabaseActor`在同一事务验证accounts/teams/team_members，绑定enterpriseId+teamId+subject。工作簿读取及个人保存要求有效团队成员，团队编辑/审计要求dispatch或manage。团队ID既在签名身份中，也必须与路径/命令一致；不同返回404。

## HTTP

| 方法 | 路径 | 返回 |
|---|---|---|
| GET | /healthz | 存活，不代表DB就绪 |
| GET | /readyz | 同时校验001与002；schemaVersion=2 |
| GET | /v1/teams/:teamId/scheduling | {workbook}，普通成员无draft/history/归档视图 |
| GET | /v1/teams/:teamId/scheduling/personal/:viewId | {personal,currentViewRevision,stale}，只读本人 |
| GET | /v1/teams/:teamId/scheduling/audit | {events}，最新100条团队及本人个人审计 |
| POST | /v1/scheduling/commands | {workbook,replayed} 或 {personal,replayed} |

原/v1/commands及/v1/orders/:id保留。新身份适配使新工单和事件携带teamId；同团队校验先于既有业务权限校验。

```ts
type SchedulingCommand = {
  commandId: UUID; teamId: UUID; expectedVersion: number; reason: string; action: Action;
};
type Action =
 | {type:'initialize'}
 | {type:'create-view';viewId:string;name:string;copyFrom?:string}
 | {type:'rename-view';viewId:string;name:string}
 | {type:'archive-view';viewId:string;archived:boolean}
 | {type:'reorder-views';viewIds:string[]}
 | {type:'save-draft';viewId:string;baseRevision:number;config:Layout}
 | {type:'discard-draft';viewId:string}
 | {type:'publish-view';viewId:string;baseRevision:number}
 | {type:'restore-view';viewId:string;revision:number}
 | {type:'set-fields';fields:Field[]}
 | {type:'set-options';options:Option[]}
 | {type:'save-personal';viewId:string;baseRevision:number;config:Layout}
 | {type:'reset-personal';viewId:string};
```

所有对象严格拒绝额外字段。reason=1–200字；JSON请求体≤128KiB。viewId是稳定小写标识符，显示名称≤24字。列ID兼容V2系统camelCase与custom_字段。

## 三种版本

1. workbook.version：团队配置任意成功命令递增，expectedVersion针对工作簿，不是view.revision。
2. view.revision：发布/恢复递增，baseRevision引用当前已发布版本；草稿保存不递增它。
3. personal.version：个人命令的expectedVersion，初始0，reset不归零；按用户/视图隔离。

普通成员读workbook的version，不获得修改团队权限。相同commandId重放返回首次历史结果，不代表当前最新版；客户端重放后GET。个人GET在团队发布后返回stale，客户端必须重新确认旧个人布局。

## 存储

迁移002新增accounts、teams、team_members、schedule_workbooks、schedule_personal、schedule_commands、schedule_audit。schedule_workbooks.document={schema:3,version,views,fields,options}。

View={id,name,archived,revision,published,draft,history}；draft={baseRevision,config,actor,at}或null；history=[{revision,config,actor,at,reason}]最近20条；个人布局不嵌进工作簿。

Layout沿用V2 config结构（columns/group/density/summary/layout/renderer/groupAnchor/board/filters/rules），严格Zod来源=`src/scheduling-contracts.ts`。表级仅定义，无values、无任务快照、无原型audit复制。字段ID/类型冻结、可归档；选择项只追加；排期选项已有ID禁止删除，等待任务引用校验器。

## 初始化、兼容与迁移

首次initialize expectedVersion=0，生成5默认视图；不会读取localStorage或真实ZIP。现有V2原型schema=2仍保留，S1没有一键全量上传/自动合并入口。后续迁移由服务端重新验证每个字段/视图、绑定真实团队/员工、清除原型身份后，经确认导入。

老foundation工单无teamId不自动赋予新团队。应先做来源映射和对账；客户端不能提交teamId修改既有工单。业务事件保留schemaVersion=1并增加可选teamId；消费者启用前需支持该范围字段，无任务重放。

## 事务与冲突

按企业commandId与团队工作簿顺序获取事务锁；配置/审计/去重一起提交。工作簿使用整体CAS，跨视图管理也可能409，当前选择粗粒度清晰一致性而非无声合并。个人写独立版本，但仍锁工作簿防止与归档/发布竞态。

幂等指纹覆盖完整Principal、teamId、action、expectedVersion、reason，键为enterpriseId+commandId。跨主体或参数变更409；即使是历史请求，也先检查当前成员和动作权限。

## 错误

400 INVALID_SCHEDULING_COMMAND/INVALID_COLUMNS/TITLE_COLUMN_REQUIRED/INVALID_VIEW_ORDER；401 AUTH_REQUIRED；403 MEMBERSHIP_REQUIRED/FORBIDDEN；404 NOT_FOUND/WORKBOOK_NOT_FOUND/VIEW_NOT_FOUND/HISTORY_NOT_FOUND；409 VERSION_CONFLICT/VIEW_VERSION_CONFLICT/IDEMPOTENCY_CONFLICT/LAST_VIEW_REQUIRED/VIEW_LIMIT及字段稳定性冲突；413 BODY_TOO_LARGE；415 JSON_REQUIRED；503 NOT_READY/RETRY_LATER。未知异常返回500 INTERNAL_ERROR，不发送内部SQL和令牌。

## 组合运行

```ts
import pg from 'pg';
import { WorkflowStore,SchedulingStore,createWorkflowServer,
  createBffAuthenticator,resolveDatabaseActor } from './dist/service.mjs';
// 由受保护的部署配置注入，不在仓库保存秘密。
const pool = new pg.Pool({connectionString: enterpriseDatabaseUrl,max:8});
const authenticate = createBffAuthenticator({issuer: trustedIssuer,audience:'enterprise-workflow',publicKeys});
const workflow = new WorkflowStore(pool,resolveDatabaseActor,validateRealAssetRevisions);
const scheduling = new SchedulingStore(pool,resolveDatabaseActor);
await workflow.ready(); await scheduling.ready();
const server = createWorkflowServer(workflow,authenticate,scheduling);
server.listen(14180,'127.0.0.1');
// 调用方负责真实BFF、反代、停止接收/排空及pool.end()；不导入tools/preview-fixture.ts。
```

## 回退

代码回退不删002表、不回灌DB。带teamId工单继续由新版兼容入口保护，不把旧无团队版本直接公开。正式发布需独立企业资源、授权/数据/蓝绿验收；本轮ROLLBACK.sh仅验证带标记的代码副本恢复，不是生产数据库降级脚本。
