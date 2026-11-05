# P1-a 图片参数"约定优先"模式（2026-11-05）

依据：[设计方案](../design/image-parameter-conventional-contract-20261105.md)、[管理后台评估](../design/admin-architecture-review-20261105.md)。基线 main `1a6c0ce5`。

## 本次实现

- **开关**：在 `upstreamModels[].parameterMap.parameterContract` 上设置，取值为 `"conventional"`。语义只在 `src/lib/model-config/parameter-contract.ts` 一处定义，其他代码都通过 `conventionalContract(map)` 判断。不设置时行为与原来逐字一致。
- **开关打开后**（只影响该通道）：
  - **质量**：映射格留空，或请求的档位不在列表里时，原样发送前端档位；填了的格子按映射发送；选"不发送"仍然不发送。`policyQuality` 新增可选参数 contract，7 个调用点都已传入。
  - **分辨率**：映射格留空时，不改动协议原有的尺寸和比例字段，例如 OpenAI 协议按比例计算的 size；填了的格子按映射发送（如 4K→2k）。`mapResolution` 新增可选参数 contract。
  - **高级参数**：没有映射的直接丢弃，不报错。
  - **不再拦截**：通道选择里基于供应商资料的拦截全部跳过，包括 QUALITY_RANK、QUALITY_UNSUPPORTED、IDENTITY/TEXT_UNSUPPORTED、NATIVE_RESOLUTION、PIXEL_LIMIT、RESOLUTION_MAPPING_MISSING；分辨率档位判断视三档都可发送；APIMart 无计划路径也不再按能力列表拦截。
  - **仍然保留**：编辑、蒙版、参考图上限、APIMart 比例契约、字段冲突、非法字段、透明意图路由，以及全部计费、幂等、冻结规则。
- **发布校验**：
  - "映射模式下每档都要填值"这条检查，从质量策略的 schema 移到发布校验中，只对没开开关的通道生效，结果和以前一样。
  - 开关只允许用在直连图片通道上（openai-images、new-api-flow、APIMart 应用通道）；模型池候选、Reverse Hub 专用适配器、成本预设和非图片模态都会被拒绝。
- **后台**：统一参数映射弹窗为每个通道加了复选框"按协议默认发送，只填需要改的格子"。
  - 打开后允许留空，留空的格子会提示"留空发送 high""留空保持协议原值"。
  - 请求预览用同一个编译器生成。
  - 保存时：`contract` 为 `null` 表示关闭开关；不带该字段表示保持已发布的值。

## 兼容与发布顺序（必须遵守）

- `parameterMap` 是严格 schema，**旧镜像读到 `parameterContract` 会解析失败**。顺序如下：
  1. 先用蓝绿发布把本版本上到所有槽位，期间不开任何开关；
  2. 旧槽排空并停止后，才允许在后台开启；
  3. 开启后如需回滚到旧镜像，**必须先关闭所有开关并发布配置**。
- 已受理的任务使用冻结的参数计划，开关的变化不影响它们。

## 验证（零外网、零供应商调用）

- **零差异门禁**：`verify:image-parameter-golden`，用 103 在线模型配置 v117 和计费配置 v8 做比较。配置通过只读接口 `versions?version=117` 和 `GET /api/admin/billing` 导出，只存放在本机暂存目录，不进仓库。
  - 覆盖 16 个启用的图片模型 × 5 个质量档 × 3 个分辨率 × 9 个比例 × 生成/编辑，共 **7495 个判定点**：通道选择、分辨率选择、逐通道参数计划、档位判断、质量映射。
  - 改动前后 **0 差异，输出逐字节一致**。
- **同一份配置启用 Geeknow 后的对比**：
  - 不开开关：Geeknow 被排除 2160 次、参数计划报错 540 个；
  - 开开关：排除 0 次、报错 0 个；
  - 其他通道的判定完全不变；唯一的连带变化是 gpt-image-2 在 auto 比例下"可选分辨率"列表变宽，实际生效的档位不变。
- `verify:image-parameter-contract`：33 项通过，覆盖质量/分辨率/编译器语义、严格默认不变、结构性约束保留、发布规则、映射编辑器的设置/保留/清除。
- `verify:image-parameter-contract-ui`：用真实 ModelEditor 组件，在 1440 和 390 两种宽度下验证：严格模式下空表不能保存；开开关后可以保存；4K→2k 覆盖的预览和提交内容正确；关掉开关后恢复严格模式；无横向溢出、无页面报错、无网络请求。
- 回归通过：
  - image-parameter-plan（25 项）、image-parameter-plan-ui、image-parameter-plan-pg（16 项）；
  - model-config、model-publication、model-execution、model-admin、model-flow、model-management、model-batch；
  - image-model-family-routing、global-image-quality、apimart-async-contract、apimart-default-preset；
  - imagegen-contract、imagegen-capabilities、imagegen-execution；
  - business-routing、billing-image-jobs、image-gateway、credit-billing。
- `tsc --noEmit` 和改动文件的 eslint 均通过。
- 既有失败，与本次无关：
  - `verify-provider-catalog`：并发刷新去重断言 2≠1，main 基线上同样失败，两边各跑 2 次结果一致；
  - `verify-model-router-contract`：需要另外检出 Router 仓库。
- 证据层级：真实线上配置上的纯函数级门禁，加真实组件的浏览器验证。**未构建镜像，未发布，没有真实付费出图。**

## 交接

```text
模块与职责：model-config 图片参数契约（parameter-contract 定义语义；编译器、通道选择、分辨率回退、发布校验、映射编辑器读取它）。
公共接口、依赖方向、数据/状态/事务归属：conventionalContract(map)；policyQuality / mapResolution 新增可选 contract 参数；开关存于已发布配置并随任务冻结；无数据库迁移。
本次实现与迁移状态：第一轮完成。3.4 的资料下拉候选与不匹配标黄、一键建议，以及 3.5 上游拒收标红，进入 P1-b。
验证命令、结果及证据层级：见上；未发布。
未完成项与下一步：发布按"先代码、后开关"的顺序进行；103 上为 Geeknow 单独建测试模型并逐档真实验收；P1-b 映射矩阵 UI。
```
