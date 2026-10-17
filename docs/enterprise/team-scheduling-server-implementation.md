# 团队排期服务端 S1 实施与验收

日期：2026-10-17。分支：`codex/enterprise-workflow-foundation-20261016`。开工HEAD：`1fbd20253f940d2860851b4befe071fa4ea131c6`。

## 1. 完整界面与验收页的定位

用户已指出本轮预览与 `http://127.0.0.1:18482/preview.html?v=4` 不一致。现场核对：18482标题为“Naumi · 企业协作 Demo”，18489为“团队排期 · 服务端验收”。

原完整企业Demo是后续产品界面基础，不换成验收页。新增`tools/fixture.html`只用合成账号和三条示例行检查配置服务；正式页面/完整V2设计器尚未连接服务端。本轮不把两页并存当作正式UI交付完成。下一模块应把后端接回原完整企业页面，不另建第二套产品设计。

## 2. 本轮改动

- `src/identity.ts`：Ed25519短时BFF签名身份验证，固定issuer/audience/alg/kid/TTL；数据库实时团队授权。
- `migrations/002-scheduling.sql`：独立企业身份/团队成员和配置/个人布局/幂等/审计表，重复执行兼容。
- `src/scheduling-contracts.ts`：严格命令和布局校验；服务端schema=3，与本地Demo格式分离。
- `src/scheduling-domain.ts`：五默认视图、草稿/发布/历史、视图生命周期、表级字段/选项稳定性。
- `src/scheduling-store.ts`：团队/个人范围、共享CAS、事务锁、指纹幂等、三写原子事务和审计过滤。
- 原工作流`contracts/domain/store`：新身份创建工单/事件绑定团队；读写和派单目标均校验团队，保留旧未分组fixture兼容。
- `src/server.ts`：可选排期store与新API；就绪要求迁移002；锁/语句超时和死锁映射503 RETRY_LATER。
- `tools/preview-fixture.ts`：随机命名一次性PG容器，回环HTTP、内存生成签名键、合成身份；不打包进正式service。
- `tools/fixture-browser-check.mjs`：独立headless浏览器与两个隔离上下文，验证跨会话真实后端数据，不连接用户Chrome/CDP。
- `tools/ROLLBACK.sh`：仅接受带标记的可丢弃代码副本，先全部校验基线载荷和当前哈希，再恢复原文件/移除新文件。

## 3. 设计决策

团队权限不取多团队并集：Principal明确绑定当前teamId，数据库只解析该团队角色。与现有工单权限并用，先团队范围再业务角色。

团队和个人版本分开，个人reset保留版本墓碑。团队布局按整个工作簿CAS，减少当前阶段跨草稿/视图/字段操作的歧义；更多跨视图同时编辑需求后再拆细粒度版本，不牺牲原子性换最后写入覆盖。

个人筛选及布局不会进入他人的查询或团队审计；主管也不默认读取其他人的个人配置。已有字段/选项保守保留，等待真实任务引用检查后再增加精确删除流程。

布局配置不会写orders/events，不通过任意JSON修改任务。原型scheduleTag、values、工时尚未正式写入；新业务命令另立验收。

## 4. 集中验证结果

基线：`node verify.mjs`，8测试通过，独立PostgreSQL/HTTP完整需求到验收流程保持。

修改后：`npm run typecheck`、`node verify.mjs`、`npm run build`均exit 0。11测试通过，包括原8项+身份/排期模型/排期PG-HTTP三个大测试组。后者包含多项断言，不把测试组数等同全部验收点数。

关键实测：

```text
PROCESS_RECOVERY_PASS: version=12
SCHEDULING_HTTP_PASS: durable=1 team_scope=1 team_role_union=0 cas_winners=1 draft_winners=1 idempotent_writes=1 private_view_isolation=1 atomic_rollback=1 workflow_mutations=0 revoked_replay_denied=1 restart_recovered=1 legacy_writes=0 provider_calls=0
BROWSER_PASS: checks=12 contexts=2 postgres=1 page_errors=0 mobile=390
```

