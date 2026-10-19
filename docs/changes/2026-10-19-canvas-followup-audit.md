# 画布第二轮边界排查（仅审计，不上线）

> 后续状态：用户要求修复三项确认缺陷，本地实现与验收见 [三项修复记录](2026-10-19-canvas-followup-fixes.md)。本页保留审计时点结论；配置待核实项未擅自修改。

## 范围

用户要求“继续找”，承接上轮“不上线”约束。基线为已本地修复、已推独立分支的 `d6e7e2303a14c1a0431b683014a00e23bbd7a30e`；本轮只新增审计脚本与文档，不修改业务源码，不合 main、不 SSH、不调用供应商。

开工 fetch origin/main，无新提交待整合。工作区仍为 `E:/Workspace/naumi-canvas-postrelease-audit47-20261019`；共享 checkout 不动。上轮四项修复仍保留，本轮不是生产用户日志核验，也不表示这些新发现已上线触发。

## 判定标准（用户纠正后）

用户指出后台可能有意将所有显示档位映射到 1K 或其他参数。撤回此前仅凭差异判定 4 类 bug 的统计，区分运行事实、明确设计和待核实项。

设计依据：`docs/admin-model-management.md`“分辨率显示与执行映射”与“自动识别接口规格”明确允许高显示档位映射较低上游规格，支持不发送参数，管理员显式设置优先，执行使用冻结配置。`src/lib/model-config/clients.ts` 调用真实 mapResolution/policyQuality 执行这些规则。

本轮未读取 47 当前生效配置、发布版本或具体用户任务的冻结映射；不把通用代码能力当作当前线上设置。

## 复核清单

### A. 撤销记录跨项目串用（确认缺陷，高优先级）

- 真实 `pushUndo`/`pushAddUndo` 将 A 的新增记录放入组件级 undoStack。
- 真实 `openProject` 切换到 B，没有清理或按项目切换历史栈。
- 在 B 执行真实 `doUndo`/`applyHistory`，发往 `/api/canvas/history` 的操作仍为 `{type:"visibility",id:"result-A",visible:false}`。
- fixture 返回成功后，真实本地状态逻辑从 works 中移除 A 的图片。
- 同项目撤销作为正常对照通过。

验证到客户端确实发出了跨项目隐藏请求，并应用了成功响应；没有连接真实数据库或删除用户作品。后端 history API 以账户认证并接受操作 ID，当前请求没有项目边界字段。用户随后明确选择“只撤销当前项目的操作”，因此跨项目撤销违背明确预期，正式计入确认缺陷；后续修复按项目隔离历史栈，不采用全局撤销。

### B. 扩图/标注编辑的失败占位仍消失（确认缺陷，高优先级）

两入口共用 `landEditResult`。真实函数在 HTTP 502、传输错误、位置保存失败、结果集合为空四种情况下，均创建 1 个占位后在 finally 删除至 0，并释放操作锁；只剩提示，不保留失败卡或原操作检查入口。成功分支正常产生撤销记录作为对照。

判定依据：用户此前要求解决生成占位消失，`docs/changes/2026-10-19-canvas-generation-feedback47.md` 明确失败卡原位置保留、受理未知保留检查入口。这条路径独立于上轮修复的普通生图和详情生成；不能将“普通生成失败卡已修”推广为所有图像编辑入口已修。这里只证明前端状态清理行为，不推断供应商是否收费或服务端图片丢失。

### C. 详情模式显示 4K 与请求 1K 的差异（配置链路待核实，不计 bug）

组合执行真实 `generateDetailSequence` → `privateFetch`，捕获 billing.quoteAndSubmit 的输入：

```text
selectedResolution=4K
wireResolution=null
quotedResolution=1K
format=3:4
qualityHeader=high
```

观察到详情请求未带 resolution，前端报价回落到 1K；A+ 后端报价与作品 resolution 字段也固定 1K。Dock 中分辨率控件仍显示可选。

这些仅是局部代码事实，未结合当前管理员发布配置、requestedResolution 冻结事实和实际执行映射，故不判定违背设计。若后台规定显示 4K 对应上游 1K，应按配置执行；若后台要求直传 4K 却丢失选择，才构成执行偏差。原始选择、上游规格、最终交付像素与计费档位分别核对，不将其中一个值代替其他三者。

没有将质量参数也列为确认缺陷：authHeader 能携带当前 quality，本轮保留 high 作为对照。另观察到前端报价 ratio 未从 format 映射，后端则有 ratioFor；未结合真实资费配置，不宣称已确认多扣或少扣。

### D. 待生成节点的详情任务正常完成时丢失拖动坐标（确认缺陷，中优先级）

- 从 pending 节点 `(500,200)` 发起详情任务。
- 调用真实 `rememberGenerationDrag`，将 pending 节点拖至 `(777,888)`，更新 pending ref 和模拟 RF 实时位置。
- 正常完成仍读取 `generationTaskPosRef[taskId]`，最终位置请求为 `(500,200)`，不是 `(777,888)`。
- 对照直接拖动图片节点生成出的 task 占位，最终正确保存 `(777,888)`。

判定依据：`docs/changes/2026-10-16-canvas-manual-layout.md` 引述用户要求“用户拖到指定坐标后不自动对齐”，并明确详情序列读取实时坐标。上轮“失败后检查原任务”使用当前 pending 坐标的修复依然通过；本次漏的是不经失败、直接完成的路径。后续应统一 pending/task 的位置来源，不恢复自动排布。

## 复现与复核

新增命令：

```powershell
node --conditions=react-server scripts/audit-canvas-followup.cjs [sourceRoot]
```

10 个实际函数场景，3 类确认缺陷、1 类配置待核实、3 个正常对照；新增 6 个真实映射函数测试：4K→1K、4K→4K、不发送分辨率、缺映射明确拒绝、高质量→标准质量、不发送质量参数。这些映射均符合支持的设计；所有网络/数据库边界均为本机内存 fixture，外部供应商调用 0。`FOLLOWUP_AUDIT=PASS` 表示复现符合断言，不代表问题已修复。

集中重跑上一轮 4 组/59 场景全部通过。业务源码相对 d6e7e230 无 diff，因此不重复整站构建。本轮没有浏览器 E2E，也不将函数级 fixture 说成线上验收。

## 状态与后续

三项确认缺陷尚待修复：项目撤销隔离、编辑失败反馈、详情坐标。详情分辨率等待具体发布配置/冻结任务证据。不擅自修改参数优先级。

修正后的证据目录：`output/canvas-followup-policy-review47-20261019`。旧 `output/canvas-followup-audit47-20261019` 已用 SUPERSEDED.txt 标明 4 类确认统计撤回。原始运行观察保留，不篡改旧测试输出。

四产物只归档审计脚本/文档；回退在隔离副本恢复用户纠正前的审计文件，验证旧报告可还原，不意味着旧分类有效。业务源码始终未改。

功能迭代同步计数仍为 1/3（本轮仅审计，不新增功能模块）。保留上轮未发布修复，不更新公开已发布记录。
