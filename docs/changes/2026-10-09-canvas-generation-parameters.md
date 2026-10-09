# 画布生图参数与竞品对齐

## 范围与状态

- 独立分支 `codex/canvas-parameter-alignment`，起点 origin/main `77dbe79711a0c7502e0da634f3e0e9a7337d3d75`。
- 比例仅智能比例、1:1、2:3、3:2、3:4、4:3、9:16、16:9；分辨率1K/2K/4K；单次张数1–4；质量低/中/高，未开放的质量继续禁用。
- 移除5K、21:9、4:5、5:4与自定义像素输入。实际模型/管理员声明更窄的参数继续收窄；预设组合矩阵中未核验的组合禁用并在服务端拒绝，不冒充上游原生能力。
- CanvasClient提交边界在报价之前归一化，新提交与报价使用同一参数；两个生成入口、重做、批量、高清和改比例均经过该边界。
- 历史5K新提交降为4K，历史非标准比例使用智能比例，超4张收敛为4张；不改原作品尺寸、媒体、数据库历史字段、冻结任务或恢复执行链。
- 服务端五个画布生成/编辑入口在计费intent前验证原始JSON/FormData，非法参数返回400/CANVAS_PARAMETER_UNSUPPORTED，不创建账单或调用供应商。普通工具箱兼容保留；该合同仅用于新画布请求。
- 画布质量选项收敛为三档，保持全站质量偏好/其他页面五档兼容；body/header/quote质量一致。
- 浅/深色tokens、管理员统一配置和双Dock避让保持。未调整上游连接、参数映射、计费售价或模型后台配置。

## 验证

集中脚本 `scripts/verify-canvas-generation-parameters.ts`：288个白名单组合、90个JSON/FormData拒绝、5个真实route导出早退、旧参数归一化与冻结worker兼容。
既有模型家族、2625组Dock、六模块UI回归与TypeScript/lint集中验收；真实供应商消费0。
完整发布证据、失败尝试、哈希、回滚命令保存到 `E:/Workspace/naumi/output/canvas-parameters-20261009/VERIFICATION.txt`。

## 协作与发布

发布前发现新机已经运行其他Agent版本f5a6f69，不能直接以77dbe79覆盖。刷新并整合实际源码及lockfile，保留其新功能，再构建固定clean SHA。
只发布120.27.162.85，旧机不连接/不回传。共用 `/opt/naumi-staging/releases/deploy.lock`，基线/备份/构建/切换/验收全程持锁，保留配置、DB、媒体和公网网关。
视频/OSS继续延期，local存储不变。发布结果须追加实际SHA/image/version和浏览器截图，不将源码测试当线上验收。

## 接手提示词

```text
先读AGENTS.md、docs/AGENT_COLLABORATION.md及本文。画布合同集中在
src/lib/canvas/generation-parameters.ts；新请求在报价前归一化，接口原始参数
在billing intent前拒绝。勿改历史任务冻结参数、作品媒体或全站其他工具参数。
使用独立codex分支；fetch main并比较新机实际版本，不能覆盖其他Agent的新功能。
集中执行参数脚本、类型/样式检查与Dock/模型/UI回归，选择性提交推送。
发布持新机deploy.lock；留备份、源码副本回滚及真实浏览器验收证据，只发布新机。
```

## 发布与验收结果（2026-10-09）

- 先将其他Agent新机已运行的f5a6f69后台MVP/代理/网关修复完整整合为b5db7fa，经517f672合并，再推送main9d86b5109352d22ad3534bfb937374ab1c8b6188；没有用旧77dbe79镜像覆盖新机。
- 新机镜像ghcr.io/jesstle/naumi:9d86b5109352d22ad3534bfb937374ab1c8b6188，Image ID sha256:f9e6b468e1c0355214df969de75c5710640b471582c8027aa1a5657d936bd3f6，公网版本1791538241。
- prepare/build/deploy exit0；基线、288组合/90JSON-FormData拒绝/5实际route、2625Dock/UI/模型家族/代理/冻结能力回归通过。独立源码第二副本反向patch恢复16个原hash和基线行为；主服务和候选保持修改。
- 真实线上30次非法参数请求全部400，错误码CANVAS_PARAMETER_UNSUPPORTED；前后任务、账单、intent、积分流水计数不变，供应商调用0。七管理员功能策略及MVP页面通过；DB容器、Compose和公网代理未改/未重启，仅NAUMI_IMAGE替换。
- 已登录浏览器验收菜单为1K/2K/4K及八种标准比例，移除自定义；质量仅低/标准/高，输入8张自动收敛4张，增加按钮禁用；实际截图live-parameters-dark.png。验收后刷新恢复1张，保留原深色主题/默认视口。
- 共用deploy.lock从基线备份到浏览器验收全程持有，锁探针exit75；备份DB仅归档不回灌。旧机未连接/回传，视频/OSS仍延期，local媒体保留。
- 远端证据/四件套目录 `/opt/naumi-staging/evidence/canvas-parameters-20261009`；原私钥hash/ACL不变；受保护TEMP副本清理命令被工具阻断，本轮尚未删除，需接手清理。
- 回滚命令（须先核对当前仍为本候选；不会覆盖别的Agent更新）：`flock -n -E 75 /opt/naumi-staging/releases/deploy.lock bash /opt/naumi-staging/evidence/canvas-parameters-20261009/ROLLBACK.sh --apply`。本轮只演练--fixture，没有回滚主服务。
