# 画布Agent渐进输出、换色指令与失败详情修复

## 目标与诊断

用户截图中的“瓶子换成蓝色”被INTENT_REQUIRED拦截，后续“确认执行”无有效待报价仍被拦；服务端PublicOutputBuffer至少保留512字且要求换行，短回复和无换行长回复等到结束才发送，页面长时间显示“正在处理请求”。线上诊断证据见忽略目录 output/canvas-agent-diagnosis-20261017/REPORT.md，实际线上7bdcd8b，不把本地新main当作已部署版本。

本轮独立 E:/Workspace/naumi-canvas-agent-stream-intent-20261017，分支codex/canvas-agent-stream-intent-20261017，基线origin/main=6dd5d51b。共享checkout的admin-ui-modernization与canvas-action-menu未提交内容原样保留；不操作47候选/容器/锁/发布，不恢复收费调用，不改永久底部图像创作去重。

## 实现

- 输出边界改为仅保留可能组成秘密/内部规则/密钥块/Markdown图片的后缀；普通文本无512字/换行门槛，跨chunk完整匹配仍脱敏，不降低原输出上限；UTF16代理对不拆断。SSE增加X-Accel-Buffering:no。
- 明确自然语言“换成/换为…颜色”进入创作意图；否定、分析、如何等表达继续禁止自动写操作。HEX颜色也支持。单独“确认执行”不泛化授权，仍只允许服务器保存的具体报价/参数，其他工具/颜色不能混入。
- 实时和历史统一reduceAgentProgress，保留attention结构化原因，不被tool_end泛化失败覆盖；等待报价与调用未执行明确区分。前端未收到正文时显示“等待模型响应”，不冒充真实推理阶段。
- 实际执行边界拒绝与功能未授权采用确定性公开提示；画布final及持久历史优先保留实际门禁原因，而不是模型先前“正在执行/已完成”的口头承诺。没有更改计费、路由或确认金额规则。

## 集中验收与待办

原基线专项复现 BASELINE=PASS INTENT=INTENT_REQUIRED CHARS_BEFORE_END=0。
专项新测试覆盖自然语言/否定/跨工具、具体报价确认隔离、每个字节切点及逐字脱敏、实时/历史/报价状态；整模块原harness/runtime/billing/canvas回归、类型、页面验收、源码副本回滚、Git提交推送在本轮完成后补全。

本轮只开发本地，生产页面未变；正式蓝绿发布及真实用户账号验收单独安排。所有模型/工具验收使用隔离fixture，不产生真实供应商收费调用。

## 本轮实际验收结果

- 新专项356项通过：原始措辞可执行，否定/分析继续拒绝；具体报价确认仅允许同工具同参数；无换行短长回复在结束前多次输出；注册密钥、Bearer、sk-token、PEM、受保护内部行、Markdown图片的全部二段切点与1/2/3/7/29逐字分片脱敏通过；emoji/UTF16正确；live/history解释一致。
- 新真实handler+本机PostgreSQL+真实Pi流式链路：上游fixture先发送无换行短句后挂起，前端SSE已读到delta且上游尚未结束；X-Accel-Buffering=no。模型试图在“只分析/不要换色”时写操作被INTENT_REQUIRED拦截，final与持久历史使用确定性原因，删除此前“马上执行”的误导文本。
- 原措辞“瓶子换成蓝色”真实进入系统报价；同轮模型伪造confirm=true被阻止，不产生图像提交；用户下一轮真实“确认执行”后才对本机图像fixture POST1次，真实作品挂载、账本仅1笔扣费通过。同operation重放只返回原结果，图像POST与模型调用均不增加。真实供应商调用0。
- 既有harness单测104项、network15项、bridge、billing-agent价格/过期确认、managed-reference回归通过；全量TypeScript通过，定向ESLint0错误6条既有canvas-client依赖warning。
- 旧verify-agent-harness-all并非全绿：runtime旧fixture缺少Router配置，临时修fixture后仍依赖旧生图路径；旧canvas-execution同样期待/api/generate-image模拟，但新共享imagegen实际走/v1/images/edits而404。未改生产代码迁就旧测试，临时runtime测试改动已撤回，未将旧整套记通过。新增真实route集成覆盖本任务含新版imagegen、报价及扣费完整路径。
- 内置浏览器验收实际面板/统一reducer/本机SSE：先看到第一段文字及“正在回复”，未结束busy=true；未执行原因和4积分报价正确显示；390px窗口文档宽390、面板360、无溢出。浏览器fixture最初双React导致Invalid hook call，显式单Reactalias后重载正常；此为fixture修正，不修改产品依赖。截图已保存并打开。
- 本轮未执行完整生产Next构建/生产真实供应商质量验证，不重复原用户付费请求，不占47锁/候选/发布；线上仍需后续蓝绿发布验收。

验收材料：E:/Workspace/naumi/output/canvas-agent-stream-intent-20261017。基线原文件hash、改动包、补丁、源码副本回滚、VERIFICATION.txt按实际结果落盘。功能迭代计数1；收尾刷新main、选择性提交及推送按Git记录。
