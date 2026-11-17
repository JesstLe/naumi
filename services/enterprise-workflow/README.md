# Enterprise Workflow Runtime 0.2

源站接入公共模块位于 `src/source-onboarding`：审计与复核计划由服务拥有，runtime和现有operator CLI依赖该模块，不反向import脚本实现。接口、原只读事务及迁移验收见 [R8T模块记录](../../docs/changes/2026-10-31-refactor-r8t-enterprise-source-onboarding.md)。

Web接线预检新增`composition-plan`/`composition-check --config RUNTIME_JSON --web-config WEB_JSON`；输入模板`web-composition.example.json`，配置与真实HTTP验收见[Web组合文档](../../docs/enterprise/web-composition-g15c.md)。规范公共入口使用`NAUMI_ENTERPRISE_PUBLIC_ORIGIN`，代理保留正确Host；预检不等于真实员工登录完成。

当前运行入口、初始化和连续更新准备见 [G15运行PRD](../../docs/enterprise/runtime-g15.md)；需求/任务/交付/排期/绩效/归属/通知模块已经实现，但实际公司源身份、工作流独立数据库与生产发布仍需配置验收。

```powershell
node build.mjs
node dist/runtime.mjs check --config ABSOLUTE_PROTECTED_CONFIG_PATH
node verify-runtime.mjs   # 独立容器 + 真实构建进程，不连现有业务库
```

`runtime.example.json`和`provision.example.json`是带显式占位符的模板，直接复制不会通过校验。API与Worker采用同一构建、不同role/端口；Worker默认standby，不领取任务，外层发布完成门禁后才使用内部activate。旧notification-worker入口只允许显式隔离fixture；正式入口为runtime worker。产品仍为原HTML，正式Web入口/enterprise/workflow复用Naumi登录，/admin不是协作UI。

以下为历史foundation接口说明；其中旧“尚待接入”状态只代表当时阶段，当前状态以实施台账与各模块PRD为准。

# Enterprise Workflow Foundation

独立工作流服务基础；产品/服务边界详见 [企业业务闭环方案](../../docs/enterprise/WORKFLOW_MICROSERVICES.md)。

已具备需求审核、拆单依赖、派单/认领、执行/阻塞/返工/验收、版本冲突、幂等、PostgreSQL原子事件日志及HTTP工厂。

**阶段：foundation + scheduling S1。** 新增Ed25519短时身份验证、实时团队成员授权、排期配置PostgreSQL持久化、CAS/幂等/审计、个人布局隔离。真实钉钉登录/组织同步、资产适配、正式BFF与企业页面、事件worker和最终绩效核算仍待接；构建导出工厂，不会自动监听端口或连接生产。

本阶段详细文档：[S1 PRD](../../docs/enterprise/team-scheduling-server-prd.md)、[服务端契约](../../docs/enterprise/team-scheduling-server-contract.md)、[实施验收](../../docs/enterprise/team-scheduling-server-implementation.md)。旧Demo不自动迁移、不覆盖正式`/enterprise`。

## 开发与集中验证

在仓库安装依赖后，从本目录运行：

```sh
node verify.mjs                # 一次性 PostgreSQL16 容器，随机回环端口，无业务卷
npm run typecheck
npm run build
```

verify脚本只清本次随机命名的容器；不会连接现有本机5432/业务库，不执行无筛选prune。`WORKFLOW_TEST_DATABASE_URL` 只给测试使用；集成测试无该值直接报错，不会跳过后伪报成功。

## 组合运行接口

```ts
import pg from 'pg';
import { WorkflowStore, createWorkflowServer } from './src/server';
import type { ResolveActor, ValidateAssets, Authenticate } from './src/server';

export async function bootstrap(
  databaseUrl: string,
  authenticate: Authenticate,
  resolveActor: ResolveActor,
  validateAssets: ValidateAssets,
) {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const store = new WorkflowStore(pool, resolveActor, validateAssets);
  await store.ready(); // 迁移必须由部署过程显式执行，不在启动时自动DDL
  const server = createWorkflowServer(store, authenticate);
  server.listen(14180, '127.0.0.1'); // 容器内按实际网络设计调整，不直接公网暴露
  return { server, pool }; // 调用方负责停止接收、排空、关闭连接与pool.end()
}
```

