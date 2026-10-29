# R7C：六类原生节点的文档状态归属

基线 `28c3c5e78eaf25db9e6452d3ae528c0669f95edb`，实际完整字节已归档到 output/refactor-r7c-20261029/BASELINE_SOURCE.tar 并逐文件核验。固定 main `7c4591361514309b0af1cef295c0c138e84b47c4` 两提交已普通整合，授权事务内的 BI 证据查询继续使用原 client，不另拿连接。

## 调研与实现

原五个 hook 各有相同的 email/readOnly epoch、节点队列与 operation map，video 又有独立实现。六者均未以 workspace 作为状态归属；页面 privateFetchRaw 在异步 auth 之后没有再次校验原作用域。video 保存重试还会生成新 operation。R7B 的 typed lifecycle adapter 没有解决这些内部 store 的时序问题。

本次共同 owner 只收拢六种已有节点的读取、写入队列、原操作与回执，按 account/workspace/owner 分桶；React 只订阅/调度，沿用已有 canvasDocumentScope/headers 的异步鉴权前后校验。节点 payload/CAS、渲染、采用、任务、钱包和 history 保留原 owner，不引入 manager、插件、事件总线或第二任务/历史系统。

保存响应未知时保留原 method/URL/body/operation；后续修改先核实原写，再用实际 revision 保存新意图。读取序号与写入边界保护迟到快照；同 revision 的实际状态变化和相同快照引用复用继续保留。换 actor/workspace 即切换文档，项目导航不清空文档。

## 进度与未完成

六个真实 hook 与实际 Canvas 调用方已迁移，node-operations 的旧 videos/directors 等分散端口和猜 revision+1 的降级已在实际调用方迁移后删除。兼容旧服务端响应只读取当前节点，不再猜版本。实际 React/Edge 旧36组42检查复现作用域与重写问题，新66组102检查通过；真实HTTP/PG的12个旧读入口投影对照也复现跨个人/企业读取，已统一沿原receipt scope鉴权并用批量项目归属投影过滤。原timeline逐节点作用域读改为同一批量规则。个人/企业A/企业B同账号、停用成员、关闭新创作后仍读取原记录均已覆盖；无新表/新业务限制。老文字fixture补真实原生端口并从模拟响应删除请求专用base字段，原21场景58检查通过；未修改业务断言。新增PG用例覆盖六种node的真实原body重放、单意图一行、history删除回执、并行不同node，最终数字与同SHA集中验证以随后VERIFICATION/DELIVERY为准。整体重构 ACTIVE，不合 main、不部署，47 HOLD。上轮完整镜像证据不冒充本轮验收；性能/INP/容量、有效远端 CI 与完整重构退出仍待。


### 准备阶段失败记录

新增PG夹具首次把operation表名猜成*_node_ops，真实表名是video_node_operations与其他kind的*_operations；后续企业夹具补authorized_until、尊重成员email单归属（测试账号拥有企业A并作为企业B成员），entitlement补updated_by。各次失败均走finally删除自有schema/关闭池，日志保留。实际发现GET未绑定workspace导致仅做浏览器分桶仍会拉回所有workspace节点，已连实际12读入口一起修正，而不是用窄fixture宣称隔离完成。新建根project仍由原node事务attest，客户端新根仅放body、不提前用header绑定。

## 收尾定向修正

固定b4144269的core101/101、完整同镜像runtime177/产品双浏览器37均实际通过。补充实际hook对照又捕获到迁移遗漏：audio/timeline的render409原本会刷新原文档，合并command后漏掉。已在共同command入口恢复409只读刷新，原错误与原operation继续向调用方保留、不重复POST；补两个真实hook断言。最终源码仅这一个生产文件和对应verifier变更，按受影响模块集中复测，不因该小修再次跑整个重型core；b414完整结果与最终定向源码/镜像结果严格分层，最终以SOURCE_BINDING/VERIFICATION为准。
