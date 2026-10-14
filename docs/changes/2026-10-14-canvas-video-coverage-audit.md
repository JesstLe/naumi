# 完整能力矩阵核对与协议应用链补证

最新矩阵23/34逐条件审核完成，注册32份证据。本批补齐V19/V20/V21/V23/V24，实际派生素材/原生下游、真实播放器和Range、工作台完整边界见[派生媒体记录](2026-10-14-canvas-video-derived-media.md)。完整交付门槛仍未闭合，68%表示能力条件复核比例。

最新矩阵18/34逐条件审核完成，注册29份证据。本批新增V06—V11，具体原生请求、真实界面和保留失败批次的汇总边界见[高级设置记录](2026-10-14-canvas-video-advanced-settings.md)。完整交付门槛仍未闭合，53%表示能力条件复核比例。

## 本模块最终结果：51组合、41原生profile

真实App/PG/Router/Worker/私有媒体链已覆盖全部51组合。verify-video-fusion-application-summary.mjs核对批准案例的完整ID/模式/profile集合、每项实际wire/完成/哈希/两账号权限/幂等结算证据、供应商创建记录与原始结果文件SHA，汇总到checkpoint-d/application-protocols-summary.json。运行命令：

```text
node scripts/verify-video-fusion-application-summary.mjs --runs=application-protocols-ec869c04-5fec-4273-b193-ed48b855d55d,application-protocols-8ae528df-9b63-433f-8422-c1fe5beabf2a,application-protocols-0ba27e12-d5e4-499c-9762-2ee440b9efcd
```

首批48929保存7项后因测试漏fixture的/api/v3前缀在Ark断言失败；修正独立预期端点。续批50443保存39项后揭示Vidu文字口型输入被校验拒绝。补批57465证明口型两分支通过，又揭示Wan首尾图片带音频被全局图片模式校验拒绝；该失败结果7c5dd8e3保留。最终11561 exit0覆盖Vidu口型、Wan、Compshare Seedance三个受影响/未覆盖profile全部6组合，并完成每profile App重启检查。去重汇总51项，不删除失败记录，也不把任何单一subset的ok:false当全量通过。此前不受影响的完成证据保留；这仍不是最终固定发布源码全量验收。

新增两项生产修复：口型校验在providerOptions完成类型、默认值和send策略解析后，使用实际会发送的朗读text；管理员不发送、未知参数、纯空白和缺视觉来源仍拒绝。Wan首尾模式可以带源音频，因此新增可选supportsFrameAudio，只有明确true且音频数量/大小/时长限制允许时接受；未声明/null/false保持拒绝，视频参考仍不准混入首尾模式。管理员编辑器可维护“首尾帧音频参考”，沿用人工优先、来源修订和已发布冻结，不按模型名自动开能力，不修改正式供应商配置。

契约检查验证朗读text/default/omit/unknown/empty/source、首尾音频未知拒绝/明确允许/人工false覆盖供应商true/数量0拒绝及单图角色。配置集中检查exit0证明人工优先、已发布默认冻结及旧配置digest保持；最终TypeScript34328 exit0，diff检查通过。supportsFrameAudio测试声明只进入隔离fixture，原生Wan实际请求同时具有first_frame_url/last_frame_url/audio_url，口型实际input.text为“你好”。

完整34项矩阵仍逐项审核中，协议应用汇总新增到evidenceRegistry；正式视频API消费0，真实生成效果未测。完整上游对照、整分支复核、固定Linux候选/兼容回滚和103发布仍待完成。本模块无服务器连接、部署锁、上线或维护计数增加。

本轮按已批准设计保留V01—V24、P01—P08、S01/S02共34项，新增scripts/video-fusion/coverage.json。每项列实现、实际已有证据、证据类型和剩余条件；已有阶段PASS保留，但完整条件未审完时均为evidence-review-pending，不用一个窄用例或JSON布尔值替代整项结论。脚本verify-video-fusion-e2e.mjs的--inventory仅核对34项、批准设计、路径和证据注册；默认命令只有所有条件逐项完成且带具体断言才通过。--delivery-audit另检查交付门槛。当前不是最终验收通过。

发现具体缺口：原ic-protocols/new-protocols覆盖24+27个协议HTTP组合，部分App真实链只覆盖Ark/KIE/工作流/结果等子集，不能据此宣称P01—P08全应用完成。新增application-protocol-cases.json固定51组合/41原生profile，应用脚本经实际App/PG/Router/Worker执行公开模型选定、授权引用、原生请求、持久task及冻结、完整产物探测/哈希、两账号私有媒体、重复提交/结算和App重启。

每个profile独立有owner guard的loopback schema/供应商，单个App顺序执行，保留生产和其他任务。fixture可显式声明测试模型定义并验证schema，用于表达原案例的5/6秒、768P、seed0/机位false/口型文本等真实契约；不是给正式模型猜能力或修改管理员配置。AutoDL/RunningHub/ComfyUI仍按独立实际应用工作流证据审查，不混作通用视频提交。

执行中的首次结果：OpenAI、Grok2API两组合、CogVideoX及Agnes共5组合经过完整App/Worker/私有媒体通过。测试初次误把冻结wire modelId当公开ID已修正，分别检查wire-video与publicModelId video-a。Agnes2.5首尾组合创建阶段失败并退费；供应商create记录为0，首次错误为“图片来源不受支持”，不是供应商已接受后失败。

真实根因：materializeVideoReferences已授权并为URL协议生成合法签名对象地址，imageForQueuedTask随后按openai-videos基础protocol再调用仅支持本站来源的旧图片读取器。Agnes2.5属于该基础protocol，合法签名地址因此被拒绝，直接wire测试无法触及这一层。现仅在没有videoProfile的旧适配器保留旧读取；明确profile的codec继续使用既有授权/哈希/签名或inline材料，不放宽来源检查、不把签名地址交给图片生成读取器。定向39564 exit0两组合（首尾、混合三媒体）完整App/Worker/产物/私有权限/幂等结算/重启PASS，证据application-protocols-1c38068f；旧失败和退费记录保留。后续批次及最终51项汇总见本记录顶部。

158ff77 CI Image gateway38515349055终态失败在Configurable billing and transactional regressions，完整Docker38515349062后续success；不能将本机阶段通过或Docker构建作为该版本整条CI通过。完整上游对照、34项条件、分支复核、Linux候选/回滚及103发布仍待完成，本轮无服务器发布/锁。
