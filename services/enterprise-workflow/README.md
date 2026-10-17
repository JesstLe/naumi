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
