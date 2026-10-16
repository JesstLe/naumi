# 账号级 Skill 文件直接导入（2026-10-16）

## 状态与边界

- 功能模块：已实现解析、当前登录账号直接持久化、并发幂等、测试脚本。
- 本模块不修改 Skill 目录、Agent UI 或独立策略页面；这些由本轮其他任务整合。
- 不连接服务器、不使用生产数据库、不调用模型或收费工具；没有生产发布。
- 起点 `c2634fb`，独立分支 `codex/brand-skill-import-api-20261016`；共享 checkout 的他人未提交改动保持原样。开工已由总控刷新远端，本模块累计功能迭代 1，最终整合由总控统一执行。

## API 契约

`POST /api/image-skills/import`，`multipart/form-data`，单个 `file`：

- `.md`：包含 `name`、`description` frontmatter 的 Skill Markdown；名称优先正文首个一级标题，否则使用 `name`。
- `.zip`：根目录或单一文件夹内的 `SKILL.md`、`references/**/*.md`、可选 `agents/openai.yaml`。标题优先使用其中的 `interface.display_name`。
- `.json`：已有 `{format:"naumi-image-skill",version:1,definition:{...}}` 导出格式。

成功即保存，不需要二次编辑/保存：`{skill,duplicate,warnings?}`。新建 201，当前账号已有同一规范化 definition 时 200 且返回原 ID/版本。同名不同内容创建新条目，不覆盖旧内容。归档后可重导；编辑过的旧版本不会被导入静默回滚。

所有写入仅使用 `authenticatedEmail(request)`，客户端 email/owner 不能指定账号。无登录 401、格式错误 400、体积超限 413，现有 100 条账号配额保留 409、速率限制 429，存储不可用 503。响应禁止共享缓存。`requestRequirement` 既有 `image-skills → agent` 别名覆盖此子路由，不需新建旁路权限。

## 数据与完整性

- 沿用 `app_image_skills`，无新表、列或破坏性迁移。
- 定义以 `validateSkillDraft` 的固定字段顺序规范化，再 SHA-256 计算内容哈希。
- 在数据库事务中锁定当前 `app_users` 行；与现有创建/编辑共用账号级锁。锁内按 email 查询当前有效条目、比较内容哈希、检查配额再创建。因此并发同文件只有一条。
- 既有 revision CAS 更新/归档不变；导入不接受客户端 selection 或 revision，也不覆盖已有定义。
- SKILL.md 及 references 正文均合并为流程数据，不截断、不摘要。UTF-8 解码严格校验，换行统一 LF，保存沿用现有字段 trim 规则。
- 名称 ≤48 字符、简介 ≤140 字符、流程 ≤6000 字符。合并超限明确返回 413，不静默丢失资料。
- YAML 仅解析普通文本元数据及 `>`/`|` 描述，不执行/加载任何 YAML 标签、引用或外部内容。agent metadata 不赋予工具权限。

## 上传与 ZIP 限制

- 原文件 ≤512 KiB，请求流 ≤528 KiB；先按流计数再解析 multipart，chunked 或伪造 Content-Length 无法绕过。
- ZIP 不落盘，central-directory 与 local-header 一致性、CRC32、目录大小、文件区域重叠均校验。
- ≤64 条目，单条解压 ≤64 KiB，总解压 ≤256 KiB，解压比 ≤100；zlib `maxOutputLength` 同步约束真实解压输出，伪造大小不能扩大内存。
- 拒绝 traversal/绝对路径/反斜线/重复大小写路径/不安全文件名、多 Skill 根、跨根内容、加密/分卷/ZIP64/特殊压缩、符号链接/特殊文件/可执行文件、非允许路径及二进制内容。
- `.DS_Store`、`__MACOSX` 仅忽略并返回去重提示；仍参与条目与解压体积上限以及路径/完整性校验。
- 不执行脚本、不读取网络、不执行导入文本；既有工作流数据提示及工具鉴权/计费边界保持。

## 验证与剩余事项

脚本 `scripts/verify-skill-import.ts`：

```powershell
# 纯解析，不依赖数据库；可选 NAUMI_SKILL_IMPORT_SOURCE 指向原 Skill 文件夹
npx tsx scripts/verify-skill-import.ts --parser-only

# 在已确认本机隔离的 PostgreSQL 上执行（每次自动建/删随机 schema）
$env:NAUMI_VERIFY_ISOLATED_DB='1'
# DATABASE_URL 由总控设置为本轮本机隔离实例，禁止使用生产 URL
npx tsx --conditions react-server scripts/verify-skill-import.ts
```

2026-10-16 本模块实际解析结果：

```text
SOURCE_SKILL=PASS NAME=品牌包装创意策略生成器 CHARACTERS=2706 FULL_REFERENCES=YES
SKILL_IMPORT=PASS CHECKS=41 PARSER=PASS DATABASE=NOT_RUN PROVIDER_CALLS=0
```

退出码 0。覆盖原附件 SKILL 与两个 reference 全文、中文元数据、JSON兼容、同内容哈希、单根ZIP、路径/双根/CRC/脚本/二进制/symlink/executable/zipbomb/条目数/长度拒绝以及 feature scope。

脚本 DB/API 段包含：登录401、创建201/重复200、伪 owner 与跨账号隔离、4并发仅1新建、同名不同内容、ZIP直接保存及提示、文件/请求流上限、无文件400、revision CAS409、编辑与归档后重导、他人读取拒绝。此段需在总控锁定版依赖 runtime 集中执行后补记录，不将解析通过当成数据库验收。

本机共享 node_modules 为旧 React18/Next14，与锁定 React19/Next15 不符：`--conditions react-server` 在旧 React 报 `This entry point is not yet supported outside of experimental channels`。总控已在隔离 runtime 安装锁定依赖，本模块不改共享依赖。TypeScript 本模块错误已修正；共享依赖完整检查剩 `canvas-action-menu.tsx:82` 的既有 React ref 类型错误，不记录全库 tsc 通过。

## 回退

本模块纯增量入口/解析和导入方法。回退代码不删表、不回灌 DB，已导入 Skill 仍可由既有 GET/PATCH/DELETE 管理。线上如需回退入口，先停止新文件导入，再按蓝绿既有流程回退兼容程序；不重放任务或变更用户历史。
