# 视频编译架构：完整固定构建与发布创建器带任务验收

## 模块与职责

本片扩展已有本地发布验证器，不修改产品执行、报价、能力政策或供应商协议。实际创建/启动/控制仍使用 `clone_worker`、`start_worker`、原 handoff；Web 为镜像中的 Next standalone，Worker 为同镜像的应用/原生媒体进程。测试引导脚本只在随机隔离 schema 中配置模型、测试账号/积分和输入资产，任务受理与执行状态由实际 HTTP/Worker 推进。

## 固定整站构建

- 固定 main：`7ce2f72926af56714b5d7ab1b40eb76cf6ee8faf`。
- 构建版号：`1794692423`。
- 镜像：`sha256:ac0aadbee385cbad48fc71159e7a834b8f2f88aa73f4c7c59f1351baedfd800c`。
- 标签：`naumi:video-compiler-release-7ce2f729-20261115`。
- 使用 git archive 干净上下文与现有完整 Dockerfile；没有以上一轮proof overlay冒充主线整站构建。Next构建、类型、standalone、Worker、依赖闭包和native media runtime均完成，exit0；原lint警告保留。
- 实际镜像 Worker 577个tracked源码输入逐个匹配归档SHA；bundle `ebd923c898b6de94e8edf09e8d1623cbaa8a42f604b223b8365f954f78036352`；plan1–5描述/manifest/实际export一致。
- 同一镜像Linux Worker49项通过，exit0。真实standalone无DB包验收7项/50HTTP/46JS-CSS通过，不冒称浏览器水合或已登录UI验收。

## 新增带任务验收

`verify_release_direct_worker.py --tasks` 扩展现有空扫描底座，不替换产品实现。`video-release-task-fixture.ts` 使用原模型配置、计费、账号和媒体模块配置fixture；供应商peer为本地HTTP，未接外部收费供应商。

覆盖：

1. 原普通及combined创建、身份、共享媒体、UID/配置分离、pause/resume/drain与停启保护继续。
2. 毒化旧capabilities（verified=false、generate=false、text-only/图片0）但发布可编译recipe，真实预览/单图请求仍正常。
3. 预览planDigest等于受理v3计划；Worker暂停时供应商POST0；重复操作仍返回原任务。
4. 接受后发布新型号和17积分价格，原任务继续原型号、原7积分、requested4K→effective2K→wire2k恰好一次；供应商读取原PNG字节。
5. 原回执在Worker停启后恢复；实际native sandbox检查结果并保存；同任务没有再次创建、只记一笔7积分。
6. 原成片通过实际Canvas节点成为下一任务输入，客户端伪造路径不进入wire；后续任务使用新型号/17积分，父子资产关联保留。
7. 创建响应断开成为needs_attention/creation_unknown，显式重试409；重启后UNKNOWN原像保持、不重发、不记账。
8. 两份保存成片从实际鉴权媒体路由读回，SHA与供应商原MP4一致；最终3个任务/2笔video账本/24 fixture积分。

最终命令、检查项数量、真实进程/实例与回退结果以证据目录 `E:/Workspace/naumi/output/video-compiler-release-e2e-20261115` 的 `VERIFICATION.txt` 和 `task-final/RESULT.json` 为准。源码副本验证与完整产物包应核对相同哈希，不把缺少验证入口误写成产品原有故障。

## 接口、依赖、状态与事务归属

- `--tasks` 是fixture选项，不是新的运行环境或产品能力门禁。
- fixture初始化/改价使用原repo与billing publication；没有手写已完成任务或付费回执。
- 只有 `next_poll_at` 在fixture中提前用于调度，不跳过lease/接受状态。产品仍拥有冻结计划、计费、UNKNOWN、资产和事务。
- Docker socket仅进入本地验证driver，不进入Web/Worker。精确命令映射到本地Docker API，不连接站点。
- 原空扫描入口继续存在；测试资产/账号/凭据均为fixture数据，不写生产配置。

## 已保留的失败与边界

初始夹具忘记设置Node依赖路径、缺少完整能力结构字段、供应商peer未处理chunked body，均保留原失败日志；chunked夹具错误触发产品正确保留UNKNOWN，不据此认定产品不支持参考图。第一次清理遗漏driver网络端点，已核对空端点后清理精确测试网络并修正finally断开顺序。没有通过关闭鉴权、素材检查或UNKNOWN保护让测试通过。

当前是实际固定生产包/本地数据库/本地供应商，不是外部上游成功率或目标站发布证明。新旧Nginx/旧静态资源/真正整站回滚、所有启用绑定和环境路线、有授权的真实供应商继续。总目标ACTIVE，47 HOLD；生产写入/部署/付费0。