三个适配器都是必填依赖：authenticate验证BFF短时身份，resolveActor检查实时组织/账号/企业授权和业务权限，validateAssets核验租户资产版本。没有默认放行实现。新导出的createBffAuthenticator只验证受信BFF公钥，resolveDatabaseActor检查独立企业库实时团队成员；旧自定义adapter调用保持兼容，但不得将无团队actor当作新团队数据授权。细粒度品牌/店铺行与字段隐私尚需策略层。

迁移脚本 `migrations/001-workflow.sql` 仅在独立工作流库执行。生产账号不应有修改原Naumi库的权限。身份服务暂时失联时拒绝命令，不返回永久缓存授权。

通知历史较大时，可在既有站点维护锁下，对独立工作流数据库单独应用
[`maintenance/notification-unread-index.sql`](maintenance/notification-unread-index.sql)。它只索引未读行，不改变通知内容、可见范围或运行所需 schema 版本。常规迁移器将版本迁移放在事务中，此索引需要在事务之外并发构建；不要加 `--single-transaction` 或由请求处理器执行。

```bash
# 由受保护的连接资料选中该站点的工作流数据库；不使用 Naumi 主库。
PGOPTIONS='-c lock_timeout=3s -c statement_timeout=15min' \
  psql -X -v ON_ERROR_STOP=1 -f services/enterprise-workflow/maintenance/notification-unread-index.sql
psql -X -v ON_ERROR_STOP=1 -c "SELECT indisready, indisvalid, pg_get_indexdef(indexrelid) FROM pg_index WHERE indexrelid=to_regclass('enterprise_workflow.notification_inbox_unread')"
```

两项状态必须都为真，且定义应匹配上述 SQL。中断留下的无效索引不能算完成；复核同名索引和当前执行状态后，再并发移除无效索引并重建。程序回退可保留有效索引。

## 命令格式

```json
{
  "commandId": "11111111-1111-4111-8111-111111111111",
  "orderId": "22222222-2222-4222-8222-222222222222",
  "expectedVersion": 0,
  "action": {
    "type": "create",
    "title": "新品详情页",
    "brief": "设计主视觉，美工制作详情与规格图",
    "acceptance": "指定尺寸、文字和品牌规范通过审核"
  }
}
```

生产请求必须由BFF认证，示例JSON不承载企业/人员/角色。前端始终使用服务端返回的version；409时刷新并让用户重新确认，不静默覆盖。

核心错误码：400 INVALID_COMMAND/INVALID_JSON，401 AUTH_REQUIRED，403 MEMBERSHIP_REQUIRED/FORBIDDEN/INVALID_ASSETS，404 NOT_FOUND，409 VERSION_CONFLICT/IDEMPOTENCY_CONFLICT/INVALID_TASK_STATE，503 NOT_READY。

`events` 是不可变工作事实与待投递源，当前不含投递循环。消费者上线前必须实现独立投递状态、租约、inbox去重与重放水位；禁止把数据库写入成功误记为绩效同步完成。

## 排期服务端隔离验收

```sh
npm run preview:fixture -- 18489  # 仅回环；随机一次性PG容器，Ctrl+C清理本次容器
```

另一个终端从仓库根运行（需要根目录已有`@playwright/test`与其浏览器）：

```sh
node services/enterprise-workflow/tools/fixture-browser-check.mjs OUTPUT_DIRECTORY http://127.0.0.1:18489/
```

浏览器版本未安装时可安装对应官方Playwright浏览器，或通过`ENTERPRISE_TEST_BROWSER_PATH`显式选择已有测试专用headless可执行文件。脚本启动全新隔离进程，不附着用户Chrome或CDP。

