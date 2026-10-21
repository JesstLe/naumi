# 画布右上角去背景：质量参数冲突修复

## 复现和根因
- 用户入口是选中图片后右上角“去背景”，并非对话或普通生图Dock。
- 当前main53a32a0d的CanvasClient.runCutout上传原图后追加quality=fine；工具箱CutoutClient也使用相同旧档位。
- fine/fast是旧分割器档位，而withModelRequest将quality按low/medium/high/xhigh/max/auto校验，导致HTTP400 MODEL_INCOMPATIBLE“质量参数无效，请选择已开放的质量档位”，请求尚未发供应商。
- 真实handler/隔离PG基线已复现；不是推测上游余额、并发或用户操作问题。

## 最小修复
- 画布去背景请求改用标准图片质量medium，body/header/报价一致；沿用读取原图、landEditResult占位落地、子节点、定位与撤销，不重做画布任务。
- 工具箱抠图同步修正请求字段及预览报价，避免另一个入口继续发fine。
- 新增纯函数cutoutImageQuality，仅将旧fine/fast映射到medium；模型请求事实和tool.cutout报价事实共用。正常low/high等值原样保留，未知值继续拒绝，其他生图端点不接受fine。
- 不改原Request/body/header，不改raw计费指纹。已settled操作仍由原幂等路径返回，不重放历史任务或修改冻结报价。
- medium是标准输入档，管理员质量映射继续权威生效；实际回归设置medium→high，确认供应商最终收到high，而非覆盖管理员配置。
- 不改供应商模型、透明能力声明、收费规则、Worker或线上配置，不新建抠图后端。

## 集中验收
- 实际OpenAI edit multipart+实际API handler+本机独立PG：旧fine/fast/body/header和新medium返回200，报价一致，管理员wire=high、透明/可见像素及48×64尺寸、原图parent/3:4比例、账号归属、一次账本及同operation回放无新增供应商POST。
- 原raw请求指纹与数据库冻结指纹逐项校验；无效档位仍400，普通generate-image的fine仍拒绝。
- 实际CanvasClient桌面1440/手机390点击右上角按钮，body/header/quote=medium、上传原图字节hash一致、子节点可见并刷新后保留，pageerror0。
- 首次UI fixture的/api/download缺少真实图片响应导致hash断言失败，已补齐隔离fixture，不以错误JSON代替原图；未改业务图片读取逻辑。
- 两次T3 snapshot均超时后沿用仓库独立无头Edge流程，不连接普通Chrome。
- 7模块集中回归（真实handler/PG、隐藏处理器执行、实际工具箱组件、质量映射、质量计费、图文视频冻结执行/密钥轮换/重放、完整tsc）全部通过。
- Linux正式Dockerfile及独立副本回退的结果以output/canvas-cutout-parameters-20261021/VERIFICATION.txt为准。

## 协作和发布边界
- 独立codex/canvas-cutout-parameters-20261021从origin/main53a32a0d开始；共享checkout18项未提交均保留。
- canvas-client仅runCutout的旧注释、质量参数；不碰Agent timeline/续写/SSE/restore。requests.ts仅explicitQuality归一化；billing/server.ts仅tool.cutout事实，未改分辨率回退或计费公式。
- 本轮一个模块，同步计数1/3。无SSH/持47三锁/候选/切流/Worker/供应商真实调用；本地提交与镜像不冒充生产验收。
