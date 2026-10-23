# 供应商余额入口与多租户用量（2026-10-23）

## 基线与边界

- 基线 `1871f84d181c8b5dc48ee506544a3857875907c1`，独立 `codex/supplier-accounts-tenants-20261023` worktree。
- 用户要求新增后台供应商剩余额度界面并接好多租户；沿用“先不要上线”，仅开发、集中验收、提交推送。
- 不改共享 checkout 的 admin modernization / canvas-action-menu 未提交内容；不改模型路由、供应商凭据、客户售价、历史任务或生产。

## 实现

1. 新增 `/admin/supplier-balances`，模型分类子导航与模型管理页提供直接入口，登录返回地址允许精确该页。浅色卡片、桌面/手机适配。
2. 复用已存在的 ProviderOps、已发布凭据及安全余额适配，不重复建设。APIB 是供应商余额，Geek 是 API Key 额度，不把不限额密钥当作无限资金，也不猜货币单位。
3. 新页面只查余额 `view=balances`，跳过调用统计 SQL；健康巡检默认保留原调用统计。未知参数、重复参数拒绝，原鉴权/缓存/版本复核保留。
4. 平台共享采购账户余额只给平台管理员。不会把共享剩余资金按企业相加/分摊，也不公开供应商身份、密钥或内部通道到企业端。
5. 租户详情的账务标签与企业端“额度与用量”共用 TenantUsagePanel。新 API `/api/admin/tenant-usage` 与 `/api/enterprise/tenant-usage` 返回已确认企业创作及其已结算消费、处理中冻结、未完成结算；不返回供应商数据。
6. 按受理日期选根创作，以受理时冻结的 `tenant_id` 及 actor/payer 追踪同租户同操作者子任务；distinct operation 去重，跨租户关联同一 operation 不计入已知消费。不会从今天的成员关系反推旧个人创作归属。
7. 企业 API 强制 `admin=false/consoleAdmin=false`，复用 enterpriseRead 的所有者/当前有效下级范围；同浏览器平台 cookie 不提升。切企业/日期立即隐藏旧数据，取消旧请求，重试不会重放生成。企业面板受控使用页头/URL的期间，不出现第二套日期选择；平台详情保留面板日期控件。顶部刷新同时联动概览汇总、状态列表和用量。
8. 当前账务仍为实际成员账户，没有企业钱包。已结算消费按已记录 operation 的 charged_credits 展示，不冒充供应商成本、净退款后余额或企业可用积分。缺表/缺依据显示未记录；明确零与未知区分。

## 验证状态

- 新 `verify-supplier-accounts-tenants.ts` 使用全新回环 PostgreSQL16，真实 API/权限/SQL通过：冻结企业归属、root/child及跨root计费去重、起止北京时间、未知与零、部分缺依据小计、子免费不提升根免费、跨企业关联歧义、错误payer、下级停用、企业所有者/岗位/普通成员/跨企业、双cookie无扩权、重复/非法参数、平台模式拒绝，以及余额body超时/断流分类。
- 原 `verify-provider-balance.ts`、`verify-provider-activity.ts`、`verify-saas-enterprise.ts` 在各自全新fixture库通过；供应商生成/余额真实网络调用均0。真实供应商余额及实际生产配置本轮未验收。
- 真实生产React组件/CSS回环fixture的Edge headless 29项通过：1440桌面、390手机、无横溢、入口、资金/密钥额度区分、失败不沿用旧数值、重试、真实PlatformConsole账务tab、切企业立即隐藏/取消旧请求、父refresh联动、受控期间使用父日期且无重复控件、pageerror0。
- T3 snapshot两次超时，保留失败，改用仓库已有 `@playwright/test` 隔离headless Edge验证，不接用户Chrome/CDP。截图已打开检查；展示值均为fixture。
- Windows Next正式构建91/91 exit0，但standalone复制node_modules junction出现EPERM警告，不作为可部署Linux包证据；后继本机Docker按正式Dockerfile build阶段重新构建。初次Windows build在开发中因误将refresh prop加到CreationBrowser而类型失败，已移至TenantUsagePanel，后继build/tsc通过。
- 最终Linux正式Dockerfile build阶段构建91/91 exit0；TypeScript exit0；独立副本回退9原文件实hash恢复、14新增文件移除并复现基线入口缺失，修复工作树保持不变。完整命令/制品核验见本任务 `output/supplier-accounts-tenants-20261023/VERIFICATION.txt`。本轮未SSH/持锁/候选/切流，不上线。

## 复核修正

- 部分billing link未通过payer/归属/存在性校验时，即使同root另有有效operation仍提示依据不完整；只展示可证明小计。
- no-charge只证明明确标记的根任务，子任务免费不推出根免费。完全无依据返回null；已知零仍为0。
- 余额响应body的超时与断流分别归TIMEOUT/NETWORK_ERROR，不再被JSON/schema解析catch误报字段未确认；大小超限与空body仍为格式问题。

## 开发迭代同步

两个模块：供应商余额入口、租户用量接线。开工已 fetch origin/main，基线如上；提交前再次fetch确认origin/main仍为1871f84d，无新增提交需要整合。未累计到第三模块；不因本功能自动合 main 或部署。