此页是后端验收工具，不替代完整企业Demo；工具合成身份选择器不属于正式身份服务，不能随正式BFF公开。`dist/service.mjs`不包含fixture签发器、示例页和Docker启动器；正式接入采用S1契约中的公钥验证器和真实资产适配。
# Linux运行镜像

`node build-linux.mjs --output ABSOLUTE_PATH` 从干净提交构建固定基础镜像、精简上下文和非root运行镜像。`node verify-linux.mjs --output ABSOLUTE_PATH` 在独立内部网络/数据库运行Linux完整验收，再验证生产镜像API与Worker。开发验证需显式`--allow-development true`；不作为最终交付版本。

部署模板：`deploy/linux/compose.example.yaml`。详细运行约束、0600配置、host网络/回环端口、独立存储、排空门禁和未完成项见`../../docs/enterprise/linux-runtime-g15b.md`。模板不自动初始化真实身份或发布服务器。

## 动态需求表单（G31）

模板草稿与发布修订分离；团队manage维护，另一位manage+review发布。字段仅六种受限类型，最多30个，不执行脚本。需求set-demand-form由服务端冻结实际已发布修订；保存草稿允许缺必填，提交时验证条件/必填/商品和模板启停。原UI入口为需求中心→需求表单，以及需求详情→选择/填写表单。

运行包schema20；formsEnabled未配置时关闭。受保护配置设为true后，以`runtime.mjs forms-enable-plan --config CONFIG --admin ADMIN --input INPUT`取得planHash，再用`forms-enable ... --preview-hash HASH`启用。INPUT包含commandId、reason和confirmedAllReadersAndWritersUpgraded:true；此确认不替代真实所有读写槽位排空证据。catalog_enabled独立保持商品配置语义。生产更新仍沿蓝绿、备份、登录/DB及受影响功能验收；不直接运行在当前真实schema8导入库上。

字段/接口/迁移合同及剩余附件、批量需求范围见[详细PRD](../../docs/enterprise/demand-forms-g31.md)。

## 需求复制与批量建单（G32）

运行schema21新增成功批次回执。demandBatchEnabled默认false，明确配置true后开放新API；复制表单/商品仍受其各自开关及团队权限控制，不改变已有流程兼容下限。原需求中心“批量新建/建单回执”、需求详情“复制需求”；1—20条只读预览后整批事务创建草稿。历史状态/人员/任务/附件/验收/积分不会继承。

API、锁顺序、幂等、回执私有和排除范围见[详细PRD](../../docs/enterprise/demand-batch-g32.md)。旧20固定包对21库新草稿的读取/改写兼容通过独立运行进程验证；该证据不是生产蓝绿发布完成。新上传附件规则仍待后续。

## 需求参考附件（G33）

运行schema22，demandAssetsEnabled默认false；需要独立的demand-assets-enable-plan / demand-assets-enable配置预览hash与全读写者升级确认，启用后兼容下限reader/writer22。forms_enabled独立flag保留表单开关，不随附件floor隐式开启。生产仍须完整蓝绿，不把CLI确认当现场排空证明。

原需求详情→参考附件，运营先上传候选，再显式选入当前草稿。32MiB/文件、20个选用、200个保留版本；与交付及续传预留共用企业配额，文件独立在deliveryRoot/demand-reference。模板可设置数量/大小/扩展名要求，提交时重新验证扫描/字节/规则。扫描disabled仅表示未扫描可用；正式需要配置真实扫描服务。详情见[PRD](../../docs/enterprise/demand-assets-g33.md)。

## 实际工时（G34）

运行schema23附加worklogs/worklog_revisions/worklog_commands，配置worklogsEnabled默认false。独立记录不抬升既有22兼容下限，不改原任务状态或绩效。原任务详情登记本人分钟，原任务中心查看台账；manage+review且非任务参与人复核。已确认值仅经独立更正审批变更，修订历史保留；跨团队同subject每天1440分钟数据上限。详情见[PRD](../../docs/enterprise/worklogs-g34.md)。自报/复核工时不等于考勤、加班许可或工资结算。


