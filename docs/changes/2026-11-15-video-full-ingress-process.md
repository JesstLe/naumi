# 视频完整输入的固定生产包验收与Comfy诊断修复

## 模块与职责

基线main bac038e110e5f9b6ed35468818e98913191b0f9d。继续统一输入编译架构的A09/A10/A18，不以此前Route直调150项代替真实Web/应用Worker。

本轮新增 `--full-ingress-process`，要求同时选择原Agent和BYOC进程；参数错误在DB初始化前拒绝。新测试模块只使用HTTP、只读SQL及既有本地供应商观测，不导入Route、工具、compiler或submit作为替身。

## 已确认问题和实现

实际Next development与固定Linux production均复现：完整BYOC预览给出WORKFLOW_MODE_CONFLICT，但实际 `/api/comfyui/run` 将同一VideoContractError吞成502“工作流执行失败”。编译器已正确拒绝，供应商没有受理；问题属于Comfy应用入口的错误响应映射，不是模型能力或上游错误。

`executeComfyRun` 的既有catch现识别VideoContractError，返回原422/code/fields；尚无creation时带accepted=false。原ModelConfigError状态不变，已受理creation不谎报accepted=false；未知错误仍502并用原safeError净化，不泄露内部详情。未改变协议映射、能力/政策、权限、账务、幂等、UNKNOWN或恢复。

## 公共接口、依赖与状态归属

HTTP入口→原Comfy应用→原BYOC/可信Resolver/公共compiler→原任务/资产/账务。catch只转换原领域结果，无第二套执行判断。测试驱动→实际Next/原Agent harness及内部HTTP→独立应用Worker→原生媒体sandbox；脚本文字模型和视频供应商仅替换外部服务，产品包不覆盖。

## 验收范围与I/O区分

完整字段分别覆盖意图、镜头、元素、摄影、尺寸、providerOptions，逐项核对独立工作台预览/执行、已保存Canvas预览/提交、实际Agent工具的诊断一致性及零视频任务/预占/视频作品记录/账本/上传/生成。Agent对话原本就必须记录agent-turn审计；每次实际调用恰新增一条该审计，单独核对，不将它误认为视频生成副作用。Agent公共回执保留原有净化summary，本片核对其与compiler reason一致，不伪称公共回执携带code字段。实际Agent还保存参数时长2秒和9秒的两份完整2秒镜头草稿，保存不再被旧能力/时长拦；实际编译预览继续负责缺结构映射诊断。

预览严格核对零凭据写入/零供应商I/O；正式提交可能执行既有object_info检查并保存加密端点凭据，本片如实单列数量，不将它们说成零网络/零DB。无供应商任务不等于所有请求都零网络。

生产镜像使用干净git archive和原Dockerfile，保留lint/type/Worker构建。已先构建main bac038e1作为实际502复现包；修复包以最终BUILD_INPUT/IMAGE_INSPECT为准，不能用前包证明本次修复已运行。fixture在本机随机schema/network，不连接生产；根驱动/媒体launcher与非root Web/应用Worker保持原边界。

## 验证命令与分层状态

- `verify-comfy-video-contract-errors.ts` 从实际catch AST核对6项：领域422/fields/未受理、ModelConfig409、已有creation、未知错误净化与非领域伪造对象。它是纯映射单元，不是Route验收。
- `verify-video-compiler-process.ts --projected-worker-env --agent-process --byoc-process --full-ingress-process` 是实际源码Next/Worker入口。
- 同一生产driver另组合budget/remote-workflow/workflow/advanced-inputs/structured-workflow，运行不可变Linux包、实际PG、独立应用Worker和原生媒体sandbox。
- 固定包Worker source manifest逐一核对干净archive的tracked输入，Linux49项保持。最终命令、源/副本输出、数量和退出状态以 `E:/Workspace/naumi/output/video-full-ingress-process-20261115/VERIFICATION.txt` 为准；验收进行中的状态不写成已通过。

## 未完成项与下一步

本轮不修改生产配置、不调用付费上游、不部署；47 HOLD及103隔离线保持。实际启用Binding/env-only目录与迁移、更多协议高级输入、真实授权上游、完整浏览器/RSC/TLS与目标站蓝绿仍开放。完整目标ACTIVE，不能以新包或本片组合关闭RFC全部要求。

## 集中组合的原限流边界

首次把预算、Agent、远程工作流、普通Workflow、BYOC、高级输入和结构化Workflow全部串在同一用户夹具中，触发原30次/10分钟video-gen入口限流，返回429；该次未写成通过，完整日志和finally清理保留。最终分为两组随机schema/实际用户环境：完整输入＋预算/Agent/远程/普通Workflow，以及高级输入＋结构化Workflow。限额、身份和所有产品校验均未改，未自动重试已提交请求；两组分别验证自己的账务与UNKNOWN。

独立解包副本50项完整生产入口已通过：底座15、原Agent6、原BYOC8、新输入21；8条agent-turn审计与12次执行object_info/加密凭据准备单列，预览均零I/O；6笔video账本共92 fixture积分，BYOC3次生成/上传、零消费。副本原文件哈希恢复与原502行为、核心137复测通过；完整两组结果及固定包身份以VERIFICATION为准。此段不把副本50项泛化成生产目录或全部供应商验收。

## 最终固定生产包结果

- 产品快照be535f6eefb9b592bf89cf3af30badcb4c43dac4，版号1794704116，image `sha256:5d45aa0d4cc0baa9673da7d30c47ddc8b5f0cd2423a55b3b83593de42a5ab03d`；后续仅测试/文档修订，src与该包完全一致。完整Dockerfile构建exit0、保留既有lint警告，578个tracked Worker输入哈希相符，Linux49项通过。
- 最终组83项exit0：底座15＋预算10＋Agent6＋RunningHub/AutoDL10＋普通Workflow13＋完整输入21＋BYOC8；19笔video账本/313 fixture积分。完整组原生13子进程/schema/pool/relay均清理。
- 高级组67项exit0：底座15＋高级输入36＋结构化Workflow16；20笔video账本/330 fixture积分。真实首尾/多图/混合音视频/镜头元素、未来元素绑定、报价确认、重启、拒绝/UNKNOWN/取消和真实物理边界保持；原生9子进程/schema/pool/relay均清理。
- 独立副本50项生产入口、完整tsc、核心137与错误响应6项通过；最终七文件hashguard复制回滚恢复原502，核心137复测通过。源码和修改包保持修复版。两组含相同底座，不泛称150个独立需求已全部覆盖。
- 所有供应商/脚本文字模型均为本地HTTP peer，真实Next/独立应用Worker/native媒体/PG未替换；不等于真实付费供应商、浏览器/RSC/TLS或目标站验收。原始失败与精确输入/命令/逐字输出/exit/产物哈希保留。
