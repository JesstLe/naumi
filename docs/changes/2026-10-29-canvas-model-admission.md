# 截图 C03/C07：OCR 选模与纯文本自适应画幅验收

## 任务与输入

- 本记录负责父任务两处产品修正的独立全模块回归，不修改父任务产品源码。
- 基线 `3b6a5279b4364590954751e8f5b5c9d566010806`。原文件由父保存到 `output/canvas-reported-issues-20261029/before/`。
- 使用父任务只读获取的 47 模型配置 v152：`live/MODEL_CONFIG_SANITIZED.json`。供应地址替换为 `https://fixture.invalid`、credentialRef 为假 UUID，实际 bindings、模型能力、参数映射、可见性及通道开关保持。测试没有连接生产 DB 或供应商。
- 测试脚本：`scripts/verify-canvas-model-admission.cjs`，支持 `--source-root`、`--output-root`、`--config`、`--baseline`。

## C03：下拉已选模型仍提示“没有可用模型绑定”

1. 线上配置没有 `vision.ocr` 旧默认 binding，也没有 `business.canvas.ocr`；可见的 `gpt6Astra` 有启用的视觉输入通道。
2. 原 `withModelRequest` 的视觉分支只按旧 binding/business 决定是否调用 executor，因此即使用户明确选中该模型，也在 executor 前抛出 `MODEL_UNAVAILABLE`。
3. 父修正使主用途为 vision 时接受明确选模或 featureDefaultModel；真实 executor 继续验证配置、可见性、视觉能力和工具范围。

验证：
- 原始两分支（explicit、feature default）稳定复现缺 binding 失败；旧 `vision.ocr` binding 正控能够执行。
- 修改后 explicit 和 feature default 经完整 `createModelExecutor.resolve → describe → runBundle` 成功，实际 ALS vision scope 为 `gpt6Astra / vision.ocr`。
- 没有选择且无默认仍报 `MODEL_UNAVAILABLE`。
- 配置副本中的独立 disabled public model 精确报 `MODEL_UNAVAILABLE`；独立无 vision 上游精确报 `MODEL_INCOMPATIBLE`；工具范围不含 OCR 精确报 `MODEL_OUTSIDE_TOOL_SCOPE`。这三项不是靠其他默认 binding 破坏后得到模糊配置错误。
- 禁用当前 provider 会令发布配置的供应通道关联无效，报 `INVALID_CONFIG`，仍未进入执行；不把它称作成功回退。

## C07：纯文本节点生图的 auto 没有可用通道

1. 原 `automaticFrameRatio` 在没有输入图时直接返回，保留 UI 值 `ratio=auto`。
2. Nano Banana Pro / Nano Banana 2 的实际 APIMart 参数映射是枚举比例，不包含 auto；真实 simulator/参数计划编译/adapter admission 排除了全部通道，抛 `IMAGEGEN_NO_CHANNEL`。
3. 父修正只在无输入且 operation=generate 时冻结 `1:1`。显式比例、实际像素、带参考图的编辑、cutout 和 postprocess 保持原语义。

验证：
- 真实脱敏配置下两个模型原始 `planImagegen` 均报 `IMAGEGEN_NO_CHANNEL`，在取得账务报价前失败；不是 mock simulate 返回空列表。
- 修改后 request、step、billingQuote 均冻结 `1:1`，真实 admitted upstream 集合非空。
- 原始用户 request 对象保持不变，plan fingerprint 仍使用原始 auto 请求的 fingerprint，供重试按原编号查回。
- 显式 `3:4` 的真实计划正控通过；768×1024 参考图编辑 auto 仍为 `3:4`。直接测试实际像素、edit/cutout/postprocess 无图时不套新默认。
- 真实 `issueImagegenQuote → frozenImagegenQuote`：在配置版本和计费版本推进、当前模型禁用后，仍读取旧冻结计划，不重新取得当前模型或价格。
- 真实 `submitImagegen → DurableImageJobs → image-job-repository`：SQL fixture 中已有 `SUBMISSION_UNKNOWN` 父回执、旧 plan 的 ratio=auto，提交相同原编号只返回原失败回执；旧计划字节不变、当前配置读取次数不增、供应商入口次数为 0。fixture 不授予新业务 lease；该项不扩大为全部 Worker 恢复时序验收。

## 最终命令与结果

证据目录：`E:/Workspace/naumi/output/canvas-reported-issues-20261029/model-admission`。

```text
node scripts/verify-canvas-model-admission.cjs --source-root E:/Workspace/naumi/output/canvas-reported-issues-20261029/before --baseline --output-root <evidence>/tests/baseline
CANVAS_MODEL_ADMISSION=REPRODUCED CHECKS=10 SUPPLIER_CALLS=0 NETWORK=0 EXIT=1

node scripts/verify-canvas-model-admission.cjs --output-root <evidence>/tests/modified
CANVAS_MODEL_ADMISSION=PASS CHECKS=16 SUPPLIER_CALLS=0 NETWORK=0 EXIT=0
```

- 最终修改态报告记录 **121 个完整产品模块**的实际路径和 SHA256。没有正则提取产品函数、替换 simulator、修改 ratio admission 或 mock executor。
- DB、config repositories、认证/成员、计费报价、输入图读取、媒体/供应商边界为 fixture；图标导出是无渲染 stub。供应商调用与网络次数均为 0。
- 实际加载产品哈希：requests `3c01728fd464ef373c40d1d8a2cc7bb5c851b2bbb465fb40095e287422102f6a`；frame-ratio `32f1e75429bb9b91748b7343953b41c1c3b3c6027f38c4dc553657b04728b869`。
- 初次 runner 加载调试分别修正了 TypeScript fileName（防止把 `.ts` 当 TSX）、目录模块解析、服务端导入图标组件问题；均为测试装载器改动，没有以它们作旧产品复现。
- 完整浏览器操作、生产供应商出图质量、main 合并与服务器发布由父任务另记。此测试脚本不会代替线上验收。