## 交付版本评审（G35）

运行schema24，reviewsEnabled默认false。原任务详情→交付评审，以提交事件哈希和真实交付assetId/revision/SHA256冻结轮次；逐项检查、1—5人独立评审、图片点批注与回复/解决/重开。发起过结构化评审的任务后续提交均须完成本轮批准，原accept-delivery事务复核，不因UI按钮或配置关闭绕过。未采用结构化评审的任务保留原简单验收，不把新制度追溯写入历史。

显式runtime.mjs reviews-enable-plan / reviews-enable：INPUT含commandId、reason、confirmedAllReadersAndWritersUpgraded:true；核对planHash并将reader/writer提升24、reviews_enabled持久化。旧23拒绝业务与就绪，回退只能用保留schema24评审门禁的兼容程序，不能下降floor或清空评审数据。demand_assets_enabled独立保留22语义，避免新floor意外开启其他模块。

配置、权限、每轮检查项、文件坐标及验收矩阵见[PRD](../../docs/enterprise/delivery-reviews-g35.md)。真实公司制度/账号/蓝绿发布另验，不把隔离账号测试当上线。


## 定时提醒与SLA升级（G36）

运行schema25，slaEnabled默认false；配置true前需runtime.mjs sla-enable-plan / sla-enable，以INPUT(commandId/reason/confirmedAllReadersAndWritersUpgraded:true)和previewHash显式提升reader/writer25并持久sla_enabled。旧24投递器没有旧提醒失效检查，因此开启SLA后不得继续作为业务/Worker槽。新Worker先standby，activate后才扫描，drain等待当前事务结束。

原通知页“定时提醒”：团队manage编辑六类规则，先看至多50单抽样预览，再确认保存；作用于全部当前/后续未结束工单。原始交付dueAt与排期planEnd独立，实际经过分钟不扣休息日；当前最高阶段优先，每业务时钟每阶段最多一次。已有未知发送不自动重发，已接受仅查询。政策、扫描游标、occurrence、站内消息/外部outbox持久化；发送租约前重新校验时钟/状态/当前收件人，过期提醒取消，不声称撤回在途消息。

详见[PRD](../../docs/enterprise/sla-g36.md)。本地34组运行/28组Next与真实4核8GiB/钉钉应用/公司制度分别验收，不因测试通过自动启用真实企业规则。G35独立review/需求附件flag的业务guard也与readyz对齐；不按floor隐式开启其他模块。


## 跨团队个人产能与WIP（G37）

运行schema26，capacityEnabled默认false；显式capacity-enable-plan / capacity-enable持久capacity_enabled并提升reader/writer26。旧25不能绕过全企业WIP门禁；回退保留26兼容程序及已承接任务，不降低floor或回灌数据库。

同企业同subject全局个人政策：weeklyMinutes/日期例外与maxWip。未配置则容量未知、WIP不限，不默认把多个团队的8小时相加。本人及本团队manage/dispatch读取全局合计，其他团队业务仅汇总不披露明细；全局政策须企业人员目录管理员+manage维护。

WIP含active订单assigned/claimed/in_progress/blocked/review/rework的执行人以及待接收交接预留。原指派/批量/认领/交接事务持同账号锁，跨团队并发最后名额单赢家；释放/取消/验收释放占用，超额旧任务继续执行。原任务中心/团队排期“跨团队产能”和执行人详情入口；改期预览包含跨组总量警示与防过期hash，但计划工时仍非预约或实际工时。

字段/权限/锁序/剩余真实制度见[PRD](../../docs/enterprise/capacity-g37.md)。本轮还修正G36测试随机选错团队通知的不稳定断言，基线失败与修正证据保留，不改变SLA业务口径。
