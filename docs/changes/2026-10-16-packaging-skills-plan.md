# 品牌包装策略：Skill 导入与独立创作页

## 目标与当前状态

- 用户授权：先把提供的品牌包装 Skill 接到站内 Agent 并真实端到端验证；Agent 页面支持拖拽/点击上传并直接存进当前账号 Skill；为不熟悉 Agent 的用户提供创作下独立交互页面。允许 Agent 集群实施。
- 本任务基线：`c2634fb`（2026-10-16 开工 `git fetch origin main`，本地 HEAD 与远端一致）。共享 checkout 位于其他任务分支且有未提交管理 UI / canvas 改动，本任务不触碰。
- 集成工作区：`C:/Users/13357/.codex/worktrees/brand-packaging-skills-20261016/naumi`，分支 `codex/brand-packaging-skills-20261016`。
- 当前为本地实现阶段；不是已上线。UI 先验收审阅，不因此触发服务器更新。

## 一套能力，两个入口

1. Agent：内置 `official:brand-packaging-strategy`；允许导入个人 Skill 后选择执行。规则文件及两份 reference 全文进入上下文，不能只导入入口而丢掉输出/输入标准。
2. 创作：`/tools/packaging-strategy`；八项 brief、按需最多三个追问、初稿、三个方向及唯一推荐、修改反馈、复制/Markdown 导出、账号隔离草稿/云端项目。
3. 共用同一 Skill 定义与已配置站内文字模型，不自动调用图片/视频收费工具，不伪造策略示例为模型结果。

## 分工与文件负责人

| 负责人 | 独立分支/工作区 | 文件范围 |
|---|---|---|
| Root | brand-packaging-skills-20261016 | canonical Skill、catalog、策略协议/API/持久化、模型路径、权限路由、集成/验收 |
| skill_import_backend | brand-skill-import-api-20261016 | import parser、`/api/image-skills/import`、Skill store 幂等、集中后端测试 |
| skill_upload_ui | brand-skill-upload-ui-20261016 | `skill-book.tsx/.module.css` |
| packaging_standalone_ui | brand-packaging-page-20261016 | 独立页面组件、route、tool-meta 入口 |

各分支基于同一基线，选择性提交后集成；不覆写整目录、不切换共享 checkout。整模块完成后集中测试。

## 导入设计

- 输入：Skill Markdown、单 Skill ZIP（入口/参考资料/元信息）、已有 Naumi Skill JSON；单次一个文件。
- `POST /api/image-skills/import` 接受 multipart `file`；服务端按真实登录身份存入既有 `app_image_skills`。客户端 owner/email 不参与归属。
- ZIP 内存解包，限制原始大小、文件数与解压大小，校验路径/符号链接/文件类型。数据不执行。忽略系统垃圾文件；缺少引用、多个技能根、超限等给明确错误，禁止悄悄截断。
- 全文合并进已有工作流字段（上限6000字符）；保留原始提供文件于 repo canonical Skill。账号内相同定义幂等；同名不同内容新建；保持原有 revision CAS。
- UI 上传成功即入库，打开“我的 Skills”；不要求再手动保存，不自动执行。切换账号/卸载时中止请求并忽略旧回包。

## 独立页 API 契约

- GET `/api/packaging-strategy` → `{projects:[{id,title,updatedAt,revision}]}`。
- GET `?id=UUID` → `{project}`，账号绑定。
- POST `{action:'save'|'generate'|'refine',projectId?,expectedRevision?,brief:{brand,task,audience,reasons,impression,priceChannels,competition,constraints},answers?,feedback?,allowDraft?}`。
- 返回 `{project:{id,title,brief,result:null|{kind:'questions',questions:string[]}|{kind:'strategy',content:string},revision,updatedAt}}`。
- 服务端校验8字段与长度；缺失关键事实时询问最多三个问题，用户可明确要求在标注假设下先出初稿。已有策略优化保留事实支持部分。
- 账号隔离表/行级查询、revision 乐观锁与运行中租约，防止两个窗口覆盖或重放并发生成；调用前后明确保存结果状态。错误不冒充成功。

## 验收门槛

1. 原始 Skill 哈希保持；bundle 与 canonical 文件同步；内置 catalog 可发现和执行。
2. Markdown/JSON/真实附件 ZIP 上传→当前账号 DB→刷新可见→Agent 请求含完整规则→真实模型结果。
3. 匿名拒绝、跨账号不可见/修改/恢复、同定义并发导入只建一次、同名不同内容不覆盖、revision 冲突可见、错误文件不落库。
4. 独立页：真实登录、示例仅填 brief、生成追问→补充→完整策略→修改→刷新恢复→复制/下载；桌面和390px，无横向溢出、无 pageerror。
5. 真实模型至少验证一份信息不足 brief 与一份完整 brief；模型/调用与结果证据单独记录。mock contract 测试不标为真实上游。
6. baseline/modified/rollback 集中测试、变更包与 diff、可执行 rollback 在另副本演练；原产物保持修改态。

## 后续更新

模块实现、集中测试结果、当前未完成项、提交与推送 SHA 逐步补入本文件/验收文档。初始功能迭代计数0；累计3模块完成后 fetch/整合 origin/main 并记录。
