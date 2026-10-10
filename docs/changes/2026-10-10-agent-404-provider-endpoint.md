# 画布Agent上游404修复

## 2026-10-10 Agent 404 地址修复（当前已解除主通道阻塞）

仅向新机发布模型配置v107→v108：供应商“多模态chat”（mvp-592d52d8-cb9b-4fce-9c11-0de433e14532）选择openai-chat协议，却使用https://open.bigmodel.cn/api/anthropic/v1，目录200而chat/completions返回404。相同密钥的普通/api/paas/v4接口返回429余额不足；实测Coding Plan兼容地址https://open.bigmodel.cn/api/coding/paas/v4返回200并成功调用工具，已通过原生配置发布流程改为该地址。

GPT-6 Astra仍为显示名，真实主模型glm-5.3-flash，备用hy4-preview与优先级、工具范围、其他模型、积分配置v8保持。完整配置比较证明只改一个provider.baseUrl，原管理员草稿内容恢复；11个可访问模型目录自动归档至元数据库并记录来源，不覆盖人工维护和采购价。

线上真实Agent单张换色、当前图参考上传、画布结果父节点/origin、数据库历史及结果卡片均通过；唯一canvas.image任务结算4积分，无重复生成。首个验收账号只有2积分，正确被拦截，未出图或扣图片积分；后改用已有充足余额账号成功，不充值、不改用户余额。备用hy4-preview此前超时，未将其记为已修复。

本轮只改运行配置，无网站源码/Schema/镜像切换；仍运行36255e03253703d2a524cf72cde67f0305956a2e，Image ID sha256:3b0a788fd1aa53a02b45519a0473c7f9caf17a0d93a2e098f6eb7e7adcc0bfff，网站版号1791624706 / v2026.10.10-173146。新机健康、版本、env/Compose指纹通过；旧机未连接。

完整数据库备份/可读目录/修复及真实验收证据：/opt/naumi-staging/evidence/agent-404-fix-20261010。配置发布和真实验收均持deploy.lock，现已释放。ROLLBACK.txt及fix-provider.mjs --rollback通过原生版本发布仅回退该provider URL，保留其余管理员后续设置；不回灌数据库/媒体。临时帮助脚本与内存登录令牌已清理，无新本机登录JSON。空间维护计数：自36255起累计成功发布1次（本次配置发布计一次，文档提交不计），尚未到3次清理门槛。

官方接口格式参考：https://docs.bigmodel.cn/cn/guide/develop/openai/introduction。具体账号可用地址与工具能力以此次同密钥实际调用证据为准，不能仅以/models成功认定对话可用。
