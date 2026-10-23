# SaaS 与已核验视频家族整合验收

基线为SaaS源码`467ad6ce`、视频家族`ea7e4ab9`、预算修正`5d568c7b`，根任务完成合并及发布门禁收口后为`e58d8b4e`。本次只改必要应用修复、隔离测试和验收文档；未改发布ops、Dockerfile、公开更新记录或design-qa，未连接生产。

## 应用修复

新供应商素材路由默认先调用`fetchStoredObject`。当驱动是local时，这实际是普通本地文件读取，只检查返回长度会跳过后续`readVerifiedVideoReferenceLocal`的冻结SHA复核。同长度原文件变化而媒体元数据未更新时，旧授权不能继续返回新字节。

现在默认local驱动直接使用已有的单文件描述符/SHA/大小/时间戳校验读取；显式注入的fixture远端读取，以及S3/R2权威对象读取与校验本地镜像回退保持原路径。真实路由回归：原始PNG完整读取hash相同、Range206；同长度字节改变503，owner变化404。没有新增匿名选key或用户提供URL的代理能力。

## 新增真实应用/PG集中测试

`scripts/verify-saas-video-profile-integration.ts`使用全新隔离PG、真实模型配置仓储/发布、真实应用服务、真实匿名素材路由及真实本地文件。六个新profile各一个代表型号走`createVideoGeneration → createValidatedVideo → reserve → submit → pollAndSettle → result-assets → completeVideoTask`，不是直接插入成功状态。

- 六种profile代表均有真实接受记录、creation父子和付款账户；配置、报价版本、原请求、storageKey和SHA持久冻结。签名URL只在提交副本生成，不写入稳定请求。
- 接受后发布新配置：供应商地址、凭据引用和显示名一起改变；随后暂停原企业，并在外层其他企业context下恢复。轮询仍使用原地址和原凭据，六个结果归原tenant/actor/payer，没有重取当前配置或身份。
- APIB与Geek各一个“接受后断线”合成HTTP案例进入needs_attention；后续poll没有新增收费POST。八个子记录中六个成功、两个待核查。
- 同actor引用其他tenant原始artwork被拒绝，fake供应商POST计数不增加。原始PNG经真实Sharp完整解码，decoder_version=1与真实SHA一致，未重编码原输入。
- 供应商短时素材授权与管理查看授权分开：已接受任务的素材能力在后续企业暂停后仍可用于供应商Range读取；改字节/owner后拒绝。后台查看仍使用SaaS逐次membership校验，不复用该外部能力。

**证据限制：** 供应商是本机loopback HTTP fixture；视频结果是明确标记的合成字节，隔离媒体probe服务也是fixture HTTP，不是可播放影片、不证明真实FFmpeg解码或Linux sandbox。本机原始图片解码是真实native Sharp。真实供应商调用0，不重放生产或源线程未知收费任务。

## 分组结果

证据目录：`output/saas-admin-20261022/verification/`，TypeScript脚本对应同名`.log`。

| 分组 | 已通过 | 证据含义 |
| --- | --- | --- |
| 新协议与预设 | verify-verified-video-profiles（33 SKU/802断言）、verify-video-family-preset（32启用/1禁用/822断言） | synthetic配置与wire合同，未调用供应商 |
| 私有素材与解码 | verify-video-reference-media（201断言）、verify-static-image-probe（4格式/46断言） | 合成token/存储及真实本地文件；真实native静态图片解码 |
| combined Worker | verify-video-worker-with-media.mjs | 进程/IPC/fetch/server注入的生命周期fixture，real_processes=0、sandbox_acceptance=false；文本日志文件名保留`.mjs`，不是可执行源码 |
| 新SaaS交点 | verify-saas-video-profile-integration | 上述六profile真实应用/PG接受恢复，supplier/media HTTP为fixture |
| 受影响模块回归 | verify-saas-video-workflow-evidence、verify-saas-creations、verify-saas-worker-restart、verify-billing-async-tasks、verify-provider-balance、verify-provider-activity | workflow/node/batch、私有详情与账务、三独立Node进程恢复、余额账户/统计安全契约 |
| 类型 | npx tsc --noEmit --pretty false | types-video-merge.log为空、退出0 |

本次集中共12组通过，不因纯脚本通过声称真实Linux Worker已启动或生产已验收。

## 剩余门槛

根任务统一执行固定Linux镜像构建及真实combined Worker/native sandbox验证，包括PID1/uid隔离、IPC启动闸、同版HTTP扫描、双队列排空、UNKNOWN与重启，按实际最终RAM门槛执行。正式47旁路、配置版本、媒体入口闭包、三锁切流、旧槽排空/停止与受控维护恢复均待根任务现场证据。

保留源线程已授权视频家族配置和后来产生的任务，不回退旧配置134。此文不是发布回执，也不声明兼容业务程序回滚通过。
