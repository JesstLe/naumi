# PR #8：原生节点引用菜单的验证合同

## 原始失败与证据

- 通知 head：`13a380962edf9a9b2e5cb332c99f3fd06144c122`；Core run `41709022444` / job `126171887855` 实际 checkout：`ce6284bcf3fc4bd51a31a17a0995613d9fb8cccb`。
- 原 Core 为 **176 PASS / 1 FAIL / 72 NOT_RUN**，`timeline-native-canvas` 在 `OUTPUT_HANDLE_MENTION_VIDEO` 阶段的 dock descendant listbox locator 等待 90 秒后 exit 1。
- 同轮原截图、body 文本、浏览器诊断、REPORT、SDK 输入及清理回执保存在 `output/pr8-checks-13a38096-core-audit-20261104`。截图中 prompt 为 `采用 @多轨`，引用菜单已显示“多轨”；截图本身不证明 DOM parent 或点击成功。
- `ReferenceMentionPanel` 使用 `createPortal(..., document.body)`；`InlineReferenceEditor` 通过 `aria-controls` 关联菜单。四个关键源码的原 CI hash 与封存基线逐字节一致。旧测试却把菜单限定为 dock 的 DOM 后代。
- 原 diagnostics 没有 pageError/runtimeException；刻意中断的 ACK、离线 job-list 和导航 abort 保留，不把它们说成网络零错误。前阶段 node-creation 在这次 Linux CI 已真实通过，未把它重复算作本次新增验收。

## 职责、接口与改动

产品引用状态仍由 `VideoPromptEditor`、`InlineReferenceEditor`、`ReferenceMentionPanel` 与原 prompt-reference owner 管理。菜单保留 body portal，引用 choice、可用性、权限、冻结媒体、事务和持久化均不变。本次不修改 `src/` 或 `services/`，不为测试将浮层移回 dock。

验证层的 `scripts/verification/reference-mention-locator.ts` 只负责一个已经出现的共享交互：

```ts
selectReferenceMention(page, editor, exactOptionName, { timeout?, menuName? })
  // => { menuId, optionName, elapsedMs }
```

接口要求展开的 editor 指向单一非空 `aria-controls`；定位同 id、精确 role 和 accessible name 的菜单，再定位精确 option。可见、可用及点击前关联检查与正常 Playwright click 共用一次原有 90 秒总预算。不增加重试、刷新、force click、模糊全局 option 或新的页面业务期限。

- timeline、audio、character、scene 四个 native interaction 调用同一 helper，并在原 interaction-result 中保存关联回执。
- audio、character、scene 原来对 contentEditable div 使用旧 textarea `toHaveValue`。现在检查精确标题的可见 chip、`data-inline-token="{{ref 1}}"` 和 `data-reference-missing="false"`；timeline 同步增加该投影检查。原 PG exact `config.prompt`、输入身份、生成参数、媒体 hash、冻结引用及账务断言仍保留。
- 新实际组件浏览器回归登记在既有 Core catalogue，不创建平行 runner。回归涵盖真实 body portal、同名 decoy、不可用 option、缺失/多值/错误关联、role/name 与单次预算。

## 验证与证据层级

本阶段首次源码写入前已封存完整 `BASELINE_SOURCE.tar`、原始 hash/mode、共享工作树快照及上一阶段四产物指纹。新的四产物和所有命令的字面 stdout/stderr/exit 维护在：

`output/pr8-timeline-video-reference-ci13a-20261104/VERIFICATION.txt`

验证分层，不相互代替：

1. 原 Linux Core 的完整失败为真实 baseline；实际组件中提取原 selector 的短预算受控复现只验证 DOM 合同，不称为原 90 秒 CI 全链重跑。
2. 实际 React 编辑器/portal 的集中回归、类型与相关静态检查验证本次验证工具切片。
3. clean 固定提交构建完整 Linux App，再由同 digest 的 SDK 执行原 timeline native Canvas case及受影响原生应用 case。App/worker 字节与 source guard 保留；不得用旧 SDK 换 source 标识。
4. 两个独立完整源码副本验证 raw patch 重放、copy-only hash-guard rollback、恢复原 selector 行为；当前源码与修改版归档保持修改。
5. 远端新 head 的 CI 另记。选中 case 成功或 PARTIAL 不代表完整 Core、main 整合、部署、容量或业务上线验收。

提交前集中实测：实际组件定位回归 **9 cases PASS / exit 0**，真实 portal、同名 decoy 零点击、wire prompt 与 chip token 一致，供应商/网络请求/pageError 均为 0。原 selector 的受控复现 **exit 1（预期）**，prompt 未插入引用；原始失败与清理回执保留。完整 TypeScript `--noEmit`、七个验证源码文件 ESLint `--max-warnings 0` 均 exit 0；原 runner 自验 **33 cases / 442 checks PASS**。预算回归保留实际剩余 timeout 与状态断言，不再对加载中的 CI 宿主施加第二个短墙钟期限。

首次新回归试跑因测试预估 disabled option 名称含空格而失败；真实 accessible name 为 `未完成尚未完成`，已按 exact name 修正该测试，未修改产品 disabled 状态。该次原失败仍保留，不改写为 baseline 或完整 App 失败。clean 最终提交的完整 App 构建、SDK、正式八项选中回归与副本回滚在上述证据目录续记，以其实际回执为准，不在提交前预报通过。

## 未完成项与边界

- 原 audio catalogue `--with-matrix` 不执行其 `--ui-only`，不可用该 PASS 冒充 audio UI 验收；实际执行范围以本阶段正式回执为准。
- 非 catalogue 的 `verify-video-native-ui.cjs` 还有旧 inputValue/readonly 假设，未扩入本次切片。
- 原 publish/restore 草稿回归证据继续保留，不因本次菜单测试修复撤销，也不将整体重构宣称完成。
- 整体仍 **ACTIVE / mainMerged=false / deployed=false / 47 HOLD**。本次不部署、不连接生产、不触发付费供应商、不重放 UNKNOWN 工作。下一步通过现有 PR 通知处理新固定头的真实失败，随后按完整退出门槛推进 main 整合。
