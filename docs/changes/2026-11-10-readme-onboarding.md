# README：AI Agent 与人类首次部署路径

## 模块与职责

- 任务：让首次自托管者按 README 完成基础生图，而不把首页可访问误认为部署完成。
- 基线：`origin/main = 628c5e93d711e25bd29f0ab975527d7eba86c5e3`。
- 任务分支：`codex/readme-onboarding-20261110`，从 main 创建独立 worktree；共享 checkout 的修改保持原样，模型映射 103 独立验证线未参与。
- 交付范围：`README.md` 与本记录；不改业务代码、Compose、安装器或数据库，不进行服务器发布，不增加功能迭代/成功发布计数。

## 公共接口、依赖方向、数据/状态/事务归属

- 文档引用现有首启、模型、计费、任务和媒体接口，不增加配置写入口。
- 基础模式：后台图片设置优先、环境兜底；PostgreSQL 保存账号、设置、任务和账务，本地卷保存媒体。
- 受管模式：供应商凭据、上游模型、公开模型、工具范围、参数和计费版本需要发布；独立 Router 负责相关管理协议/路由协作，默认 Compose 不打包该服务。
- Web 持久化任务；默认 direct `video-worker` 执行图片、批量/参考及视频任务，`media-worker` 处理媒体。App 与 direct Worker 共享必要的业务配置、存储和固定镜像。
- 历史任务继续使用冻结上下文；文档没有引入重复提交、直接 SQL 配置或重置业务数据的流程。

## 调研结论与源码依据

| 部署容易遗漏的事项 | 当前源码依据 | README 的处理 |
|---|---|---|
| Key 提前注入会关闭首启入口 | `src/lib/setup.ts`：Key 或管理员密码存在即 configured；`src/app/api/setup/route.ts` | 首启前 Key 留空，用向导同时建立 Key 与管理员，列明 403 的含义 |
| 首启不配置所有能力 | `src/components/setup/setup-client.tsx`、`src/lib/setup.ts` | 明确向导字段与后续接口、模型、余额、权限步骤 |
| 改 DB 容器密码未同步 DSN | `docker-compose.yml` 的 `POSTGRES_*` 与独立 `DATABASE_URL` 默认值 | 新实例生成一次随机密码，同时写两处，解释旧卷密码不自动变更 |
| Worker 不是可选的视频插件 | `docker-compose.yml`、`src/lib/application/task-execution.ts` | 写明 `worker` 模式、图片执行职责和四服务拓扑 |
| 默认源码构建缺少提交身份 | `Dockerfile` 默认 `ARG SOURCE_COMMIT=`；`scripts/video-worker.mjs` 要求非空身份 | 构建命令显式传入 Git 完整 SHA；检查 direct Worker 的身份和状态 |
| 健康 HTTP 200 不等于就绪 | `src/app/api/health/route.ts` | 命令检查产品身份、DB enabled/ok；另查 Worker 与媒体服务 |
| 默认 Compose 无 Router | `docker-compose.yml`、`src/lib/model-config/startup.ts`、`availability.ts`、`lifecycle.ts` | 区分基础模式与完整模型管理；已发布实例不以删 env 退回 legacy |
| Key/目录不等于工具可用 | `src/lib/model-config/feature-model-policy.ts`、`schema.ts`、`src/app/api/models/route.ts` | 给出供应商→上游→公开模型→范围/默认→计费→发布顺序；解释 managed:false |
| 后台配置可覆盖 env | `src/lib/settings.ts`、`src/lib/openai-base.ts` | 写明配置优先级、env 重建语义与 App/Worker 一致性 |
| 存储配置标志不测试媒体 I/O | `src/lib/object-storage/config.ts`、`runtime.ts`、`src/app/api/health/route.ts` | local 模式 enabled=true 仍需真实保存/回读验收 |

## 本次实现与迁移状态

1. README 顶部直接提供 AI、人类、部署核心与验收导航。
2. AI 路径增加输入清单、自动化 setup 契约、秘密处理、失败处理、证据格式和可复用提示词。
3. 人类路径提供新装 `.env` 生成、同镜像固定源码构建、管理员初始化、图片通道、积分与权限操作步骤。
4. 额外解释 Router 受管发布、可选 Agent/视频/OCR/对象存储依赖，不暗示默认安装全功能已经可用。
5. 增加不调用供应商的检查命令、真实单图验收清单、按症状排错、本地开发与容器模式差异。
6. 去掉已漂移的工具数量固定描述；Next.js 写主次版本范围，精确依赖继续以锁文件为准；历史图片日期保持。