持久化恢复既验证新服务/连接池，也用新Node操作系统进程读取同一隔离PG的version=12，不依赖父进程内存、localStorage或UI成功提示。

事务回滚包含注入schedule_audit插入异常：工作簿/个人布局和去重表均不变。并发包含不同命令的版本冲突、两主管共享草稿竞争、相同commandId并发仅1条新写入。撤权测试先更新成员权限/账号，再重放历史成功请求，得到403。

浏览器检查12项：5视图、设计师禁用团队控件、未发布草稿隐藏、发布跨上下文可见、个人刷新保持/隔离、个人审计隔离、旧会话冲突且编辑保留、团队草稿刷新保持、恢复新版本、持久化看板、390px无整页横溢、pageerror=0。桌面/看板/手机截图已打开检查，表内/看板内允许横向滚动。

T3原生preview连续两次snapshot失败，原始错误均为`Preview automation snapshot timed out after 15000ms.`；另尝试IAB返回`Browser is not available: iab`。按工具约定改用新headless进程，未附着普通Chrome、未使用CDP。

## 5. 文档与追踪

S1 PRD含14节、C01–C28；契约覆盖身份、6个HTTP入口（含健康/就绪）、13个配置命令、3层版本、事务和兼容/回退。既有32模块文档与V1/V2原型保留；旧契约顶部增加指向S1的说明，不把原型格式误当新后端格式。

本轮交付证据目录：`E:/Workspace/naumi/output/enterprise-server-v1-20261017/`。精确命令/输入/字面结果/退出状态在`VERIFICATION.txt`，逐文件基线/修改SHA在`MANIFEST.json`，Git实际回执在`GIT_STATUS.txt`。

## 6. 回退验证与数据边界

回滚仅对另一个带`.enterprise-rollback-fixture`标记的代码副本执行，不改开发工作树、不连接生产、不删002表、不回灌任何数据库。验证原文件字节哈希恢复、新文件移除，并在恢复副本重跑原8项测试。修改版源码/交付zip保留。

正式DB已接受带teamId数据后，不能把旧无团队版本直接公开；正式发布需兼容旧入口和范围数据，旧版回退材料仅作代码副本验证而非授权降级路径。

本轮使用合成账号/任务，无真实ZIP导入、无供应商调用、无生产数据库/私钥复制。真实钉钉登录、组织同步、资产、ERP接口均未接入，不能据本次fixture签名验证宣布企业SSO完成。

## 7. Git、迭代与后续

开工origin/main为`6aca158587c51362140ce2bca613617828a5991d`；收尾刷新发现main已推进到`1b80da5694a5709ac0ce08b62f6d257cc4b67255`，先选择性提交本任务，再普通合并最新main并集中复验。本轮是排期第3个功能模块，同步完成后计数归零。最终本地/远端SHA与整合结果以`GIT_STATUS.txt`回执为准。共享E:/Workspace/naumi不切分支、不stash/reset、不提交他人文件。未合并任务分支到main，未发布任何服务器，服务器维护计数不增加。

下一模块：沿用18482完整企业界面，接正式可信BFF/组织映射和团队任务查询，再将完整排期设计器、业务日期/工时/标签命令接入。随后推进资产/日历/交接/原始记录ID确认、小团队试点与独立企业环境蓝绿；同团队品牌/店铺行及敏感字段策略也需单独验证。

收尾同步结果：功能提交`d97fdf1c`，普通合并main `1b80da56`生成`0c330dc2`，无冲突；合并后11项服务测试、类型、构建重新通过，原Demo集中检查`RELEASE_CHECK_PASS: static=1 model=36+32 documents=5 acceptance=50`。本次检查同时重建旧文档阅读器，纳入S1契约指引。功能迭代计数归零。源ZIP再次核对SHA256=`a1a60e7fc38d159bd0820a0bfb6ad17d21b2508ac31fb05a9233e344e881d06a`，原件保持。
