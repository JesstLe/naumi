# 质量档位回退：移除"不会静默退档"硬拒（2026-10-24）

## 事故

用户画布编辑（GPT-Image-2.5 + 参考图 + 2:3 + "标准"档）全部被 400 拒绝："所选模型不支持该质量，不会静默退档"。复现确认：前端提交了显示标签 "standard"（合法档位是 medium/high/...），服务端模型能力声明只认五档+auto，参数准入护栏硬拒，用户完全无法出图。

## 变更（src/lib/model-config/requests.ts）

- 删除两处 MODEL_INCOMPATIBLE 硬拒（未知质量值、模型不支持的质量档）。
- 赋值处统一回退：malformed 值与模型不支持的合法档位都按模型默认档（环境 OPENAI_IMAGE_QUALITY，缺省 medium）执行；原请求值仅入审计与 console.warn（fallback 原因：malformed-quality-value / channel-unsupported）。
- auto/空值行为不变；显式合法档直通不变；preset 路径与计费选择消费回退后的档位，报价与结算一致。

## 验收

- scripts/verify-quality-fallback-contract.ts：5 用例全 PASS（standard 标签回退 medium、即梦缺 low 档回退、合法档直通、空值默认、中文标签回退）。
- 首轮契约测试抓到实现 bug（不支持的合法档未回退），已修复并同步镜像。
- tsc 错误数与基线一致（32888，worktree 未装依赖的既有噪声，零新增）。

## 边界

- 未动 auto 语义、未动比例/尺寸校验、未动计费表。
- 前端把显示标签当值发送的问题（standard≠medium）另开前端任务修正；本回退保证在其修复前用户不受阻。
- 遵循 2026-10-23 定调：参数护栏只审计不阻断；付费创作显式请求不得被静默拒绝。
