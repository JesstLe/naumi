# 次级管理中心（企业主控制台）一期（2026-10-13）

## 背景与决策（用户已确认）

面向企业老板的次级管理系统：管理手下员工（团队子账号）、查看本企业数据。与站点管理后台（`/admin`）完全隔离。

用户拍板的 4 点：

1. 业务记录**只开放图片与操作内容**；对话与操作内容、模型调用记录不开放。
2. 老板**可见本企业积分消耗汇总**（仅积分数，无价格/成本/充值）。
3. 入口地址 `/enterprise`。
4. 企业底座**复用已上线的团队/子账号体系**（`app_team_*`、入口授权 grants、`/api/team/*`），不新建企业表。

## 一期实现（纯前端新壳，零后端改动）

- `src/app/enterprise/page.tsx` + `src/components/enterprise/enterprise-console.tsx` + `enterprise.module.css`。
- 三个视图：**数据概览**（子账号数/可用积分合计/累计消耗/作品总数 + 成员积分一览表）、**团队与子账号**（有效期/重置密码/停用启用；新增绑定与授权调整仍归站点管理员，页面有提示文案）、**图片与操作内容**（按成员查看图片画廊与操作任务，含预估积分）。
- 侧边栏视觉对齐管理后台（深色分组菜单），底部「返回工作台」；`仅团队负责人可见` 标识。
- 数据面 100% 复用已审计端点：`/api/team/access`（入口授权）、`/api/team`（快照）、`/api/team/users`（成员操作 + 内容分区）、`/api/team/media`（私有图片代理）。不新增任何 API，不调用任何 `/api/admin/*`。

## 模型红线（结构性保证）

- 团队内容 SQL（`src/lib/teams/server.ts`）本就不 select 模型列；控制台前端亦不引用任何 wire/modelExecutions 字段。
- 静态契约 `scripts/verify-enterprise-console.ts`：断言菜单无「对话/积分流水/操作记录/充值/价格/定价/调用记录」、分区白名单只有 `artworks|tasks`、端点仅 `/api/team/*`、无 admin API 引用、无真实模型字段引用、复用 teams/contracts 类型。

## 权限

- 访问前提 = 站点管理员发放的**团队入口授权**（app_team_access_grants 处于 active）；未授权访问显示提示，不泄露任何数据。
- 团队负责人权限边界不变：不能增发积分、不能超授权上限续期、不能增删绑定；这些仍归站点管理员。

## 已知边界与后续（二期候选）

- 模型列：当前内容行不含模型信息（红线天然满足）；若老板需要看"前端显示模型"，用 TEXT_MODEL_ALIASES 反查映射后加入，不得出现真实模型名。
- 入口发现：一期通过直链 `/enterprise` 访问；用户菜单入口待与并行会话协调后加入（共享 user-menu 由 codex 维护中）。
- `npx tsc` 在 origin/main 存在一个既有错误（`canvas-action-menu.tsx` React19 ref 类型），与本功能无关。
