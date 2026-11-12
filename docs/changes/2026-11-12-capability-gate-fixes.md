# 已确认能力误拦修复（不实施统一抽象方案）

## 模块与职责、基线

- 用户要求：先解决已确认问题，统一抽象方案另行考虑；追加明确要求“别造成新回归”。
- 基线 main：`aea143eaaa39e391e496e2d1fcc2d59fb768dc63`。
- 任务分支：`codex/capability-gate-fixes-20261112`，独立工作树 `E:/Workspace/naumi-capability-fixes-20261112`。
- 原共享 checkout `codex/admin-ui-modernization` 和既有未提交内容保持原样；隔离 model-mapping-103 分支不参与。
- 调研与局部复现：`E:/Workspace/naumi-task-evidence/capability-gates-audit-20261112/`；GLM 只读评审原文 `GLM_REVIEW.md`。

## 本轮边界

沿用当前模块和公共接口，修已确认的能力证据误拦、人工映射被旧列表否决、旧名称推断和错误关键词黑名单。不新增统一执行契约框架、不改价格、不自动启用新供应商/目录型号、不恢复已经停用的 BYOK 新建入口。

保留人工明确 false/0/omit、真实协议序列化约束、凭据/权限、计费和操作幂等、未知受理不重放、原任务版本/原报价。请求中的真实参考图仍应发送，不静默退成文生图。透明处理算法及其只读调查结论保持原样。

`imageParameterPlanVersion` 同时关联准入与历史交付缩放；本轮不修改 requests 默认版本、finish-stored-image 的缩放规则或历史已接受任务语义，回归中单独核验原图字节/尺寸。

## 实施与迁移状态

### 图片与配置模块

- `capabilities.verified`、来源及核对日期保留为记录，不再额外否决已发布的 edit/transparent 布尔声明和合法高级字段映射。
- 显式 per-capability unsupported 仍优先；unknown 不撤销既有开启，false、0、omit、非法字段和缺失实际映射仍有各自语义。
- 后台普通选项、批量应用、接入、预设与音频移除同类核验许可；保留停用、用途、协议、采购预算、价格完整性和真实参数约束。
- 业务质量/尺寸按展示值编译已配置映射，不拿供应商原生列表否决 high→medium / 4K→2K。目录、默认绑定、执行沿用现有 `upstreamSupportsFeature` 和能力解析函数，避免一处放行、另一处仍按原始布尔值否决；没有新增统一框架。
- 模拟器移除质量排名、文字准确度、保真和原生规格的隐式额外门禁；管理员显式 pool require 继续生效。参考图上限独立于 verified，明确 0 继续拒绝。
- 公共接口、快照结构、持久层、计费事务归属和供应商适配器协议保持；无迁移脚本、无价格/线上配置修改。

### 旧型号猜测与 Agent

- 旧图片协议路由依据显式配置或目录模态，编辑能力不再依据 gpt-image 前缀；供应商拒绝仍由实际协议返回。
- 新 BYOK 入口保持退役；只保留既有加密任务快照恢复，不复活新账户端点。
- 旧视觉聊天继续使用现有图片内容序列化器，AGENT_VISION=0/1 与托管显式 vision 保持优先。
- 删除进程级关键词黑名单，同时修正真实调用方 `src/app/api/agent/route.ts` 的 POST/SSE 错误改写分支。图片下载超时不会污染后续请求；不自动丢图、不改成文生图重试。
- 错误归类、原会话持久化、取消和计费逻辑保留。此前只搜索 lib/agent 会漏掉 app/api 调用方，本轮类型检查发现并补齐了调用链。

## 验证命令、结果及证据层级

证据目录：`E:/Workspace/naumi-task-evidence/capability-gate-fixes-20261112`。

- 初始基线 `aea143ea`：新版30项回归失败23项；修复副本30项全部通过，网络/生产写入/付费调用均0。旧29项日志保留，不覆盖原始失败。
- 保存的v121配置离线复演：31项通过；原基线失败24项。该项复用当时保存的真实声明，不是当前服务器再次读取或付费上游验收。
- 刷新并同步 `origin/main=685a323aea365c4881cdde1b6d19bf0678fb943e`，保留同事媒体恢复修复，未引入隔离103实验分支。
- `node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit --incremental false` exit0；本任务TS/TSX定向ESLint exit0；`npm run build` exit0。全局构建仍有既有Hook等警告，没有写成零警告。
- 安装了任务自有锁文件依赖；旧共享依赖缺少数学渲染包，未向共享依赖安装。早期命令的条件传递错误、4GiB类型检查堆耗尽均保留日志；最终采用正确tsx条件和8GiB堆完成。
- 19个现有模块脚本通过：图片能力、参数计划/合同/分辨率、批量、音频、Agent真实HTTP/SSE、配置PG、接入、质量映射、冻结计划PG、交付恢复、APIB工具操作、工具所选模型、全局托管品质、冻结报价PG、音频PG、19工作流合同、像素后处理。
- APIB工具回归使用 verified=false，真实PNG上传字节与下游image_urls均核对；原始Route→隔离PG→本地模拟上游→存储/回执/结算/重放链通过，重复操作不再次POST/扣费。不是付费供应商实测。
- `verify-capability-output-compatibility.cjs`：6组实际PNG前后编码字节、尺寸一致，alpha保留；finish-stored-image、cutout-provider、requests、download、postprocess共5个保护文件SHA一致。
- 修复旧报价测试装配的真实依赖缺口（请求来源、公开模型身份、账单身份）及APIMart夹具协议，未替换业务判断或放宽断言。7项真实报价函数检查、6项实际React/Edge报价控件检查通过；报价失败重试、真实0积分、张数/尺寸切换和390px均覆盖。
- 新同步主线媒体恢复浏览器脚本5项通过。

### 原有失败和无效调用单独保留

- `verify-image-quality-select.ts` 的旧源码正则已不符合当前按功能报价组件；初始基线和修改版同样失败。当前组件另用6项真实浏览器交互覆盖，未为旧断言修改产品UI。
- `verify-imagegen-frozen-quote-client.ts` 仍期待旧的涨价确认；初始基线同样失败 `only higher price confirms: 0 !== 1`。未修改已删除的确认逻辑，也未将该旧脚本计为通过；真实PG冻结报价脚本通过。
- 无参调用需要显式快照文件的 golden 工具、误写不存在的 verify-resolution-fallback.ts 均属无效调用，不计通过或产品回归。

## 回滚、整合与未完成项

- 原始BASELINE.zip的SHA256持续核对；同步主线另存基线，用哈希保护的脚本只恢复本任务路径，不退掉其他主线增量。
- 独立修改副本回滚实测和四项制品的最终路径、命令、字面输出、退出状态见 `VERIFICATION.txt`；修改后的源码制品保持修改状态。
- 本文随代码选择性提交；最终Git整合SHA和远端回执在证据文件记录。共享checkout及他人工作不切换、不重置。
- 本轮没有服务器发布、线上模型配置修改或付费重放；47 HOLD保留。代码合并不代表已上线，实际供应商质量与真实站点验收独立记录。
