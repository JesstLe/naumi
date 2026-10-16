# 品牌包装策略独立页面

## 目标与范围

- 不要求用户学习 Agent。创作工具新增「品牌包装策略」，页面 `/tools/packaging-strategy`。
- 参考资料：用户提供的 `brand-packaging-strategy` 技能及 `brief-schema.md`、`output-format.md`。页面只收集简报和展示真实文字结果，不生成图片、不执行印刷完稿。
- 本模块只负责独立交互页面、工具入口及前端契约；技能导入、账号级存储、生成接口和权限映射由主任务集成。

## 已实现

1. 浅色三栏工作台：八步导航 / 当前字段编辑 / 实时摘要；390px 以下改为四列步骤与单栏内容。填写完整度只显示 `已填项 / 8`，明确不是策略质量评分。
2. 八项字段与资料一致：品牌产品、任务、人群、购买理由、印象、价格渠道、竞争关系、包装范围限制。每项允许留空；示例只填简报，不冒充生成结果。
3. 按登录账号隔离本机草稿，输入300ms防抖保存，离开页面或账号切换立即落盘；本地存储失败提示使用云端保存。保存字段、当前步骤、追问回答、修改要求和最近真实项目。
4. 云端项目列表、手动保存、恢复、新建、示例和清空确认。清空只替换本机当前草稿，不删除云端项目。
5. 生成、最多三个追问的补充回答、显式跳过追问出初稿、保留已有策略继续优化、复制文字与下载 Markdown。
6. 真实接口出错时显示错误，不填入示例结果。409保留本机简报并提示恢复云端；生成失败如返回更新后的项目版本，接收服务端 revision 后显示失败，避免下一次必然冲突。
7. 全私有工作区按账号 key 重建；退出、切换账号或卸载会取消在途请求。认证未就绪、匿名、访问未授权、401/403、列表/生成错误、无项目、无结果等状态均独立处理。
8. 同步 ref 防止双击并发，POST 均带最新 `expectedRevision`。生成中不可修改字段或切换云端项目，不会覆盖生成请求已提交的输入。
9. 结果使用 ReactMarkdown 文本渲染，跳过 HTML、禁止结果图片加载和链接导航；本页面不触发任何图片供应商请求。
10. 简报在本机编辑后，旧结果显示「上次结果」提示，必须重新生成才能继续优化。服务端约定 save 改变 brief 时清除 result；同 brief 保存保留。
11. 确认弹窗支持 Escape、Tab 焦点约束、关闭后恢复焦点、背景滚动锁定；按钮和字段有可访问名称。

## API 契约

- `GET /api/packaging-strategy` → `{ projects: [{ id, title, revision, updatedAt }] }`
- `GET /api/packaging-strategy?id=<uuid>` → `{ project }`
- `POST /api/packaging-strategy`：`{ action: 'save'|'generate'|'refine', brief, projectId?, expectedRevision?, answers?, feedback?, allowDraft? }`
- `project`：`{ id, title, brief, result: null | { kind: 'questions', questions: string[] } | { kind: 'strategy', content: string }, revision, updatedAt }`
- 非2xx可返回 `{ error, project }`，用于模型失败后同步已释放租约的最新 revision。409不会自动接受远端 revision，以防静默覆盖新内容。
- 所有接口使用 `authHeader()`；不提交 email 代替服务端认证。页面额外调用 `canPage('/tools/packaging-strategy')`。

## 验证与当前边界

- `npx tsx src/components/packaging-strategy/model.test.ts`：27项通过，覆盖八字段计数、未知输入、恶意本机数据、账号草稿key、结果结构、版本和下载文件名。
- 定向 TypeScript：通过（exit 0），范围为本页面、组件、测试和工具元数据。
- 全量 `npx tsc --noEmit --pretty false --incremental false`：exit 2；唯一错误位于未修改的 `canvas-action-menu.tsx:82`，共享依赖 React18 的 `RefObject` 与项目源码不匹配；本模块无错误。
- 初始基线：`c2634fb`；独立分支 `codex/brand-packaging-page-20261016`，工作副本不修改共享 checkout。
- 真实 API / 登录账号 / 桌面与390px浏览器 / 模型端到端由主任务在服务端合并后集中验证；本模块没有把纯逻辑测试等同于浏览器或真实模型验收。
- 本轮没有连接或发布服务器。新入口 `live: true` 仅表示候选代码接真实接口，不能作为已部署声明。

## 进度与集成

- 功能模块计数：本前端模块完成1，主任务按合并模块合计刷新远端。
- 文件范围：`src/app/tools/packaging-strategy/page.tsx`、`src/components/packaging-strategy/*`、`src/lib/tool-meta.ts` 和本文档。
- 待主任务：合并后端与技能、按账号权限目录接入口、完整浏览器与真实调用验收、用户确认后决定发布。UI开发没有自行触发发布。
