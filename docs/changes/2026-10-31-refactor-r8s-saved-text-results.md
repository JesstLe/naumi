# R8S：助手已保存文字结果归入文字文档

## 模块、基线与职责

基线 `b0cf62fdf99d823cb0e16def11cf9e2ef72d475a`，独立工作树 `E:/Workspace/naumi-refactor-20261024`。完整5315个原始raw hashes、源码归档与完整副本保存在 `output/refactor-r8s-20261031`；上一轮R8R已提交/推送并取得实际验证，本轮继续产品代码重构。

原Canvas助手text回调直接读取文字快照、按结果ID/项目筛选、补默认字段并交给document.accept；这些规则已属于现有text-document及其canonical normalizer、草稿和写入版本边界。

## 实现、公开接口与依赖

`text-document.refreshSaved(nodes, signal, isCurrent)` 接收已经保存的文字节点身份，只GET既有快照，不执行生成、不建任务或新operation。页面只绑定该具体接口。

- 读取继续沿原owner和账号/工作空间/项目scope，使用调用方原AbortSignal和当前会话检查。
- 只合入原事件ID且属于原项目的行，不用完整快照替换整份文字图，不因缺少行重执行工具。
- 复用既有`normalizeTextNodes`，与load/cache共用有限正数尺寸、文本字段和引用数组规则。
- 复用既有per-ID `written` revision：在读取期间完成的accept/history/save或删除，不被迟到的旧快照回滚；不同ID的并行结果仍可分别合入。
- 既有accept继续保留本地草稿、confirmed状态和保存队列。只读上下文允许读，不引入POST或业务额度/确认门槛。

依赖为Canvas/assistant应用owner → 原text document → 原scoped HTTP/GET handler。数据库、事务、CAS、history、报价、钱包、供应商和UNKNOWN原执行链不改，不另起store/cache/任务系统。

## 验证与未完成

完成模块后集中执行原/新实际页面回调与真实document、SSE助手入口、隔离PG GET，以及原文字并发/历史/助手回归。结果按实际输出补录，不提前填写通过数字。

本模块为主线同步后第三个产品模块，完成后按AGENTS刷新并普通整合main，记录实际SHA与计数。完整候选core/镜像/runtime/产品浏览器、有效CI、持续容量与最终main验收仍OPEN；未合回main、未部署，47 HOLD。
