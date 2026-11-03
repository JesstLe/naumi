# 认证启动读取的限时恢复

## 模块与职责

基线 `dfdec4f8a8b209d1a8f98f4908ac7da34cfd142c`。本模块解决画布读取开始之前的认证启动等待：`AuthProvider` 的 config、session、account 请求此前没有期限，session 的任意非 2xx 被映射为匿名，config 故障则保持默认 local 并宣布 ready。

- `src/lib/auth-bootstrap.ts` 只负责启动 GET、HTTP/必要字段校验，复用 `withBrowserReadDeadline`。每次完整读取包含 auth header、fetch、body 的 15 秒预算；不重试写入，不执行供应商请求。
- `src/lib/auth-context.tsx` 继续拥有身份、缓存激活、现有 identity epoch 与会员状态。只有配置及对应身份读取完成才对外 ready。
- 页面、画布、节点 store 和登录/会员服务端写入接口没有搬入新 helper。

## 实现与兼容

1. config 需 HTTP 200、真实 boolean `db/multiUser` 与已知 `authMode`；明确 `db:false` 才使用本地模式，故障不作为部署模式证据。
2. session 只有 HTTP 200 且显式 `user:null` 代表匿名。503、超时、坏 JSON、缺少 user 留为未核实，不删除 LAST_KEY、用户缓存或草稿。
3. mock 单用户模式保留旧的 session-null 后 account 查找。只有前置 session 已明确匿名且 account 返回 401/403 时结束匿名；account 503、超时、坏格式继续显示重连。account 用户必须匹配请求邮箱。
4. children 始终挂载，SessionBridge 可继续运行，编辑器状态不因重连被卸载。未知阶段使用 `display:contents` 的 inert 容器和 Provider 简洁恢复提示；React portal 的 click/key/pointer/submit 事件也在同一逻辑边界拦截。
5. 不提前发布未经核验的本地暖 user。保留存储原字节；有效 local 模式确认后才恢复暖 user。启动未就绪时 `consumeCredits` 返回 false、`changePlan` 返回 null，不产生乐观扣款。
6. 身份在等待中改变时，废弃旧 epoch 的只读启动，并以新身份重新发现；不会重发登录/保存/生成。Supabase bridge 仍可从始终挂载的 children 发出身份；已就绪后的原 sync POST 行为保持。
7. 手动“重新连接”只执行启动 GET。无定时重试；清理仅 abort 本轮读取，不取消业务任务，不更换原任务身份。

## 集中验证与证据层级

测试入口：`node scripts/verify-auth-bootstrap-resilience.cjs`。测试加载真实 AuthProvider、SessionBridge、React DOM，在本机 Edge 执行；HTTP、Supabase SDK、缓存激活为明确 fixture，15 秒计时在测试中缩至 120 毫秒。不是线上 DB、真实登录服务或供应商端到端验收。

- 原始源码：8 个已知缺陷全部复现，`AUTH_BOOTSTRAP=REPRODUCED CHECKS=8 FAILURES=8 ACTUAL_REACT_PROVIDER=1 ACTUAL_SESSION_BRIDGE=1 SUPPLIER_CALLS=0 EXIT=1`。
- 修改源码：35/35，通过 config/session/account 的 fetch/body/header 永久等待、HTTP/格式错误、显式匿名、mock 旧缓存、local 成功、Supabase 先后顺序、重连、portal 阻断、未知模式扣款阻断、A→B→A/注销/卸载晚到等场景。字面输出：`AUTH_BOOTSTRAP=PASS CHECKS=35 FAILURES=0 ACTUAL_REACT_PROVIDER=1 ACTUAL_SESSION_BRIDGE=1 SUPPLIER_CALLS=0 EXIT=0`。
- 独立副本执行真实 Bash `ROLLBACK.sh`：恢复 auth-context 原 hash、删除新 helper；回退后同一测试重新复现 8 个旧缺陷，正式文件保留修改态。rollback 不是测试成功行为，而是验证原行为可恢复。
- 一次全量 `npx tsc --noEmit --pretty false --incremental false` 返回 2：仅并行 Canvas lazy-panel 尚在接线的 props 三处错误（gridClass、seedTemplateId、pack），Auth 文件未报错；最终全量集中类型检查由父任务负责，不把此轮标成 tsc 通过。

证据目录：`output/browser-stability-goal-20261103/auth/`，包含 `MODIFIED_FILE.tsx`、`MODIFIED_HELPER.ts`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`、hash 清单、baseline/modified/rollback 的逐项结果。

## 未完成项与下一步

- 本子模块未 commit、未合 main、未部署；由父任务集中审查/封存后决定提交范围。
- 六种节点列表初始化与项目误判空列表属于后续独立模块，未在这里修改。
- 本次保留现有 POST/account 行为；不扩展为认证系统或计费系统重构。

## 父任务最终集成与独立审查

独立审查确证并修复一个新引入的P2：全站inert遮罩把独立后台cookie登录也挡住，管理员在配置目录故障时不能进入修配置。最终仅精确 `/admin`、`/admin/…` 与 `/setup` 不受产品bootstrap交互遮罩阻断；原AdminClient/backend/setup鉴权仍负责入口，Auth.ready及积分保护未放开。`/adminish`、`/setupish` 等仍受保护。

真实AdminClient对照：原dfdec控制4项通过；修正前3处入口故障复现（exit1）；最终10项通过，初始POST0、人点后台登录仅1次，拒绝仍拒绝；未知身份ready=false/扣款false/换套餐null。证据 `output/browser-stability-goal-20261103/auth-admin/`。最终35项认证回归继续全过。父15命令集中回归及全量tsc exit0，完整Next/CanvasClient桌面与移动恢复11项通过。原子模块旧tsc未完成和初轮失败仍保留在历史证据，不代表最终状态。

后续四产物以目标根proof目录的整包清单为准（包含本次admin兼容修正），旧auth目录四产物仅对应修正前子模块快照，不当作最终全包。