## 验证命令、结果及证据层级

本地证据目录：`E:/Workspace/naumi/output/readme-onboarding-20261110/`。验证器为该目录中的 `verify_readme.py`；`--root` 指向上述固定基线的任务 worktree，`--readme` 指向被测副本。验证器与测试环境留在本地证据目录，不增加项目运行依赖。

| 验证命令 / 输入 | 结果与层级 |
|---|---|
| `python verify_readme.py --readme BASELINE_README.md --root <任务工作树>` | `README_CONTRACT=FAIL checks=18 failed=17`，exit 1；这是原文缺少本次上手契约的基线，不是业务运行失败 |
| `python verify_readme.py --readme MODIFIED_FILE.md --root <任务工作树> --suite` | exit 0；18 项文档契约、58 个本地引用/锚点、15 项源码契约、6 个 Bash 代码块语法通过 |
| 上述 suite 实际执行 README 的新 `.env` 生成块并再次执行 | 首次 exit 0，再次 exit 1，原文件 hash 不变；三个随机密钥不同，DSN/DB 密码相同，首启 Key 为空 |
| 上述 suite 使用真实 `docker compose ... config --format json` | 四服务解析通过；App/direct Worker 业务配置一致、三角色镜像一致、DB/Worker 无宿主端口；未启动容器 |
| README 三条 Node 检查命令，用 fixture 响应执行 | 24 个成功/失败用例通过，覆盖 DB 不可用、产品错误、暂停/UNKNOWN、非 direct、版本不一致、媒体排空、鉴权/网络/JSON 失败；外部请求 0 |
| `node scripts/verify-web-startup-compose.mjs --source-root .`，`WEB_STARTUP_EVIDENCE` 指向证据目录 | `WEB_STARTUP_COMPOSE=PASS mode=MODIFIED checks=14 graph=ACTUAL health_cases=4 worker_db=1 role=direct product_stack=0`，exit 0；现有真实 Compose 图与回环 HTTP fixture |
| `node scripts/video-worker.mjs`，仅注入 fixture 的受控 direct Worker 配置、`SOURCE_COMMIT` 为空 | `DURABLE_WORKER_CONTROL_CONFIG_REQUIRED`，exit 1；复现构建身份遗漏，在创建业务执行器前退出，未接触数据库/供应商 |
| `bash ROLLBACK.sh --fixture` | exit 0；在另一副本恢复原 README SHA256 `165f0ca813e25a2e80413b847dd8d28978b855d6a149eb8522030d5787d14d64`，原文契约重新 exit 1；修改后主副本保持不变 |
| `git diff --check` | exit 0，无空白/补丁格式错误；只选择性提交 README 和本记录 |

准确绝对路径、命令、输入、原始输出、退出码和回滚 SHA 记于 `VERIFICATION.txt`；README 修改后副本、完整差异和可执行回滚脚本分别为 `MODIFIED_FILE.md`、`DIFF_FILE.patch`、`ROLLBACK.sh`。本地检查没有调用真实模型，也没有把模拟结果记录为部署成功。

本机 Docker Desktop Linux Engine 的 `docker version` 返回 HTTP 500。本轮不以修改全机 Docker 状态来扩展文档任务；Compose 配置解析不依赖运行中的引擎。完整容器启动、浏览器登录与真实供应商出图不记为本轮通过，也没有使用任何现有供应商密钥或生产数据。

## 未完成项与下一步

- 每个新部署仍需在自己的网络、数据库、供应商和存储环境完成 README 的真实单图闭环；未经执行的 Agent/视频/编辑能力保持 `PENDING`。
- 独立 Router 的交付和部署不包含在默认 Compose 中；若目标是“全功能一次安装”，后续应单独完成可分发 Router 依赖、安装预检和首启配置诊断的产品切片，而不是在 README 假设该服务已存在。
- `.env.example` 与安装器仍保留部分历史文案/默认行为；本轮只更新 README，推荐路径显式避开这些易误读点。后续如改安装器，需独立验证新装、已有数据与升级分支。
- 本次没有发布服务器，也未把本地文档测试写成用户侧真实部署验收。
