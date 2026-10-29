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


## 最终证据与退出状态

2026-10-29 R7C：六种实际native hook归同一文档owner，复用Canvas actor/workspace scope，异步auth后再次检查；原method/body/operation先恢复再写下一意图，同节点串行、不同节点并行。12个GET及timeline素材读沿原receipt scope，项目归属批量过滤；同账号个人/A/B、成员撤权与原记录读取通过，节点payload/CAS/任务/账务仍原owner。旧分散端口和猜revision降级在真实调用方迁移后删除；老文字fixture补真实adapter并修正模拟响应base泄漏，原21/58通过。固定b414 core101/101全新执行、同镜像runtime177/产品37通过；补充实际hook对照发现command409漏刷新，最终66da仅一个生产文件及verifier/文档修正，8个受影响入口全部通过，React68组106、PG6组146、最终完整镜像及产品37通过。两层SHA不互相改标；tsc/lint37warning、四类SCC0。4923基线hash副本回滚/完整源码四产物/远端以DELIVERY为准。整体ACTIVE；继续完整退出需求/Canvas剩余编排与变更扩散、性能/INP/容量、有效远端CI及最终整合，不合main不部署。

- 完整core101/完整镜像runtime177（包括native timeline52）绑定`b41442698be4e68cd4360f35ea6f567d60c7abca`，完整新执行；完整产品浏览器初版37也绑定该source。
- 最终应用`66da204a6dae4152be62b3ae5ff692e16d53a188`，最终8项全部PASS；runner状态PARTIAL仅表示非全core选择，未运行0。实际React/Edge最终68组106检查，旧38组46检查复现workspace/auth/rewrite，原command409刷新行为在旧新都保持。
- 最终镜像`sha256:56294e78668ed11835776e911c850512c4fd18e9ad5c42748312915b47b20f65`；完整生产Web+Worker同镜像包与产品37检查绑定最终source，route mocks0、pageerror0、confirmation0，60秒持续读取不是容量证明。最终修正后未重跑完整core/runtime177，不把b414结果改标66da。
- PG旧12读入口投影+当前公共依赖6组146复现跨scope读取；新实际owner/真实HTTP/PG6组146通过，同账号拥有A并为B成员，未破坏既有成员email唯一约束。新建根只在原事务attest，原operation单行且账本不变、supplier0。
- 真实BI scoped pool7检查完成：5个client全占时授权事务内读取仍结束，pool waiter0，普通整合主线事务修复没有恢复第二pool singleton。
- 现行Native模块可复用变更口径从六份hook收敛到共同owner/调度hook；并非按行数拆空层，未新增任务/history/billing服务。公共video merge出口仍供实际polling调用者使用；无实际消费者的video hook copy方法已删除。
- 旧core/首轮定向失败和夹具准备失败日志均保留。原文字fixture债务在本轮关闭；MEDIA_STATE_WRITE_FAILED历史根因仍OPEN_NOT_REPRODUCED，full product通过不改写该结论。
- 整体目标按9项需求审计仍未证明完成：Canvas剩余创建/细节批次/renderer交互callback需实际所有权和变更扩散复核；同场景性能/INP/RSS/查询/容量、远端required CI和最终main整合仍待。不以局部core、零SCC或完整源码归档冒充完整重构结束。
