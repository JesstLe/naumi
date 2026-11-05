# PR #8：原生场景与角色的 pending prompt 验证合同

## 原始失败

通知 head 为 `a8a36ffed670312a91a0b25fa4af35476329990f`。Core run `41723292512` / job `126221374429` 实际验证 merge `a84dbb75fc0bb0e4f2f7e0fa7e9a41d7ab77eaad`，source digest `19f8f28ec121d394e69d4b96461978de8d5b1b586fa049d7b20ea6f169f86ef6`。

本次真实 Linux Core 为 **187 PASS / 1 FAIL / 62 NOT_RUN**，在 `scene-application` 的 `UI_PREWARM` 阶段失败：旧脚本查询 pending dock 内 `textarea.value[]`，结果为 `[]`，原关键词断言失败。上一阶段实际组件引用菜单回归和完整 timeline-native-canvas 在同轮 Linux CI 已通过；这不撤销前一阶段本地 processing 失败记录，也不单凭新通过推断旧失败原因。

原日志、同轮归档、REPORT、场景 failure 图文/诊断/清理以及时间线通过回执保存在 `output/pr8-native-pending-prompt-ci-a8a36ff-20261104`。基线完整 5715 文件 raw hash/mode、归档和上一阶段四产物在首次源码写入前已封存。

## Owner、接口与实现

真实产品调用链保持：领域编辑器保存定义及选定 variant → 原 reference command → domain referenceText → 原 imageDraft.seed → CanvasImageComposer → ImageReferenceComposer → InlineReferenceEditor。动作只打开已有普通 draft，不是付费生成，也不建立新的 pending PG job。

实际提示词是 `image-reference-composer` 下名为“节点提示词”的 `div role=textbox`，带 `contenteditable=true`、`aria-readonly=false`、`aria-multiline=true`，不是 textarea。变量名 `textareaRef` 不是 DOM 类型合同。

测试层窄接口：

```ts
assertPlainPendingPrompt(dock, exactExpected, { timeout? })
// => actual text/tag/contentEditable/ariaReadonly/tokens/elapsedMs
```

helper 只承担这两个已出现的纯文字预填场景：限定目标 dock→唯一 image-reference-composer→精确 textbox，检查唯一、可见、可编辑、多行、inline token 数为 0，再以实际 `textContent` 严格核对完整三行及 LF。所有等待和最终 snapshot 共用原 60000ms 单一预算；没有 whole-dock 文本替代、textarea/CE fallback、空白归一化或产品改动。它不是通用 wire prompt reader；真实 token prompt 明确拒绝。

两份 expected 是独立 fixture literal，保留标题、中点、空格、完整总设定与选定 variant，不从同一产品 builder 动态计算预期：

```text
庭院 · 交互
石阶连接木廊，石桌靠东，跨镜头保持布局
夜景：木廊暖灯照明，空间位置保持
```

```text
林舟 · 交互
短发，左眉有疤，跨镜头保持身份
外套：深蓝外套，保持左眉疤痕
```

scene/character 两个 fixture 保存实际 pending prompt receipt，同时原两个关键词、余额/供应商调用不变及后续全部 PG、wire token、冻结 revision/媒体、director/workflow、原子 history 与防重放断言保留。实际领域 textarea、number/range 等表单检查不批量替换。`src/`、`services/`、生产状态与事务 owner 均零改动。

## 集中回归与证据边界

新增 `scripts/verify-native-pending-prompt.tsx` 登记进原 Core catalogue，实际渲染 ImageReferenceComposer/InlineReferenceEditor，不使用替代组件：

- 当前 **12 cases PASS / exit 0**：两份精确三行、Unicode/LF、dock 外同名真实 composer、真实输入/Enter/onPrompt、错误首行/缺行/额外行/折叠换行、readonly/hidden/重复 editor、可见文字相同但实际有 token 的拒绝。
- 原 selector 和关键词断言从封存旧场景脚本 AST 提取，实际 CE 得到 `[]`，**baseline exit 1（预期）**；不是伪造“必错组件”或缺依赖失败。
- 两轮真实浏览器均关闭；服务/供应商/网络请求/pageError 为 0。组件回归不代替完整 Next/PG/生成验收。
- clean 最终提交再构建完整 Linux App 与同源 SDK，集中执行原 scene/character application 和两项受影响组件回归；固定 source/digest、原断言及清理门禁保持。结果写入本阶段 `VERIFICATION.txt`，提交前不预报完整原生通过。
- 两个独立完整源副本验证 raw patch 重放、copy-only hash-guard rollback 和原失败行为恢复。当前工作源码和修改版归档保留修改；外置新版受控 driver 与原 native driver 的证据层级区分。

## 未完成项

完整 Core、新 head CI、main 整合、部署和容量分别验收。原 processing 失败仍保留 UNKNOWN 原因，不清 lease、不增加 timeout、不重放原任务来取得通过。整体继续 **ACTIVE / mainMerged=false / deployed=false / 47 HOLD**。本阶段四产物、精确命令与字面输出以 `output/pr8-native-pending-prompt-ci-a8a36ff-20261104/VERIFICATION.txt` 为准。
