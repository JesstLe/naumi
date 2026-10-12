# 2026-10-12 废弃业务工具移除

## 状态和范围
- 用户明确废弃鱼塘任务、SCM上架、差评巡检。只改Naumi源码，不删除独立项目/用户本机skills或历史业务数据。
- 独立分支 `codex/remove-retired-business-tools-20261012`，基于开工fetch后的origin/main `1506166cf29de6c79270cf229b033fa2dcfd5fd3`。不修改共享main、不连接服务器、不发布，由其他Agent合并上线。
- 本次完成1个功能模块，迭代同步计数1/3；文档提交不计数。合并前再次fetch并审查冲突，尤其naumi-tools.ts、db.ts和迁移README。

## 实现
- 从共享 `createNaumiTools` 删除9个废弃工具及全部请求封装、登录/默认配置、提示词说明。工作台/画布（含小球复用的画布运行时）一致由53项减为44项，动态工具目录不再返回废弃工具。生图、创作中心、A+母图审核、ComfyUI、视频工具保留。
- `describeNaumiTools` 删除废弃工具的只读特判；不变更现有生图/计费参数和会话历史格式。
- 数据库新项目种子不再创建3类废弃项目；`listProjects`对公开/全量列表都排除废弃slug（含大小写和前后空白），原注册表记录和业务历史不删除。`upsertProject`与HTTP POST拒绝恢复废弃slug，API返回410。其他自定义项目CRUD保持。
- `docker-compose.yml`移除旧适配器环境项；保留其他服务可能需要的host-gateway别名。预发布配置不再生成废弃项，依赖巡检不再探测三个废弃端口或输出其环境元数据。
- 当前Agent说明更新；迁移README顶部标明旧恢复建议已废弃，历史验收事实保留。未来部署者可另行移除服务器遗留env，本任务不改任何线上配置。

## 验收与回滚
- 使用独立本机PostgreSQL容器、随机schema和原生签名测试账号；网络fetch全面阻断，外部调用0。
- 基线53工具/9废弃项；修改后44工具/0废弃项。验证工作台与画布同集合、动态目录、核心工具保留、新库种子、旧3条记录保留但不返回、已登录GET/POST和有效自定义项目。源码残留扫描排除执行配置引用。
- 集中TypeScript检查exit0，Windows本地正式Next构建exit0；创作回归26入口/25可执行、40次fixture适配器请求通过，取消/空结果/写请求不重试保持，付费上游调用0。不是线上或Linux镜像验收。
- 原生业务API检查：GET公开/已登录全量200且废弃项不返回；三个废弃slug（大小写/空白归一化）POST410；正常自定义项目POST200。新库不播种，旧3行精确保留，fetch请求0。
- 7个原文件SHA256恢复通过，独立副本恢复53项工具/9废弃项、旧注册表返回与POST200，任务分支保留44项新工具集；测试schema随验证结束清理。
- 源码回滚仅在隔离副本恢复旧文件SHA256并运行基线测试，开发分支保留删除后的版本。整合Agent若回滚发布，应审查git revert后构建固定镜像；历史数据无需回灌。

## 文件和交接
`src/lib/agent/naumi-tools.ts`、`src/lib/db.ts`、`src/lib/retired-business-projects.ts`、`src/app/api/hub/projects/route.ts`、`docker-compose.yml`、两个staging脚本、Agent说明与迁移README、`scripts/verify-retired-business-tools.ts`。

本地证据：`E:/Workspace/naumi/output/retired-business-tools-20261012/`。测试命令需设置本机隔离DATABASE_URL、NAUMI_VERIFY_ISOLATED_DB=1、NODE_OPTIONS=--conditions=react-server；不使用业务数据库。仅三个slug的墓碑名单保留，不提供任何废弃功能实现。

## 交付前主线刷新
交付前fetch发现origin/main已从1506166推进到994c943（即梦接入及模型名称加载修复），本任务先选择性提交再普通合并最新main；整合后集中复验废弃工具/注册表和类型构建。不覆盖他人改动、不强推main，最终证据记录整合后的分支SHA。
